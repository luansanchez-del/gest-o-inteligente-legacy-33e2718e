import { describe, expect, it } from "vitest";

import { montarTextoDaPagina, normalizarTransform } from "../pdf.server";
import { parseBalancete } from "../balancete.parser";
import { validarBalancete } from "../balancete.validator";
import { PAGINAS_PILOTO, TITULO_PILOTO } from "./balancete.fixture";

/** Item como o pdf.js entrega: transform [a,b,c,d,x,y]. */
function item(str: string, x: number, y: number, tipo: "array" | "typed" | "arraylike" = "array") {
  const base = [1, 0, 0, 1, x, y];
  const transform =
    tipo === "typed"
      ? Float32Array.from(base)
      : tipo === "arraylike"
        ? { 0: 1, 1: 0, 2: 0, 3: 1, 4: x, 5: y, length: 6 }
        : base;
  return { str, transform };
}

describe("normalizarTransform", () => {
  it("aceita array, typed array e array-like", () => {
    expect(normalizarTransform([1, 0, 0, 1, 10, 700])?.[5]).toBe(700);
    expect(normalizarTransform(Float32Array.from([1, 0, 0, 1, 10, 700]))?.[4]).toBe(10);
    expect(
      normalizarTransform({ 0: 1, 1: 0, 2: 0, 3: 1, 4: 10, 5: 700, length: 6 })?.[5],
    ).toBe(700);
    expect(normalizarTransform(undefined)).toBeNull();
    expect(normalizarTransform([1, 0, 0])).toBeNull();
  });
});

describe("montarTextoDaPagina", () => {
  for (const tipo of ["array", "typed", "arraylike"] as const) {
    it(`reconstrói linhas por posição com transform ${tipo}`, () => {
      const texto = montarTextoDaPagina([
        item("BALANCETE", 10, 700, tipo),
        item("1", 10, 680, tipo),
        item("ATIVO", 40, 680, tipo),
        item("1.000,00", 200, 680, tipo),
      ]);
      expect(texto).not.toBe("");
      expect(texto.split("\n")).toEqual(["BALANCETE", "1 ATIVO 1.000,00"]);
    });
  }

  it("usa fallback por hasEOL quando não há coordenadas", () => {
    const texto = montarTextoDaPagina([
      { str: "BALANCETE", hasEOL: true },
      { str: "1 ATIVO 1.000,00", hasEOL: true },
    ]);
    expect(texto).toBe("BALANCETE\n1 ATIVO 1.000,00");
  });

  it("não descarta itens válidos quando transform não é Array", () => {
    const texto = montarTextoDaPagina([item("TONIOLO", 10, 700, "typed")]);
    expect(texto).toContain("TONIOLO");
  });
});

describe("segurança: documento sem contas", () => {
  it("não afirma que fecha matematicamente", () => {
    const relatorio = validarBalancete(parseBalancete([""]));
    expect(relatorio.totais.totalContas).toBe(0);
    expect(relatorio.resumo).not.toContain("fecha matematicamente");
    expect(relatorio.resumo).toContain("Documento não lido");
    expect(relatorio.achados.map((a) => a.code)).toContain("ARQUIVO_SEM_CONTEUDO");
    expect(relatorio.resultado).not.toBe("APROVADO");
  });
});

describe("PDF textual da solicitação 35806843", () => {
  it("extrai contas e valores mesmo com transform Float32Array", () => {
    const linhas = PAGINAS_PILOTO[0]!.split("\n");
    const itens = linhas.flatMap((linha, indice) =>
      linha
        .split(" ")
        .map((palavra, coluna) =>
          item(palavra, 10 + coluna * 30, 800 - indice * 12, "typed"),
        ),
    );

    const texto = montarTextoDaPagina(itens);
    expect(texto.split("\n")).toHaveLength(linhas.length);

    const documento = parseBalancete([texto]);
    expect(documento.linhas.length).toBeGreaterThan(0);
    expect(documento.cnpj).toBe("54876405000117");

    const relatorio = validarBalancete(documento, {
      cnpjSolicitacao: "54876405000117",
      tituloSolicitacao: TITULO_PILOTO,
    });
    expect(relatorio.totais.totalContas).toBe(documento.linhas.length);
    expect(relatorio.totais.totalDebitos).toBeGreaterThan(0);
    // Há alertas contábeis: nunca pode ser aprovado automaticamente.
    expect(relatorio.resultado).not.toBe("APROVADO");
  });
});
