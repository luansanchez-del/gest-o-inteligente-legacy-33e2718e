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

describe("totais por grupo raiz", () => {
  it("soma pelo nível mais raso de CADA grupo, não por um nível fixo do documento", () => {
    // O Passivo não tem linha de nível 1 (pode ter sido mal extraída do
    // PDF), só os subgrupos de nível 2 -- o total ainda precisa aparecer,
    // em vez de contar como zero e derrubar a equação patrimonial.
    const resultado = validar([
      linha("1", "ATIVO", 100_000, false),
      linha("2.1", "Passivo Circulante", 70_000, false),
      linha("2.2", "Patrimônio Líquido", 30_000, false),
      linha("4", "RECEITAS", 0, false),
      linha("5", "DESPESAS", 0, false),
    ]);

    expect(resultado.totais.passivoPl).toBe(100_000);
    const equacao = resultado.achados.find((a) => a.code.startsWith("EQUACAO_PATRIMONIAL"));
    expect(equacao?.code).toBe("EQUACAO_PATRIMONIAL_OK");
  });

  it("diferença na equação patrimonial vai para revisão humana, não bloqueia sozinha", () => {
    const resultado = validar([
      linha("1", "ATIVO", 100_000, false),
      linha("2", "PASSIVO E PATRIMÔNIO LÍQUIDO", 40_000, false),
      linha("4", "RECEITAS", 0, false),
      linha("5", "DESPESAS", 30_000, false),
    ]);

    const equacao = resultado.achados.find((a) => a.code === "EQUACAO_PATRIMONIAL_DIVERGENTE");
    expect(equacao?.severity).toBe("WARNING");
    expect(equacao?.requiresHuman).toBe(true);
    expect(resultado.achados.some((a) => a.severity === "BLOCKER")).toBe(false);
    expect(resultado.resultado).toBe("REVISAO_HUMANA");
  });

  it("expõe a composição por grupo raiz na evidência da equação patrimonial", () => {
    const resultado = validar([
      linha("1", "ATIVO", 100_000, false),
      linha("2.1", "Passivo Circulante", 70_000, false),
      linha("2.2", "Patrimônio Líquido", 30_000, false),
      linha("4", "RECEITAS", 0, false),
      linha("5", "DESPESAS", 0, false),
    ]);

    const equacao = resultado.achados.find((a) => a.code === "EQUACAO_PATRIMONIAL_OK");
    const composicao = equacao?.evidence?.["composicaoPorGrupo"] as Array<
      Record<string, unknown>
    >;
    expect(composicao).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ raiz: "1", natureza: "ATIVO", linhas: 1, saldo: 100_000 }),
        expect.objectContaining({
          raiz: "2",
          natureza: "PASSIVO_PL",
          nivelUsado: 2,
          linhas: 2,
          saldo: 100_000,
        }),
      ]),
    );
  });

  it("acusa GRUPO_NAO_CLASSIFICADO para grupo 'OUTRO' com saldo material e não bloqueia sozinho", () => {
    const resultado = validar([
      linha("1", "ATIVO", 100_000, false),
      linha("2", "PASSIVO E PATRIMÔNIO LÍQUIDO", 100_000, false),
      linha("4", "RECEITAS", 0, false),
      linha("5", "DESPESAS", 0, false),
      linha("9", "Contas de Compensação", 5_000, false),
    ]);

    const achado = resultado.achados.find((a) => a.code === "GRUPO_NAO_CLASSIFICADO");
    expect(achado).toMatchObject({
      severity: "WARNING",
      requiresHuman: true,
      evidence: { raiz: "9", saldo: 5_000 },
    });
    expect(resultado.achados.some((a) => a.severity === "BLOCKER")).toBe(false);
    expect(resultado.resultado).toBe("REVISAO_HUMANA");
  });

  it("aponta no detalhe quando a diferença da equação coincide com um grupo ignorado", () => {
    // Passivo saiu R$ 259.969,13 a menos porque a extração jogou esse valor
    // num grupo "OUTRO" em vez de dentro do grupo 2 -- indício de falha de
    // leitura do PDF, não de balancete que não fecha de fato.
    const resultado = validar([
      linha("1", "ATIVO", 400_000, false),
      linha("2", "PASSIVO E PATRIMÔNIO LÍQUIDO", 140_030.87, false),
      linha("4", "RECEITAS", 0, false),
      linha("5", "DESPESAS", 0, false),
      linha("9", "Grupo não identificado", 259_969.13, false),
    ]);

    const equacao = resultado.achados.find((a) => a.code === "EQUACAO_PATRIMONIAL_DIVERGENTE");
    expect(equacao?.detail).toContain("259.969,13");
    expect(equacao?.detail).toContain("falha de leitura");
    expect(equacao?.evidence?.["grupoCoincidenteComDiferenca"]).toMatchObject({
      raiz: "9",
      saldo: 259_969.13,
    });

    const achadoGrupo = resultado.achados.find((a) => a.code === "GRUPO_NAO_CLASSIFICADO");
    expect(achadoGrupo?.evidence).toMatchObject({
      coincideComDiferencaEquacao: true,
    });
  });

  it("reconhece grupo de apuração de resultado e não sugere falha de leitura do PDF", () => {
    // Caso real: balancete cobrindo vários meses com fechamentos parciais
    // já rodados -- o saldo não transferido para o PL fica numa conta
    // "6 - RESULTADO" (ou "APURAÇÃO DO RESULTADO"), não é PDF mal lido.
    const resultado = validar([
      linha("1", "ATIVO", 325_972.69, false),
      linha("2", "PASSIVO E PATRIMÔNIO LÍQUIDO", 101_836.69, false),
      linha("4", "RECEITAS", 231_240, false),
      linha("5", "DESPESAS", 1_600, false),
      linha("6", "RESULTADO", 5_504, false),
    ]);

    const equacao = resultado.achados.find((a) => a.code === "EQUACAO_PATRIMONIAL_DIVERGENTE");
    expect(equacao?.detail).toContain("apuração de resultado");
    expect(equacao?.detail).not.toContain("Provável falha de leitura do PDF");

    const achadoGrupo = resultado.achados.find((a) => a.code === "GRUPO_NAO_CLASSIFICADO");
    expect(achadoGrupo?.detail).toContain("apuração de resultado");
    expect(achadoGrupo?.detail).not.toContain("provável falha de leitura do PDF");
    expect(achadoGrupo?.evidence).toMatchObject({ apuracaoDeResultado: true });
  });
});
