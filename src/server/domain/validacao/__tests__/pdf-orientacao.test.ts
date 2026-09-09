import { describe, expect, it } from "vitest";
import { montarTextoDeItensEstruturados } from "../pdf.server";

const COLUNAS = [10, 20, 30, 40, 100, 150, 200, 250, 300];

/** Monta uma linha de balancete (9 células) em um mesmo baseline Y. */
function linhaNormal(y: number, celulas: string[]) {
  return celulas.map((str, i) => ({ str, x: COLUNAS[i]!, y, fontSize: 8 }));
}

/** Mesma linha, porém com as células compartilhando X (página rotacionada). */
function linhaRotacionada(x: number, celulas: string[]) {
  // Em página rotacionada o pdf.js emite Y decrescente ao longo da linha.
  return celulas.map((str, i) => ({ str, x, y: 800 - i * 60, fontSize: 8 }));
}

const LINHA_1 = [
  "1",
  "S",
  "1",
  "ATIVO",
  "1.059.938,31",
  "409.928,39",
  "314.257,30",
  "95.671,09",
  "1.155.609,40",
];
const LINHA_2 = [
  "2",
  "S",
  "1.1",
  "CIRCULANTE",
  "1.056.931,77",
  "409.928,39",
  "314.085,04",
  "95.843,35",
  "1.152.775,12",
];
const LINHA_3 = [
  "3",
  "A",
  "1.1.01",
  "CAIXA",
  "12.345,67",
  "1.000,00",
  "500,00",
  "0,00",
  "12.845,67",
];

const TEXTO_1 =
  "1 S 1 ATIVO 1.059.938,31 409.928,39 314.257,30 95.671,09 1.155.609,40";
const TEXTO_2 =
  "2 S 1.1 CIRCULANTE 1.056.931,77 409.928,39 314.085,04 95.843,35 1.152.775,12";
const TEXTO_3 = "3 A 1.1.01 CAIXA 12.345,67 1.000,00 500,00 0,00 12.845,67";

describe("agrupamento de linha por tolerância de baseline", () => {
  it("une células com baselines separados por 0,3 pt usando o fontSize do item", () => {
    const texto = montarTextoDeItensEstruturados([
      { str: "1.1.01", x: 10, y: 100, fontSize: 8 },
      { str: "CAIXA GERAL", x: 60, y: 99.8, fontSize: 8 },
      { str: "12.345,67", x: 200, y: 99.7, fontSize: 8 },
    ]);

    expect(texto).toBe("1.1.01 CAIXA GERAL 12.345,67");
  });

  it("sem fontSize usa a tolerância padrão de 1,5 pt", () => {
    const junto = montarTextoDeItensEstruturados([
      { str: "A", x: 10, y: 100 },
      { str: "B", x: 60, y: 98.8 },
    ]);
    const separado = montarTextoDeItensEstruturados([
      { str: "A", x: 10, y: 100 },
      { str: "B", x: 60, y: 98 },
    ]);

    expect(junto).toBe("A B");
    expect(separado.split("\n")).toEqual(["A", "B"]);
  });

  it("respeita o piso de 0,75 pt em fontes minúsculas", () => {
    const junto = montarTextoDeItensEstruturados([
      { str: "A", x: 10, y: 100, fontSize: 1 },
      { str: "B", x: 60, y: 99.5, fontSize: 1 },
    ]);
    const separado = montarTextoDeItensEstruturados([
      { str: "A", x: 10, y: 100, fontSize: 1 },
      { str: "B", x: 60, y: 99.1, fontSize: 1 },
    ]);

    expect(junto).toBe("A B");
    expect(separado.split("\n")).toEqual(["A", "B"]);
  });

  it("respeita o teto de 4 pt em fontes enormes", () => {
    const junto = montarTextoDeItensEstruturados([
      { str: "A", x: 10, y: 100, fontSize: 40 },
      { str: "B", x: 60, y: 96.5, fontSize: 40 },
    ]);
    const separado = montarTextoDeItensEstruturados([
      { str: "A", x: 10, y: 100, fontSize: 40 },
      { str: "B", x: 60, y: 95, fontSize: 40 },
    ]);

    expect(junto).toBe("A B");
    expect(separado.split("\n")).toEqual(["A", "B"]);
  });
});

describe("escolha da orientação da página", () => {
  it("página normal sai direto pelo eixo Y", () => {
    const texto = montarTextoDeItensEstruturados([
      ...linhaNormal(200, LINHA_1),
      ...linhaNormal(180, LINHA_2),
    ]);

    expect(texto.split("\n")).toEqual([TEXTO_1, TEXTO_2]);
  });

  it("página de totais transposta continua saindo pelo eixo Y", () => {
    // 3 linhas x 9 colunas: a contagem de grupos aponta X (9 grupos) contra
    // Y (3 grupos), mas só o eixo Y forma linhas de conta reconhecíveis.
    const texto = montarTextoDeItensEstruturados([
      ...linhaNormal(200, LINHA_1),
      ...linhaNormal(180, LINHA_2),
      ...linhaNormal(160, LINHA_3),
    ]);

    expect(texto.split("\n")).toEqual([TEXTO_1, TEXTO_2, TEXTO_3]);
  });

  it("página rotacionada continua sendo lida pelo eixo X", () => {
    const texto = montarTextoDeItensEstruturados([
      ...linhaRotacionada(102, LINHA_1),
      ...linhaRotacionada(114, LINHA_2),
    ]);

    expect(texto.split("\n")).toEqual([TEXTO_1, TEXTO_2]);
  });
});
