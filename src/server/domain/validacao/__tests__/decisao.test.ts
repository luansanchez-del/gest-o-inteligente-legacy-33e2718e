import { describe, expect, it, vi } from "vitest";

import { criarDbFalso } from "../../carteira/__tests__/db-falso";
import { excluirDecisao, registrarDecisao } from "../validacao.service";

const SOLICITACAO = {
  id: "req-1",
  organization_id: "org-1",
  external_id: "35806843",
  number: "1509-EF",
  description: "FECHAMENTO CONTÁBIL - 07/2026",
  status: "Em andamento",
  reference_month: "2026-07",
  client_name: "TONIOLO LTDA",
  client_document: "12.345.678/0001-90",
  has_attachment: true,
  finished_at: null,
};

function contexto(linhas: Record<string, Record<string, unknown>[]> = {}) {
  return criarDbFalso({ request: [SOLICITACAO], audit_log: [], ...linhas });
}

describe("registrarDecisao", () => {
  it("publica a decisão como comentário privado no PIER e marca SENT", async () => {
    const { ctx, gravacoes } = contexto();
    const createPost = vi.fn(async () => ({ externalId: "post-1" }));

    const resultado = await registrarDecisao(
      ctx,
      {
        solicitacaoExternalId: SOLICITACAO.external_id,
        decisao: "APPROVED",
        notas: "Tudo certo",
        autorEmail: "contabilidade@grouplegacy.com.br",
      },
      { pier: { createPost } },
    );

    expect(resultado.pierEnviado).toBe(true);
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        requestExternalId: SOLICITACAO.external_id,
        privada: true,
      }),
    );
    const update = gravacoes.find(
      (g) => g.tabela === "request_decision" && g.operacao === "insert",
    );
    expect(update).toBeTruthy();
  });

  it("não falha a decisão quando a publicação no PIER dá erro, mas marca FAILED", async () => {
    const { ctx } = contexto();
    const createPost = vi.fn(async () => {
      throw new Error("PIER fora do ar");
    });

    const resultado = await registrarDecisao(
      ctx,
      {
        solicitacaoExternalId: SOLICITACAO.external_id,
        decisao: "RETURNED",
        notas: null,
      },
      { pier: { createPost } },
    );

    expect(resultado.decisaoId).toBeTruthy();
    expect(resultado.pierEnviado).toBe(false);
    expect(resultado.avisoPier).toContain("não foi possível publicar");
  });
});

describe("excluirDecisao", () => {
  it("remove o registro interno da decisão", async () => {
    const { ctx, tabelasEscritas } = contexto({
      request_decision: [
        {
          id: "dec-1",
          organization_id: "org-1",
          request_id: "req-1",
          decision: "APPROVED",
        },
      ],
    });

    const resultado = await excluirDecisao(ctx, {
      solicitacaoExternalId: SOLICITACAO.external_id,
      decisaoId: "dec-1",
    });

    expect(resultado.excluida).toBe(true);
    expect(tabelasEscritas).toContain("request_decision");
  });

  it("recusa excluir decisão que não pertence à solicitação", async () => {
    const { ctx } = contexto({ request_decision: [] });

    await expect(
      excluirDecisao(ctx, {
        solicitacaoExternalId: SOLICITACAO.external_id,
        decisaoId: "inexistente",
      }),
    ).rejects.toThrow();
  });
});
