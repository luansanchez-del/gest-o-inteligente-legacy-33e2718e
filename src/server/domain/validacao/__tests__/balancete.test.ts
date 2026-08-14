import { describe, expect, it } from "vitest";

import { parseBalancete, parseValorBR } from "../balancete.parser";
import { validarBalancete } from "../balancete.validator";
import { instrucaoEfetiva, interpretarTexto, type Instrucao } from "../instrucao";
import { mascararTexto } from "../../../lib/mascara";
import { PAGINAS_PILOTO, POSTAGEM_PILOTO, TITULO_PILOTO } from "./balancete.fixture";

const instrucoes: Instrucao[] = [
  { origem: "TITLE", texto: TITULO_PILOTO, interpretado: interpretarTexto(TITULO_PILOTO) },
  {
    origem: "POST",
    ocorridoEm: "2026-06-10T12:00:00Z",
    texto: POSTAGEM_PILOTO,
    interpretado: interpretarTexto(POSTAGEM_PILOTO),
  },
];

describe("parseValorBR", () => {
  it("lê valores pt-BR e negativos", () => {
    expect(parseValorBR("1.688.184,24")).toBe(1688184.24);
    expect(parseValorBR("(448.800,00)")).toBe(-448800);
    expect(parseValorBR("-2,79")).toBe(-2.79);
    expect(parseValorBR("12,34 C")).toBe(12.34);
  });
});

describe("instrução efetiva", () => {
  it("a postagem mais recente com período vence o título", () => {
    const efetiva = instrucaoEfetiva(instrucoes);
    expect(efetiva?.origem).toBe("POST");
    expect(efetiva?.interpretado.inicio).toBe("2026-01");
    expect(efetiva?.interpretado.fim).toBe("2026-05");
  });

  it("máscara remove credenciais do texto", () => {
    expect(mascararTexto(POSTAGEM_PILOTO)).not.toContain("123456");
  });
});

describe("balancete piloto", () => {
  const documento = parseBalancete(PAGINAS_PILOTO);
  const relatorio = validarBalancete(documento, {
    cnpjSolicitacao: "54876405000117",
    tituloSolicitacao: TITULO_PILOTO,
    instrucao: instrucaoEfetiva(instrucoes),
  });

  it("extrai cabeçalho e contas", () => {
    expect(documento.cnpj).toBe("54876405000117");
    expect(documento.periodoInicio).toBe("01/01/2026");
    expect(documento.periodoFim).toBe("31/05/2026");
    expect(documento.linhas).toHaveLength(8);
    expect(documento.naoInterpretadas).toHaveLength(0);
  });

  it("fecha débitos x créditos e a equação patrimonial", () => {
    expect(relatorio.totais.totalDebitos).toBe(3397239.64);
    expect(relatorio.totais.totalCreditos).toBe(3397239.64);
    expect(relatorio.totais.diferencaEquacao).toBe(0);
    expect(relatorio.totais.resultado).toBe(-3348.29);
  });

  it("aponta os julgamentos contábeis do caso piloto", () => {
    const codigos = relatorio.achados.map((a) => a.code);
    expect(codigos).toContain("INVESTIMENTO_SALDO_CREDOR");
    expect(codigos).toContain("CAIXA_SEM_MOVIMENTO");
    expect(codigos).toContain("ADIANTAMENTO_LUCROS");
    expect(codigos).toContain("ADIANTAMENTO_MATERIAL");
    expect(codigos).toContain("PERIODO_COMPATIVEL");
  });

  it("não reprova por julgamento: cai em revisão humana", () => {
    expect(relatorio.achados.every((a) => a.severity !== "BLOCKER" && a.severity !== "ERROR")).toBe(
      true,
    );
    expect(relatorio.resultado).toBe("REVISAO_HUMANA");
  });

  it("reprova quando as partidas não fecham", () => {
    const adulterado = PAGINAS_PILOTO[0]!.replace(
      "4 DESPESAS 0,00 7.239,64 3.888,56 3.351,08",
      "4 DESPESAS 0,00 9.000,00 3.888,56 5.111,44",
    );
    const r = validarBalancete(parseBalancete([adulterado]));
    expect(r.resultado).toBe("REPROVADO");
    expect(r.achados.map((a) => a.code)).toContain("PARTIDAS_DOBRADAS_DIVERGENTE");
  });
});
