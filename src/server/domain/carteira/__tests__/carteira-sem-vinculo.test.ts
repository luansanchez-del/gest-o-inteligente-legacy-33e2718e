import { describe, expect, it } from "vitest";

import { listarCarteira, listarSolicitacoesDoCliente } from "../carteira.service";
import { montarPreview } from "../../gestao/gestao.service";
import { criarDbFalso } from "./db-falso";

const CLIENTE = {
  id: "pc-1",
  organization_id: "org-1",
  external_id: "5001",
  name: "TONIOLO LTDA",
  document: "12.345.678/0001-90",
  status: "Ativo",
  tax_regime: "Lucro Presumido",
  // Ficha incompleta de propósito: sem responsável contábil.
  responsible_name: null,
  synced_at: "2026-08-01T10:00:00.000Z",
};

const SOLICITACAO = {
  id: "req-1",
  organization_id: "org-1",
  external_id: "1509-EF",
  number: "1509",
  description: "Fechamento contábil",
  status: "Em andamento",
  reference_month: "2026-01",
  type_external_id: "117418",
  client_external_id: "5001",
  client_name: "TONIOLO LTDA",
  client_document: "12.345.678/0001-90",
  responsible_external_id: "u-1",
  responsible_name: "VINICIUS MANICA BISETTO",
  department_external_id: "9625",
  has_attachment: true,
  // Sem company_id: cliente sem empresa interna nem vínculo.
  company_id: null,
};

const BASE = {
  pier_client: [CLIENTE],
  request: [SOLICITACAO],
  pier_department: [
    { organization_id: "org-1", external_id: "9625", name: "CONTABILIDADE LEGACY" },
    { organization_id: "org-1", external_id: "16104", name: "CONTABILIDADE BPO" },
  ],
  pier_user: [
    {
      organization_id: "org-1",
      external_id: "u-1",
      name: "VINICIUS MANICA BISETTO",
      status: "Ativo",
      department_external_id: "9625",
    },
  ],
  request_attachment: [{ organization_id: "org-1", request_id: "req-1" }],
  post: [],
  validation_execution: [],
  request_decision: [],
  app_setting: [],
  sync_run: [],
};

describe("carteira como catálogo (sem company/company_pier_link)", () => {
  it("lista a carteira sem tocar em company nem company_pier_link", async () => {
    const { ctx, tabelasLidas, tabelasEscritas } = criarDbFalso(BASE);
    const { linhas, resumo } = await listarCarteira(ctx, {});

    expect(linhas).toHaveLength(1);
    expect(resumo.total).toBe(1);
    expect(resumo.ativos).toBe(1);
    expect(Object.keys(linhas[0]!)).not.toContain("vinculado");
    expect([...tabelasLidas, ...tabelasEscritas]).not.toContain("company");
    expect([...tabelasLidas, ...tabelasEscritas]).not.toContain("company_pier_link");
  });

  it("lista solicitações 117418 de um cliente sem empresa interna, com PDF disponível", async () => {
    const { ctx, tabelasLidas, tabelasEscritas } = criarDbFalso(BASE);
    const solicitacoes = await listarSolicitacoesDoCliente(ctx, { clientExternalId: "5001" });

    expect(solicitacoes).toHaveLength(1);
    expect(solicitacoes[0]).toMatchObject({
      externalId: "1509-EF",
      competencia: "2026-01",
      contabil: true,
      documentoDisponivel: true,
    });
    expect([...tabelasLidas, ...tabelasEscritas]).not.toContain("company_pier_link");
  });

  it("também encontra as solicitações pelo CNPJ, sem vínculo", async () => {
    const { ctx } = criarDbFalso(BASE);
    const solicitacoes = await listarSolicitacoesDoCliente(ctx, { documento: "12345678000190" });
    expect(solicitacoes.map((s) => s.externalId)).toEqual(["1509-EF"]);
  });
});

describe("gestão sem exigência de vínculo", () => {
  it("inclui a solicitação contábil e apenas avisa sobre a ficha sem responsável", async () => {
    const { ctx, tabelasLidas, tabelasEscritas } = criarDbFalso(BASE);
    const preview = await montarPreview(ctx, { competencia: "2026-01", tipo: "CONTABIL" });

    expect(preview.totalEmpresas).toBe(1);
    const linha = preview.empresas[0]!;
    expect(linha.solicitacaoId).toBe("1509-EF");
    expect(linha.clienteExternalId).toBe("5001");
    expect(linha.responsavelNome).toBe("VINICIUS MANICA BISETTO");
    expect(linha.statusFila).toBe("PRONTO_PARA_ANALISE");
    // Aviso cadastral, nunca bloqueio.
    expect(linha.avisoCadastral).toBe("Ficha do cliente sem responsável contábil.");
    expect(preview.totalAvisosCadastrais).toBe(1);
    expect([...tabelasLidas, ...tabelasEscritas]).not.toContain("company");
    expect([...tabelasLidas, ...tabelasEscritas]).not.toContain("company_pier_link");
  });
});
