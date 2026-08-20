export type CategoriaFiscal =
  | "ICMS"
  | "SPED_ICMS_IPI"
  | "ISS"
  | "PIS_COFINS"
  | "SPED_CONTRIBUICOES"
  | "IRPJ_CSLL"
  | "SIMPLES_DAS"
  | "OUTRA";

export type RegimeFiscalManual = "NORMAL" | "SIMPLES" | "OUTRO";

export interface RequisitoFiscal {
  id: string;
  rotulo: string;
  obrigatorio: boolean;
  /** Cada grupo interno representa termos alternativos; pelo menos um grupo precisa casar. */
  termos: string[][];
}

export interface ItemChecklistFiscal extends RequisitoFiscal {
  presente: boolean;
  arquivoEncontrado: string | null;
}

function normalizar(valor: string | null | undefined) {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contemTodos(texto: string, termos: string[]) {
  return termos.every((termo) => texto.includes(normalizar(termo)));
}

function req(
  id: string,
  rotulo: string,
  termos: string[][],
  obrigatorio = true,
): RequisitoFiscal {
  return { id, rotulo, termos, obrigatorio };
}

export function classificarRegimeFiscal(
  taxRegime: string | null | undefined,
): RegimeFiscalManual {
  const regime = normalizar(taxRegime);
  if (regime.includes("simples nacional")) return "SIMPLES";
  if (regime.includes("lucro presumido") || regime.includes("lucro real"))
    return "NORMAL";
  return "OUTRO";
}

export function classificarCategoriaFiscal(input: {
  description?: string | null;
  typeName?: string | null;
}): CategoriaFiscal {
  const texto = normalizar(`${input.typeName ?? ""} ${input.description ?? ""}`);

  if (
    (texto.includes("sped") || texto.includes("efd")) &&
    (texto.includes("icms") || texto.includes("ipi") || texto.includes("fiscal"))
  )
    return "SPED_ICMS_IPI";

  if (
    (texto.includes("sped") || texto.includes("efd")) &&
    texto.includes("contrib")
  )
    return "SPED_CONTRIBUICOES";

  if (texto.includes("irpj") || texto.includes("csll")) return "IRPJ_CSLL";
  if (
    texto.includes("pis cofins") ||
    (texto.includes("pis") && texto.includes("cofins"))
  )
    return "PIS_COFINS";

  if (
    texto.includes("pgdas") ||
    texto.includes("guia das") ||
    /(^| )sn( |$)/.test(texto) ||
    texto.includes("simples nacional")
  )
    return "SIMPLES_DAS";

  if (texto.includes("iss") || texto.includes("nfs")) return "ISS";
  if (texto.includes("icms") || texto.includes("guia icms")) return "ICMS";
  return "OUTRA";
}

export function requisitosDoManualFiscal(
  categoria: CategoriaFiscal,
  regime: RegimeFiscalManual,
): RequisitoFiscal[] {
  if (categoria === "ICMS") {
    return [
      req("NF_ENTRADA", "Relatório de Notas Fiscais de Entrada", [
        ["nota", "entrada"],
        ["nf", "entrada"],
      ]),
      req("NF_SAIDA", "Relatório de Notas Fiscais de Saída", [
        ["nota", "saida"],
        ["nf", "saida"],
      ]),
      req("NF_FALTANTES", "Relatório Questor de NF faltantes", [
        ["nf", "faltant"],
        ["nota", "faltant"],
      ]),
      req("NF_CANCELADAS", "Relatório Questor de NF canceladas", [
        ["nf", "cancelad"],
        ["nota", "cancelad"],
      ]),
      req("GUIA_ICMS", "Guia ICMS", [["guia", "icms"], ["icms"]]),
    ];
  }

  if (categoria === "SPED_ICMS_IPI") {
    return [
      req("RECIBO_SPED_ICMS", "Recibo de entrega do SPED ICMS/IPI", [
        ["recibo", "sped", "icms"],
        ["recibo", "efd", "icms"],
        ["recibo", "sped", "fiscal"],
      ]),
    ];
  }

  if (categoria === "ISS") {
    return [
      req("RELATORIO_ISS", "Relatório de ISS da Prefeitura ou sem movimento", [
        ["relatorio", "iss"],
        ["prefeitura", "iss"],
        ["iss", "sem", "movimento"],
      ]),
      req("NFS_FALTANTES", "Relatório Questor de NFS-e faltantes", [
        ["nfs", "faltant"],
        ["nfse", "faltant"],
      ]),
      req("GUIA_DAM", "Guia DAM", [["guia", "dam"], ["dam"]]),
    ];
  }

  if (categoria === "PIS_COFINS") {
    return [
      req("APURACAO_PIS_COFINS", "Memória de cálculo ou relatório de apuração do Questor", [
        ["pis", "cofins", "apur"],
        ["pis", "cofins", "memoria"],
        ["pis", "cofins", "calculo"],
      ]),
      req(
        "GUIA_PIS_COFINS",
        "Guia de recolhimento, quando aplicável",
        [["guia", "pis"], ["guia", "cofins"], ["darf", "pis"], ["darf", "cofins"]],
        false,
      ),
    ];
  }

  if (categoria === "SPED_CONTRIBUICOES") {
    return [
      req("RECIBO_SPED_CONTRIB", "Recibo de entrega do SPED Contribuições", [
        ["recibo", "sped", "contrib"],
        ["recibo", "efd", "contrib"],
      ]),
    ];
  }

  if (categoria === "IRPJ_CSLL") {
    return [
      req("APURACAO_IRPJ_CSLL", "Memória de cálculo da apuração do Questor", [
        ["irpj", "csll", "apur"],
        ["irpj", "csll", "memoria"],
        ["irpj", "csll", "calculo"],
      ]),
      req("PLANILHA_CONFERENCIA", "Planilha de Conferência", [
        ["planilha", "conferencia"],
        ["conferencia", "irpj"],
        ["conferencia", "csll"],
      ]),
      req("DARF_IRPJ_CSLL", "Guia de recolhimento (DARF)", [
        ["darf", "irpj"],
        ["darf", "csll"],
        ["guia", "irpj"],
        ["guia", "csll"],
      ]),
      req("NF_CANCELADAS", "Relatório Questor de NF canceladas", [
        ["nf", "cancelad"],
        ["nota", "cancelad"],
      ]),
    ];
  }

  if (categoria === "SIMPLES_DAS" || regime === "SIMPLES") {
    return [
      req("NF_ENTRADA", "Relatório de Notas Fiscais de Entrada", [
        ["nota", "entrada"],
        ["nf", "entrada"],
      ]),
      req("NF_SAIDA_SERVICO", "Relatório de Notas Fiscais de Saída ou Serviços", [
        ["nota", "saida"],
        ["nf", "saida"],
        ["nota", "servico"],
        ["nfs"],
      ]),
      req("NF_FALTANTES", "Relatório Questor de NF faltantes", [
        ["nf", "faltant"],
        ["nota", "faltant"],
      ]),
      req("PGDAS", "Relatório da Declaração PGDAS-D", [["pgdas"]]),
      req("DAS", "Guia DAS emitida para recolhimento", [
        ["guia", "das"],
        ["das"],
      ]),
    ];
  }

  return [];
}

export function avaliarChecklistFiscal(input: {
  categoria: CategoriaFiscal;
  regime: RegimeFiscalManual;
  arquivos: Array<{ name: string | null; category?: string | null }>;
}) {
  const requisitos = requisitosDoManualFiscal(input.categoria, input.regime);
  const nomes = input.arquivos
    .map((arquivo) => ({
      original: arquivo.name ?? arquivo.category ?? "Arquivo sem nome",
      normalizado: normalizar(`${arquivo.name ?? ""} ${arquivo.category ?? ""}`),
    }))
    .filter((arquivo) => arquivo.normalizado);

  const itens: ItemChecklistFiscal[] = requisitos.map((requisito) => {
    const encontrado = nomes.find((arquivo) =>
      requisito.termos.some((grupo) => contemTodos(arquivo.normalizado, grupo)),
    );
    return {
      ...requisito,
      presente: Boolean(encontrado),
      arquivoEncontrado: encontrado?.original ?? null,
    };
  });

  const obrigatorios = itens.filter((item) => item.obrigatorio);
  const faltantes = obrigatorios.filter((item) => !item.presente);
  const opcionaisAusentes = itens.filter(
    (item) => !item.obrigatorio && !item.presente,
  );

  return {
    itens,
    totalObrigatorios: obrigatorios.length,
    totalPresentes: obrigatorios.length - faltantes.length,
    faltantes: faltantes.map((item) => item.rotulo),
    opcionaisAusentes: opcionaisAusentes.map((item) => item.rotulo),
    completo: requisitos.length > 0 && faltantes.length === 0,
  };
}

export const ROTULOS_CATEGORIA_FISCAL: Record<CategoriaFiscal, string> = {
  ICMS: "ICMS",
  SPED_ICMS_IPI: "SPED ICMS/IPI",
  ISS: "ISS",
  PIS_COFINS: "PIS e COFINS",
  SPED_CONTRIBUICOES: "SPED Contribuições",
  IRPJ_CSLL: "IRPJ e CSLL",
  SIMPLES_DAS: "Simples Nacional / DAS",
  OUTRA: "Outra solicitação fiscal",
};
