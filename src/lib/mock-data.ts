// Dados fictícios que espelham o domínio real.
// Nenhum componente deve importar este arquivo diretamente — use src/lib/api-client.ts.

export type ClosingType = "ACCOUNTING" | "TAX";

export type ClosingStatus =
  | "AWAITING"
  | "RECEIVED"
  | "IN_ANALYSIS"
  | "APPROVED"
  | "HAS_ALERTS"
  | "HAS_ISSUES"
  | "RETURNED"
  | "NEEDS_REPROCESSING";

export type RequestPurpose =
  | "ACCOUNTING_CLOSING"
  | "TAX_CLOSING"
  | "OTHER"
  | "UNMAPPED";

export type Severity = "INFO" | "WARNING" | "CRITICAL";

export interface Company {
  id: string;
  name: string;
  document: string;
  active: boolean;
  linkedToPier: boolean;
  segment: "BPO" | "CONTABIL";
  internalOwnerName: string | null;
}

export interface ClosingPeriod {
  id: string;
  companyId: string;
  referenceMonth: string; // "2026-07"
  type: ClosingType;
  status: ClosingStatus;
  externalResponsibleName: string | null;
  deadlineAt: string;
  lastAnalysisAt: string | null;
  completedAt: string | null;
  evidence: {
    kind: "POSTAGEM" | "ARQUIVO" | "STATUS" | "DATA";
    description: string;
    occurredAt: string;
  }[];
  confidence: number; // 0..1
}

export interface ExternalRequest {
  id: string;
  closingPeriodId: string;
  number: string;
  description: string;
  typeName: string;
  purpose: RequestPurpose;
  status: string;
  responsibleName: string | null;
  requestedAt: string;
  finishedAt: string | null;
  deadlineAt: string;
  hasAttachment: boolean;
}

export interface Pendency {
  id: string;
  closingPeriodId: string;
  category: string;
  ruleCode: string;
  severity: Severity;
  foundValue: string;
  expectedValue: string;
  difference: string;
  guidance: string;
  status: "OPEN" | "RESOLVED" | "IGNORED";
}

export interface BatchExecution {
  id: string;
  competencia: string;
  scope: string;
  status: "EM_ANDAMENTO" | "CONCLUIDA" | "CONCLUIDA_COM_ALERTAS";
  totalCompanies: number;
  completedCompanies: number;
  warningCompanies: number;
  errorCompanies: number;
  skippedCompanies: number;
}

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07"];

const RESPONSIBLES = [
  "Ana Beatriz Moraes",
  "Carlos Eduardo Lima",
  "Fernanda Rocha",
  "João Pedro Alves",
  "Marina Castro",
  null,
];

const INTERNAL_OWNERS = [
  "Equipe Contábil A",
  "Equipe Contábil B",
  "Equipe Fiscal",
  "Time BPO",
  null,
];

const REQUEST_TYPES = [
  "Extratos bancários",
  "Notas fiscais de entrada",
  "Notas fiscais de saída",
  "Folha de pagamento",
  "Conciliação de cartões",
  "Documentos diversos",
];

const COMPANY_NAMES = [
  "Aurora Comércio de Alimentos",
  "Brasilis Logística",
  "Cedro Engenharia",
  "Delta Serviços Médicos",
  "Estrela Confecções",
  "Ferreira & Filhos Distribuidora",
  "Grafite Estúdio Criativo",
  "Horizonte Tecnologia",
  "Ipê Materiais de Construção",
  "Jacarandá Consultoria",
  "Kaizen Indústria Metalúrgica",
  "Lumiar Educação",
  "Monte Verde Agropecuária",
  "Nova Rota Transportes",
  "Orion Farmacêutica",
  "Pampa Bebidas",
  "Quartzo Mineração",
  "Recanto Hotelaria",
];

// Gerador determinístico simples
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function pad(n: number, size = 2) {
  return String(n).padStart(size, "0");
}

function formatDoc(i: number) {
  return `${pad(10 + i)}.${pad(100 + i, 3)}.${pad(200 + i, 3)}/0001-${pad(30 + i)}`;
}

const rand = seeded(20260810);

export const companies: Company[] = COMPANY_NAMES.map((name, i) => ({
  id: `emp-${pad(i + 1)}`,
  name,
  document: formatDoc(i),
  active: i !== 16,
  linkedToPier: ![2, 7, 12, 16].includes(i),
  segment: i % 3 === 0 ? "BPO" : "CONTABIL",
  internalOwnerName: INTERNAL_OWNERS[i % INTERNAL_OWNERS.length] ?? null,
}));

const STATUS_POOL: ClosingStatus[] = [
  "APPROVED",
  "APPROVED",
  "APPROVED",
  "IN_ANALYSIS",
  "RECEIVED",
  "AWAITING",
  "HAS_ALERTS",
  "HAS_ISSUES",
  "RETURNED",
  "NEEDS_REPROCESSING",
];

function monthDeadline(month: string, day: number) {
  return `${month}-${pad(day)}T18:00:00.000Z`;
}

function nextMonthDate(month: string, day: number) {
  const parts = month.split("-").map(Number);
  const y = parts[0] as number;
  const m = parts[1] as number;
  const d = new Date(Date.UTC(y, m - 1 + 1, day, 15, 0, 0));
  return d.toISOString();
}

export const closingPeriods: ClosingPeriod[] = [];
export const externalRequests: ExternalRequest[] = [];
export const pendencies: Pendency[] = [];

let seqRequest = 1000;
let seqPendency = 1;

companies.forEach((company, ci) => {
  MONTHS.forEach((month, mi) => {
    (["ACCOUNTING", "TAX"] as ClosingType[]).forEach((type, ti) => {
      const pick = Math.floor(rand() * STATUS_POOL.length);
      let status = STATUS_POOL[(pick + ci + mi + ti) % STATUS_POOL.length] as ClosingStatus;
      if (!company.linkedToPier) status = "AWAITING";

      const responsible = company.linkedToPier
        ? RESPONSIBLES[(ci + mi + ti) % RESPONSIBLES.length] ?? null
        : null;

      const deadline = monthDeadline(month, type === "TAX" ? 20 : 25);
      const late = (ci + mi + ti) % 4 === 0;
      const completed =
        status === "APPROVED"
          ? late
            ? nextMonthDate(month, 8)
            : monthDeadline(month, type === "TAX" ? 18 : 22)
          : null;

      const id = `fech-${company.id}-${month}-${type}`;
      closingPeriods.push({
        id,
        companyId: company.id,
        referenceMonth: month,
        type,
        status,
        externalResponsibleName: responsible,
        deadlineAt: deadline,
        lastAnalysisAt: company.linkedToPier ? nextMonthDate(month, 2) : null,
        completedAt: completed,
        evidence: company.linkedToPier
          ? [
              {
                kind: "POSTAGEM",
                description: `Postagem no PIER confirmando envio dos documentos da competência ${month}.`,
                occurredAt: monthDeadline(month, 12),
              },
              {
                kind: "ARQUIVO",
                description: `Arquivo "balancete-${month}.pdf" anexado pelo cliente.`,
                occurredAt: monthDeadline(month, 14),
              },
              {
                kind: "STATUS",
                description: `Situação registrada no PIER: ${status}.`,
                occurredAt: monthDeadline(month, 15),
              },
            ]
          : [],
        confidence: company.linkedToPier ? 0.55 + rand() * 0.44 : 0.2,
      });

      const qty = 2 + ((ci + mi) % 3);
      for (let r = 0; r < qty; r++) {
        seqRequest += 1;
        const typeName = REQUEST_TYPES[(ci + r + mi) % REQUEST_TYPES.length] as string;
        const finished = status === "APPROVED" || (r === 0 && status !== "AWAITING");
        externalRequests.push({
          id: `sol-${seqRequest}`,
          closingPeriodId: id,
          number: `#${seqRequest}`,
          description: `${typeName} — competência ${month}`,
          typeName,
          purpose:
            type === "TAX"
              ? "TAX_CLOSING"
              : r === 2
                ? "UNMAPPED"
                : r === 1
                  ? "OTHER"
                  : "ACCOUNTING_CLOSING",
          status: finished ? "Concluída" : status === "AWAITING" ? "Aguardando cliente" : "Em análise",
          responsibleName: responsible ?? null,
          requestedAt: monthDeadline(month, 5),
          finishedAt: finished ? monthDeadline(month, late ? 28 : 16) : null,
          deadlineAt: deadline,
          hasAttachment: finished || r % 2 === 0,
        });
      }

      if (status === "HAS_ALERTS" || status === "HAS_ISSUES" || status === "RETURNED") {
        seqPendency += 1;
        pendencies.push({
          id: `pend-${seqPendency}`,
          closingPeriodId: id,
          category: status === "HAS_ISSUES" ? "Conciliação bancária" : "Documentação",
          ruleCode: status === "HAS_ISSUES" ? "CONC-014" : "DOC-003",
          severity: status === "HAS_ISSUES" ? "CRITICAL" : status === "RETURNED" ? "WARNING" : "INFO",
          foundValue: status === "HAS_ISSUES" ? "R$ 128.430,10" : "3 documentos",
          expectedValue: status === "HAS_ISSUES" ? "R$ 131.900,00" : "5 documentos",
          difference: status === "HAS_ISSUES" ? "R$ 3.469,90" : "2 documentos",
          guidance:
            status === "HAS_ISSUES"
              ? "Solicitar ao cliente o extrato completo do período para conciliar a diferença."
              : "Reforçar a solicitação dos documentos faltantes junto ao responsável.",
          status: "OPEN",
        });
      }
    });
  });
});

export const batchExecutions: BatchExecution[] = MONTHS.map((month, i) => ({
  id: `lote-${month}`,
  competencia: month,
  scope: i === 0 ? "Carteira geral" : i === 1 ? "Clientes BPO" : "Carteira geral",
  status: i === MONTHS.length - 1 ? "EM_ANDAMENTO" : i % 2 === 0 ? "CONCLUIDA" : "CONCLUIDA_COM_ALERTAS",
  totalCompanies: companies.length,
  completedCompanies: companies.length - 4 - i,
  warningCompanies: 2 + i,
  errorCompanies: i % 2,
  skippedCompanies: 2,
}));

export const availableMonths = MONTHS;
