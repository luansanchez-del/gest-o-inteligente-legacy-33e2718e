import { describe, expect, it } from "vitest";
import { montarTextoDeItensEstruturados } from "../pdf.server";

describe("reconstrução de texto PDF", () => {
  it("reconstrói uma linha de balancete em página rotacionada", () => {
    const texto = montarTextoDeItensEstruturados([
      { str: "1.155.609,40", x: 102, y: 756 },
      { str: "95.671,09", x: 102, y: 700 },
      { str: "314.257,30", x: 102, y: 636 },
      { str: "409.928,39", x: 102, y: 578 },
      { str: "1.059.938,31", x: 102, y: 515 },
      { str: "ATIVO", x: 102, y: 209 },
      { str: "1", x: 102, y: 120 },
      { str: "S", x: 102, y: 102 },
      { str: "1", x: 102, y: 97 },
      { str: "1.152.775,12", x: 114, y: 756 },
      { str: "95.843,35", x: 114, y: 700 },
      { str: "314.085,04", x: 114, y: 636 },
      { str: "409.928,39", x: 114, y: 578 },
      { str: "1.056.931,77", x: 114, y: 515 },
      { str: "CIRCULANTE", x: 114, y: 209 },
      { str: "1.1", x: 114, y: 120 },
      { str: "S", x: 114, y: 102 },
      { str: "2", x: 114, y: 97 },
    ]);

    expect(texto.split("\n")).toEqual([
      "1 S 1 ATIVO 1.059.938,31 409.928,39 314.257,30 95.671,09 1.155.609,40",
      "2 S 1.1 CIRCULANTE 1.056.931,77 409.928,39 314.085,04 95.843,35 1.152.775,12",
    ]);
  });
});
