import { describe, expect, it } from "vitest";
import {
  validarBalancete,
  type RelatorioValidacao,
} from "../balancete.validator";
import type { BalanceteDocumento, LinhaBalancete } from "../balancete.parser";

function linha(
  codigo: string,
  nome: string,
  saldoAtual: number,
  analitica = true,
): LinhaBalancete {
  return {
    codigo,
    nome,
    nivel: codigo.split(".").length,
    raiz: codigo.split(".")[0]!,
    saldoAnterior: saldoAtual,
    debito: 0,
    credito: 0,
    movimento: 0,
    saldoAtual,
    analitica,
    contaInterna: null,
    pagina: 1,
    textoOriginal: `${codigo} ${nome} ${saldoAtual}`,
  };
}

function validar(linhas: LinhaBalancete[]): RelatorioValidacao {
  const documento: BalanceteDocumento = {
    empresa: "Empresa Teste",
    cnpj: "00000000000000",
    emissaoEm: null,
    periodoInicio: "01/01/2026",
    periodoFim: "31/01/2026",
    paginas: 1,
    colunasDetectadas: [],
    linhas,
    naoInterpretadas: [],
  };
  return validarBalancete(documento);
}

describe("natureza contábil pelo plano de contas", () => {
  it("não acusa contas redutoras como saldo invertido", () => {
    const resultado = validar([
      linha("1", "ATIVO", 100_000, false),
      linha("2", "PASSIVO E PATRIMÔNIO LÍQUIDO", 40_000, false),
      linha("4", "RECEITAS", 100_000, false),
      linha("5", "DESPESAS", 40_000, false),
      linha("2.4.13.001.002", "(-) Prejuízos Acumulados", -1_083.31),
      linha("4.1.03.005.004", "(-) PIS", -1_560),
      linha("4.1.03.005.005", "(-) COFINS", -7_200),
      linha("1.2.05.007.010", "(-) Deprec. Instalações", -1_344.15),
      linha(
        "1.2.05.007.023",
        "(-) Software ou Programas de Computador",
        -1_900,
      ),
    ]);

    expect(
      resultado.achados.filter((a) => a.code === "NATUREZA_INVERTIDA"),
    ).toEqual([]);
  });

  it("herda a natureza do grupo raiz do plano e mantém alerta para conta comum", () => {
    const resultado = validar([
      linha("1", "ATIVO", 100_000, false),
      linha("2", "PASSIVO E PATRIMÔNIO LÍQUIDO", 40_000, false),
      linha("4", "RECEITAS", 100_000, false),
      linha("5", "DESPESAS", 40_000, false),
      linha("4.1.01.001", "Venda de serviços", -2_000),
    ]);

    expect(
      resultado.achados.find((a) => a.code === "NATUREZA_INVERTIDA"),
    ).toMatchObject({
      accountCode: "4.1.01.001",
      evidence: { natureza: "RECEITA" },
    });
  });
});
