import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { carregarUsuariosPier } from "./pier-user.repo";

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
  const posts = await pierAdapter.listPosts({
    requestExternalId: input.requestExternalId,
  });
  const internosEncontrados = posts
    .filter((post) => {
      const autor = normalizar(post.authorName);
      return Boolean(autor && internos.has(autor));
    })
    .sort((a, b) => timestamp(b.postedAt) - timestamp(a.postedAt));

  const ultimo = internosEncontrados[0] ?? null;
  const estado = ultimo
    ? {
        status: "RESPONDIDA" as const,
        postExternalId: ultimo.externalId,
        authorName: ultimo.authorName,
        postedAt: ultimo.postedAt,
      }
    : {
        status: "NAO_RESPONDIDA" as const,
        postExternalId: null,
        authorName: null,
        postedAt: null,
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
    erros: resultados.filter((r) => r.status === "ERRO").length,
  };

  await audit(ctx, {
    action: "SINCRONIZAR_RESPOSTAS_PIER",
    entity: "request_response_state",
    after: resumo,
  });

  return { resumo, resultados };
}
