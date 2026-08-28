import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    clone() {
      return this;
    },
  };
}

function tokenResponse(token = "tok-1") {
  return fakeResponse(200, { token, expiraEm: Date.now() + 3_600_000 });
}

async function carregarPierHttp() {
  return import("../pier.http");
}

/**
 * Roda uma chamada real (com sleep/backoff internos) sob fake timers, sem
 * precisar acertar de antemão quanto tempo o algoritmo vai esperar: drena os
 * timers pendentes em passos até a promise assentar (resolver ou rejeitar).
 */
async function resolverComTimers<T>(criarPromise: () => Promise<T>): Promise<T> {
  const promise = criarPromise();
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  while (!settled) {
    await vi.advanceTimersByTimeAsync(1000);
  }
  return promise;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.useFakeTimers();
  process.env["PIER_BASE_URL"] = "https://pier.test";
  process.env["PIER_USUARIO"] = "usuario";
  process.env["PIER_SENHA"] = "senha";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env["PIER_BASE_URL"];
  delete process.env["PIER_USUARIO"];
  delete process.env["PIER_SENHA"];
});

describe("pierGet", () => {
  it("num 429 real espera a janela e repete a chamada até ter sucesso", async () => {
    let getCalls = 0;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/auth/login")) return tokenResponse();
      getCalls++;
      if (getCalls === 1) return fakeResponse(429, { message: "quota exceeded" });
      return fakeResponse(200, { total: 3 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { pierGet } = await carregarPierHttp();
    const resultado = await resolverComTimers(() => pierGet("/api/v2/solicitacoes"));

    expect(resultado).toEqual({ total: 3 });
    expect(getCalls).toBe(2);
  });

  it("num 401 renova o token uma vez e repete a chamada", async () => {
    let getCalls = 0;
    let authCalls = 0;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/auth/login")) {
        authCalls++;
        return tokenResponse(`tok-${authCalls}`);
      }
      getCalls++;
      if (getCalls === 1) return fakeResponse(401, {});
      return fakeResponse(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { pierGet } = await carregarPierHttp();
    const resultado = await resolverComTimers(() => pierGet("/api/v2/solicitacoes"));

    expect(resultado).toEqual({ ok: true });
    expect(authCalls).toBe(2);
    expect(getCalls).toBe(2);
  });

  it("num 401 persistente mesmo após renovar, falha como integração indisponível", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/auth/login")) return tokenResponse();
      return fakeResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { pierGet } = await carregarPierHttp();

    await expect(resolverComTimers(() => pierGet("/api/v2/solicitacoes"))).rejects.toMatchObject({
      code: "INTEGRACAO_INDISPONIVEL",
    });
  });

  it("em 5xx repetido esgota as tentativas e falha como integração", async () => {
    let getCalls = 0;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/auth/login")) return tokenResponse();
      getCalls++;
      return fakeResponse(503, { message: "fora do ar" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { pierGet } = await carregarPierHttp();

    await expect(resolverComTimers(() => pierGet("/api/v2/solicitacoes"))).rejects.toMatchObject({
      code: "INTEGRACAO_FALHA",
    });
    expect(getCalls).toBe(4);
  });
});

describe("pierPost", () => {
  it("não repete a chamada quando o erro não é 401 (evita duplicar a ação)", async () => {
    let postCalls = 0;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/auth/login")) return tokenResponse();
      postCalls++;
      return fakeResponse(500, { message: "erro interno" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { pierPost } = await carregarPierHttp();

    await expect(
      resolverComTimers(() => pierPost("/api/v2/solicitacoes/1/finalizar")),
    ).rejects.toMatchObject({ code: "INTEGRACAO_FALHA" });
    expect(postCalls).toBe(1);
  });

  it("num 401 renova o token e repete a chamada exatamente uma vez", async () => {
    let postCalls = 0;
    let authCalls = 0;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/auth/login")) {
        authCalls++;
        return tokenResponse(`tok-${authCalls}`);
      }
      postCalls++;
      if (postCalls === 1) return fakeResponse(401, {});
      return fakeResponse(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { pierPost } = await carregarPierHttp();
    const resultado = await resolverComTimers(() => pierPost("/api/v2/solicitacoes/1/finalizar"));

    expect(resultado).toEqual({ ok: true });
    expect(postCalls).toBe(2);
    expect(authCalls).toBe(2);
  });
});

describe("cota de chamadas por janela", () => {
  it("ao estourar o limite de chamadas por minuto, espera a janela liberar antes de continuar", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/auth/login")) return tokenResponse();
      return fakeResponse(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const { pierGet } = await carregarPierHttp();

    // Bem mais que o limite de 45 chamadas/minuto: força o limitador a intervir.
    const chamadas = Array.from({ length: 50 }, () => pierGet("/api/v2/solicitacoes"));
    await resolverComTimers(() => Promise.all(chamadas));

    const esperasDeJanela = setTimeoutSpy.mock.calls.filter(
      ([, ms]) => typeof ms === "number" && ms >= 59_000,
    );
    expect(esperasDeJanela.length).toBeGreaterThan(0);
  });
});
