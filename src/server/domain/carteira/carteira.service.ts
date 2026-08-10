import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";

export interface CarteiraFiltros {
  busca?: string;
  situacao?: "TODOS" | "VINCULADO" | "NAO_VINCULADO";
  status?: string;
  regime?: string;
}

export interface CarteiraLinha {
  pierClientId: string;
  externalId: string;
  nome: string;
  documento: string | null;
  status: string | null;
  regime: string | null;
  responsavel: string | null;
  sincronizadoEm: string;
  empresaId: string | null;
  empresaNome: string | null;
  vinculado: boolean;
}

export interface CarteiraResumo {
  total: number;
  vinculados: number;
  naoVinculados: number;
  ultimaSincronizacao: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    processados: number;
    falhas: number;
    mensagem: string | null;
  } | null;
  integracao: { available: boolean; reason?: string };
  filtrosDisponiveis: { regimes: string[]; statuses: string[] };
}

function normalizarDocumento(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export async function listarCarteira(
  ctx: AppContext,
  filtros: CarteiraFiltros,
): Promise<{ linhas: CarteiraLinha[]; resumo: CarteiraResumo }> {
  // PostgREST corta em 1000 linhas por requisição: pagina até trazer a carteira completa.
  const clientes: NonNullable<Awaited<ReturnType<typeof buscarPagina>>["data"]> = [];
  const buscarPagina = (de: number, ate: number) =>
    ctx.db
      .from("pier_client")
      .select("id, external_id, name, document, status, tax_regime, responsible_name, synced_at")
      .eq("organization_id", ctx.organizationId)
      .order("name")
      .range(de, ate);

  const TAMANHO_PAGINA = 1000;
  for (let pagina = 0; pagina < 50; pagina++) {
    const de = pagina * TAMANHO_PAGINA;
    const { data, error } = await buscarPagina(de, de + TAMANHO_PAGINA - 1);
    if (error)
      throw new AppError("INESPERADO", "Não foi possível carregar a carteira.", error.message);
    clientes.push(...(data ?? []));
    if (!data || data.length < TAMANHO_PAGINA) break;
  }



  const { data: vinculos } = await ctx.db
    .from("company_pier_link")
    .select("pier_client_id, company:company_id(id, name)")
    .eq("organization_id", ctx.organizationId);

  const mapaVinculo = new Map(
    (vinculos ?? []).map((v) => [
      v.pier_client_id,
      v.company as unknown as { id: string; name: string } | null,
    ]),
  );

  let linhas: CarteiraLinha[] = (clientes ?? []).map((c) => {
    const empresa = mapaVinculo.get(c.id) ?? null;
    return {
      pierClientId: c.id,
      externalId: c.external_id,
      nome: c.name,
      documento: c.document,
      status: c.status,
      regime: c.tax_regime,
      responsavel: c.responsible_name,
      sincronizadoEm: c.synced_at,
      empresaId: empresa?.id ?? null,
      empresaNome: empresa?.name ?? null,
      vinculado: Boolean(empresa),
    };
  });

  // Opções de filtro vêm da carteira completa (antes dos filtros) para o select ficar estável.
  const valoresUnicos = (selector: (l: CarteiraLinha) => string | null) =>
    Array.from(
      new Set(linhas.map((l) => selector(l)?.trim()).filter((v): v is string => Boolean(v))),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const filtrosDisponiveis = {
    regimes: valoresUnicos((l) => l.regime),
    statuses: valoresUnicos((l) => l.status),
  };

  const busca = filtros.busca?.trim().toLowerCase();
  if (busca) {
    linhas = linhas.filter(
      (l) =>
        l.nome.toLowerCase().includes(busca) ||
        normalizarDocumento(l.documento).includes(busca.replace(/\D/g, "")),
    );
  }
  if (filtros.status) linhas = linhas.filter((l) => l.status === filtros.status);
  if (filtros.regime) linhas = linhas.filter((l) => (l.regime ?? "").trim() === filtros.regime);
  if (filtros.situacao === "VINCULADO") linhas = linhas.filter((l) => l.vinculado);
  if (filtros.situacao === "NAO_VINCULADO") linhas = linhas.filter((l) => !l.vinculado);

  const { data: ultima } = await ctx.db
    .from("sync_run")
    .select("id, status, started_at, finished_at, processed_items, failed_items, message")
    .eq("organization_id", ctx.organizationId)
    .eq("kind", "CARTEIRA")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    linhas,
    resumo: {
      total: linhas.length,
      vinculados: linhas.filter((l) => l.vinculado).length,
      naoVinculados: linhas.filter((l) => !l.vinculado).length,
      ultimaSincronizacao: ultima
        ? {
            id: ultima.id,
            status: ultima.status,
            startedAt: ultima.started_at,
            finishedAt: ultima.finished_at,
            processados: ultima.processed_items,
            falhas: ultima.failed_items,
            mensagem: ultima.message,
          }
        : null,
      integracao: await pierAdapter.status(),
    },
  };
}

/** Sincronização sempre manual: só roda sob comando explícito do usuário. */
export async function sincronizarCarteira(ctx: AppContext) {
  assertCanWrite(ctx);

  const { data: run, error: runError } = await ctx.db
    .from("sync_run")
    .insert({
      organization_id: ctx.organizationId,
      kind: "CARTEIRA",
      status: "RUNNING",
      started_by: ctx.userId,
    })
    .select("id")
    .single();

  if (runError || !run)
    throw new AppError("INESPERADO", "Não foi possível iniciar a sincronização.", runError?.message);

  const finalizar = async (
    status: "COMPLETED" | "FAILED",
    payload: { total?: number; processados?: number; falhas?: number; mensagem?: string },
  ) => {
    await ctx.db
      .from("sync_run")
      .update({
        status,
        total_items: payload.total ?? 0,
        processed_items: payload.processados ?? 0,
        failed_items: payload.falhas ?? 0,
        message: payload.mensagem ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
  };

  try {
    const clientes = await pierAdapter.listClients();
    let processados = 0;
    let falhas = 0;
    const agora = new Date().toISOString();
    const TAMANHO_LOTE = 250;

    // Upsert em lotes: milhares de round-trips individuais faziam a sincronização estourar o tempo.
    for (let inicio = 0; inicio < clientes.length; inicio += TAMANHO_LOTE) {
      const lote = clientes.slice(inicio, inicio + TAMANHO_LOTE);
      const { error } = await ctx.db.from("pier_client").upsert(
        lote.map((cliente) => ({
          organization_id: ctx.organizationId,
          external_id: cliente.externalId,
          name: cliente.name,
          document: cliente.document,
          status: cliente.status,
          tax_regime: cliente.taxRegime,
          responsible_name: cliente.responsibleName,
          raw: cliente.raw as never,
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


    await finalizar("COMPLETED", { total: clientes.length, processados, falhas });
    await audit(ctx, {
      action: "SINCRONIZAR_CARTEIRA",
      entity: "sync_run",
      entityId: run.id,
      after: { total: clientes.length, processados, falhas },
    });

    return { syncRunId: run.id, total: clientes.length, processados, falhas };
  } catch (error) {
    const mensagem =
      error instanceof AppError ? error.userMessage : "Falha inesperada na sincronização.";
    await finalizar("FAILED", { mensagem });
    await ctx.db.from("sync_event").insert({
      organization_id: ctx.organizationId,
      sync_run_id: run.id,
      level: "CRITICAL",
      message: mensagem,
    });
    throw error;
  }
}

/** Cria (ou reaproveita) a empresa interna e vincula ao cliente do PIER. */
export async function vincularCliente(ctx: AppContext, pierClientId: string) {
  assertCanWrite(ctx);

  const { data: cliente } = await ctx.db
    .from("pier_client")
    .select("id, name, document")
    .eq("organization_id", ctx.organizationId)
    .eq("id", pierClientId)
    .maybeSingle();

  if (!cliente) throw new AppError("VALIDACAO", "Cliente não encontrado na carteira.");

  const documento = normalizarDocumento(cliente.document);
  let empresaId: string | null = null;

  if (documento) {
    const { data: empresas } = await ctx.db
      .from("company")
      .select("id, document")
      .eq("organization_id", ctx.organizationId);
    empresaId =
      (empresas ?? []).find((e) => normalizarDocumento(e.document) === documento)?.id ?? null;
  }

  if (!empresaId) {
    const { data: nova, error } = await ctx.db
      .from("company")
      .insert({
        organization_id: ctx.organizationId,
        name: cliente.name,
        document: cliente.document,
      })
      .select("id")
      .single();
    if (error || !nova)
      throw new AppError("INESPERADO", "Não foi possível criar a empresa.", error?.message);
    empresaId = nova.id;
  }

  const { error: linkError } = await ctx.db.from("company_pier_link").upsert(
    {
      organization_id: ctx.organizationId,
      company_id: empresaId,
      pier_client_id: cliente.id,
      linked_by: ctx.userId,
    },
    { onConflict: "organization_id,pier_client_id" },
  );

  if (linkError)
    throw new AppError("REGRA_NEGOCIO", "Não foi possível vincular este cliente.", linkError.message);

  await audit(ctx, {
    action: "VINCULAR_CLIENTE",
    entity: "company_pier_link",
    entityId: cliente.id,
    after: { empresaId, pierClientId: cliente.id },
  });

  return { empresaId };
}

export async function desvincularCliente(ctx: AppContext, pierClientId: string) {
  assertCanWrite(ctx);
  const { error } = await ctx.db
    .from("company_pier_link")
    .delete()
    .eq("organization_id", ctx.organizationId)
    .eq("pier_client_id", pierClientId);
  if (error)
    throw new AppError("INESPERADO", "Não foi possível desfazer o vínculo.", error.message);

  await audit(ctx, {
    action: "DESVINCULAR_CLIENTE",
    entity: "company_pier_link",
    entityId: pierClientId,
  });
  return { ok: true };
}
