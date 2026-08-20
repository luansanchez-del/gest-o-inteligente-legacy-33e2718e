import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { carregarUsuariosPier } from "./pier-user.repo";
import { solicitacaoFinalizadaPier } from "./status-pier";

const TIPOS_INTERNOS = new Set(["colaborador", "gestor", "encarregado"]);
const CONCORRENCIA = 6;

function normalizar(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function timestamp(value: string | null | undefined) {
  if (!value) return 0;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

async function nomesInternos(ctx: AppContext) {
  const usuarios = await carregarUsuariosPier<{
    name: string;
    kind: string | null;
  }>(ctx, "name, kind");
  return new Set(
    usuarios
      .filter((u) => TIPOS_INTERNOS.has((u.kind ?? "").toLowerCase()))
      .map((u) => normalizar(u.name))
      .filter(Boolean),
  );
}

async function salvarEstado(
  ctx: AppContext,
  input: {
    requestId: string;
    status: "RESPONDIDA" | "NAO_RESPONDIDA";
    postExternalId?: string | null;
    authorName?: string | null;
    postedAt?: string | null;
  },
) {
  const agora = new Date().toISOString();
  const { error } = await (ctx.db as any).from("request_response_state").upsert(
    {
      organization_id: ctx.organizationId,
      request_id: input.requestId,
      status: input.status,
      checked_at: agora,
      post_external_id: input.postExternalId ?? null,
      author_name: input.authorName ?? null,
      posted_at: input.postedAt ?? null,
      source: "PIER",
      updated_at: agora,
    },
    { onConflict: "organization_id,request_id" },
  );
  if (error)
    throw new AppError(
      "INESPERADO",
      "Não foi possível guardar o status da resposta.",
      error.message,
    );
}

async function ultimaReabertura(ctx: AppContext, externalId: string) {
  const { data } = await ctx.db
    .from("audit_log")
    .select("created_at")
    .eq("organization_id", ctx.organizationId)
    .eq("correlation_id", externalId)
    .eq("action", "REQUEST_REOPENED_PIER")
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.created_at ?? null;
}

/**
 * O endpoint de listagem do PIER pode ficar defasado depois de uma reabertura.
 * Antes de decidir se pode responder, o detalhe individual é a fonte de verdade.
 * Quando detectamos Finalizada -> Aberta/Andamento, limpamos finished_at e abrimos
 * um novo ciclo de resposta, sem apagar o histórico das postagens anteriores.
 */
async function reconciliarEstadoAtualPier(
  ctx: AppContext,
  input: { requestId: string; requestExternalId: string },
) {
  const { data: local, error } = await ctx.db
    .from("request")
    .select("id, external_id, status, finished_at")
    .eq("organization_id", ctx.organizationId)
    .eq("id", input.requestId)
    .maybeSingle();
  if (error || !local)
    throw new AppError(
      "VALIDACAO",
      "A solicitação não foi localizada na base da Gestão.",
      error?.message,
    );

  const detalhe = await pierAdapter.getRequest({
    requestExternalId: input.requestExternalId,
  });
  const eraFinalizada = solicitacaoFinalizadaPier(local.status, local.finished_at);
  const estaFinalizada = solicitacaoFinalizadaPier(detalhe.status, detalhe.finishedAt);
  const agora = new Date().toISOString();
  let reabertaEm: string | null = null;

  if (eraFinalizada && !estaFinalizada) {
    reabertaEm = agora;
    const { error: updateError } = await ctx.db
      .from("request")
      .update({
        status: detalhe.status ?? local.status,
        finished_at: null,
        synced_at: agora,
      })
      .eq("id", local.id);
    if (updateError)
      throw new AppError(
        "INESPERADO",
        "Não foi possível registrar a reabertura da solicitação.",
        updateError.message,
      );

    // O ciclo anterior não pode ser reaproveitado: nova resposta e nova decisão são obrigatórias.
    await ctx.db
      .from("request_processing")
      .update({
        outcome: "PENDENTE",
        reason: "Solicitação reaberta no PIER; novo ciclo de análise/resposta necessário.",
        execution_id: null,
        attachment_id: null,
        content_hash: null,
        pier_post_external_id: null,
        posted_at: null,
        finalized_at: null,
        updated_at: agora,
      })
      .eq("organization_id", ctx.organizationId)
      .eq("request_id", local.id);

    await salvarEstado(ctx, {
      requestId: local.id,
      status: "NAO_RESPONDIDA",
    });

    await audit(ctx, {
      action: "REQUEST_REOPENED_PIER",
      entity: "request",
      entityId: local.id,
      correlationId: local.external_id,
      before: { status: local.status, finishedAt: local.finished_at },
      after: {
        status: detalhe.status ?? local.status,
        finishedAt: null,
        reabertaEm,
        cicloAnteriorResetado: true,
      },
    });
  } else {
    // Mesmo sem transição detectável, um status atual de trabalho elimina finished_at obsoleto.
    const finishedAtAtual = estaFinalizada
      ? (detalhe.finishedAt ?? local.finished_at)
      : null;
    await ctx.db
      .from("request")
      .update({
        status: detalhe.status ?? local.status,
        finished_at: finishedAtAtual,
        synced_at: agora,
      })
      .eq("id", local.id);
  }

  if (!reabertaEm) reabertaEm = await ultimaReabertura(ctx, local.external_id);

  return {
    status: detalhe.status ?? local.status,
    finalizada: estaFinalizada,
    reabertaEm,
  };
}

export async function verificarRespostaPier(
  ctx: AppContext,
  input: {
    requestId: string;
    requestExternalId: string;
    internos?: Set<string>;
    persistir?: boolean;
  },
) {
  const internos = input.internos ?? (await nomesInternos(ctx));
  const ciclo = await reconciliarEstadoAtualPier(ctx, input);
  const limiteReabertura = timestamp(ciclo.reabertaEm);

  const posts = await pierAdapter.listPosts({
    requestExternalId: input.requestExternalId,
  });
  const internosEncontrados = posts
    .filter((post) => {
      const autor = normalizar(post.authorName);
      if (!autor || !internos.has(autor)) return false;
      if (limiteReabertura > 0) {
        const publicado = timestamp(post.postedAt);
        return publicado > 0 && publicado >= limiteReabertura;
      }
      return true;
    })
    .sort((a, b) => timestamp(b.postedAt) - timestamp(a.postedAt));

  const ultimo = internosEncontrados[0] ?? null;
  const estado = ultimo
    ? {
        status: "RESPONDIDA" as const,
        postExternalId: ultimo.externalId,
        authorName: ultimo.authorName,
        postedAt: ultimo.postedAt,
        reabertaEm: ciclo.reabertaEm,
        statusPier: ciclo.status,
        finalizada: ciclo.finalizada,
      }
    : {
        status: "NAO_RESPONDIDA" as const,
        postExternalId: null,
        authorName: null,
        postedAt: null,
        reabertaEm: ciclo.reabertaEm,
        statusPier: ciclo.status,
        finalizada: ciclo.finalizada,
      };

  if (input.persistir !== false) {
    await salvarEstado(ctx, {
      requestId: input.requestId,
      ...estado,
    });
  }
  return estado;
}

export async function verificarRespostaPierPorExternalId(
  ctx: AppContext,
  solicitacaoExternalId: string,
) {
  const { data: request, error } = await ctx.db
    .from("request")
    .select("id, external_id")
    .eq("organization_id", ctx.organizationId)
    .eq("external_id", solicitacaoExternalId)
    .maybeSingle();
  if (error || !request)
    throw new AppError(
      "VALIDACAO",
      "A solicitação não foi localizada na base da Gestão.",
      error?.message,
    );
  return verificarRespostaPier(ctx, {
    requestId: request.id,
    requestExternalId: request.external_id,
  });
}

export async function sincronizarRespostasPier(
  ctx: AppContext,
  input: { solicitacoes: string[] },
) {
  assertCanWrite(ctx);
  const ids = [...new Set(input.solicitacoes.map((id) => id.trim()).filter(Boolean))].slice(0, 100);
  if (!ids.length)
    throw new AppError("VALIDACAO", "Nenhuma solicitação foi informada para verificar respostas.");

  const { data: requests, error } = await ctx.db
    .from("request")
    .select("id, external_id")
    .eq("organization_id", ctx.organizationId)
    .in("external_id", ids);
  if (error)
    throw new AppError("INESPERADO", "Não foi possível localizar as solicitações.", error.message);

  const internos = await nomesInternos(ctx);
  const fila = [...(requests ?? [])];
  const resultados: Array<{
    solicitacaoExternalId: string;
    status: "RESPONDIDA" | "NAO_RESPONDIDA" | "ERRO";
    autor?: string | null;
    respondidaEm?: string | null;
    reabertaEm?: string | null;
    statusPier?: string | null;
    erro?: string;
  }> = [];

  async function worker() {
    while (fila.length) {
      const request = fila.shift();
      if (!request) return;
      try {
        const estado = await verificarRespostaPier(ctx, {
          requestId: request.id,
          requestExternalId: request.external_id,
          internos,
        });
        resultados.push({
          solicitacaoExternalId: request.external_id,
          status: estado.status,
          autor: estado.authorName,
          respondidaEm: estado.postedAt,
          reabertaEm: estado.reabertaEm,
          statusPier: estado.statusPier,
        });
      } catch (error) {
        resultados.push({
          solicitacaoExternalId: request.external_id,
          status: "ERRO",
          erro: error instanceof Error ? error.message : "Falha ao consultar as postagens do PIER.",
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, fila.length || 1) }, () => worker()));

  const resumo = {
    total: resultados.length,
    respondidas: resultados.filter((r) => r.status === "RESPONDIDA").length,
    semResposta: resultados.filter((r) => r.status === "NAO_RESPONDIDA").length,
    reabertas: resultados.filter((r) => Boolean(r.reabertaEm)).length,
    erros: resultados.filter((r) => r.status === "ERRO").length,
  };

  await audit(ctx, {
    action: "SINCRONIZAR_RESPOSTAS_PIER",
    entity: "request_response_state",
    after: resumo,
  });

  return { resumo, resultados };
}
