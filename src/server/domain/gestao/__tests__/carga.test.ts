import { beforeEach, describe, expect, it, vi } from "vitest";

import { criarDbFalso } from "../../carteira/__tests__/db-falso";

const listRequestsByType = vi.fn();
const listRequests = vi.fn();

vi.mock("../../../integrations/pier/pier.adapter", () => ({
  pierAdapter: {
    listRequestsByType: (args: unknown) => listRequestsByType(args),
    listRequests: (args: unknown) => listRequests(args),
  },
}));

const { carregarCompetencia, estadoCarga, listarMeses, previsualizarCarga, proximaCompetencia } =
  await import("../carga.service");

function solicitacao(externalId: string, competencia: string | null, anexo = true) {
  return {
    externalId,
    number: externalId,
    description: `Fechamento contábil ${competencia ?? "sem competência"}`,
    typeName: "Fechamento Contábil",
    purpose: "FECHAMENTO",
    referenceMonth: competencia,
    status: "Em andamento",
    responsibleName: "VINICIUS",
    responsibleExternalId: "u-1",
    clientExternalId: "5001",
    clientName: "TONIOLO LTDA",
    clientDocument: "12.345.678/0001-90",
    requestedAt: null,
    finishedAt: null,
    deadlineAt: null,
    hasAttachment: anexo,
    raw: {},
  };
}

function base(requests: Record<string, unknown>[] = []) {
  return {
    app_setting: [],
    pier_department: [
      { external_id: "9625", name: "CONTABILIDADE LEGACY", organization_id: "org-1" },
    ],
    pier_user: [
      { external_id: "u-1", department_external_id: "9625", organization_id: "org-1" },
      { external_id: "u-9", department_external_id: "7777", organization_id: "org-1" },
    ],
    request: requests,
    sync_run: [],
    sync_event: [],
    audit_log: [],
  };
}

beforeEach(() => {
  listRequestsByType.mockReset();
  listRequests.mockReset().mockResolvedValue([]);
});

describe("intervalo de competências", () => {
  it("expande o intervalo mês a mês, inclusive virando o ano", () => {
    expect(listarMeses("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("aceita intervalo de um único mês", () => {
    expect(listarMeses("2026-03", "2026-03")).toEqual(["2026-03"]);
  });

  it("recusa intervalo invertido ou formato inválido", () => {
    expect(() => listarMeses("2026-05", "2026-01")).toThrow();
    expect(() => listarMeses("05/2026", "2026-06")).toThrow();
  });

  it("sugere sempre o mês seguinte", () => {
    expect(proximaCompetencia("2025-12")).toBe("2026-01");
    expect(proximaCompetencia("2026-04")).toBe("2026-05");
  });
});

describe("preview da carga histórica", () => {
  it("conta novas, existentes, anexos e revisão de competência sem gravar nada", async () => {
    const { ctx, tabelasEscritas } = criarDbFalso(
      base([
        {
          organization_id: "org-1",
          external_id: "A1",
          reference_month: "2026-01",
          type_external_id: "117418",
        },
      ]),
    );
    listRequestsByType.mockResolvedValue([
      solicitacao("A1", "2026-01"),
      solicitacao("A2", "2026-01", false),
      solicitacao("A3", null),
    ]);

    const preview = await previsualizarCarga(ctx, { inicio: "2026-01", fim: "2026-01" });

    expect(preview.totalMeses).toBe(1);
    expect(preview.totalEncontradas).toBe(3);
    expect(preview.totalNovas).toBe(2);
    expect(preview.totalExistentes).toBe(1);
    expect(preview.totalComAnexo).toBe(2);
    expect(preview.totalSemAnexo).toBe(1);
    expect(preview.totalSemCompetencia).toBe(1);
    expect(tabelasEscritas).not.toContain("request");
  });

  it("isola a falha de um mês sem invalidar os demais", async () => {
    const { ctx } = criarDbFalso(base());
    listRequestsByType
      .mockResolvedValueOnce([solicitacao("A1", "2026-01")])
      .mockRejectedValueOnce(new Error("PIER fora do ar"))
      .mockResolvedValueOnce([solicitacao("A3", "2026-03")]);

    const preview = await previsualizarCarga(ctx, { inicio: "2026-01", fim: "2026-03" });

    expect(preview.meses.map((m) => m.erro !== null)).toEqual([false, true, false]);
    expect(preview.totalErros).toBe(1);
    expect(preview.totalEncontradas).toBe(2);
  });

  it("ignora solicitações fora dos departamentos contábeis", async () => {
    const { ctx } = criarDbFalso(base());
    listRequestsByType.mockResolvedValue([
      solicitacao("A1", "2026-01"),
      { ...solicitacao("A2", "2026-01"), responsibleExternalId: "u-9" },
    ]);

    const preview = await previsualizarCarga(ctx, { inicio: "2026-01", fim: "2026-01" });
    expect(preview.totalEncontradas).toBe(1);
    expect(preview.meses[0]?.ignoradasNaoContabeis).toBe(1);
    expect(preview.totalIgnoradasNaoContabeis).toBe(1);
  });

  it("complementa a busca tipada com a busca ampla por texto, sem duplicar", async () => {
    const { ctx } = criarDbFalso(base());
    listRequestsByType.mockResolvedValue([solicitacao("A1", "2026-01")]);
    listRequests.mockResolvedValue([
      solicitacao("A1", "2026-01"), // já veio da busca tipada: não deve duplicar
      solicitacao("A2", "2026-01"), // só apareceu na busca ampla (ex.: DAS, REINF)
    ]);

    const preview = await previsualizarCarga(ctx, { inicio: "2026-01", fim: "2026-01" });

    expect(preview.totalEncontradas).toBe(2);
  });

  it("tenta a busca ampla com barra e com ponto, porque o separador varia por departamento", async () => {
    const { ctx } = criarDbFalso(base());
    listRequestsByType.mockResolvedValue([]);
    listRequests.mockResolvedValue([]);

    await previsualizarCarga(ctx, { inicio: "2026-01", fim: "2026-01" });

    expect(listRequests).toHaveBeenCalledWith(expect.objectContaining({ busca: "01/2026" }));
    expect(listRequests).toHaveBeenCalledWith(expect.objectContaining({ busca: "01.2026" }));
  });
});

describe("carga de uma competência", () => {
  it("grava por upsert com chave organização + external_id, sem duplicar na repetição", async () => {
    const jaGravada = {
      organization_id: "org-1",
      external_id: "A1",
      reference_month: "2026-01",
      type_external_id: "117418",
    };
    const { ctx, gravacoes } = criarDbFalso(base([jaGravada]));
    listRequestsByType.mockResolvedValue([solicitacao("A1", "2026-01")]);

    const resumo = await carregarCompetencia(ctx, { competencia: "2026-01" });

    expect(resumo.novas).toBe(0);
    expect(resumo.existentes).toBe(1);
    const upsert = gravacoes.find((g) => g.tabela === "request");
    expect(upsert?.operacao).toBe("upsert");
    expect(upsert?.linhas).toHaveLength(1);
    expect(upsert?.linhas[0]?.external_id).toBe("A1");
  });

  it("mantém a solicitação sem competência interpretável para revisão", async () => {
    const { ctx, gravacoes } = criarDbFalso(base());
    listRequestsByType.mockResolvedValue([solicitacao("A9", null)]);

    const resumo = await carregarCompetencia(ctx, { competencia: "2026-02" });

    expect(resumo.semCompetencia).toBe(1);
    const linha = gravacoes.find((g) => g.tabela === "request")?.linhas[0];
    expect(linha?.reference_month).toBeNull();
  });

  it("pede a competência no formato AAAA-MM", async () => {
    const { ctx } = criarDbFalso(base());
    await expect(carregarCompetencia(ctx, { competencia: "01/2026" })).rejects.toThrow();
  });

  it("nunca finaliza nem escreve no PIER", async () => {
    const { ctx } = criarDbFalso(base());
    listRequestsByType.mockResolvedValue([solicitacao("A1", "2026-01")]);
    await carregarCompetencia(ctx, { competencia: "2026-01" });
    // o adapter só é usado em modo leitura
    expect(listRequestsByType).toHaveBeenCalledWith(
      expect.objectContaining({ incluirSemCompetencia: true }),
    );
  });
});

describe("estado da carga", () => {
  it("informa que ainda não há carga inicial", async () => {
    const { ctx } = criarDbFalso(base());
    const estado = await estadoCarga(ctx);
    expect(estado.possuiCarga).toBe(false);
    expect(estado.competenciasCarregadas).toEqual([]);
  });

  it("resume competências carregadas e sugere o mês seguinte", async () => {
    const { ctx } = criarDbFalso(
      base([
        {
          organization_id: "org-1",
          external_id: "A1",
          reference_month: "2026-01",
          type_external_id: "117418",
          synced_at: "2026-02-01T10:00:00.000Z",
        },
        {
          organization_id: "org-1",
          external_id: "A2",
          reference_month: "2026-02",
          type_external_id: "117418",
          synced_at: "2026-03-01T10:00:00.000Z",
        },
        {
          organization_id: "org-1",
          external_id: "A3",
          reference_month: null,
          type_external_id: "117418",
          synced_at: "2026-03-02T10:00:00.000Z",
        },
      ]),
    );

    const estado = await estadoCarga(ctx);

    expect(estado.possuiCarga).toBe(true);
    expect(estado.primeiraCompetencia).toBe("2026-01");
    expect(estado.ultimaCompetencia).toBe("2026-02");
    expect(estado.proximaSugerida).toBe("2026-03");
    expect(estado.emRevisaoCompetencia).toBe(1);
    expect(estado.ultimaSincronizacao).toBe("2026-03-02T10:00:00.000Z");
  });
});
