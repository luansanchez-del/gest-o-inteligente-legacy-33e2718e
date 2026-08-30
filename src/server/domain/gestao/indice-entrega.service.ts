import type { AppContext } from "../../lib/context";
import { montarPreview, type EscopoFiltro } from "./gestao.service";

/**
 * Índice de entrega baseado nos dados reais do PIER (mesma origem que a
 * Gestão Contábil usa: a tabela `request`, alimentada pela Carga histórica).
 * Substitui o painel antigo, que lia de `closing_period` — tabela que não
 * recebe mais dados do fluxo real, só escrita manualmente.
 */
export interface IndicadorEntrega {
  codigo: string;
  titulo: string;
  numerador: number;
  denominador: number;
  regra: string;
  formato: "CONTAGEM" | "PERCENTUAL" | "DIAS";
  valor: number;
}

export interface PainelIndiceEntrega {
  competencia: string;
  indicadores: IndicadorEntrega[];
}

function indicador(
  codigo: string,
  titulo: string,
  numerador: number,
  denominador: number,
  regra: string,
  formato: IndicadorEntrega["formato"] = "CONTAGEM",
): IndicadorEntrega {
  const valor =
    formato === "PERCENTUAL"
      ? denominador > 0
        ? (numerador / denominador) * 100
        : 0
      : numerador;
  return { codigo, titulo, numerador, denominador, regra, formato, valor };
}

function diasAtePrazo(prazo: string | null): number | null {
  if (!prazo) return null;
  const alvo = new Date(prazo);
  if (Number.isNaN(alvo.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

function diasEntrePrazoEEntrega(prazo: string | null, finalizadaEm: string | null): number | null {
  if (!prazo || !finalizadaEm) return null;
  const alvo = new Date(prazo).getTime();
  const entrega = new Date(finalizadaEm).getTime();
  if (Number.isNaN(alvo) || Number.isNaN(entrega)) return null;
  return (entrega - alvo) / 86_400_000;
}

/**
 * Apura o índice de entrega para o escopo filtrado (competência, departamento,
 * responsável...). Reaproveita montarPreview: a mesma lista de empresas que a
 * tela de Gestão mostra é a base do índice — os dois nunca divergem.
 */
export async function apurarIndiceEntrega(
  ctx: AppContext,
  filtro: EscopoFiltro,
): Promise<PainelIndiceEntrega> {
  const preview = await montarPreview(ctx, filtro);
  const empresas = preview.empresas;

  const total = empresas.length;
  const entregues = empresas.filter((e) => e.statusFila === "HISTORICO");
  const atrasos = entregues
    .map((e) => diasEntrePrazoEEntrega(e.prazo, e.finalizadaEm))
    .filter((v): v is number => v !== null);
  const noPrazo = atrasos.filter((v) => v <= 0).length;
  const foraPrazo = atrasos.length - noPrazo;
  const backlog = total - entregues.length;

  const emAberto = empresas.filter((e) => e.statusFila !== "HISTORICO");
  const atrasadas = emAberto.filter((e) => {
    const dias = diasAtePrazo(e.prazo);
    return dias !== null && dias < 0;
  }).length;
  const venceHoje = emAberto.filter((e) => diasAtePrazo(e.prazo) === 0).length;
  const proximosTresDias = emAberto.filter((e) => {
    const dias = diasAtePrazo(e.prazo);
    return dias !== null && dias >= 1 && dias <= 3;
  }).length;
  const semResponsavel = empresas.filter((e) => !e.responsavelId).length;
  const precisamRevisao = empresas.filter((e) => e.statusFila === "REVISAO_NECESSARIA").length;
  const bloqueadas = empresas.filter(
    (e) => e.statusFila === "BLOQUEADA" || e.statusFila === "ERRO",
  ).length;

  const indicadores: IndicadorEntrega[] = [
    indicador("PREVISTO", "Previsto para entrega", total, total, "Solicitações existentes no escopo selecionado."),
    indicador(
      "ENTREGUE",
      "Entregue",
      entregues.length,
      total,
      "Solicitações finalizadas no PIER dentro do escopo.",
    ),
    indicador(
      "INDICE",
      "Cobertura de entrega",
      entregues.length,
      total,
      "Entregues ÷ previstas no escopo selecionado.",
      "PERCENTUAL",
    ),
    indicador(
      "INDICE_PRAZO",
      "Índice de entrega no prazo",
      noPrazo,
      atrasos.length,
      "Entregues até o prazo ÷ entregues com prazo e data de finalização conhecidos.",
      "PERCENTUAL",
    ),
    indicador("NO_PRAZO", "Entregues no prazo", noPrazo, atrasos.length, "Finalizadas até a data limite."),
    indicador(
      "FORA_PRAZO",
      "Entregues fora do prazo",
      foraPrazo,
      atrasos.length,
      "Finalizadas após a data limite.",
    ),
    indicador("BACKLOG", "Backlog em aberto", backlog, total, "Previstas que ainda não foram finalizadas."),
    indicador("ATRASADA", "Vencidas", atrasadas, total, "Em aberto com prazo já vencido."),
    indicador("VENCE_HOJE", "Vencem hoje", venceHoje, total, "Em aberto com prazo no dia atual."),
    indicador(
      "PROXIMOS_3_DIAS",
      "Vencem nos próximos 3 dias",
      proximosTresDias,
      total,
      "Em aberto com prazo entre amanhã e os próximos três dias.",
    ),
    indicador(
      "BLOQUEADA",
      "Bloqueadas / com falha",
      bloqueadas,
      total,
      "Reprovadas na análise ou com falha técnica no processamento.",
    ),
    indicador(
      "REVISAO",
      "Exigem revisão humana",
      precisamRevisao,
      total,
      "Análise concluída com alerta ou resultado que exige revisão humana.",
    ),
    indicador(
      "SEM_RESPONSAVEL",
      "Sem responsável definido",
      semResponsavel,
      total,
      "Solicitações sem responsável continuam visíveis e contam no escopo.",
    ),
    indicador(
      "ATRASO_MEDIO",
      "Atraso médio na entrega (dias)",
      atrasos.length
        ? Math.round((atrasos.reduce((soma, v) => soma + v, 0) / atrasos.length) * 10) / 10
        : 0,
      atrasos.length,
      "Média de dias entre o prazo e a finalização (negativo = antecipado).",
      "DIAS",
    ),
  ];

  return { competencia: filtro.competencia, indicadores };
}
