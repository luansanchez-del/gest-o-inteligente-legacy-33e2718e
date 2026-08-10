import type { ClosingPeriod, Company, ExternalRequest } from "./api-client";

export const TODAY = new Date("2026-08-10T12:00:00.000Z");

export type Situacao =
  | "CONCLUIDA_NO_PRAZO"
  | "CONCLUIDA_FORA_PRAZO"
  | "EM_ANDAMENTO_NO_PRAZO"
  | "ATRASADA"
  | "AGUARDANDO_CLIENTE"
  | "SEM_EVIDENCIA"
  | "PRECISA_REVISAO";

export const SITUACAO_LABEL: Record<Situacao, string> = {
  CONCLUIDA_NO_PRAZO: "Concluída no prazo",
  CONCLUIDA_FORA_PRAZO: "Concluída fora do prazo",
  EM_ANDAMENTO_NO_PRAZO: "Em andamento dentro do prazo",
  ATRASADA: "Atrasada",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  SEM_EVIDENCIA: "Sem evidência suficiente",
  PRECISA_REVISAO: "Precisa de revisão humana",
};

export const SEM_RESPONSAVEL = "Sem responsável";

export function classify(period: ClosingPeriod): Situacao {
  if (period.completedAt) {
    return new Date(period.completedAt) <= new Date(period.deadlineAt)
      ? "CONCLUIDA_NO_PRAZO"
      : "CONCLUIDA_FORA_PRAZO";
  }
  if (period.evidence.length === 0 || period.confidence < 0.35) return "SEM_EVIDENCIA";
  if (period.status === "NEEDS_REPROCESSING" || period.status === "HAS_ISSUES")
    return "PRECISA_REVISAO";
  if (period.status === "AWAITING" || period.status === "RETURNED") return "AGUARDANDO_CLIENTE";
  if (new Date(period.deadlineAt) < TODAY) return "ATRASADA";
  return "EM_ANDAMENTO_NO_PRAZO";
}

export function responsavelDe(period: ClosingPeriod): string {
  return period.externalResponsibleName ?? SEM_RESPONSAVEL;
}

export function tipoLabel(type: ClosingPeriod["type"]) {
  return type === "ACCOUNTING" ? "Fechamento contábil" : "Fechamento fiscal";
}

export function formatCompetencia(month: string) {
  const parts = month.split("-");
  const nomes = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  const idx = Number(parts[1]) - 1;
  return `${nomes[idx] ?? ""}/${parts[0]}`;
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

export interface Indicadores {
  previstos: number;
  entregues: number;
  indice: number;
  entreguesNoPrazo: number;
  entreguesForaPrazo: number;
  emAndamento: number;
  atrasados: number;
  aguardandoCliente: number;
  semEvidencia: number;
  precisaRevisao: number;
  semResponsavel: number;
  prazoMedioEntrega: number;
  atrasoMedio: number;
}

export function calcularIndicadores(periods: ClosingPeriod[]): Indicadores {
  const situacoes = periods.map(classify);
  const count = (s: Situacao) => situacoes.filter((x) => x === s).length;

  const entreguesNoPrazo = count("CONCLUIDA_NO_PRAZO");
  const entreguesForaPrazo = count("CONCLUIDA_FORA_PRAZO");
  const entregues = entreguesNoPrazo + entreguesForaPrazo;
  const previstos = periods.length;

  const concluidos = periods.filter((p) => p.completedAt);
  const prazos = concluidos.map((p) => daysBetween(p.completedAt!, p.deadlineAt));
  const atrasos = prazos.filter((d) => d > 0);

  return {
    previstos,
    entregues,
    indice: previstos === 0 ? 0 : entregues / previstos,
    entreguesNoPrazo,
    entreguesForaPrazo,
    emAndamento: count("EM_ANDAMENTO_NO_PRAZO"),
    atrasados: count("ATRASADA"),
    aguardandoCliente: count("AGUARDANDO_CLIENTE"),
    semEvidencia: count("SEM_EVIDENCIA"),
    precisaRevisao: count("PRECISA_REVISAO"),
    semResponsavel: periods.filter((p) => !p.externalResponsibleName).length,
    prazoMedioEntrega:
      prazos.length === 0 ? 0 : prazos.reduce((a, b) => a + b, 0) / prazos.length,
    atrasoMedio: atrasos.length === 0 ? 0 : atrasos.reduce((a, b) => a + b, 0) / atrasos.length,
  };
}

export function evolucaoMensal(periods: ClosingPeriod[]) {
  const meses = Array.from(new Set(periods.map((p) => p.referenceMonth))).sort();
  return meses.map((mes) => {
    const doMes = periods.filter((p) => p.referenceMonth === mes);
    const ind = calcularIndicadores(doMes);
    return {
      mes: formatCompetencia(mes),
      indice: Math.round(ind.indice * 100),
      entregues: ind.entregues,
      previstos: ind.previstos,
    };
  });
}

export function companyMap(companies: Company[]) {
  return new Map(companies.map((c) => [c.id, c]));
}

export function requestsOf(requests: ExternalRequest[], periodId: string) {
  return requests.filter((r) => r.closingPeriodId === periodId);
}
