import { beforeEach, describe, expect, it, vi } from "vitest";

import { criarDbFalso } from "../../carteira/__tests__/db-falso";

const listRequestTypes = vi.fn();

vi.mock("../../../integrations/pier/pier.adapter", () => ({
  pierAdapter: {
    listRequestTypes: () => listRequestTypes(),
  },
}));

const {
  configurarDepartamentosContabeis,
  departamentosContabeis,
  resolverTipoSolicitacao,
  responsavelHumano,
} = await import("../escopo.service");

function base(overrides: Record<string, unknown[]> = {}) {
  return {
    app_setting: [],
    pier_department: [],
    pier_user: [],
    request: [],
    sync_run: [],
    sync_event: [],
    audit_log: [],
    ...overrides,
  };
}

beforeEach(() => listRequestTypes.mockReset());

describe("responsavelHumano", () => {
  it("considera vazio/nulo como humano (nada a filtrar)", () => {
    expect(responsavelHumano(null)).toBe(true);
    expect(responsavelHumano(undefined)).toBe(true);
    expect(responsavelHumano("")).toBe(true);
  });

  it("exclui contas automáticas conhecidas, sem distinguir acento/maiúsculas", () => {
    expect(responsavelHumano("AUTOMAÇÃO")).toBe(false);
    expect(responsavelHumano("automacao")).toBe(false);
    expect(responsavelHumano("Fechamento Contábil")).toBe(false);
    expect(responsavelHumano("CONTRATOS ANTIGOS")).toBe(false);
    expect(responsavelHumano("EMAIL")).toBe(false);
  });

  it("mantém Movimento Financeiro Mensal como responsável provisório", () => {
    expect(responsavelHumano("MOVIMENTO FINANCEIRO MENSAL")).toBe(true);
  });

  it("considera um nome comum como humano", () => {
    expect(responsavelHumano("VINICIUS SILVA")).toBe(true);
  });
});

describe("resolverTipoSolicitacao", () => {
  it("usa o ID padrão embutido no código quando não há override", async () => {
    const { ctx } = criarDbFalso(base());
    await expect(resolverTipoSolicitacao(ctx, "CONTABIL")).resolves.toBe("117418");
  });

  it("prioriza o override configurado em app_setting sobre o padrão", async () => {
    const { ctx } = criarDbFalso(
      base({
        app_setting: [
          {
            organization_id: "org-1",
            key: "pier.tipos_solicitacao",
            value: { CONTABIL: "999999" },
          },
        ],
      }),
    );
    await expect(resolverTipoSolicitacao(ctx, "CONTABIL")).resolves.toBe("999999");
  });

  it("aceita direto um ID numérico vindo do seletor dinâmico", async () => {
    const { ctx } = criarDbFalso(base());
    await expect(resolverTipoSolicitacao(ctx, "123456")).resolves.toBe("123456");
  });

  it("recusa uma chave desconhecida sem configuração e sem ser numérica", async () => {
    const { ctx } = criarDbFalso(base());
    await expect(resolverTipoSolicitacao(ctx, "ALGO_DESCONHECIDO")).rejects.toThrow();
  });

  it("resolve MOVIMENTO_FINANCEIRO consultando os tipos do PIER pelo nome", async () => {
    const { ctx } = criarDbFalso(base());
    listRequestTypes.mockResolvedValue([
      { externalId: "1", name: "Fechamento Contábil" },
      { externalId: "77", name: "Movimento Financeiro Mensal" },
    ]);
    await expect(resolverTipoSolicitacao(ctx, "MOVIMENTO_FINANCEIRO")).resolves.toBe("77");
  });
});

describe("departamentosContabeis", () => {
  it("usa a seleção manual configurada em app_setting quando existir", async () => {
    const { ctx } = criarDbFalso(
      base({
        app_setting: [
          {
            organization_id: "org-1",
            key: "pier.departamentos_contabeis",
            value: ["111", "222"],
          },
        ],
        pier_department: [
          { external_id: "9625", name: "CONTABILIDADE LEGACY", organization_id: "org-1" },
        ],
      }),
    );
    await expect(departamentosContabeis(ctx)).resolves.toEqual(["111", "222"]);
  });

  it("sem configuração, casa pelo nome do departamento cadastrado", async () => {
    const { ctx } = criarDbFalso(
      base({
        pier_department: [
          { external_id: "9625", name: "CONTABILIDADE LEGACY", organization_id: "org-1" },
          { external_id: "16104", name: "CONTABILIDADE BPO", organization_id: "org-1" },
          { external_id: "7777", name: "FISCAL", organization_id: "org-1" },
        ],
      }),
    );
    const ids = await departamentosContabeis(ctx);
    expect(ids.sort()).toEqual(["16104", "9625"]);
  });

  it("sem configuração e sem nome batendo, cai no padrão fixo", async () => {
    const { ctx } = criarDbFalso(base());
    await expect(departamentosContabeis(ctx)).resolves.toEqual(["9625", "16104"]);
  });
});

describe("configurarDepartamentosContabeis", () => {
  it("exige perfil administrador", async () => {
    const { ctx } = criarDbFalso(base());
    ctx.isAdmin = false;
    await expect(
      configurarDepartamentosContabeis(ctx, { departamentoIds: ["111"] }),
    ).rejects.toThrow();
  });

  it("recusa lista vazia", async () => {
    const { ctx } = criarDbFalso(base());
    await expect(configurarDepartamentosContabeis(ctx, { departamentoIds: [] })).rejects.toThrow();
  });

  it("grava a seleção sem duplicatas e sem espaços", async () => {
    const { ctx, gravacoes } = criarDbFalso(base());
    const resultado = await configurarDepartamentosContabeis(ctx, {
      departamentoIds: [" 111", "222", "111"],
    });
    expect(resultado.departamentoIds).toEqual(["111", "222"]);
    const upsert = gravacoes.find((g) => g.tabela === "app_setting");
    expect(upsert?.linhas[0]?.value).toEqual(["111", "222"]);
  });
});
