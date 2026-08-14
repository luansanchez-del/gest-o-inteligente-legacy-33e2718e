import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import {
  documentoValido,
  normalizarDocumento,
  planejarVinculo,
  resumirPlano,
  type PlanoVinculo,
  type ResumoVinculoAutomatico,
} from "./vinculo.plan";

export type { ResumoVinculoAutomatico } from "./vinculo.plan";

export interface CarteiraFiltros {
  busca?: string;
  situacao?: "TODOS" | "VINCULADO" | "NAO_VINCULADO" | "REVISAO";
  status?: string;
  regime?: string;
}

/** Por que o cliente do PIER não pôde ser vinculado automaticamente. */
export type MotivoRevisao = "SEM_DOCUMENTO" | "DOCUMENTO_INVALIDO" | "DOCUMENTO_DUPLICADO";

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
  /** Preenchido quando o vínculo automático não é possível e exige revisão humana. */
  motivoRevisao: MotivoRevisao | null;
}

export interface CarteiraResumo {
  /** Totais globais da carteira — nunca afetados pelos filtros da tela. */
  total: number;
  vinculados: number;
  naoVinculados: number;
  emRevisao: number;
  semDocumento: number;
  documentosDuplicados: number;
  /** Quantas linhas o filtro atual está exibindo (null quando não há filtro). */
  totalExibido: number | null;
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

function classificarDocumento(
  documento: string | null,
  ocorrenciasPorDocumento: Map<string, number>,
): MotivoRevisao | null {
  const digitos = normalizarDocumento(documento);
  if (!digitos) return "SEM_DOCUMENTO";
  if (!documentoValido(digitos)) return "DOCUMENTO_INVALIDO";
  if ((ocorrenciasPorDocumento.get(digitos) ?? 0) > 1) return "DOCUMENTO_DUPLICADO";
  return null;
}

const TAMANHO_PAGINA = 1000;

/**
 * PostgREST corta qualquer consulta em 1000 linhas. Este helper pagina por `range`
 * até esgotar a tabela — obrigatório em toda leitura de carteira/vínculos/empresas.
 */
async function carregarTodas<T>(
  rotulo: string,
  buscarPagina: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const acumulado: T[] = [];
  for (let pagina = 0; pagina < 200; pagina++) {
    const de = pagina * TAMANHO_PAGINA;
    const { data, error } = await buscarPagina(de, de + TAMANHO_PAGINA - 1);
    if (error) throw new AppError("INESPERADO", `Não foi possível carregar ${rotulo}.`, error.message);
    acumulado.push(...(data ?? []));
    if (!data || data.length < TAMANHO_PAGINA) break;
  }
  return acumulado;
}

export async function listarCarteira(
  ctx: AppContext,
  filtros: CarteiraFiltros,
): Promise<{ linhas: CarteiraLinha[]; resumo: CarteiraResumo }> {
  const clientes = await carregarTodas("a carteira", (de, ate) =>
    ctx.db
      .from("pier_client")
      .select("id, external_id, name, document, status, tax_regime, responsible_name, synced_at")
      .eq("organization_id", ctx.organizationId)
      .order("name")
      .range(de, ate),
  );

  const vinculos = await carregarTodas("os vínculos", (de, ate) =>
    ctx.db
      .from("company_pier_link")
      .select("pier_client_id, company:company_id(id, name)")
      .eq("organization_id", ctx.organizationId)
      .order("pier_client_id")
      .range(de, ate),
  );

  const mapaVinculo = new Map(
    vinculos.map((v) => [
      v.pier_client_id,
      v.company as unknown as { id: string; name: string } | null,
    ]),
  );

  const ocorrenciasPorDocumento = new Map<string, number>();
  for (const c of clientes) {
    const digitos = normalizarDocumento(c.document);
    if (digitos) ocorrenciasPorDocumento.set(digitos, (ocorrenciasPorDocumento.get(digitos) ?? 0) + 1);
  }

  const todasAsLinhas: CarteiraLinha[] = clientes.map((c) => {
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
      motivoRevisao: empresa ? null : classificarDocumento(c.document, ocorrenciasPorDocumento),
    };
  });

  // Opções de filtro vêm da carteira completa (antes dos filtros) para o select ficar estável.
  const valoresUnicos = (selector: (l: CarteiraLinha) => string | null) =>
    Array.from(
      new Set(todasAsLinhas.map((l) => selector(l)?.trim()).filter((v): v is string => Boolean(v))),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const filtrosDisponiveis = {
    regimes: valoresUnicos((l) => l.regime),
    statuses: valoresUnicos((l) => l.status),
  };

  let linhas = todasAsLinhas;
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
  if (filtros.situacao === "REVISAO") linhas = linhas.filter((l) => Boolean(l.motivoRevisao));

  const houveFiltro = linhas.length !== todasAsLinhas.length;

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
      // Cards sempre globais: usam a carteira inteira, nunca o subconjunto filtrado.
      total: todasAsLinhas.length,
      vinculados: todasAsLinhas.filter((l) => l.vinculado).length,
      naoVinculados: todasAsLinhas.filter((l) => !l.vinculado).length,
      emRevisao: todasAsLinhas.filter((l) => Boolean(l.motivoRevisao)).length,
      semDocumento: todasAsLinhas.filter((l) => l.motivoRevisao === "SEM_DOCUMENTO").length,
      documentosDuplicados: todasAsLinhas.filter((l) => l.motivoRevisao === "DOCUMENTO_DUPLICADO")
        .length,
      totalExibido: houveFiltro ? linhas.length : null,
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
      filtrosDisponiveis,
    },
  };
}

/**
 * Sincronização sempre manual: só roda sob comando explícito do usuário.
 * NÃO executa vínculo automático — o vínculo é uma ação separada, com
 * pré-visualização e confirmação, para nunca estourar timeout no meio.
 */
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

/** Lê o estado atual (paginado) necessário para planejar o vínculo automático. */
async function carregarEstadoVinculo(ctx: AppContext) {
  const clientes = await carregarTodas<{ id: string; name: string; document: string | null }>(
    "a carteira",
    (de, ate) =>
      ctx.db
        .from("pier_client")
        .select("id, name, document")
        .eq("organization_id", ctx.organizationId)
        .order("id")
        .range(de, ate),
  );

  const vinculos = await carregarTodas<{ pier_client_id: string }>("os vínculos", (de, ate) =>
    ctx.db
      .from("company_pier_link")
      .select("pier_client_id")
      .eq("organization_id", ctx.organizationId)
      .order("pier_client_id")
      .range(de, ate),
  );

  const empresas = await carregarTodas<{ id: string; document_digits: string | null }>(
    "as empresas",
    (de, ate) =>
      ctx.db
        .from("company")
        .select("id, document_digits")
        .eq("organization_id", ctx.organizationId)
        .order("id")
        .range(de, ate),
  );

  return {
    clientes,
    empresas,
    clientesJaVinculados: vinculos.map((v) => v.pier_client_id),
  };
}

/** Somente leitura: mostra o que a rotina faria, sem escrever nada. */
export async function previsualizarVinculoAutomatico(
  ctx: AppContext,
): Promise<ResumoVinculoAutomatico> {
  const estado = await carregarEstadoVinculo(ctx);
  return resumirPlano(planejarVinculo(estado));
}

export interface ExecucaoVinculo extends ResumoVinculoAutomatico {
  vinculados: number;
  empresasCriadas: number;
  falhas: number;
  concluido: boolean;
  /** Quando false, restaram itens: basta rodar de novo (a rotina é retomável). */
  mensagem: string;
}

const LOTE_VINCULO = 200;
const LOTE_EMPRESA = 100;

/**
 * Vincula cada cliente do PIER a uma empresa interna pelo documento normalizado.
 * Idempotente e retomável: nunca apaga empresas, nunca cria empresa quando já
 * existe exatamente uma com o mesmo documento e grava os vínculos logo após
 * criar cada lote de empresas — um timeout no meio não perde progresso.
 */
export async function vincularCarteiraAutomaticamente(
  ctx: AppContext,
  opcoes?: { syncRunId?: string; limiteEmpresas?: number },
): Promise<ExecucaoVinculo> {
  assertCanWrite(ctx);

  const estado = await carregarEstadoVinculo(ctx);
  const plano: PlanoVinculo = planejarVinculo(estado);
  const resumo = resumirPlano(plano);

  const { data: run } = await ctx.db
    .from("sync_run")
    .insert({
      organization_id: ctx.organizationId,
      kind: "VINCULO_CARTEIRA",
      status: "RUNNING",
      started_by: ctx.userId,
      total_items: plano.vincularExistentes.length + plano.criarEmpresas.length,
      scope: resumo as never,
    })
    .select("id")
    .single();

  const runId = run?.id ?? opcoes?.syncRunId ?? null;
  let vinculados = 0;
  let empresasCriadas = 0;
  let falhas = 0;

  const registrarProgresso = async () => {
    if (!runId) return;
    await ctx.db
      .from("sync_run")
      .update({ processed_items: vinculados, failed_items: falhas })
      .eq("id", runId);
  };

  const gravarVinculos = async (
    pares: { pierClientId: string; companyId: string }[],
  ): Promise<void> => {
    if (!pares.length) return;
    const { error } = await ctx.db.from("company_pier_link").upsert(
      pares.map((p) => ({
        organization_id: ctx.organizationId,
        company_id: p.companyId,
        pier_client_id: p.pierClientId,
        linked_by: ctx.userId,
      })),
      { onConflict: "organization_id,pier_client_id" },
    );
    if (error) falhas += pares.length;
    else vinculados += pares.length;
  };

  // 1) Vincula primeiro tudo que já tem empresa (inclui as criadas por execuções interrompidas).
  for (let i = 0; i < plano.vincularExistentes.length; i += LOTE_VINCULO) {
    await gravarVinculos(plano.vincularExistentes.slice(i, i + LOTE_VINCULO));
    await registrarProgresso();
  }

  // 2) Cria apenas empresas que ainda não existem, recarregando o estado a cada lote,
  //    e grava o vínculo do mesmo lote imediatamente.
  const limite = opcoes?.limiteEmpresas ?? plano.criarEmpresas.length;
  const aCriar = plano.criarEmpresas.slice(0, limite);

  for (let i = 0; i < aCriar.length; i += LOTE_EMPRESA) {
    const lote = aCriar.slice(i, i + LOTE_EMPRESA);
    const documentos = lote.map((c) => c.documento);

    // Recarrega o estado deste lote: outra execução pode já ter criado estas empresas.
    const { data: existentes, error: erroExistentes } = await ctx.db
      .from("company")
      .select("id, document_digits")
      .eq("organization_id", ctx.organizationId)
      .in("document_digits", documentos);
    if (erroExistentes)
      throw new AppError(
        "INESPERADO",
        "Não foi possível verificar as empresas existentes.",
        erroExistentes.message,
      );

    const porDocumento = new Map<string, string[]>();
    for (const e of existentes ?? []) {
      const d = e.document_digits ?? "";
      if (!d) continue;
      const atual = porDocumento.get(d);
      if (atual) atual.push(e.id);
      else porDocumento.set(d, [e.id]);
    }

    const paresDoLote: { pierClientId: string; companyId: string }[] = [];
    const novas = lote.filter((c) => {
      const ids = porDocumento.get(c.documento) ?? [];
      if (ids.length === 1) {
        paresDoLote.push({ pierClientId: c.pierClientId, companyId: ids[0]! });
        return false;
      }
      if (ids.length > 1) {
        falhas += 1;
        return false;
      }
      return true;
    });

    if (novas.length) {
      const { data: criadas, error } = await ctx.db
        .from("company")
        .insert(
          novas.map((c) => ({
            organization_id: ctx.organizationId,
            name: c.nome,
            document: c.documentoOriginal,
            active: true,
          })),
        )
        .select("id, document_digits");

      if (error || !criadas) {
        falhas += novas.length;
      } else {
        empresasCriadas += criadas.length;
        const mapaCriadas = new Map(
          criadas.map((e) => [e.document_digits ?? "", e.id] as const),
        );
        for (const c of novas) {
          const id = mapaCriadas.get(c.documento);
          if (id) paresDoLote.push({ pierClientId: c.pierClientId, companyId: id });
          else falhas += 1;
        }
      }
    }

    // Vínculo gravado imediatamente após a criação do lote: execução retomável.
    await gravarVinculos(paresDoLote);
    await registrarProgresso();
  }

  const concluido = aCriar.length === plano.criarEmpresas.length;
  const mensagem = concluido
    ? `Vínculo concluído: ${vinculados} vínculos, ${empresasCriadas} empresas criadas.`
    : `Parcial: ${vinculados} vínculos. Execute novamente para continuar.`;

  if (runId) {
    await ctx.db
      .from("sync_run")
      .update({
        status: falhas > 0 && vinculados === 0 ? "FAILED" : "COMPLETED",
        processed_items: vinculados,
        failed_items: falhas,
        message: mensagem,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
  }

  await audit(ctx, {
    action: "VINCULAR_CARTEIRA_AUTOMATICO",
    entity: "company_pier_link",
    after: { ...resumo, vinculados, empresasCriadas, falhas } as never,
  });

  return { ...resumo, vinculados, empresasCriadas, falhas, concluido, mensagem };
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
    // Consulta indexada por (organization_id, document_digits): nunca carrega a tabela inteira.
    const { data: empresas, error } = await ctx.db
      .from("company")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("document_digits", documento)
      .limit(2);
    if (error)
      throw new AppError("INESPERADO", "Não foi possível consultar as empresas.", error.message);
    if ((empresas ?? []).length > 1)
      throw new AppError(
        "REGRA_NEGOCIO",
        "Este CNPJ está em mais de uma empresa interna. Resolva a duplicidade antes de vincular.",
      );
    empresaId = empresas?.[0]?.id ?? null;
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

/** Vincula vários clientes de uma vez; erros por linha não abortam o lote. */
export async function vincularClientesEmLote(ctx: AppContext, pierClientIds: string[]) {
  assertCanWrite(ctx);
  let vinculados = 0;
  const falhas: { pierClientId: string; motivo: string }[] = [];

  for (const id of pierClientIds) {
    try {
      await vincularCliente(ctx, id);
      vinculados += 1;
    } catch (error) {
      falhas.push({
        pierClientId: id,
        motivo:
          error instanceof AppError ? error.userMessage : "Falha inesperada ao vincular o cliente.",
      });
    }
  }

  return { vinculados, falhas };
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
