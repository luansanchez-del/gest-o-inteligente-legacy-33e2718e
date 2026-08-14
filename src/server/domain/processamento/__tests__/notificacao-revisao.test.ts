import { describe, expect, it } from "vitest";

import { montarMensagemRevisao } from "../processamento.service";

describe("mensagem privada de revisão", () => {
  it("inclui evidências e exclui informações sem pendência", () => {
    const mensagem = montarMensagemRevisao({
      clienteNome: "TONIOLO PARTICIPAÇÃO LTDA",
      numero: "1509-EF",
      arquivo: "balancete.pdf",
      periodoInicio: "2026-01",
      periodoFim: "2026-05",
      achados: [
        {
          severidade: "WARNING",
          titulo: "Investimento com saldo negativo",
          detalhe: "Saldo de R$ 448.800,00.",
          contaCodigo: "1.2.03.001.003",
          pagina: 1,
          exigeHumano: true,
        },
        {
          severidade: "INFO",
          titulo: "Período compatível",
          exigeHumano: false,
        },
      ],
    });

    expect(mensagem).toContain("TONIOLO PARTICIPAÇÃO LTDA");
    expect(mensagem).toContain("2026-01 a 2026-05");
    expect(mensagem).toContain("R$ 448.800,00");
    expect(mensagem).not.toContain("Período compatível");
    expect(mensagem).toContain("permanecerá aberta");
  });
});
