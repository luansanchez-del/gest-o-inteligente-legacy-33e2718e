import { describe, expect, it, vi } from "vitest";
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

describe("extrairTextoPdf — escolha da estratégia de extração", () => {
  // Caso real (Alcaprint): o extractText do unpdf segue a ordem do stream do
  // PDF, que para esse gerador de relatório emite os campos da linha em
  // ordem invertida e colados, sem espaço nenhum entre eles.
  const textoColado =
    "463.480,32(16.315,86)69.815,1753.499,31479.796,18ATIVO1S1";

  const itensPosicionais = [
    { str: "1", x: 10, y: 100 },
    { str: "S", x: 20, y: 100 },
    { str: "1", x: 30, y: 100 },
    { str: "ATIVO", x: 40, y: 100 },
    { str: "479.796,18", x: 100, y: 100 },
    { str: "53.499,31", x: 150, y: 100 },
    { str: "69.815,17", x: 200, y: 100 },
    { str: "(16.315,86)", x: 250, y: 100 },
    { str: "463.480,32", x: 300, y: 100 },
  ];

  it("cai para a extração posicional quando a simples vem colada/fora de ordem", async () => {
    vi.resetModules();
    vi.doMock("unpdf", () => ({
      extractText: vi.fn(async () => ({ text: [textoColado], totalPages: 1 })),
      extractTextItems: vi.fn(async () => ({ items: [itensPosicionais], totalPages: 1 })),
    }));

    const { extrairTextoPdf } = await import("../pdf.server");
    const { paginas } = await extrairTextoPdf(new Uint8Array([1]));

    expect(paginas[0]).toContain(
      "1 S 1 ATIVO 479.796,18 53.499,31 69.815,17 (16.315,86) 463.480,32",
    );

    vi.doUnmock("unpdf");
    vi.resetModules();
  });

  it("não troca de estratégia quando a extração simples já vem íntegra", async () => {
    vi.resetModules();
    const textoBom =
      "1 S 1 ATIVO 479.796,18 53.499,31 69.815,17 (16.315,86) 463.480,32";
    const extractTextItems = vi.fn(async () => ({ items: [itensPosicionais], totalPages: 1 }));
    vi.doMock("unpdf", () => ({
      extractText: vi.fn(async () => ({ text: [textoBom], totalPages: 1 })),
      extractTextItems,
    }));

    const { extrairTextoPdf } = await import("../pdf.server");
    const { paginas } = await extrairTextoPdf(new Uint8Array([1]));

    expect(paginas[0]).toContain(textoBom);
    expect(extractTextItems).not.toHaveBeenCalled();

    vi.doUnmock("unpdf");
    vi.resetModules();
  });
});
