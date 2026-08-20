export type GrupoFiscal =
  | "ICMS"
  | "SPED_ICMS_IPI"
  | "ISS"
  | "PIS_COFINS"
  | "SPED_CONTRIBUICOES"
  | "IRPJ_CSLL"
  | "SIMPLES_NACIONAL"
  | "NAO_MAPEADO";

export type SeveridadeFiscal = "INFO" | "ALERTA" | "IMPEDIMENTO";

export interface EvidenciaFiscal {
  nome: string;
  categoria?: string | null;
}

export interface AchadoFiscal {
  severidade: SeveridadeFiscal;
  codigo: string;
  titulo: string;
  detalhe: string;
}

export interface ResultadoManualFiscal {
  grupo: GrupoFiscal;
  grupoRotulo: string;
  situacao: "APROVADA" | "COM_RESSALVAS" | "BLOQUEADA" | "NAO_MAPEADA";
  regime: string | null;
  evidenciasEncontradas: string[];
  achados: AchadoFiscal[];
  totalImpedimentos: number;
  totalAlertas: number;
  respostaSugerida: string;
}

function normalizar(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contem(texto: string, ...termos: string[]) {
  return termos.some((termo) => texto.includes(normalizar(termo)));
}

export function classificarGrupoFiscal(input: {
  tipoNome?: string | null;
  descricao?: string | null;
  regime?: string | null;
}): GrupoFiscal {
  const texto = normalizar(`${input.tipoNome ?? ""} ${input.descricao ?? ""}`);
  const regime = normalizar(input.regime);

  if (
    contem(texto, "das", "pgdas", "simples nacional") ||
    regime.includes("simples")
  )
    return "SIMPLES_NACIONAL";
  if (contem(texto, "irpj", "csll")) return "IRPJ_CSLL";
  if (
    contem(texto, "sped contribuicoes", "sped contribuicao", "efd contribuicoes")
  )
    return "SPED_CONTRIBUICOES";
  if (contem(texto, "pis", "cofins")) return "PIS_COFINS";
  if (contem(texto, "iss", "dam", "nfs e", "nfse")) return "ISS";
  if (
    contem(texto, "sped fiscal", "sped icms", "efd icms", "icms ipi")
  )
    return "SPED_ICMS_IPI";
  if (contem(texto, "icms")) return "ICMS";
  return "NAO_MAPEADO";
}

function rotulo(grupo: GrupoFiscal) {
  const mapa: Record<GrupoFiscal, string> = {
    ICMS: "ICMS",
    SPED_ICMS_IPI: "SPED ICMS/IPI",
    ISS: "ISS",
    PIS_COFINS: "PIS e COFINS",
    SPED_CONTRIBUICOES: "SPED Contribuições",
    IRPJ_CSLL: "IRPJ e CSLL",
    SIMPLES_NACIONAL: "Simples Nacional",
    NAO_MAPEADO: "Assunto fiscal não mapeado",
  };
  return mapa[grupo];
}

function alvo(evidencias: EvidenciaFiscal[], textoPostagens: string) {
  return normalizar(
    `${evidencias.map((e) => `${e.nome} ${e.categoria ?? ""}`).join(" ")} ${textoPostagens}`,
  );
}

function evidencia(
  texto: string,
  aliases: string[],
  nome: string,
  obrigatoria = true,
): AchadoFiscal | null {
  if (aliases.some((alias) => texto.includes(normalizar(alias)))) return null;
  return {
    severidade: obrigatoria ? "IMPEDIMENTO" : "ALERTA",
    codigo: `DOC_${normalizar(nome).replace(/\s+/g, "_").toUpperCase()}`,
    titulo: `${nome} não localizado`,
    detalhe: obrigatoria
      ? `O procedimento fiscal exige ${nome} para esta etapa.`
      : `${nome} não foi localizado. O procedimento o exige quando aplicável; confirmar se há recolhimento no período.`,
  };
}

function semMovimento(texto: string) {
  return /\bsem\s+moviment(?:o|acao)\b/.test(texto) ||
    /\bnao\s+houve\s+moviment(?:o|acao)\b/.test(texto);
}

export function validarManualFiscal(input: {
  tipoNome?: string | null;
  descricao?: string | null;
  regime?: string | null;
  competencia?: string | null;
  evidencias: EvidenciaFiscal[];
  textoPostagens?: string;
}): ResultadoManualFiscal {
  const grupo = classificarGrupoFiscal(input);
  const texto = alvo(input.evidencias, input.textoPostagens ?? "");
  const achados: AchadoFiscal[] = [];
  const add = (item: AchadoFiscal | null) => {
    if (item) achados.push(item);
  };

  if (grupo === "ICMS") {
    add(evidencia(texto, ["notas fiscais de entrada", "notas de entrada", "relatorio entrada"], "Relatório de Notas Fiscais de Entrada"));
    add(evidencia(texto, ["notas fiscais de saida", "notas de saida", "relatorio saida"], "Relatório de Notas Fiscais de Saída"));
    add(evidencia(texto, ["nf faltantes", "notas faltantes", "documentos faltantes"], "Relatório do Questor de NF faltantes"));
    add(evidencia(texto, ["nf canceladas", "notas canceladas", "canceladas"], "Relatório do Questor de NF Canceladas"));
    add(evidencia(texto, ["guia icms", "gare", "gnre", "icms a recolher"], "Guia ICMS"));
  } else if (grupo === "SPED_ICMS_IPI") {
    add(evidencia(texto, ["recibo sped icms", "recibo efd icms", "recibo sped fiscal", "recibo de entrega"], "Recibo de entrega do SPED ICMS"));
  } else if (grupo === "ISS") {
    if (!semMovimento(texto))
      add(evidencia(texto, ["relatorio de iss", "relatorio iss", "prefeitura", "livro iss"], "Relatório de ISS da Prefeitura"));
    add(evidencia(texto, ["nfs e faltantes", "nfse faltantes", "nfs faltantes"], "Relatório do Questor de NFS-e faltantes"));
    add(evidencia(texto, ["guia dam", "dam"], "Guia DAM"));
  } else if (grupo === "PIS_COFINS") {
    add(evidencia(texto, ["memoria de calculo", "relatorio de apuracao", "apuracao pis", "apuracao cofins"], "Memória de cálculo ou relatório de apuração do Questor"));
    add(evidencia(texto, ["guia de recolhimento", "darf", "guia pis", "guia cofins"], "Guia de recolhimento de PIS/COFINS", false));
  } else if (grupo === "SPED_CONTRIBUICOES") {
    add(evidencia(texto, ["recibo sped contribuicoes", "recibo sped contribuicao", "recibo efd contribuicoes", "recibo de entrega"], "Recibo de entrega do SPED Contribuições"));
  } else if (grupo === "IRPJ_CSLL") {
    add(evidencia(texto, ["memoria de calculo", "memoria calculo", "apuracao irpj", "apuracao csll"], "Memória de cálculo da apuração do Questor"));
    add(evidencia(texto, ["planilha de conferencia", "planilha conferencia"], "Planilha de Conferência"));
    add(evidencia(texto, ["darf", "guia de recolhimento"], "Guia de recolhimento (DARF)"));
    add(evidencia(texto, ["nf canceladas", "notas canceladas", "canceladas"], "Relatório do Questor de NF Canceladas"));
  } else if (grupo === "SIMPLES_NACIONAL") {
    add(evidencia(texto, ["notas fiscais de entrada", "notas de entrada", "relatorio entrada"], "Relatório de Notas Fiscais de Entrada"));
    add(evidencia(texto, ["notas fiscais de saida", "notas de saida", "servicos", "relatorio saida"], "Relatório de Notas Fiscais de Saída ou Serviços"));
    add(evidencia(texto, ["nf faltantes", "notas faltantes", "documentos faltantes"], "Relatório do Questor de NF faltantes"));
    add(evidencia(texto, ["pgdas", "declaracao pgdas"], "Relatório da Declaração PGDAS-D"));
    add(evidencia(texto, ["guia das", "das simples", "documento de arrecadacao do simples"], "Guia DAS"));
  } else {
    achados.push({
      severidade: "ALERTA",
      codigo: "ASSUNTO_FISCAL_NAO_MAPEADO",
      titulo: "Assunto fiscal ainda não mapeado no manual",
      detalhe: "A solicitação pertence ao departamento fiscal, mas o assunto não foi reconhecido entre ICMS, SPED ICMS/IPI, ISS, PIS/COFINS, SPED Contribuições, IRPJ/CSLL e Simples Nacional. Revisão humana obrigatória.",
    });
  }

  if (!input.evidencias.length) {
    achados.unshift({
      severidade: "IMPEDIMENTO",
      codigo: "SEM_ANEXOS",
      titulo: "Nenhum documento anexado",
      detalhe: "O procedimento determina a disponibilização dos relatórios e documentos de suporte no PIER antes da conclusão do fechamento fiscal.",
    });
  }

  const totalImpedimentos = achados.filter((a) => a.severidade === "IMPEDIMENTO").length;
  const totalAlertas = achados.filter((a) => a.severidade === "ALERTA").length;
  const situacao =
    grupo === "NAO_MAPEADO"
      ? "NAO_MAPEADA"
      : totalImpedimentos
        ? "BLOQUEADA"
        : totalAlertas
          ? "COM_RESSALVAS"
          : "APROVADA";

  const presentes = input.evidencias.map((e) => e.nome).filter(Boolean);
  const faltas = achados.map((a) => `• ${a.titulo}: ${a.detalhe}`);
  const respostaSugerida = [
    `Conferência do fechamento fiscal — ${rotulo(grupo)}.`,
    `Competência: ${input.competencia ?? "não identificada"}.`,
    `Regime: ${input.regime ?? "não identificado"}.`,
    `Documentos localizados no PIER: ${presentes.length}.`,
    faltas.length ? "Pontos para revisão:" : "Checklist documental do procedimento atendido.",
    ...faltas,
    situacao === "APROVADA"
      ? "Resultado: documentação prevista no procedimento localizada; apta para decisão de conclusão."
      : "Resultado: manter a solicitação aberta até a revisão/regularização dos pontos acima.",
  ].join("\n");

  return {
    grupo,
    grupoRotulo: rotulo(grupo),
    situacao,
    regime: input.regime ?? null,
    evidenciasEncontradas: presentes,
    achados,
    totalImpedimentos,
    totalAlertas,
    respostaSugerida,
  };
}
