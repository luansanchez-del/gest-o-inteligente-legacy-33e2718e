import type { AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { pierAdapter } from "../../integrations/pier/pier.adapter";

export type RegimeFiscalChecklist =
  | "SIMPLES_NACIONAL"
  | "REGIME_NORMAL"
  | "NAO_IDENTIFICADO";
export type StatusItemFiscal = "OK" | "FALTANTE" | "CONDICIONAL";

export interface ItemChecklistFiscal {
  codigo: string;
  grupo:
    | "ICMS"
    | "SPED_ICMS_IPI"
    | "ISS"
    | "PIS_COFINS"
    | "SPED_CONTRIBUICOES"
    | "IRPJ_CSLL"
    | "SIMPLES_NACIONAL";
  documento: string;
  status: StatusItemFiscal;
  obrigatorio: boolean;
  evidencias: string[];
}

function normalizar(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function regimeDoTexto(
  value: string | null | undefined,
): RegimeFiscalChecklist {
  const texto = normalizar(value);
  if (texto.includes("simples")) return "SIMPLES_NACIONAL";
  if (
    texto.includes("lucro real") ||
    texto.includes("lucro presumido") ||
    texto.includes("presumido")
  )
    return "REGIME_NORMAL";
  return "NAO_IDENTIFICADO";
}

function corresponde(alvo: string, termos: string[]) {
  const texto = normalizar(alvo);
  return termos.some((termo) => texto.includes(normalizar(termo)));
}

function item(
  arquivos: string[],
  codigo: string,
  grupo: ItemChecklistFiscal["grupo"],
  documento: string,
  termos: string[],
  obrigatorio = true,
): ItemChecklistFiscal {
  const evidencias = arquivos.filter((arquivo) => corresponde(arquivo, termos));
  return {
    codigo,
    grupo,
    documento,
    obrigatorio,
    status: evidencias.length
      ? "OK"
      : obrigatorio
        ? "FALTANTE"
        : "CONDICIONAL",
    evidencias,
  };
}

function checklistSimples(arquivos: string[]) {
  return [
    item(
      arquivos,
      "SN_ENTRADAS",
      "SIMPLES_NACIONAL",
      "Relatório de Notas Fiscais de Entrada",
      ["notas fiscais entrada", "nf entrada", "entradas"],
    ),
    item(
      arquivos,
      "SN_SAIDAS",
      "SIMPLES_NACIONAL",
      "Relatório de Notas Fiscais de Saída ou Serviços",
      ["notas fiscais saida", "nf saida", "saidas", "servicos", "nfs e"],
    ),
    item(
      arquivos,
      "SN_FALTANTES",
      "SIMPLES_NACIONAL",
      "Relatório do Questor de NF faltantes",
      ["nf faltante", "notas faltantes", "faltantes"],
    ),
    item(
      arquivos,
      "SN_PGDAS",
      "SIMPLES_NACIONAL",
      "Relatório da Declaração PGDAS-D",
      ["pgdas", "declaracao pgdas"],
    ),
    item(
      arquivos,
      "SN_DAS",
      "SIMPLES_NACIONAL",
      "Guia DAS emitida para recolhimento",
      ["guia das", "sn das", "das recolhimento"],
    ),
  ];
}

function checklistNormal(arquivos: string[]) {
  return [
    item(
      arquivos,
      "ICMS_ENTRADAS",
      "ICMS",
      "Relatório de Notas Fiscais de Entrada",
      ["notas fiscais entrada", "nf entrada", "entradas"],
    ),
    item(
      arquivos,
      "ICMS_SAIDAS",
      "ICMS",
      "Relatório de Notas Fiscais de Saída",
      ["notas fiscais saida", "nf saida", "saidas"],
    ),
    item(
      arquivos,
      "ICMS_FALTANTES",
      "ICMS",
      "Relatório do Questor de NF faltantes",
      ["nf faltante", "notas faltantes", "faltantes"],
    ),
    item(
      arquivos,
      "ICMS_CANCELADAS",
      "ICMS",
      "Relatório do Questor de NF Canceladas",
      ["nf cancelada", "notas canceladas", "canceladas"],
    ),
    item(
      arquivos,
      "ICMS_GUIA",
      "ICMS",
      "Guia ICMS",
      ["guia icms", "icms guia"],
    ),
    item(
      arquivos,
      "SPED_ICMS",
      "SPED_ICMS_IPI",
      "Recibo de entrega do SPED ICMS/IPI",
      ["recibo sped icms", "sped fiscal", "sped icms", "efd icms"],
    ),

    // O manual trata ISS como um bloco próprio, mas sua aplicabilidade depende da empresa.
    // Sem evidência suficiente, a ausência fica como ressalva humana e nunca vira bloqueio automático.
    item(
      arquivos,
      "ISS_RELATORIO",
      "ISS",
      "Relatório de ISS da Prefeitura ou evidência de sem movimento",
      ["relatorio iss", "iss prefeitura", "iss sem movimento", "sem movimento iss"],
      false,
    ),
    item(
      arquivos,
      "ISS_NFSE_FALTANTES",
      "ISS",
      "Relatório do Questor de NFS-e faltantes",
      ["nfs e faltante", "nfse faltante", "nfs faltantes"],
      false,
    ),
    item(
      arquivos,
      "ISS_DAM",
      "ISS",
      "Guia DAM",
      ["guia dam", "dam iss"],
      false,
    ),

    item(
      arquivos,
      "PC_APURACAO",
      "PIS_COFINS",
      "Memória de cálculo ou relatório de apuração de PIS/COFINS",
      [
        "pis cofins",
        "apuracao pis",
        "apuracao cofins",
        "memoria pis",
        "memoria cofins",
      ],
    ),
    item(
      arquivos,
      "PC_GUIA",
      "PIS_COFINS",
      "Guia de recolhimento de PIS/COFINS, quando aplicável",
      ["guia pis", "guia cofins", "darf pis", "darf cofins"],
      false,
    ),
    item(
      arquivos,
      "SPED_CONTRIB",
      "SPED_CONTRIBUICOES",
      "Recibo de entrega do SPED Contribuições",
      ["recibo sped contribu", "sped contribu", "efd contribu"],
    ),

    item(
      arquivos,
      "IRPJ_CSLL_APURACAO",
      "IRPJ_CSLL",
      "Memória de cálculo da apuração de IRPJ/CSLL",
      [
        "irpj csll",
        "apuracao irpj",
        "apuracao csll",
        "memoria irpj",
        "memoria csll",
      ],
    ),
    item(
      arquivos,
      "IRPJ_CSLL_PLANILHA",
      "IRPJ_CSLL",
      "Planilha de Conferência",
      ["planilha conferencia", "conferencia irpj", "conferencia csll"],
    ),
    item(
      arquivos,
      "IRPJ_CSLL_DARF",
      "IRPJ_CSLL",
      "Guia de recolhimento (DARF)",
      ["darf irpj", "darf csll", "guia irpj", "guia csll"],
    ),
  ];
}

export async function validarChecklistFiscal(
  ctx: AppContext,
  input: { solicitacaoExternalId: string },
) {
  const { data: solicitacao, error } = await ctx.db
    .from("request")
    .select(
      "id, external_id, client_document, client_name, reference_month, type_name, description",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("external_id", input.solicitacaoExternalId)
    .maybeSingle();

  if (error || !solicitacao)
    throw new AppError(
      "REGRA_NEGOCIO",
      "Solicitação fiscal não encontrada no cache.",
      error?.message,
    );

  const { data: cliente } = await ctx.db
    .from("pier_client")
    .select("tax_regime")
    .eq("organization_id", ctx.organizationId)
    .eq("document", solicitacao.client_document)
    .maybeSingle();

  const regime = regimeDoTexto(cliente?.tax_regime);
  const arquivosPier = await pierAdapter.listFiles({
    requestExternalId: solicitacao.external_id,
  });
  const arquivos = arquivosPier
    .map((a) => `${a.name ?? ""} ${a.category ?? ""}`.trim())
    .filter(Boolean);

  const itens =
    regime === "SIMPLES_NACIONAL"
      ? checklistSimples(arquivos)
      : regime === "REGIME_NORMAL"
        ? checklistNormal(arquivos)
        : [];

  const faltantes = itens.filter(
    (i) => i.obrigatorio && i.status === "FALTANTE",
  );
  const condicionais = itens.filter(
    (i) => !i.obrigatorio && i.status !== "OK",
  );

  return {
    solicitacaoExternalId: solicitacao.external_id,
    clienteNome: solicitacao.client_name,
    competencia: solicitacao.reference_month,
    tipoNome: solicitacao.type_name,
    regime,
    arquivos: arquivosPier.map((a) => ({
      id: a.externalId,
      nome: a.name,
      categoria: a.category,
    })),
    itens,
    resumo: {
      obrigatorios: itens.filter((i) => i.obrigatorio).length,
      atendidos: itens.filter((i) => i.status === "OK").length,
      faltantes: faltantes.length,
      condicionais: condicionais.length,
    },
    situacao:
      regime === "NAO_IDENTIFICADO"
        ? "REVISAO_HUMANA"
        : faltantes.length
          ? "AGUARDANDO_DOCUMENTO"
          : condicionais.length
            ? "COM_RESSALVAS"
            : "APTA_PARA_CONCLUIR",
    motivo:
      regime === "NAO_IDENTIFICADO"
        ? "Regime tributário não identificado; a lista obrigatória não pode ser definida automaticamente."
        : faltantes.length
          ? `${faltantes.length} documento(s) obrigatório(s) do fechamento fiscal não foram identificados no PIER.`
          : condicionais.length
            ? "Documentação obrigatória identificada; existem itens condicionais que exigem confirmação do analista fiscal."
            : "Documentação obrigatória do fechamento fiscal identificada conforme o procedimento do escritório.",
  };
}
