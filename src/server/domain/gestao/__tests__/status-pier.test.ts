import { describe, expect, it } from "vitest";

import {
  atendeFiltroStatusPier,
  selecionarParaCarga,
  solicitacaoFinalizadaPier,
} from "../status-pier";

describe("Status PIER na Gestão", () => {
  it("reconhece finalização pelo status mesmo sem finishedAt", () => {
    expect(solicitacaoFinalizadaPier("Finalizada", null)).toBe(true);
    expect(solicitacaoFinalizadaPier("Concluída", null)).toBe(true);
    expect(solicitacaoFinalizadaPier("Andamento", null)).toBe(false);
  });

  it("filtra pendentes e finalizadas", () => {
    expect(atendeFiltroStatusPier("PENDENTES", "Andamento", null)).toBe(true);
    expect(atendeFiltroStatusPier("PENDENTES", "Finalizada", null)).toBe(false);
    expect(atendeFiltroStatusPier("FINALIZADAS", "Finalizada", null)).toBe(true);
    expect(atendeFiltroStatusPier("TODOS", "Finalizada", null)).toBe(true);
  });

  it("ignora finalizada nova, mas mantém finalizada já existente para atualizar cache", () => {
    const solicitacoes = [
      { externalId: "aberta", status: "Andamento", finishedAt: null },
      { externalId: "finalizada-nova", status: "Finalizada", finishedAt: null },
      {
        externalId: "finalizada-existente",
        status: "Andamento",
        finishedAt: "2026-08-18T10:00:00Z",
      },
    ];

    const resultado = selecionarParaCarga(
      solicitacoes,
      new Set(["finalizada-existente"]),
      false,
    );

    expect(resultado.finalizadasIgnoradas).toBe(1);
    expect(resultado.elegiveis.map((item) => item.externalId)).toEqual([
      "aberta",
      "finalizada-existente",
    ]);
  });
});
