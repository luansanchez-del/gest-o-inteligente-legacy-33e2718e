import { describe, expect, it } from "vitest";

import { parseBalancete } from "../balancete.parser";
import { instrucaoEfetiva, interpretarTexto, type Instrucao } from "../instrucao";

/** Linhas reais do balancete do piloto 35806843 (conta interna + marcador S). */
const PAGINA_REAL = [
  "TONIOLO PARTICIPACAO LTDA",
  "CNPJ: 54.876.405/0001-17",
  "Balancete Analitico",
  "Periodo: 01/01/2026 a 31/05/2026 Emissao: 10/06/2026",
  "Conta C/S Classificacao Descricao Saldo Anterior Debito Credito Movimento Saldo Atual",
  "1 S 1 ATIVO 7.627.764,59 2.094.097,39 1.956.245,68 137.851,71 7.765.616,30",
  "5   1.1.01.001.001 Caixa 1.688.184,24 0,00 0,00 0,00 1.688.184,24",
  "18   1.1.06.001.001 Adiantamentos a Fornecedores 563.001,64 0,00 0,00 0,00 563.001,64",
  "42   1.2.03.001.001 Toniolo Empreendimentos 0,00 0,00 448.800,00 (448.800,00) (448.800,00)",
  "70 S 2 PASSIVO E PATRIMONIO LIQUIDO 7.627.764,59 390.000,00 531.199,88 141.199,88 7.768.964,59",
  "88   2.4.05.001.001 Adiantamento de Lucros 578.176,10 0,00 0,00 0,00 578.176,10",
  "120 S 3 RECEITAS 0,00 0,00 2,79 2,79 2,79",
  "150 S 4 DESPESAS 0,00 7.239,64 3.888,56 3.351,08 3.351,08",
].join("\n");

const POSTAGEM = "Segue demonstrativo atualizado de 01.2026 à 05.2026, para validação.";

describe("balancete com layout real (conta interna + marcador S)", () => {
  const documento = parseBalancete([PAGINA_REAL]);

  it("extrai contas e cabeçalho", () => {
    expect(documento.linhas.length).toBeGreaterThan(0);
    expect(documento.linhas).toHaveLength(8);
    expect(documento.cnpj).toBe("54876405000117");
    expect(documento.periodoInicio).toBe("01/01/2026");
    expect(documento.periodoFim).toBe("31/05/2026");
    expect(documento.naoInterpretadas).toHaveLength(0);
  });

  it("usa a classificação como código e guarda a conta interna", () => {
    const caixa = documento.linhas.find((l) => l.nome === "Caixa")!;
    expect(caixa.codigo).toBe("1.1.01.001.001");
    expect(caixa.contaInterna).toBe("5");
    expect(caixa.analitica).toBe(true);

    const ativo = documento.linhas.find((l) => l.codigo === "1")!;
    expect(ativo.contaInterna).toBe("1");
    expect(ativo.analitica).toBe(false); // marcador S
  });

  it("preserva as cinco colunas e valores negativos entre parênteses", () => {
    const ativo = documento.linhas.find((l) => l.codigo === "1")!;
    expect(ativo.saldoAnterior).toBe(7627764.59);
    expect(ativo.debito).toBe(2094097.39);
    expect(ativo.credito).toBe(1956245.68);
    expect(ativo.movimento).toBe(137851.71);
    expect(ativo.saldoAtual).toBe(7765616.3);

    const investimento = documento.linhas.find((l) => l.codigo === "1.2.03.001.001")!;
    expect(investimento.movimento).toBe(-448800);
    expect(investimento.saldoAtual).toBe(-448800);

    const receitas = documento.linhas.find((l) => l.codigo === "3")!;
    expect(receitas.credito).toBe(2.79);
    const despesas = documento.linhas.find((l) => l.codigo === "4")!;
    expect(despesas.debito).toBe(7239.64);

    // Nenhuma linha zerada por completo.
    expect(documento.linhas.every((l) => l.saldoAnterior || l.debito || l.credito || l.saldoAtual)).toBe(
      true,
    );
  });
});

describe("instrução efetiva do piloto", () => {
  it("prioriza a postagem com período interpretável", () => {
    const instrucoes: Instrucao[] = [
      {
        origem: "TITLE",
        texto: "Fechamento Contabil - 01/2026",
        interpretado: interpretarTexto("Fechamento Contabil - 01/2026"),
      },
      {
        origem: "POST",
        ocorridoEm: "2026-06-10T12:00:00Z",
        texto: POSTAGEM,
        interpretado: interpretarTexto(POSTAGEM),
      },
    ];

    const efetiva = instrucaoEfetiva(instrucoes)!;
    expect(efetiva.origem).toBe("POST");
    expect(efetiva.interpretado.inicio).toBe("2026-01");
    expect(efetiva.interpretado.fim).toBe("2026-05");
  });
});
