import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { departamentosContabeis, resolverTipoSolicitacao } from "../gestao/escopo.service";

/**
 * ARQUITETURA (decidida com o usuário):
 * a carteira do PIER é apenas CACHE/CATÁLOGO para localizar clientes e suas solicitações.
 * Este módulo NÃO lê nem escreve em `company` ou `company_pier_link`.
 * As tabelas legadas continuam no banco (2.086 empresas e vínculos recentes) e serão
 * tratadas em auditoria separada — nada é apagado nem alterado aqui.
 */

export interface CarteiraFiltros {
  busca?: string;
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
}

export interface CarteiraResumo {
  /** Totais globais da carteira — nunca afetados pelos filtros da tela. */
  total: number;
  ativos: number;
  inativos: number;
  outrosStatus: number;
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

function normalizarDocumento(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

const TAMANHO_PAGINA = 1000;

/**
 * PostgREST corta qualquer consulta em 1000 linhas. Este helper pagina por `range`
 * até esgotar a tabela — obrigatório em toda leitura da carteira.
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

  const todasAsLinhas: CarteiraLinha[] = clientes.map((c) => ({
    pierClientId: c.id,
    externalId: c.external_id,
    nome: c.name,
    documento: c.document,
    status: c.status,
    regime: c.tax_regime,
    responsavel: c.responsible_name,
    sincronizadoEm: c.synced_at,
  }));

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

  const houveFiltro = linhas.length !== todasAsLinhas.length;

  const { data: ultima } = await ctx.db
    .from("sync_run")
    .select("id, status, started_at, finished_at, processed_items, failed_items, message")
    .eq("organization_id", ctx.organizationId)
    .eq("kind", "CARTEIRA")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ehAtivo = (s: string | null) => (s ?? "").trim().toLowerCase().startsWith("ativ");
  const ehInativo = (s: string | null) => (s ?? "").trim().toLowerCase().startsWith("inativ");

  return {
    linhas,
    resumo: {
      total: todasAsLinhas.length,
      ativos: todasAsLinhas.filter((l) => ehAtivo(l.status)).length,
      inativos: todasAsLinhas.filter((l) => ehInativo(l.status)).length,
      outrosStatus: todasAsLinhas.filter((l) => !ehAtivo(l.status) && !ehInativo(l.status)).length,
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

export interface SolicitacaoDoCliente {
  externalId: string;
  numero: string | null;
  descricao: string | null;
  status: string | null;
  competencia: string | null;
  responsavelNome: string | null;
  departamentoId: string | null;
  departamentoNome: string | null;
  contabil: boolean;
  temAnexoPier: boolean;
  documentoDisponivel: boolean;
  postagens: number;
  solicitadaEm: string | null;
  prazo: string | null;
}

/**
 * Solicitações do cliente do PIER. Nesta fase, apenas Fechamento Contábil (117418).
 * Não depende de company nem de vínculo — casa por client_external_id ou CNPJ.
 */
export async function listarSolicitacoesDoCliente(
  ctx: AppContext,
  entrada: { clientExternalId?: string | null; documento?: string | null },
): Promise<SolicitacaoDoCliente[]> {
  const externalId = entrada.clientExternalId?.trim() || null;
  const digitos = normalizarDocumento(entrada.documento);
  if (!externalId && !digitos)
    throw new AppError("VALIDACAO", "Informe o cliente do PIER ou o CNPJ/CPF.");

  const typeExternalId = await resolverTipoSolicitacao(ctx, "CONTABIL");

  const colunas =
    "id, external_id, number, description, status, reference_month, responsible_name, department_external_id, client_external_id, client_document, has_attachment, requested_at, deadline_at";

  const consultas: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>[] = [];
  if (externalId)
    consultas.push(
      ctx.db
        .from("request")
        .select(colunas)
        .eq("organization_id", ctx.organizationId)
        .eq("type_external_id", typeExternalId)
        .eq("client_external_id", externalId),
    );
  if (digitos)
    consultas.push(
      ctx.db
        .from("request")
        .select(colunas)
        .eq("organization_id", ctx.organizationId)
        .eq("type_external_id", typeExternalId)
        .ilike("client_document", `%${digitos}%`),
    );

  type LinhaRequest = {
    id: string;
    external_id: string;
    number: string | null;
    description: string | null;
    status: string | null;
    reference_month: string | null;
    responsible_name: string | null;
    department_external_id: string | null;
    client_document: string | null;
    has_attachment: boolean;
    requested_at: string | null;
    deadline_at: string | null;
  };

  const resultados = await Promise.all(consultas);
  const porId = new Map<string, LinhaRequest>();
  for (const { data, error } of resultados) {
    if (error)
      throw new AppError("INESPERADO", "Não foi possível carregar as solicitações.", error.message);
    for (const linha of (data ?? []) as LinhaRequest[]) {
      // O CNPJ do PIER pode vir formatado; conferimos pelos dígitos.
      if (digitos && !externalId && !normalizarDocumento(linha.client_document).includes(digitos))
        continue;
      porId.set(linha.id, linha);
    }
  }

  const linhas = [...porId.values()];
  if (!linhas.length) return [];

  const ids = linhas.map((l) => l.id);
  const [{ data: departamentos }, { data: anexos }, { data: posts }, contabeis] = await Promise.all([
    ctx.db
      .from("pier_department")
      .select("external_id, name")
      .eq("organization_id", ctx.organizationId),
    ctx.db
      .from("request_attachment")
      .select("request_id")
      .eq("organization_id", ctx.organizationId)
      .in("request_id", ids),
    ctx.db
      .from("post")
      .select("request_id")
      .eq("organization_id", ctx.organizationId)
      .in("request_id", ids),
    departamentosContabeis(ctx),
  ]);

  const deptoNome = new Map((departamentos ?? []).map((d) => [d.external_id, d.name]));
  const comAnexoInterno = new Set((anexos ?? []).map((a) => a.request_id));
  const postagens = new Map<string, number>();
  for (const p of posts ?? []) postagens.set(p.request_id, (postagens.get(p.request_id) ?? 0) + 1);
  const setContabeis = new Set(contabeis);

  return linhas
    .map((l) => ({
      externalId: l.external_id,
      numero: l.number,
      descricao: l.description,
      status: l.status,
      competencia: l.reference_month,
      responsavelNome: l.responsible_name,
      departamentoId: l.department_external_id,
      departamentoNome: l.department_external_id
        ? (deptoNome.get(l.department_external_id) ?? null)
        : null,
      contabil: Boolean(l.department_external_id && setContabeis.has(l.department_external_id)),
      temAnexoPier: Boolean(l.has_attachment),
      documentoDisponivel: comAnexoInterno.has(l.id),
      postagens: postagens.get(l.id) ?? 0,
      solicitadaEm: l.requested_at,
      prazo: l.deadline_at,
    }))
    .sort((a, b) => (b.competencia ?? "").localeCompare(a.competencia ?? ""));
}

/**
 * Sincronização sempre manual: só roda sob comando explícito do usuário.
 * Atualiza exclusivamente `pier_client` — nenhuma empresa ou vínculo é criado.
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
