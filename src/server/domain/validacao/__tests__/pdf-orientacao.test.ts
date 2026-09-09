import { describe, expect, it } from "vitest";
import {
  montarTextoDeItensEstruturados,
  toleranciaLinha,
} from "../pdf.server";

describe("tolerância de baseline do PDF", () => {
  it("usa fallback de 1,5 pt quando fontSize não está disponível", () => {
    expect(toleranciaLinha({})).toBe(1.5);
  });

  it("respeita o limite mínimo de 0,75 pt", () => {
    expect(toleranciaLinha({ fontSize: 1 })).toBe(0.75);
  });

  it("respeita o limite máximo de 4 pt", () => {
    expect(toleranciaLinha({ fontSize: 20 })).toBe(4);
  });
});

describe("orientação e agrupamento do PDF", () => {
  it("usa 35% da fonte e mantém pequena diferença de baseline na mesma linha", () => {
    expect(toleranciaLinha({ fontSize: 10 })).toBe(3.5);

    const texto = montarTextoDeItensEstruturados([
      { str: "1.1.01", x: 10, y: 100, fontSize: 10 },
      { str: "CAIXA GERAL", x: 50, y: 100.3, fontSize: 10 },
      { str: "1.000,00", x: 140, y: 99.9, fontSize: 10 },
      { str: "200,00", x: 190, y: 100.2, fontSize: 10 },
      { str: "100,00", x: 240, y: 100.1, fontSize: 10 },
      { str: "1.100,00", x: 290, y: 100, fontSize: 10 },
    ]);

    expect(texto).toBe(
      "1.1.01 CAIXA GERAL 1.000,00 200,00 100,00 1.100,00",
    );
  });

  it("mantém a orientação normal pelo eixo Y", () => {
    const texto = montarTextoDeItensEstruturados([
      { str: "1.1.01", x: 10, y: 200, fontSize: 10 },
      { str: "CAIXA", x: 60, y: 200, fontSize: 10 },
      { str: "1.000,00", x: 150, y: 200, fontSize: 10 },
      { str: "100,00", x: 210, y: 200, fontSize: 10 },
      { str: "50,00", x: 260, y: 200, fontSize: 10 },
      { str: "1.050,00", x: 310, y: 200, fontSize: 10 },
    ]);

    expect(texto).toBe("1.1.01 CAIXA 1.000,00 100,00 50,00 1.050,00");
  });

  it("corrige página tabular em que a contagem de grupos sugere X por engano", () => {
    const texto = montarTextoDeItensEstruturados([
      { str: "1", x: 10, y: 200, fontSize: 10 },
      { str: "S", x: 30, y: 200, fontSize: 10 },
      { str: "1", x: 50, y: 200, fontSize: 10 },
      { str: "ATIVO", x: 90, y: 200, fontSize: 10 },
      { str: "1.000,00", x: 170, y: 200, fontSize: 10 },
      { str: "100,00", x: 230, y: 200, fontSize: 10 },
      { str: "50,00", x: 280, y: 200, fontSize: 10 },
      { str: "1.050,00", x: 330, y: 200, fontSize: 10 },

      { str: "2", x: 10, y: 180, fontSize: 10 },
      { str: "S", x: 30, y: 180, fontSize: 10 },
      { str: "1.1", x: 50, y: 180, fontSize: 10 },
      { str: "CIRCULANTE", x: 90, y: 180, fontSize: 10 },
      { str: "900,00", x: 170, y: 180, fontSize: 10 },
      { str: "80,00", x: 230, y: 180, fontSize: 10 },
      { str: "30,00", x: 280, y: 180, fontSize: 10 },
      { str: "950,00", x: 330, y: 180, fontSize: 10 },
    ]);

    expect(texto.split("\n")).toEqual([
      "1 S 1 ATIVO 1.000,00 100,00 50,00 1.050,00",
      "2 S 1.1 CIRCULANTE 900,00 80,00 30,00 950,00",
    ]);
  });

  it("mantém página realmente rotacionada usando X como eixo das linhas", () => {
    const texto = montarTextoDeItensEstruturados([
      { str: "1.155.609,40", x: 102, y: 756, fontSize: 10 },
      { str: "95.671,09", x: 102, y: 700, fontSize: 10 },
      { str: "314.257,30", x: 102, y: 636, fontSize: 10 },
      { str: "409.928,39", x: 102, y: 578, fontSize: 10 },
      { str: "1.059.938,31", x: 102, y: 515, fontSize: 10 },
      { str: "ATIVO", x: 102, y: 209, fontSize: 10 },
      { str: "1", x: 102, y: 120, fontSize: 10 },
      { str: "S", x: 102, y: 102, fontSize: 10 },
      { str: "1", x: 102, y: 97, fontSize: 10 },
      { str: "1.152.775,12", x: 114, y: 756, fontSize: 10 },
      { str: "95.843,35", x: 114, y: 700, fontSize: 10 },
      { str: "314.085,04", x: 114, y: 636, fontSize: 10 },
      { str: "409.928,39", x: 114, y: 578, fontSize: 10 },
      { str: "1.056.931,77", x: 114, y: 515, fontSize: 10 },
      { str: "CIRCULANTE", x: 114, y: 209, fontSize: 10 },
      { str: "1.1", x: 114, y: 120, fontSize: 10 },
      { str: "S", x: 114, y: 102, fontSize: 10 },
      { str: "2", x: 114, y: 97, fontSize: 10 },
    ]);

    expect(texto.split("\n")).toEqual([
      "1 S 1 ATIVO 1.059.938,31 409.928,39 314.257,30 95.671,09 1.155.609,40",
      "2 S 1.1 CIRCULANTE 1.056.931,77 409.928,39 314.085,04 95.843,35 1.152.775,12",
    ]);
  });
});
