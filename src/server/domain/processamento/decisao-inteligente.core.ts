export type TipoDecisaoInteligente =
  | "APROVAR_FINALIZAR"
  | "APROVAR_COM_JUSTIFICATIVA"
  | "SOLICITAR_CORRECAO"
  | "REVISAO_HUMANA";

export type ConfiancaDecisao = "ALTA" | "MEDIA" | "BAIXA";

export interface AchadoDecisao {
  severidade: string;
  titulo: string;
  detalhe?: string | null;
  contaCodigo?: string | null;
  contaNome?: string | null;
  exigeHumano?: boolean;
}

export interface RecomendacaoDecisao {
  tipo: TipoDecisaoInteligente;
  titulo: string;
  confianca: ConfiancaDecisao;
  motivos: string[];
  respostaSugerida: string;
  podeFinalizar: boolean;
  exigeJustificativa: boolean;
  totalImpedimentos: number;
  totalAlertas: number;
}

function resumoAchado(achado: AchadoDecisao) {
  const conta = achado.contaCodigo
    ? `Conta ${achado.contaCodigo}${achado.contaNome ? ` — ${achado.contaNome}` : ""}: `
    : "";
  const detalhe = achado.detalhe?.trim();
  return `${conta}${achado.titulo}${detalhe ? ` — ${detalhe}` : ""}`;
}

function listaTecnica(achados: AchadoDecisao[]) {
  return achados
    .slice(0, 5)
    .map((achado, indice) => `${indice + 1}. ${resumoAchado(achado)}`)
    .join("\n");
}

/**
 * Converte o resultado técnico do balancete em uma recomendação operacional.
 * A recomendação nunca executa uma ação no PIER sozinha.
 */
export function montarRecomendacaoDecisao(input: {
  clienteNome?: string | null;
  competencia?: string | null;
  resultado?: string | null;
  resumo?: string | null;
  achados?: AchadoDecisao[];
  analiseDisponivel?: boolean;
}): RecomendacaoDecisao {
  const achados = input.achados ?? [];
  const relevantes = achados.filter(
    (achado) =>
      achado.severidade === "BLOCKER" ||
      achado.severidade === "ERROR" ||
      achado.severidade === "WARNING" ||
      achado.exigeHumano,
  );
  const impeditivos = relevantes.filter(
    (achado) =>
      achado.severidade === "BLOCKER" || achado.severidade === "ERROR",
  );
  const alertas = relevantes.filter(
    (achado) =>
      achado.severidade === "WARNING" ||
      (achado.exigeHumano &&
        achado.severidade !== "BLOCKER" &&
        achado.severidade !== "ERROR"),
  );
  const competencia = input.competencia ?? "competência analisada";
  const empresa = input.clienteNome ?? "empresa";

  if (!input.analiseDisponivel) {
    return {
      tipo: "REVISAO_HUMANA",
      titulo: "Revisão humana necessária",
      confianca: "BAIXA",
      motivos: [
        "Ainda não existe análise técnica concluída para sustentar uma decisão de fechamento.",
        "O vencimento da solicitação, isoladamente, não autoriza resposta ou finalização.",
      ],
      respostaSugerida:
        "A solicitação foi recebida e permanece em análise. Antes de uma devolutiva conclusiva, é necessário validar a documentação e o contexto técnico da competência.",
      podeFinalizar: false,
      exigeJustificativa: false,
      totalImpedimentos: 0,
      totalAlertas: 0,
    };
  }

  if (impeditivos.length) {
    const pontos = listaTecnica(impeditivos);
    return {
      tipo: "SOLICITAR_CORRECAO",
      titulo: "Correção necessária antes da conclusão",
      confianca: "ALTA",
      motivos: [
        `${impeditivos.length} impedimento(s) objetivo(s) identificado(s) na análise.`,
        "A solicitação deve permanecer aberta até a correção ou apresentação de evidência suficiente.",
      ],
      respostaSugerida: `Durante a revisão do fechamento contábil de ${competencia} da ${empresa}, identificamos ponto(s) que precisam ser regularizados antes da conclusão:\n\n${pontos}\n\nFavor revisar os itens acima e, quando aplicável, anexar a composição ou documentação de suporte. Após a regularização, o fechamento poderá ser reprocessado para nova validação.`,
      podeFinalizar: false,
      exigeJustificativa: false,
      totalImpedimentos: impeditivos.length,
      totalAlertas: alertas.length,
    };
  }

  if (
    alertas.length ||
    input.resultado === "COM_ALERTAS" ||
    input.resultado === "REVISAO_HUMANA"
  ) {
    const pontos = listaTecnica(alertas.length ? alertas : relevantes);
    const complemento = pontos
      ? `\n\nPontos que exigem julgamento contábil:\n${pontos}`
      : "";
    return {
      tipo: "APROVAR_COM_JUSTIFICATIVA",
      titulo: "Pode ser aprovado com justificativa humana",
      confianca: "MEDIA",
      motivos: [
        `${Math.max(alertas.length, 1)} ponto(s) de atenção sem impedimento objetivo de finalização.`,
        "A decisão depende de julgamento profissional e a justificativa deve ficar registrada antes da finalização.",
      ],
      respostaSugerida: `Realizamos a revisão do fechamento contábil de ${competencia} da ${empresa}. Não foram identificados impedimentos objetivos, porém existem pontos de atenção que exigem validação profissional.${complemento}\n\nCaso os pontos estejam devidamente suportados, o fechamento poderá ser concluído mediante justificativa registrada.`,
      podeFinalizar: true,
      exigeJustificativa: true,
      totalImpedimentos: 0,
      totalAlertas: Math.max(alertas.length, 1),
    };
  }

  if (input.resultado === "APROVADO") {
    return {
      tipo: "APROVAR_FINALIZAR",
      titulo: "Fechamento apto para conclusão",
      confianca: "ALTA",
      motivos: [
        "A análise técnica foi concluída sem impedimentos objetivos.",
        "Não existem alertas que exijam justificativa adicional para a conclusão.",
      ],
      respostaSugerida: `Analisamos o fechamento contábil de ${competencia} da ${empresa} e não foram identificadas inconsistências contábeis impeditivas nos documentos avaliados. O fechamento está apto para conclusão.`,
      podeFinalizar: true,
      exigeJustificativa: false,
      totalImpedimentos: 0,
      totalAlertas: 0,
    };
  }

  return {
    tipo: "REVISAO_HUMANA",
    titulo: "Conclusão técnica ainda indefinida",
    confianca: "BAIXA",
    motivos: [
      input.resumo?.trim() ||
        "A análise não produziu uma conclusão objetiva suficiente para executar uma ação no PIER.",
    ],
    respostaSugerida:
      "A análise foi realizada, mas a conclusão ainda exige revisão humana antes de qualquer resposta ou finalização no PIER.",
    podeFinalizar: false,
    exigeJustificativa: false,
    totalImpedimentos: 0,
    totalAlertas: 0,
  };
}
