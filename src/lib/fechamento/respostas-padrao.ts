/**
 * Respostas padrão para os alertas de julgamento contábil do fechamento.
 *
 * Módulo puro (usado no servidor e no painel): classifica cada alerta numa
 * categoria, oferece as respostas daquela categoria e monta a resposta
 * consolidada publicada no PIER. Respostas com `acompanhar` viram pendência
 * para o colaborador conferir no fechamento seguinte do mesmo cliente.
 */

export type CategoriaResposta =
  | "ADIANTAMENTO"
  | "SOCIOS_LUCROS"
  | "TRIBUTO"
  | "NATUREZA"
  | "CAIXA"
  | "INVESTIMENTO"
  | "RAZAO"
  | "GERAL";

export interface OpcaoResposta {
  chave: string;
  rotulo: string;
  texto: string;
  /** true = fica pendente para conferência no próximo fechamento. */
  acompanhar: boolean;
}

export interface AchadoParaResposta {
  id: string;
  codigo?: string | null;
  severidade: string;
  titulo: string;
  detalhe?: string | null;
  contaCodigo?: string | null;
  contaNome?: string | null;
  valor?: number | null;
  exigeHumano?: boolean;
}

export interface RespostaEscolhida {
  achadoId: string;
  chave: string;
  complemento?: string | null;
}

export const ROTULO_CATEGORIA: Record<CategoriaResposta, string> = {
  ADIANTAMENTO: "Adiantamento",
  SOCIOS_LUCROS: "Sócios / lucros",
  TRIBUTO: "Tributo",
  NATUREZA: "Natureza do saldo",
  CAIXA: "Caixa",
  INVESTIMENTO: "Investimento",
  RAZAO: "Conciliação com razão",
  GERAL: "Ponto de atenção",
};

export const RESPOSTAS_PADRAO: Record<CategoriaResposta, OpcaoResposta[]> = {
  ADIANTAMENTO: [
    {
      chave: "ADIANT_ACOMPANHAR_BAIXA",
      rotulo: "Em aberto — acompanhar baixa",
      texto:
        "Adiantamento em aberto com documentação de suporte. Baixa esperada nas próximas competências; será conferida no próximo fechamento.",
      acompanhar: true,
    },
    {
      chave: "ADIANT_SOLICITADO_CLIENTE",
      rotulo: "Documentação solicitada ao cliente",
      texto:
        "Composição/documentação do adiantamento solicitada ao cliente. Saldo mantido e acompanhado no próximo fechamento.",
      acompanhar: true,
    },
    {
      chave: "ADIANT_COMPOSICAO_CONFERIDA",
      rotulo: "Composição conferida — sem ajuste",
      texto:
        "Composição do saldo conferida e compatível com os documentos. Sem ajuste nesta competência.",
      acompanhar: false,
    },
  ],
  SOCIOS_LUCROS: [
    {
      chave: "SOCIO_ANTECIPACAO_LUCROS",
      rotulo: "Antecipação de lucros — formalizar",
      texto:
        "Valores tratados como antecipação de lucros, com lucro disponível apurado. Formalização (ata/contrato) e baixa contra distribuição serão acompanhadas no próximo fechamento.",
      acompanhar: true,
    },
    {
      chave: "SOCIO_BAIXA_ENCERRAMENTO",
      rotulo: "Baixa prevista no encerramento",
      texto:
        "Adiantamento a sócio com baixa prevista contra distribuição de lucros no encerramento do exercício. Acompanhar nos próximos fechamentos.",
      acompanhar: true,
    },
    {
      chave: "SOCIO_MUTUO",
      rotulo: "Mútuo com sócio",
      texto:
        "Valores caracterizados como mútuo com sócio. Contrato e devolução serão acompanhados no próximo fechamento.",
      acompanhar: true,
    },
    {
      chave: "SOCIO_SUPORTADO",
      rotulo: "Suportado por ata/contrato — sem ajuste",
      texto:
        "Saldo suportado por ata/contrato e lucro disponível conferidos. Sem ajuste nesta competência.",
      acompanhar: false,
    },
  ],
  TRIBUTO: [
    {
      chave: "TRIB_DIFERENCA_EXERCICIO_ANTERIOR",
      rotulo: "Diferença de exercício anterior",
      texto:
        "Saldo decorrente de diferença de exercício anterior entre a contabilidade e a apuração fiscal. Em conciliação com o setor fiscal; ajuste será acompanhado no próximo fechamento.",
      acompanhar: true,
    },
    {
      chave: "TRIB_PAGAMENTO_NAO_IDENTIFICADO",
      rotulo: "Pagamento não identificado (e-CAC)",
      texto:
        "Pagamento de tributo ainda não identificado. Aguardando consulta ao e-CAC/cliente para classificação; será acompanhado no próximo fechamento.",
      acompanhar: true,
    },
    {
      chave: "TRIB_PAGAMENTO_A_MAIOR",
      rotulo: "Pagamento a maior / compensação",
      texto:
        "Saldo decorrente de pagamento a maior ou compensação, a recuperar/compensar nas próximas apurações. Acompanhar no próximo fechamento.",
      acompanhar: true,
    },
    {
      chave: "TRIB_CONCILIADO_FISCAL",
      rotulo: "Conciliado com o fiscal — sem ajuste",
      texto:
        "Saldo conciliado com as apurações do setor fiscal. Sem ajuste nesta competência.",
      acompanhar: false,
    },
  ],
  NATUREZA: [
    {
      chave: "NAT_JUSTIFICADA",
      rotulo: "Justificada pela operação",
      texto:
        "Saldo com natureza invertida justificado pela operação (compensação/conta transitória), conferido. Sem ajuste nesta competência.",
      acompanhar: false,
    },
    {
      chave: "NAT_RECLASSIFICAR",
      rotulo: "Reclassificar na próxima competência",
      texto:
        "Saldo invertido identificado. Reclassificação/ajuste será feito na próxima competência e conferido no próximo fechamento.",
      acompanhar: true,
    },
  ],
  CAIXA: [
    {
      chave: "CAIXA_CONFIRMADO",
      rotulo: "Saldo confirmado com o cliente",
      texto: "Saldo de caixa confirmado com o cliente (numerário em espécie).",
      acompanhar: false,
    },
    {
      chave: "CAIXA_REGULARIZAR",
      rotulo: "Regularizar com o cliente",
      texto:
        "Saldo de caixa sem movimentação a ser regularizado com o cliente. Acompanhar no próximo fechamento.",
      acompanhar: true,
    },
  ],
  INVESTIMENTO: [
    {
      chave: "INV_CONFERIDO",
      rotulo: "Equivalência/baixa conferida",
      texto:
        "Saldo credor explicado por equivalência patrimonial ou baixa, conferido. Sem ajuste nesta competência.",
      acompanhar: false,
    },
    {
      chave: "INV_REGULARIZAR",
      rotulo: "Regularizar registro",
      texto:
        "Registro do investimento a regularizar. Acompanhar no próximo fechamento.",
      acompanhar: true,
    },
  ],
  RAZAO: [
    {
      chave: "RAZAO_LANCAMENTO_POSTERIOR",
      rotulo: "Lançamentos posteriores ao razão",
      texto:
        "Diferença explicada por lançamentos posteriores à emissão do razão; o balancete reflete a posição final.",
      acompanhar: false,
    },
    {
      chave: "RAZAO_REEMITIR",
      rotulo: "Reemitir razão e reconciliar",
      texto:
        "Razão será reemitido na mesma data de corte do balancete e reconciliado no próximo fechamento.",
      acompanhar: true,
    },
  ],
  GERAL: [
    {
      chave: "GERAL_CONFERIDO",
      rotulo: "Conferido — sem impacto",
      texto: "Ponto conferido manualmente, sem impacto no fechamento.",
      acompanhar: false,
    },
    {
      chave: "GERAL_ACOMPANHAR",
      rotulo: "Em aberto — acompanhar",
      texto: "Ponto em aberto; será conferido no próximo fechamento.",
      acompanhar: true,
    },
  ],
};

const TRIBUTO =
  /IMPOST|TRIBUT|\bPIS\b|COFINS|CSLL|IRPJ|IRRF|\bISS\b|\bINSS\b|ICMS|FGTS|A RECOLHER|A RECUPERAR|SIMPLES NACIONAL|\bDAS\b/;

export function categoriaDoAchado(
  achado: Pick<AchadoParaResposta, "codigo" | "contaNome" | "titulo">,
): CategoriaResposta {
  const nome = `${achado.contaNome ?? ""}`.toUpperCase();
  switch (achado.codigo) {
    case "RECONCILIACAO_RAZAO_DIVERGENTE":
    case "RAZAO_ILEGIVEL":
      return "RAZAO";
    case "CAIXA_SEM_MOVIMENTO":
      return "CAIXA";
    case "INVESTIMENTO_SALDO_CREDOR":
      return "INVESTIMENTO";
    case "ADIANTAMENTO_LUCROS":
      return "SOCIOS_LUCROS";
    case "ADIANTAMENTO_MATERIAL":
      return /S[ÓO]CIO/.test(nome) ? "SOCIOS_LUCROS" : "ADIANTAMENTO";
    case "NATUREZA_INVERTIDA":
      return TRIBUTO.test(nome) ? "TRIBUTO" : "NATUREZA";
    default:
      return TRIBUTO.test(nome) ? "TRIBUTO" : "GERAL";
  }
}

export function opcoesDoAchado(achado: AchadoParaResposta): OpcaoResposta[] {
  return RESPOSTAS_PADRAO[categoriaDoAchado(achado)];
}

export function opcaoPorChave(
  achado: AchadoParaResposta,
  chave: string,
): OpcaoResposta | null {
  return opcoesDoAchado(achado).find((o) => o.chave === chave) ?? null;
}

/** Mesmo recorte de "alerta" usado pela recomendação: exige julgamento humano. */
export function achadoExigeResposta(achado: AchadoParaResposta): boolean {
  if (achado.severidade === "BLOCKER" || achado.severidade === "ERROR") return false;
  return achado.severidade === "WARNING" || Boolean(achado.exigeHumano);
}

function brl(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function descricaoDoAchado(achado: AchadoParaResposta) {
  const conta = achado.contaNome
    ? `${achado.contaNome}${achado.contaCodigo ? ` (${achado.contaCodigo})` : ""}`
    : achado.titulo;
  const valor =
    typeof achado.valor === "number" && Number.isFinite(achado.valor)
      ? ` — ${brl(Math.abs(achado.valor))}`
      : "";
  return achado.contaNome ? `${conta}${valor}: ${achado.titulo}` : `${conta}${valor}`;
}

export interface ItemRespondido {
  achado: AchadoParaResposta;
  opcao: OpcaoResposta;
  complemento: string | null;
}

/**
 * Casa as respostas escolhidas com os alertas. Devolve os itens válidos e os
 * alertas que ainda estão sem resposta (chave ausente ou fora do catálogo).
 */
export function conferirRespostas(
  achados: AchadoParaResposta[],
  respostas: RespostaEscolhida[],
): { itens: ItemRespondido[]; semResposta: AchadoParaResposta[] } {
  const porAchado = new Map(respostas.map((r) => [r.achadoId, r]));
  const itens: ItemRespondido[] = [];
  const semResposta: AchadoParaResposta[] = [];
  for (const achado of achados.filter(achadoExigeResposta)) {
    const escolhida = porAchado.get(achado.id);
    const opcao = escolhida ? opcaoPorChave(achado, escolhida.chave) : null;
    if (!opcao) {
      semResposta.push(achado);
      continue;
    }
    const complemento = escolhida?.complemento?.trim() || null;
    itens.push({ achado, opcao, complemento });
  }
  return { itens, semResposta };
}

export interface PendenciaAnterior {
  competencia: string | null;
  contaNome: string | null;
  contaCodigo: string | null;
  valor: number | null;
  titulo: string;
  resposta: string;
}

/** Texto consolidado publicado no PIER ao aprovar com respostas padrão. */
export function montarRespostaFechamento(input: {
  clienteNome?: string | null;
  competencia?: string | null;
  itens: ItemRespondido[];
  pendenciasConferidas?: PendenciaAnterior[];
}): string {
  const competencia = input.competencia ?? "competência analisada";
  const empresa = input.clienteNome ?? "empresa";
  const linhas: string[] = [
    `Fechamento contábil ${competencia} — ${empresa}.`,
    "",
    "Revisão concluída sem impedimentos objetivos no balancete.",
  ];

  if (input.itens.length) {
    linhas.push("", "Pontos de atenção e tratamento definido:");
    input.itens.forEach(({ achado, opcao, complemento }, i) => {
      linhas.push(
        `${i + 1}. ${descricaoDoAchado(achado)}`,
        `   Tratamento: ${opcao.texto}${complemento ? ` ${complemento}` : ""}`,
      );
    });
    const acompanhar = input.itens.filter((i) => i.opcao.acompanhar).length;
    if (acompanhar)
      linhas.push(
        "",
        `${acompanhar} ponto(s) ficam em acompanhamento para conferência no próximo fechamento.`,
      );
  }

  if (input.pendenciasConferidas?.length) {
    linhas.push("", "Pendências do fechamento anterior conferidas nesta competência:");
    input.pendenciasConferidas.forEach((p, i) => {
      const conta = p.contaNome ?? p.titulo;
      const valor = typeof p.valor === "number" ? ` (${brl(Math.abs(p.valor))} em ${p.competencia ?? "competência anterior"})` : "";
      linhas.push(`${i + 1}. ${conta}${valor} — ${p.resposta}`);
    });
  }

  return linhas.join("\n");
}
