import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";

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

export interface ResumoVinculoAutomatico {
  sincronizados: number;
  vinculados: number;
  criados: number;
  conflitos: number;
  semDocumento: number;
}

function normalizarDocumento(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

/** Aceita CNPJ (14) e CPF (11); qualquer outro tamanho é documento inválido. */
function documentoValido(digitos: string) {
  return digitos.length === 14 || digitos.length === 11;
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
  buscarPagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
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

    // Vínculo automático por CNPJ logo após o upsert: a carteira já chega pronta para uso.
    const vinculo = await vincularCarteiraAutomaticamente(ctx, run.id);

    await finalizar("COMPLETED", { total: clientes.length, processados, falhas });
    await audit(ctx, {
      action: "SINCRONIZAR_CARTEIRA",
      entity: "sync_run",
      entityId: run.id,
      after: { total: clientes.length, processados, falhas, ...vinculo },
    });

    return { syncRunId: run.id, total: clientes.length, processados, falhas, vinculo };

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

/**
 * Vincula automaticamente cada cliente do PIER a uma empresa interna pelo CNPJ normalizado.
 * Reaproveita a empresa existente; se não houver, cria uma empresa mínima.
 * Documento ausente, inválido ou repetido na carteira nunca é vinculado — vai para revisão.
 */
export async function vincularCarteiraAutomaticamente(
  ctx: AppContext,
  syncRunId?: string,
): Promise<ResumoVinculoAutomatico> {
  assertCanWrite(ctx);

  const clientes = await carregarTodas<{ id: string; name: string; document: string | null }>(
    "a carteira",
    (de, ate) =>
      ctx.db
        .from("pier_client")
        .select("id, name, document")
        .eq("organization_id", ctx.organizationId)
        .order("name")
        .range(de, ate),
  );

  const ocorrencias = new Map<string, number>();
  for (const c of clientes) {
    const digitos = normalizarDocumento(c.document);
    if (digitos) ocorrencias.set(digitos, (ocorrencias.get(digitos) ?? 0) + 1);
  }

  const vinculosAtuais = await carregarTodas("os vínculos", (de, ate) =>
    ctx.db
      .from("company_pier_link")
      .select("pier_client_id")
      .eq("organization_id", ctx.organizationId)
      .order("pier_client_id")
      .range(de, ate),
  );
  const jaVinculados = new Set(vinculosAtuais.map((v) => v.pier_client_id));

  // Todas as empresas precisam estar carregadas ANTES de qualquer criação,
  // senão o vínculo automático recria empresas que já existem além da 1000ª linha.
  const empresas = await carregarTodas("as empresas", (de, ate) =>
    ctx.db
      .from("company")
      .select("id, document_digits")
      .eq("organization_id", ctx.organizationId)
      .order("id")
      .range(de, ate),
  );
  // Documento repetido entre empresas internas nunca escolhe "a primeira": vira conflito.
  const empresasPorDocumento = new Map<string, string[]>();
  for (const e of empresas) {
    const digitos = e.document_digits ?? "";
    if (!digitos) continue;
    const atual = empresasPorDocumento.get(digitos);
    if (atual) atual.push(e.id);
    else empresasPorDocumento.set(digitos, [e.id]);
  }


  const resumo: ResumoVinculoAutomatico = {
    sincronizados: clientes.length,
    vinculados: 0,
    criados: 0,
    conflitos: 0,
    semDocumento: 0,
  };

  const eventos: { level: "WARNING"; message: string }[] = [];
  const novosVinculos: {
    organization_id: string;
    company_id: string;
    pier_client_id: string;
    linked_by: string;
  }[] = [];

  for (const cliente of clientes) {
    if (jaVinculados.has(cliente.id)) {
      resumo.vinculados += 1;
      continue;
    }

    const motivo = classificarDocumento(cliente.document, ocorrencias);
    if (motivo === "SEM_DOCUMENTO") {
      resumo.semDocumento += 1;
      eventos.push({ level: "WARNING", message: `${cliente.name}: sem CNPJ/CPF informado.` });
      continue;
    }
    if (motivo) {
      resumo.conflitos += 1;
      eventos.push({
        level: "WARNING",
        message:
          motivo === "DOCUMENTO_DUPLICADO"
            ? `${cliente.name}: CNPJ repetido na carteira do PIER.`
            : `${cliente.name}: documento inválido (${cliente.document}).`,
      });
      continue;
    }

    const digitos = normalizarDocumento(cliente.document);
    const candidatas = empresasPorDocumento.get(digitos) ?? [];
    if (candidatas.length > 1) {
      resumo.conflitos += 1;
      eventos.push({
        level: "WARNING",
        message: `${cliente.name}: CNPJ presente em mais de uma empresa interna — revisão manual.`,
      });
      continue;
    }

    let empresaId = candidatas[0] ?? null;

    if (!empresaId) {
      const { data: nova, error } = await ctx.db
        .from("company")
        .insert({
          organization_id: ctx.organizationId,
          name: cliente.name,
          document: cliente.document,
          active: true,
        })
        .select("id")
        .single();
      if (error || !nova) {
        resumo.conflitos += 1;
        eventos.push({
          level: "WARNING",
          message: `${cliente.name}: não foi possível criar a empresa interna.`,
        });
        continue;
      }
      empresaId = nova.id;
      empresasPorDocumento.set(digitos, [empresaId]);
      resumo.criados += 1;
    }


    novosVinculos.push({
      organization_id: ctx.organizationId,
      company_id: empresaId,
      pier_client_id: cliente.id,
      linked_by: ctx.userId,
    });
  }

  const LOTE = 250;
  for (let inicio = 0; inicio < novosVinculos.length; inicio += LOTE) {
    const lote = novosVinculos.slice(inicio, inicio + LOTE);
    const { error } = await ctx.db
      .from("company_pier_link")
      .upsert(lote, { onConflict: "organization_id,pier_client_id" });
    if (error) {
      resumo.conflitos += lote.length;
      eventos.push({ level: "WARNING", message: `Falha ao vincular lote: ${error.message}` });
    } else {
      resumo.vinculados += lote.length;
    }
  }

  if (syncRunId && eventos.length) {
    const amostra = eventos.slice(0, 200);
    await ctx.db.from("sync_event").insert(
      amostra.map((e) => ({
        organization_id: ctx.organizationId,
        sync_run_id: syncRunId,
        level: e.level,
        message: e.message,
      })),
    );
  }

  await audit(ctx, {
    action: "VINCULAR_CARTEIRA_AUTOMATICO",
    entity: "company_pier_link",
    after: resumo as never,
  });

  return resumo;
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
