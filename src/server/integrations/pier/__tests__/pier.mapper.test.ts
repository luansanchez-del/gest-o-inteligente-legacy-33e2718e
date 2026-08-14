import { describe, expect, it } from "vitest";

import { mapPost, mapRequest, mapRequestType } from "../pier.mapper";

describe("mapPost", () => {
  it("reconhece os aliases reais da API V2", () => {
    const post = mapPost(
      {
        idPostagem: 998877,
        postagemTexto:
          "Segue demonstrativo atualizado de 01.2026 à 05.2026, para validação.",
        postadoEm: "2026-06-10T12:00:00Z",
        nomeUsuario: "Contador",
      },
      "35806843",
    );

    expect(post.externalId).toBe("998877");
    expect(post.content).toContain("01.2026");
    expect(post.postedAt).toBe("2026-06-10T12:00:00Z");
    expect(post.authorName).toBe("Contador");
    expect(post.requestExternalId).toBe("35806843");
  });

  it("mantém compatibilidade com os nomes antigos", () => {
    const post = mapPost(
      { id: "1", mensagem: "ok", criadoEm: "2026-01-02" },
      "10",
    );
    expect(post.externalId).toBe("1");
    expect(post.content).toBe("ok");
    expect(post.postedAt).toBe("2026-01-02");
  });
});

describe("tipos de solicitação", () => {
  it("reconhece Movimento Financeiro Mensal como finalidade própria", () => {
    const request = mapRequest({
      id: "123",
      descricao: "MOVIMENTO FINANCEIRO MENSAL - 01/2026",
      nomeTipo: "MOVIMENTO FINANCEIRO MENSAL",
    });
    expect(request.purpose).toBe("MONTHLY_FINANCIAL_MOVEMENT");
    expect(
      mapRequestType({ id: 77, nome: "MOVIMENTO FINANCEIRO MENSAL" }),
    ).toEqual({
      externalId: "77",
      name: "MOVIMENTO FINANCEIRO MENSAL",
      status: null,
    });
  });
});
