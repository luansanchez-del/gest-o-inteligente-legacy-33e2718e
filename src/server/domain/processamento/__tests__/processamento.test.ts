import { beforeEach, describe, expect, it, vi } from "vitest";

import { criarDbFalso } from "../../carteira/__tests__/db-falso";
import type { AppContext } from "../../../lib/context";

const carregarSolicitacao = vi.fn();
const salvarAnexoBytes = vi.fn();
const executarValidacao = vi.fn();
const obterResultadoValidacao = vi.fn();

vi.mock("../../validacao/validacao.service", () => ({
  carregarSolicitacao: (...args: unknown[]) => carregarSolicitacao(...args),
  salvarAnexoBytes: (...args: unknown[]) => salvarAnexoBytes(...args),
  executarValidacao: (...args: unknown[]) => executarValidacao(...args),
  obterResultadoValidacao: (...args: unknown[]) => obterResultadoValidacao(...args),
}));

vi.mock("../../../integrations/pier/pier.adapter", () => ({ pierAdapter: {} }));

const { escolherBalancete, processarEscopo, processarSolicitacao } = await import(
  "../processamento.service"
);

const SOLICITACAO = {
  id: "req-1",
  external_id: "35806843",
  number: "1509-EF",
  description: "FECHAMENTO CONTÁBIL - 07/2026",
  status: "Em andamento",
  reference_month: "2026-07",
  client_name: "TONIOLO LTDA",
  client_document: "12.345.678/0001-90",
  has_attachment: true,
  finished_at: null,
};

function contexto(linhas: Record<string, Record<string, unknown>[]> = {}): AppContext {
  return criarDbFalso({ request_processing: [], audit_log: [], request: [], ...linhas }).ctx;
}

function pierFalso(over: Record<string, unknown> = {}) {
  return {
    getRequest: vi.fn(async () => ({
      externalId: "35806843",
      status: "Em andamento",
      finishedAt: null,
      referenceMonth: "2026-07",
      hasAttachment: true,
    })),
    listPosts: vi.fn(async () => [{ content: "Segue balancete 07/2026" }]),
    listFiles: vi.fn(async () => [
      {
        externalId: "arq-1",
        name: "BALANCETE 07-2026.pdf",
        category: "Balancete",
        mimeType: "application/pdf",
        createdAt: "2026-08-01",
      },
      {
        externalId: "arq-2",
        name: "contrato.pdf",
        category: "Outros",
        mimeType: "application/pdf",
        createdAt: "2026-08-02",
      },
    ]),
    downloadFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
    createPost: vi.fn(async () => ({ externalId: "post-1" })),
    finalizeRequest: vi.fn(async () => undefined),
    ...over,
  } as never;
}

function deps(over: Record<string, unknown> = {}) {
  return {
    pier: pierFalso(),
    salvarAnexo: salvarAnexoBytes,
    validar: executarValidacao,
    obterResultado: obterResultadoValidacao,
    ...over,
  } as never;
}

beforeEach(() => {
  carregarSolicitacao.mockReset().mockResolvedValue(SOLICITACAO);
  salvarAnexoBytes.mockReset().mockResolvedValue({ anexoId: "anx-1", hash: "h1", reaproveitado: false });
  executarValidacao.mockReset().mockResolvedValue({ execucaoId: "exec-1" });
  obterResultadoValidacao
    .mockReset()
    .mockResolvedValue({ resultado: "APROVADO", resumo: "ok", achados: [] });
});

describe("processamento de fechamento contábil", () => {
  it("aprovado: posta antes de finalizar e só confirma após novo GET", async () => {
    const pier = pierFalso();
    (pier as unknown as { getRequest: ReturnType<typeof vi.fn> }).getRequest = vi
      .fn()
      .mockResolvedValueOnce({ status: "Em andamento", finishedAt: null, referenceMonth: "2026-07" })
      .mockResolvedValueOnce({ status: "Finalizada", finishedAt: "2026-08-10T12:00:00Z" });

    const r = await processarSolicitacao(contexto(), { solicitacaoExternalId: "35806843" }, deps({ pier }));

    expect(r.situacao).toBe("FINALIZADO");
    expect(r.postagemId).toBe("post-1");
    expect(r.finalizadaEm).toBe("2026-08-10T12:00:00Z");
    const p = pier as unknown as { createPost: ReturnType<typeof vi.fn>; finalizeRequest: ReturnType<typeof vi.fn> };
    expect(p.createPost).toHaveBeenCalledTimes(1);
    expect(p.createPost.mock.invocationCallOrder[0]!).toBeLessThan(
      p.finalizeRequest.mock.invocationCallOrder[0]!,
    );
  });

  it("sem balancete: fica em revisão e não finaliza", async () => {
    const pier = pierFalso({ listFiles: vi.fn(async () => []) });
    const r = await processarSolicitacao(contexto(), { solicitacaoExternalId: "35806843" }, deps({ pier }));
    expect(r.situacao).toBe("EM_REVISAO");
    expect((pier as unknown as { finalizeRequest: ReturnType<typeof vi.fn> }).finalizeRequest)
      .not.toHaveBeenCalled();
  });

  it("com alerta contábil (caso 35806843): analisa, mostra e não finaliza", async () => {
    obterResultadoValidacao.mockResolvedValue({
      resultado: "COM_ALERTAS",
      resumo: "divergências",
      achados: [{ severidade: "WARNING", exigeHumano: true }],
    });
    const pier = pierFalso();
    const r = await processarSolicitacao(contexto(), { solicitacaoExternalId: "35806843" }, deps({ pier }));
    expect(r.situacao).toBe("EM_REVISAO");
    expect(r.execucaoId).toBe("exec-1");
    expect(r.totalAlertas).toBe(1);
    const p = pier as unknown as { createPost: ReturnType<typeof vi.fn>; finalizeRequest: ReturnType<typeof vi.fn> };
    expect(p.createPost).not.toHaveBeenCalled();
    expect(p.finalizeRequest).not.toHaveBeenCalled();
  });

  it("com erro contábil: não finaliza", async () => {
    obterResultadoValidacao.mockResolvedValue({
      resultado: "REPROVADO",
      resumo: "erro",
      achados: [{ severidade: "ERROR" }],
    });
    const r = await processarSolicitacao(contexto(), { solicitacaoExternalId: "35806843" }, deps());
    expect(r.situacao).toBe("EM_REVISAO");
    expect(r.totalErros).toBe(1);
  });

  it("já finalizada: nenhuma ação de escrita", async () => {
    const pier = pierFalso({
      getRequest: vi.fn(async () => ({ status: "Finalizada", finishedAt: "2026-08-01T10:00:00Z" })),
    });
    const r = await processarSolicitacao(contexto(), { solicitacaoExternalId: "35806843" }, deps({ pier }));
    expect(r.situacao).toBe("JA_FINALIZADA");
    const p = pier as unknown as { createPost: ReturnType<typeof vi.fn>; finalizeRequest: ReturnType<typeof vi.fn> };
    expect(p.createPost).not.toHaveBeenCalled();
    expect(p.finalizeRequest).not.toHaveBeenCalled();
  });

  it("postagem ok e finalização falha: fica pendente com a postagem guardada", async () => {
    const pier = pierFalso({
      finalizeRequest: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    const r = await processarSolicitacao(contexto(), { solicitacaoExternalId: "35806843" }, deps({ pier }));
    expect(r.situacao).toBe("PENDENTE");
    expect(r.postagemId).toBe("post-1");
  });

  it("reexecução idempotente: reutiliza a postagem existente e só finaliza", async () => {
    const ctx = contexto({
      request_processing: [
        {
          organization_id: "org-1",
          request_id: "req-1",
          pier_post_external_id: "post-antiga",
          finalized_at: null,
        },
      ],
    });
    const pier = pierFalso();
    (pier as unknown as { getRequest: ReturnType<typeof vi.fn> }).getRequest = vi
      .fn()
      .mockResolvedValueOnce({ status: "Em andamento", finishedAt: null })
      .mockResolvedValueOnce({ status: "Finalizada", finishedAt: "2026-08-10T12:00:00Z" });

    const r = await processarSolicitacao(ctx, { solicitacaoExternalId: "35806843" }, deps({ pier }));
    expect(r.postagemId).toBe("post-antiga");
    expect((pier as unknown as { createPost: ReturnType<typeof vi.fn> }).createPost)
      .not.toHaveBeenCalled();
    expect(r.situacao).toBe("FINALIZADO");
  });

  it("divergência entre cache e API é corrigida antes de agir", async () => {
    const pier = pierFalso({
      getRequest: vi.fn(async () => ({ status: "Aguardando cliente", finishedAt: null })),
    });
    const r = await processarSolicitacao(contexto(), { solicitacaoExternalId: "35806843" }, deps({ pier }));
    expect(r.divergenciaCorrigida).toBe(true);
    expect(r.statusPier).toBe("Aguardando cliente");
  });

  it("lote reutiliza o serviço unitário e consolida o resumo", async () => {
    const resumo = await processarEscopo(
      contexto(),
      { solicitacoes: ["35806843"], permitirFinalizar: false },
      deps(),
    );
    expect(resumo.total).toBe(1);
    expect(resumo.pendentes).toBe(1);
    expect(resumo.itens[0]!.motivo).toContain("não solicitada");
  });
});

describe("escolherBalancete", () => {
  function arquivo(overrides: Partial<Parameters<typeof escolherBalancete>[0][number]>) {
    return {
      externalId: "f1",
      name: "arquivo.pdf",
      category: null,
      mimeType: "application/pdf",
      createdAt: "2026-08-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("nunca escolhe um arquivo de razão no lugar do balancete", () => {
    const escolhido = escolherBalancete(
      [
        arquivo({ externalId: "razao", name: "Razão 08-2026.pdf" }),
        arquivo({ externalId: "balancete", name: "Documento contábil 08-2026.pdf" }),
      ],
      { competencia: "2026-08", textoPostagens: "" },
    );
    expect(escolhido?.externalId).toBe("balancete");
  });

  it("ainda prioriza o nome que contém 'balancete' quando existe mais de um candidato", () => {
    const escolhido = escolherBalancete(
      [
        arquivo({ externalId: "outro", name: "Outro anexo 08-2026.pdf" }),
        arquivo({ externalId: "balancete", name: "Balancete 08-2026.pdf" }),
      ],
      { competencia: "2026-08", textoPostagens: "" },
    );
    expect(escolhido?.externalId).toBe("balancete");
  });
});
