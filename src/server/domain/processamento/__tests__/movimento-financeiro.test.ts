import { describe, expect, it } from "vitest";

import { conferirMovimentoFinanceiro } from "../processamento.service";

const baixarVazio = async () => new Uint8Array();

describe("Movimento Financeiro Mensal", () => {
  it("bloqueia quando não há extrato nem declaração sem movimento", async () => {
    const resultado = await conferirMovimentoFinanceiro(
      [],
      "Documentação pendente",
      baixarVazio,
    );
    expect(resultado.situacao).toBe("BLOQUEADO");
  });

  it("libera com declaração expressa de empresa sem movimento", async () => {
    const resultado = await conferirMovimentoFinanceiro(
      [],
      "Empresa sem movimentação nesta competência.",
      baixarVazio,
    );
    expect(resultado.situacao).toBe("LIBERADO");
    expect(resultado.semMovimentoDeclarado).toBe(true);
  });

  it("libera com extrato bancário e identifica aplicações e e-CAC", async () => {
    const resultado = await conferirMovimentoFinanceiro(
      [
        {
          externalId: "1",
          name: "extrato_banco_itau.ofx",
          category: null,
          mimeType: "application/ofx",
        },
        {
          externalId: "2",
          name: "extrato_aplicacao_cdb.xlsx",
          category: null,
          mimeType: null,
        },
        {
          externalId: "3",
          name: "comprovante_e-cac_receita.pdf",
          category: null,
          mimeType: "application/pdf",
        },
      ],
      "",
      async () => {
        throw new Error("PDF indisponível no teste");
      },
    );
    expect(resultado.situacao).toBe("LIBERADO");
    expect(resultado.extratosBancarios).toHaveLength(1);
    expect(resultado.extratosAplicacoes).toHaveLength(1);
    expect(resultado.comprovantesEcac).toHaveLength(1);
  });
});
