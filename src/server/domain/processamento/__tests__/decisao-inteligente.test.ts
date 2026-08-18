import { describe, expect, it } from "vitest";

import { montarRecomendacaoDecisao } from "../decisao-inteligente.core";

describe("decisão inteligente do fechamento", () => {
  it("recomenda finalizar quando a análise está aprovada sem alertas", () => {
    const decisao = montarRecomendacaoDecisao({
      clienteNome: "Empresa Teste",
      competencia: "2026-07",
      resultado: "APROVADO",
      analiseDisponivel: true,
      achados: [],
    });

    expect(decisao.tipo).toBe("APROVAR_FINALIZAR");
    expect(decisao.podeFinalizar).toBe(true);
    expect(decisao.exigeJustificativa).toBe(false);
    expect(decisao.respostaSugerida).toContain("apto para conclusão");
  });

  it("exige justificativa quando existem apenas alertas", () => {
    const decisao = montarRecomendacaoDecisao({
      clienteNome: "Empresa Teste",
      competencia: "2026-07",
      resultado: "COM_ALERTAS",
      analiseDisponivel: true,
      achados: [
        {
          severidade: "WARNING",
          titulo: "Saldo relevante sem composição",
          contaCodigo: "1.1.01.001",
          detalhe: "Saldo de R$ 100.000,00.",
          exigeHumano: true,
        },
      ],
    });

    expect(decisao.tipo).toBe("APROVAR_COM_JUSTIFICATIVA");
    expect(decisao.podeFinalizar).toBe(true);
    expect(decisao.exigeJustificativa).toBe(true);
    expect(decisao.respostaSugerida).toContain("1.1.01.001");
  });

  it("bloqueia finalização quando há erro contábil", () => {
    const decisao = montarRecomendacaoDecisao({
      clienteNome: "Empresa Teste",
      competencia: "2026-07",
      resultado: "REPROVADO",
      analiseDisponivel: true,
      achados: [
        {
          severidade: "BLOCKER",
          titulo: "Débitos e créditos não fecham",
          detalhe: "Diferença de R$ 10,00.",
        },
      ],
    });

    expect(decisao.tipo).toBe("SOLICITAR_CORRECAO");
    expect(decisao.podeFinalizar).toBe(false);
    expect(decisao.totalImpedimentos).toBe(1);
    expect(decisao.respostaSugerida).toContain("regularizados antes da conclusão");
  });
});
