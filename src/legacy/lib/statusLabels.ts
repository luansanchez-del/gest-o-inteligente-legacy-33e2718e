import type {
  ImplementationStatus,
  ImportStatus,
  MappingStatus,
  RowImportStatus,
} from "../api/types";

/**
 * Rótulos e classes puramente apresentacionais. Nenhuma lógica de negócio ou
 * de detecção aqui — apenas tradução de um enum já calculado no backend para
 * texto/cor em português.
 */

export const ROW_STATUS_LABELS: Record<RowImportStatus, string> = {
  AUTO_ACCEPT: "Automático",
  REVIEW: "Revisar",
  REJECTED: "Rejeitado",
};

export const ROW_STATUS_CLASS: Record<RowImportStatus, string> = {
  AUTO_ACCEPT: "pill pill-success",
  REVIEW: "pill pill-warning",
  REJECTED: "pill pill-danger",
};

export const MAPPING_STATUS_LABELS: Record<MappingStatus, string> = {
  SUGGESTED: "Sugerido",
  NEEDS_REVIEW: "Revisar",
  CONFIRMED: "Confirmado",
  REJECTED: "Rejeitado",
};

export const MAPPING_STATUS_CLASS: Record<MappingStatus, string> = {
  SUGGESTED: "pill pill-info",
  NEEDS_REVIEW: "pill pill-warning",
  CONFIRMED: "pill pill-success",
  REJECTED: "pill pill-danger",
};

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  PENDING_MAPPING: "Aguardando confirmação",
  READY_TO_IMPORT: "Pronto para importar",
  IMPORTED: "Importado",
  ERROR: "Erro",
};

export const IMPORT_STATUS_CLASS: Record<ImportStatus, string> = {
  PENDING_MAPPING: "pill pill-warning",
  READY_TO_IMPORT: "pill pill-info",
  IMPORTED: "pill pill-success",
  ERROR: "pill pill-danger",
};

export const IMPLEMENTATION_STATUS_LABELS: Record<ImplementationStatus, string> = {
  IN_PROGRESS: "Em análise",
  CONCLUDED: "Concluída",
};

/** Confiança em texto, na mesma linguagem usada na ETAPA 5 do pedido (99%, 96%...). */
export function confidenceLabel(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return "Não disponível";
  return `${Math.round(confidence)}%`;
}

export function confidenceBucketClass(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return "pill pill-neutral";
  if (confidence >= 85) return "pill pill-success";
  if (confidence >= 50) return "pill pill-warning";
  return "pill pill-danger";
}
