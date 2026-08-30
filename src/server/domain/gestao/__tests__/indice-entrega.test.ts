import { describe, expect, it } from "vitest";

import { criarDbFalso } from "../../carteira/__tests__/db-falso";
import { apurarIndiceEntrega } from "../indice-entrega.service";

function base(requests: Record<string, unknown>[]) {
  return {
    app_setting: [],
    pier_department: [
      { external_id: "9625", name: "CONTABILIDADE LEGACY", organization_id: "org-1" },
    ],
    pier_user: [
      { external_id: "u-1", name: "VINICIUS", department_external_id: "9625", organization_id: "org-1" },
    ],
    pier_client: [],
    request: requests,
    validation_execution: [],
    request_attachment: [],
  };
}

function solicitacao(overrides: Record<string, unknown>) {
  return {
    organization_id: "org-1",
    id: overrides.id,
    external_id: overrides.id,
    reference_month: "2026-01",
    responsible_external_id: "u-1",
    responsible_name: "VINICIUS",
    department_external_id: "9625",
    status: "Em andamento",
    has_attachment: true,
    finished_at: null,
    deadline_at: null,
    ...overrides,
  };
}

describe("apurarIndiceEntrega", () => {
  it("calcula cobertura, entrega no prazo e backlog com numerador/denominador transparentes", async () => {
    const { ctx } = criarDbFalso(
      base([
        // Finalizada até o prazo.
        solicitacao({
          id: "A1",
          status: "Finalizada",
          deadline_at: "2026-01-20T00:00:00.000Z",
          finished_at: "2026-01-18T00:00:00.000Z",
        }),
        // Finalizada depois do prazo.
        solicitacao({
          id: "A2",
          status: "Finalizada",
          deadline_at: "2026-01-10T00:00:00.000Z",
          finished_at: "2026-01-15T00:00:00.000Z",
        }),
        // Em aberto, prazo já vencido (usa uma data bem no passado para não expirar o teste).
        solicitacao({
          id: "A3",
          status: "Em andamento",
          deadline_at: "2020-01-05T00:00:00.000Z",
        }),
        // Em aberto, sem prazo definido: não conta como atrasada nem como backlog vencido.
        solicitacao({ id: "A4", status: "Em andamento" }),
      ]),
    );

    const painel = await apurarIndiceEntrega(ctx, { competencia: "2026-01" });
    const porCodigo = new Map(painel.indicadores.map((i) => [i.codigo, i]));

    expect(porCodigo.get("PREVISTO")).toMatchObject({ numerador: 4, denominador: 4 });
    expect(porCodigo.get("ENTREGUE")).toMatchObject({ numerador: 2, denominador: 4 });
    expect(porCodigo.get("INDICE")).toMatchObject({ numerador: 2, denominador: 4, valor: 50 });
    expect(porCodigo.get("NO_PRAZO")).toMatchObject({ numerador: 1, denominador: 2 });
    expect(porCodigo.get("FORA_PRAZO")).toMatchObject({ numerador: 1, denominador: 2 });
    expect(porCodigo.get("INDICE_PRAZO")).toMatchObject({ valor: 50 });
    expect(porCodigo.get("BACKLOG")).toMatchObject({ numerador: 2, denominador: 4 });
    expect(porCodigo.get("ATRASADA")).toMatchObject({ numerador: 1, denominador: 4 });
  });

  it("não quebra com escopo vazio (divisão por zero controlada)", async () => {
    const { ctx } = criarDbFalso(base([]));
    const painel = await apurarIndiceEntrega(ctx, { competencia: "2026-01" });
    const indice = painel.indicadores.find((i) => i.codigo === "INDICE");
    expect(indice?.valor).toBe(0);
    expect(indice?.denominador).toBe(0);
  });
});
