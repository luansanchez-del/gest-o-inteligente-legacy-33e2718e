import { describe, expect, it, vi } from "vitest";

import { criarDbFalso } from "../../carteira/__tests__/db-falso";
import {
  detalharSolicitacao,
  excluirDecisao,
  registrarDecisao,
} from "../validacao.service";

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
      },
      { pier: { createPost } },
    );

    expect(resultado.pierEnviado).toBe(true);
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        requestExternalId: SOLICITACAO.external_id,
        privada: true,
        // Mensagem enxuta e sem identificar quem decidiu (não expõe e-mail no PIER).
        mensagem: "Aprovado. Tudo certo",
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

describe("detalharSolicitacao / instrução efetiva", () => {
  it("reinterpreta a instrução a partir do texto, sem travar no snapshot antigo salvo no sync", async () => {
    // Caso real: um post foi sincronizado quando interpretarTexto ainda
    // extraía qualquer data solta do texto. O snapshot `interpreted` salvo
    // naquele momento ficou com um período errado (2026-03 a 2026-04) que
    // não tem nada a ver com o fechamento -- e como o sync só insere
    // instruções novas (nunca reprocessa as já salvas), reprocessar o
    // balancete sozinho não corrigia isso: listarInstrucoes preferia o
    // `interpreted` gravado em vez de recalcular.
    const { ctx } = contexto({
      request_instruction: [
        {
          organization_id: "org-1",
          request_id: "req-1",
          source: "TITLE",
          source_external_id: null,
          occurred_at: null,
          created_at: "2026-08-14T01:30:09Z",
          text: "FECHAMENTO CONTÁBIL - 01/2026",
          interpreted: { inicio: "2026-01", fim: "2026-01", tipo: "MES", trecho: "..." },
        },
        {
          organization_id: "org-1",
          request_id: "req-1",
          source: "POST",
          source_external_id: "post-1",
          occurred_at: "2026-06-01T15:42:16Z",
          created_at: "2026-06-01T15:42:16Z",
          text: "Fechamento contabil finalizado 01/2026, segue balancete para validação",
          interpreted: { inicio: "2026-01", fim: "2026-01", tipo: "MES", trecho: "..." },
        },
        {
          organization_id: "org-1",
          request_id: "req-1",
          source: "POST",
          source_external_id: "post-2",
          occurred_at: "2026-06-01T16:48:19Z",
          created_at: "2026-06-01T16:48:19Z",
          text: "OBSERVAÇÕES E SOLICITAÇÕES *EMPRESA ENVIOU ALGUNS BORDEROS EM 04/2026 *COFINS FALTOU PAGAMENTO DOS MESES 01/2026- 03/2026 CONFORME COMPROVANTES ECAC",
          // Snapshot desatualizado: gravado com a regra antiga, que pegava
          // qualquer data solta do texto inteiro.
          interpreted: { inicio: "2026-03", fim: "2026-04", tipo: "INTERVALO", trecho: "..." },
        },
      ],
    });

    const resultado = await detalharSolicitacao(ctx, {
      solicitacaoExternalId: SOLICITACAO.external_id,
      sincronizarPostagens: false,
    });

    expect(resultado.instrucaoEfetiva?.interpretado.inicio).toBe("2026-01");
    expect(resultado.instrucaoEfetiva?.interpretado.fim).toBe("2026-01");
  });
});
