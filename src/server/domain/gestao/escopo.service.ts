import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";

/**
 * IDs reais dos tipos de solicitação no PIER (/api/v2/tipos-solicitacao).
 * Podem ser sobrescritos por organização em app_setting (chave `pier.tipos_solicitacao`).
 */
const TIPOS_PADRAO: Record<string, string> = {
  CONTABIL: "117418", // FECHAMENTO CONTÁBIL
  FISCAL: "117811", // FECHAMENTO FISCAL
};

/** Tipos considerados internos do escritório (o PIER também lista usuários "Cliente"). */
const TIPOS_INTERNOS = new Set(["colaborador", "gestor", "encarregado"]);

export type TipoFechamento = "CONTABIL" | "FISCAL" | "OUTRO";

export interface DepartamentoOpcao {
  /** Código interno do PIER — usado como value, nunca exibido como rótulo. */
  id: string;
  codigo: string;
  nome: string;
  /** true quando o nome foi definido pelo escritório (e não o rótulo genérico). */
  personalizado: boolean;
  totalUsuarios: number;
}

export interface UsuarioOpcao {
  id: string;
  nome: string;
  tipo: string | null;
  status: string | null;
  departamentoId: string | null;
}

export async function resolverTipoSolicitacao(
  ctx: AppContext,
  tipo: TipoFechamento,
): Promise<string> {
  const { data } = await ctx.db
    .from("app_setting")
    .select("value")
    .eq("organization_id", ctx.organizationId)
    .eq("key", "pier.tipos_solicitacao")
    .maybeSingle();

  const override = (data?.value ?? {}) as Record<string, unknown>;
  const configurado = override[tipo];
  const resolvido = typeof configurado === "string" ? configurado : TIPOS_PADRAO[tipo];

  if (!resolvido)
    throw new AppError(
      "REGRA_NEGOCIO",
      "Este tipo de fechamento ainda não tem um tipo de solicitação do PIER configurado.",
    );
  return resolvido;
}

function nomePadraoDepartamento(externalId: string) {
  return `Departamento ${externalId}`;
}

/** Sincronização manual dos usuários do PIER e dos departamentos derivados deles. */
export async function sincronizarEquipe(ctx: AppContext) {
  assertCanWrite(ctx);

  const { data: run, error: runError } = await ctx.db
    .from("sync_run")
    .insert({
      organization_id: ctx.organizationId,
      kind: "EQUIPE",
      status: "RUNNING",
      started_by: ctx.userId,
    })
    .select("id")
    .single();

  if (runError || !run)
    throw new AppError("INESPERADO", "Não foi possível iniciar a sincronização.", runError?.message);

  try {
    const usuarios = await pierAdapter.listUsers({ status: "Todos" });
    const agora = new Date().toISOString();
    const LOTE = 250;
    let processados = 0;
    let falhas = 0;

    for (let inicio = 0; inicio < usuarios.length; inicio += LOTE) {
      const lote = usuarios.slice(inicio, inicio + LOTE);
      const { error } = await ctx.db.from("pier_user").upsert(
        lote.map((u) => ({
          organization_id: ctx.organizationId,
          external_id: u.externalId,
          name: u.name,
          kind: u.kind,
          login: u.login,
          email: u.email,
          status: u.status,
          department_external_id: u.departmentExternalId,
          raw: u.raw as never,
          synced_at: agora,
        })),
        { onConflict: "organization_id,external_id" },
      );
      if (error) {
        falhas += lote.length;
        await ctx.db.from("sync_event").insert({
          organization_id: ctx.organizationId,
          sync_run_id: run.id,
          level: "CRITICAL",
          message: error.message,
        });
      } else {
        processados += lote.length;
      }
    }

    // O PIER não expõe nome de departamento: derivamos a lista dos usuários internos.
    const contagem = new Map<string, number>();
    for (const u of usuarios) {
      if (!u.departmentExternalId) continue;
      if (!TIPOS_INTERNOS.has((u.kind ?? "").toLowerCase())) continue;
      contagem.set(u.departmentExternalId, (contagem.get(u.departmentExternalId) ?? 0) + 1);
    }

    if (contagem.size) {
      const { data: existentes } = await ctx.db
        .from("pier_department")
        .select("external_id, name")
        .eq("organization_id", ctx.organizationId);
      const nomes = new Map((existentes ?? []).map((d) => [d.external_id, d.name]));

      await ctx.db.from("pier_department").upsert(
        [...contagem.entries()].map(([externalId, total]) => ({
          organization_id: ctx.organizationId,
          external_id: externalId,
          name: nomes.get(externalId) ?? nomePadraoDepartamento(externalId),
          user_count: total,
          synced_at: agora,
        })),
        { onConflict: "organization_id,external_id" },
      );
    }

    await ctx.db
      .from("sync_run")
      .update({
        status: "COMPLETED",
        total_items: usuarios.length,
        processed_items: processados,
        failed_items: falhas,
        finished_at: agora,
      })
      .eq("id", run.id);

    await audit(ctx, {
      action: "SINCRONIZAR_EQUIPE",
      entity: "sync_run",
      entityId: run.id,
      after: { usuarios: usuarios.length, departamentos: contagem.size, falhas },
    });

    return { total: usuarios.length, processados, falhas, departamentos: contagem.size };
  } catch (error) {
    const mensagem =
      error instanceof AppError ? error.userMessage : "Falha inesperada na sincronização.";
    await ctx.db
      .from("sync_run")
      .update({ status: "FAILED", message: mensagem, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    throw error;
  }
}

/** Departamentos e usuários em cache, para alimentar os selects da tela de Gestão. */
export async function listarEquipe(ctx: AppContext, opcoes?: { incluirInativos?: boolean }) {
  const { data: departamentos, error } = await ctx.db
    .from("pier_department")
    .select("external_id, name, user_count, synced_at")
    .eq("organization_id", ctx.organizationId)
    .order("name");

  if (error)
    throw new AppError("INESPERADO", "Não foi possível carregar os departamentos.", error.message);

  const { data: usuarios } = await ctx.db
    .from("pier_user")
    .select("external_id, name, kind, status, department_external_id")
    .eq("organization_id", ctx.organizationId)
    .order("name");

  const internos = (usuarios ?? []).filter(
    (u) =>
      TIPOS_INTERNOS.has((u.kind ?? "").toLowerCase()) &&
      (opcoes?.incluirInativos || (u.status ?? "").toLowerCase() === "ativo"),
  );

  const ativosPorDepto = new Map<string, number>();
  for (const u of internos) {
    if (!u.department_external_id) continue;
    ativosPorDepto.set(
      u.department_external_id,
      (ativosPorDepto.get(u.department_external_id) ?? 0) + 1,
    );
  }

  const opcoesDepartamento = (departamentos ?? [])
    .map<DepartamentoOpcao>((d) => {
      const personalizado = d.name !== nomePadraoDepartamento(d.external_id);
      return {
        id: d.external_id,
        codigo: d.external_id,
        nome: personalizado ? d.name : `Departamento ${d.external_id}`,
        personalizado,
        totalUsuarios: ativosPorDepto.get(d.external_id) ?? 0,
      };
    })
    .sort((a, b) => {
      if (a.personalizado !== b.personalizado) return a.personalizado ? -1 : 1;
      if (a.totalUsuarios !== b.totalUsuarios) return b.totalUsuarios - a.totalUsuarios;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });

  return {
    departamentos: opcoesDepartamento,
    usuarios: internos.map<UsuarioOpcao>((u) => ({
      id: u.external_id,
      nome: u.name,
      tipo: u.kind,
      status: u.status,
      departamentoId: u.department_external_id,
    })),
    sincronizadoEm: departamentos?.[0]?.synced_at ?? null,
    integracao: await pierAdapter.status(),
  };
}

function normalizarDocumento(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Preparação (somente leitura) das solicitações de fechamento da competência.
 * Guarda em cache, vincula à empresa interna pelo documento e nunca escreve no PIER.
 */
export async function sincronizarSolicitacoes(
  ctx: AppContext,
  input: { competencia: string; tipo: TipoFechamento },
) {
  assertCanWrite(ctx);
  const typeExternalId = await resolverTipoSolicitacao(ctx, input.tipo);

  const { data: run } = await ctx.db
    .from("sync_run")
    .insert({
      organization_id: ctx.organizationId,
      kind: "SOLICITACOES",
      scope: { competencia: input.competencia, tipo: input.tipo } as never,
      status: "RUNNING",
      started_by: ctx.userId,
    })
    .select("id")
    .single();

  try {
    const solicitacoes = await pierAdapter.listRequestsByType({
      typeExternalId,
      referenceMonth: input.competencia,
    });

    // Documento -> empresa interna já vinculada na carteira.
    const { data: vinculos } = await ctx.db
      .from("company_pier_link")
      .select("company:company_id(id, document), pier_client:pier_client_id(document)")
      .eq("organization_id", ctx.organizationId);

    const empresaPorDocumento = new Map<string, string>();
    for (const v of vinculos ?? []) {
      const empresa = v.company as unknown as { id: string; document: string | null } | null;
      const cliente = v.pier_client as unknown as { document: string | null } | null;
      if (!empresa) continue;
      for (const doc of [empresa.document, cliente?.document]) {
        const chave = normalizarDocumento(doc);
        if (chave) empresaPorDocumento.set(chave, empresa.id);
      }
    }

    const { data: usuarios } = await ctx.db
      .from("pier_user")
      .select("external_id, department_external_id")
      .eq("organization_id", ctx.organizationId);
    const deptoPorUsuario = new Map(
      (usuarios ?? []).map((u) => [u.external_id, u.department_external_id]),
    );

    const agora = new Date().toISOString();
    const LOTE = 250;
    let processados = 0;

    for (let inicio = 0; inicio < solicitacoes.length; inicio += LOTE) {
      const lote = solicitacoes.slice(inicio, inicio + LOTE);
      const { error } = await ctx.db.from("request").upsert(
        lote.map((s) => ({
          organization_id: ctx.organizationId,
          external_id: s.externalId,
          number: s.number,
          description: s.description,
          type_name: s.typeName,
          type_external_id: typeExternalId,
          purpose: s.purpose,
          reference_month: s.referenceMonth,
          status: s.status,
          responsible_name: s.responsibleName,
          responsible_external_id: s.responsibleExternalId,
          department_external_id: s.responsibleExternalId
            ? (deptoPorUsuario.get(s.responsibleExternalId) ?? null)
            : null,
          client_external_id: s.clientExternalId,
          client_name: s.clientName,
          client_document: s.clientDocument,
          company_id: empresaPorDocumento.get(normalizarDocumento(s.clientDocument)) ?? null,
          requested_at: s.requestedAt,
          finished_at: s.finishedAt,
          deadline_at: s.deadlineAt,
          has_attachment: s.hasAttachment,
          raw: s.raw as never,
          synced_at: agora,
        })),
        { onConflict: "organization_id,external_id" },
      );
      if (error)
        throw new AppError(
          "INESPERADO",
          "Não foi possível guardar as solicitações da competência.",
          error.message,
        );
      processados += lote.length;
    }

    if (run)
      await ctx.db
        .from("sync_run")
        .update({
          status: "COMPLETED",
          total_items: solicitacoes.length,
          processed_items: processados,
          finished_at: agora,
        })
        .eq("id", run.id);

    return { total: solicitacoes.length, processados };
  } catch (error) {
    const mensagem =
      error instanceof AppError ? error.userMessage : "Falha inesperada na preparação.";
    if (run)
      await ctx.db
        .from("sync_run")
        .update({ status: "FAILED", message: mensagem, finished_at: new Date().toISOString() })
        .eq("id", run.id);
    throw error;
  }
}
