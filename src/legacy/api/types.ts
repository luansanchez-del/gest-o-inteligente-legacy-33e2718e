export type ChartAccountOrigin = "SOURCE" | "TARGET";

export type MappingStatus = "SUGGESTED" | "NEEDS_REVIEW" | "CONFIRMED" | "REJECTED";

export type RowImportStatus = "AUTO_ACCEPT" | "REVIEW" | "REJECTED";

export type ImplementationStatus = "IN_PROGRESS" | "CONCLUDED";

export type ImportFileKind =
  | "CHART_SOURCE"
  | "CHART_TARGET"
  | "TRIAL_BALANCE_SOURCE"
  | "LEDGER_SOURCE"
  | "COST_CENTER_SOURCE"
  | "COST_CENTER_TARGET"
  | "QUESTOR_JOURNAL_SOURCE";

export type ImportStatus = "PENDING_MAPPING" | "READY_TO_IMPORT" | "IMPORTED" | "ERROR";

export const IMPORT_KIND_LABELS: Record<ImportFileKind, string> = {
  CHART_SOURCE: "Plano de Contas — Origem",
  CHART_TARGET: "Plano de Contas — Destino",
  TRIAL_BALANCE_SOURCE: "Balancete",
  LEDGER_SOURCE: "Razão",
  COST_CENTER_SOURCE: "Centros de Custo — Origem",
  COST_CENTER_TARGET: "Centros de Custo — Destino",
  QUESTOR_JOURNAL_SOURCE: "Lançamentos Questor (.nli)",
};

export type JournalEntryLineType = "DEBIT" | "CREDIT";

export type RecognizedField =
  | "CODE"
  | "CLASSIFICATION"
  | "ACCOUNT_NAME"
  | "NATURE"
  | "ANALYTIC_SYNTHETIC"
  | "OPENING_BALANCE"
  | "DEBIT"
  | "CREDIT"
  | "CLOSING_BALANCE"
  | "COST_CENTER"
  | "DATE"
  | "HISTORY";

export const FIELD_LABELS: Record<RecognizedField, string> = {
  CODE: "Código da conta",
  CLASSIFICATION: "Classificação",
  ACCOUNT_NAME: "Descrição da conta",
  NATURE: "Natureza",
  ANALYTIC_SYNTHETIC: "Analítica/Sintética",
  OPENING_BALANCE: "Saldo anterior",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  CLOSING_BALANCE: "Saldo final",
  COST_CENTER: "Centro de custo",
  DATE: "Data",
  HISTORY: "Histórico",
};

export interface PagedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Company {
  id: string;
  tenantId: string;
  name: string;
  document: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingSystem {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface AccountingImplementation {
  id: string;
  tenantId: string;
  companyId: string;
  company?: Company | { name: string; document: string };
  name: string;
  /** "YYYY-MM-DD" (primeiro dia do mês de referência) ou null quando não informado. */
  referencePeriod: string | null;
  sourceSystemId: string | null;
  sourceSystem?: AccountingSystem | null;
  targetSystemId: string | null;
  targetSystem?: AccountingSystem | null;
  status: ImplementationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ChartAccount {
  id: string;
  tenantId: string;
  implementationId: string;
  origin: ChartAccountOrigin;
  code: string;
  name: string;
  classification: string | null;
  nature: string | null;
  analytic: boolean | null;
  level: number | null;
  parentCode: string | null;
  lastImportConfidence: number | null;
  lastImportStatus: RowImportStatus | null;
  lastPreviousBalance: string | null;
  lastDebit: string | null;
  lastCredit: string | null;
  lastFinalBalance: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CostCenter {
  id: string;
  tenantId: string;
  implementationId: string;
  origin: ChartAccountOrigin;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CostCenterWithMapping {
  id: string;
  code: string;
  name: string;
  origin: ChartAccountOrigin;
  occurrences: number;
  suggestedTarget: CostCenter | null;
  mappingConfidence: number | null;
  mappingStatus: MappingStatus | null;
  mappingId: string | null;
  createdAt: string;
}

export interface AccountMapping {
  id: string;
  tenantId: string;
  implementationId: string;
  sourceAccountId: string;
  targetAccountId: string;
  costCenterId: string | null;
  confidence: number | null;
  status: MappingStatus;
  sourceAccount: ChartAccount;
  targetAccount: ChartAccount;
  costCenter: CostCenter | null;
  createdAt: string;
  updatedAt: string;
}

export interface CostCenterMapping {
  id: string;
  tenantId: string;
  implementationId: string;
  sourceCostCenterId: string;
  targetCostCenterId: string;
  confidence: number | null;
  status: MappingStatus;
  sourceCostCenter: CostCenter;
  targetCostCenter: CostCenter;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnDetection {
  column: string;
  index: number;
  header: string;
  field: RecognizedField | null;
  confidence: number;
}

export interface ImportedFileSummary {
  id: string;
  kind: ImportFileKind;
  originalName: string;
  sheetName: string | null;
  status: ImportStatus;
  rowCount: number;
  importedCount: number | null;
  needsConfirmation: boolean;
  errorMessage: string | null;
  detectedCostCenters: { code: string; name: string }[] | null;
  analysisSummary: Record<string, unknown> | null;
  createdAt: string;
}

export interface ImportedFileDetail extends ImportedFileSummary {
  headers: string[];
  sampleRows: string[][];
  detectedFields: ColumnDetection[];
  columnMapping: Partial<Record<RecognizedField, number>>;
}

export interface LedgerAnalysisPreview {
  accountsIdentified: number;
  accountsNew: number;
  accountsExisting: number;
  syntheticAccounts: number;
  analyticAccounts: number;
  costCentersIdentified: number;
  costCentersNew: number;
  costCentersExisting: number;
  rowsAutoAccepted: number;
  rowsNeedingReview: number;
  rowsIgnored: number;
  ignoredRows: { sourceRow: number; reason: string | null; warnings: string[] }[];
  warningsCount: number;
}

/**
 * Preview de um arquivo `.nli` Questor (ETAPA 21) — mesmo racional do
 * LedgerAnalysisPreview, mas para lançamentos débito+crédito em vez de
 * contas de balancete/razão. Ver docs/questor-nli.md.
 */
export interface QuestorAnalysisPreview {
  entriesIdentified: number;
  entriesAutoAccepted: number;
  entriesNeedingReview: number;
  entriesIgnored: number;
  accountsIdentified: number;
  accountsNew: number;
  accountsExisting: number;
  totalDebitAmount: number;
  totalCreditAmount: number;
  warningsCount: number;
  ignoredEntries: { sourceRow: number; reason: string | null; warnings: string[] }[];
}

export interface ImportPreview {
  importId: string;
  kind: ImportFileKind;
  originalName: string;
  sheetName: string | null;
  rowCount: number;
  columnsDetected: ColumnDetection[];
  needsConfirmation: boolean;
  ledgerAnalysis: LedgerAnalysisPreview | null;
  questorAnalysis: QuestorAnalysisPreview | null;
}

export interface ImportedJournalEntryLine {
  id: string;
  lineType: JournalEntryLineType;
  accountCode: string;
  amount: string;
  accountName: string | null;
  costCenterCode: string | null;
  costCenterName: string | null;
}

export interface ImportedJournalEntry {
  id: string;
  sourceRow: number;
  entryDate: string | null;
  period: string | null;
  historyCode: string | null;
  historyDescription: string | null;
  companyCode: string | null;
  establishmentCode: string | null;
  amount: string;
  status: RowImportStatus;
  confidence: number | null;
  warnings: string[];
  ignoredReason: string | null;
  createdAt: string;
  lines: ImportedJournalEntryLine[];
}

export interface JournalEntryPage {
  total: number;
  page: number;
  pageSize: number;
  entries: ImportedJournalEntry[];
}

export interface ImportedRow {
  id: string;
  sourceRow: number;
  sourceSheet: string | null;
  accountCode: string | null;
  accountDescription: string | null;
  classification: string | null;
  accountNature: string | null;
  level: number | null;
  parentCode: string | null;
  analytic: boolean | null;
  previousBalance: string | null;
  debit: string | null;
  credit: string | null;
  finalBalance: string | null;
  balanceNature: string | null;
  costCenterCode: string | null;
  costCenterDescription: string | null;
  period: string | null;
  chartAccountId: string | null;
  costCenterId: string | null;
  rawData: string[];
  confidence: number | null;
  status: RowImportStatus;
  warnings: string[] | null;
  ignoredReason: string | null;
  createdAt: string;
  importedFile?: { originalName: string; sheetName: string | null };
  costCenter?: CostCenter | null;
}

export interface MappingCandidate {
  targetAccount: ChartAccount;
  score: number;
}

export interface ChartAccountDetail {
  account: ChartAccount;
  lastImportedRow: ImportedRow | null;
  costCenter: CostCenter | null;
}

export interface AccountMappingStats {
  sourceAccounts: number;
  targetAccounts: number;
  suggestionsGenerated: number;
  highConfidence: number;
  needsReview: number;
  noMatch: number;
  confirmed: number;
  rejected: number;
  pendingHighConfidence: number;
}

export interface CostCenterMappingStats {
  sourceCostCenters: number;
  targetCostCenters: number;
  suggestionsGenerated: number;
  highConfidence: number;
  needsReview: number;
  noMatch: number;
  confirmed: number;
}

// ---------------------------------------------------------------------------
// Gestão de Fechamentos (módulo separado da Implantação — ver docs/gestao-fechamentos.md)
// ---------------------------------------------------------------------------

export type ClosingType = "ACCOUNTING" | "TAX";

export type ClosingPeriodStatus =
  | "AWAITING"
  | "RECEIVED"
  | "IN_ANALYSIS"
  | "APPROVED"
  | "HAS_ALERTS"
  | "HAS_ISSUES"
  | "RETURNED"
  | "NEEDS_REPROCESSING";

export const CLOSING_PERIOD_STATUS_LABELS: Record<ClosingPeriodStatus, string> = {
  AWAITING: "Aguardando",
  RECEIVED: "Recebido",
  IN_ANALYSIS: "Em análise",
  APPROVED: "Aprovado",
  HAS_ALERTS: "Com alertas",
  HAS_ISSUES: "Com pendências",
  RETURNED: "Devolvido",
  NEEDS_REPROCESSING: "Reprocessar",
};

export interface ClosingPeriod {
  id: string;
  companyId: string;
  referenceMonth: string;
  type: ClosingType;
  status: ClosingPeriodStatus;
  origin: "MANUAL" | "PIER";
  externalResponsibleName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ExternalRequestPurpose = "ACCOUNTING_CLOSING" | "TAX_CLOSING" | "OTHER" | "UNMAPPED";

export const EXTERNAL_REQUEST_PURPOSE_LABELS: Record<ExternalRequestPurpose, string> = {
  ACCOUNTING_CLOSING: "Fechamento Contábil",
  TAX_CLOSING: "Fechamento Fiscal",
  OTHER: "Outro",
  UNMAPPED: "Não classificado",
};

export interface ExternalRequest {
  id: string;
  companyId: string;
  provider: "PIER";
  externalId: string;
  number: string | null;
  description: string | null;
  typeExternalId: string;
  typeName: string | null;
  purpose: ExternalRequestPurpose;
  status: string | null;
  responsibleExternalId: string | null;
  responsibleExternalName: string | null;
  requestedAt: string | null;
  finishedAt: string | null;
  /** `prazo` do PIER — comparar com `finishedAt`/agora para saber se a entrega está fora do prazo. */
  deadlineAt: string | null;
  hasAttachment: boolean;
  closingPeriodId: string | null;
  syncedAt: string;
}

/** Uma mensagem da conversa de uma solicitação — ver docs/pier-integration.md. Sem nome do remetente (só id) e sem anexo, conforme o Swagger real do PIER. */
export interface PierPostagem {
  idPostagem: number;
  postadoEm: string;
  postagemTexto: string | null;
  idRemetente: number;
}

export type ExternalFileProcessingStatus = "PENDING" | "DOWNLOADED" | "DOWNLOAD_FAILED";

export interface ExternalFile {
  id: string;
  companyId: string;
  provider: "PIER";
  externalId: string;
  externalRequestId: string | null;
  closingPeriodId: string | null;
  name: string | null;
  categoria: string | null;
  subcategoria: string | null;
  competencia: string | null;
  enviadoEm: string | null;
  uploadedByExternalId: string | null;
  syncedAt: string;
  size: string | null;
  hash: string | null;
  downloadedAt: string | null;
  processingStatus: ExternalFileProcessingStatus;
}

export interface RequestAnalysisResult {
  analysisRunId: string;
  requestId: string;
  status: ClosingPeriodStatus;
  validated: boolean;
  documents: Array<{
    fileId: string;
    fileName: string;
    kind: "GNRE" | "ICMS_ST_REPORT" | "UNKNOWN";
    cnpjs: string[];
    periods: string[];
    dueDates: string[];
    states: string[];
    amounts: number[];
  }>;
  findings: Array<{
    code: string;
    title: string;
    description: string;
    severity: "INFO" | "WARNING" | "CRITICAL";
    guidance: string;
    sourceFileName?: string;
  }>;
}

export interface GestaoSyncResult {
  companyId: string;
  pierClientId: number;
  competencia: string;
  solicitacoesEncontradas: number;
  fechamentos: { contabil: string | null; fiscal: string | null };
  arquivosEncontrados: number;
  novos: number;
  atualizados: number;
  inalterados: number;
  naoClassificados: number;
  warnings: string[];
}

export interface ClosingBucket {
  closingPeriod: ClosingPeriod | null;
  requests: ExternalRequest[];
  files: ExternalFile[];
}

export interface CompetenciaSnapshot {
  company: { id: string; name: string; document: string };
  competencia: string;
  lastSyncedAt: string | null;
  contabil: ClosingBucket;
  fiscal: ClosingBucket;
  naoClassificados: { requests: ExternalRequest[]; files: ExternalFile[] };
}

export interface PierCompanyLink {
  id: string;
  companyId: string;
  provider: "PIER";
  externalId: string;
  externalName: string | null;
  syncedAt: string | null;
}

export interface PierCliente {
  id: number;
  nome: string | null;
  documento: string | null;
  status: string | null;
  tributacao: string | null;
}

/** Cópia local da carteira PIER — lida pela interface em vez de buscar ao vivo a cada entrada na tela. */
export interface PierClienteCache {
  id: string;
  externalId: string;
  nome: string | null;
  documento: string | null;
  status: string | null;
  tributacao: string | null;
  syncedAt: string;
}

// ---------------------------------------------------------------------------
// Central de Sincronização em Lote (ver docs/gestao-fechamentos.md, "Central
// de Sincronização"). Só SYNC está implementado — VALIDATE/SYNC_AND_VALIDATE
// existem nos tipos porque o backend os aceita no schema, mas são recusados
// em tempo de execução (motor de leitura+validação ainda não existe).
// ---------------------------------------------------------------------------

export type BatchOperationType = "SYNC" | "VALIDATE" | "SYNC_AND_VALIDATE";
export type BatchScopeType =
  | "ALL_COMPANIES"
  | "SELECTED_COMPANIES"
  | "SINGLE_COMPANY"
  | "FAILED_COMPANIES"
  | "COMPANIES_WITH_CHANGES";
export type BatchOrigin = "MANUAL" | "SCHEDULED" | "RETRY" | "API";
export type BatchExecutionStatus =
  "QUEUED" | "RUNNING" | "COMPLETED" | "COMPLETED_WITH_WARNINGS" | "FAILED" | "CANCELLED";
export type SyncMode = "INCREMENTAL" | "FULL";
export type CompanyExecutionStatus =
  | "QUEUED"
  | "SYNCING_REQUESTS"
  | "SYNCING_POSTS"
  | "SYNCING_FILES"
  | "DOWNLOADING"
  | "READING_DOCUMENTS"
  | "VALIDATING"
  | "COMPLETED"
  | "COMPLETED_WITH_WARNINGS"
  | "FAILED"
  | "CANCELLED"
  | "SKIPPED";

export const BATCH_OPERATION_LABELS: Record<BatchOperationType, string> = {
  SYNC: "Sincronizar",
  VALIDATE: "Validar (indisponível — motor de validação ainda não existe)",
  SYNC_AND_VALIDATE: "Sincronizar e validar (indisponível — motor de validação ainda não existe)",
};

export const BATCH_SCOPE_LABELS: Record<BatchScopeType, string> = {
  ALL_COMPANIES: "Todas as empresas",
  SELECTED_COMPANIES: "Empresas selecionadas",
  SINGLE_COMPANY: "Uma empresa",
  FAILED_COMPANIES: "Somente empresas com falha",
  COMPANIES_WITH_CHANGES: "Somente empresas com alterações",
};

export const BATCH_ORIGIN_LABELS: Record<BatchOrigin, string> = {
  MANUAL: "Manual",
  SCHEDULED: "Agendada",
  RETRY: "Reprocessamento",
  API: "API",
};

export const BATCH_EXECUTION_STATUS_LABELS: Record<BatchExecutionStatus, string> = {
  QUEUED: "Na fila",
  RUNNING: "Em processamento",
  COMPLETED: "Concluída",
  COMPLETED_WITH_WARNINGS: "Concluída com avisos",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

export const COMPANY_EXECUTION_STATUS_LABELS: Record<CompanyExecutionStatus, string> = {
  QUEUED: "Na fila",
  SYNCING_REQUESTS: "Sincronizando solicitações",
  SYNCING_POSTS: "Sincronizando conversas",
  SYNCING_FILES: "Sincronizando arquivos",
  DOWNLOADING: "Baixando documentos",
  READING_DOCUMENTS: "Lendo documentos",
  VALIDATING: "Validando",
  COMPLETED: "Concluída",
  COMPLETED_WITH_WARNINGS: "Concluída com avisos",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
  SKIPPED: "Ignorada",
};

/** Estágios "em andamento" — mesmo conjunto usado no backend para decidir se o polling continua. */
export const COMPANY_EXECUTION_ACTIVE_STATUSES: CompanyExecutionStatus[] = [
  "QUEUED",
  "SYNCING_REQUESTS",
  "SYNCING_POSTS",
  "SYNCING_FILES",
  "DOWNLOADING",
  "READING_DOCUMENTS",
  "VALIDATING",
];

export interface BatchExecutionConfig {
  concurrency?: number;
  continueOnError?: boolean;
  syncMode?: SyncMode;
}

export interface BatchExecution {
  id: string;
  competencia: string;
  operation: BatchOperationType;
  scope: BatchScopeType;
  origin: BatchOrigin;
  status: BatchExecutionStatus;
  totalCompanies: number;
  pendingCompanies: number;
  processingCompanies: number;
  completedCompanies: number;
  warningCompanies: number;
  errorCompanies: number;
  skippedCompanies: number;
  requestedCompanyIds: string[] | null;
  config: BatchExecutionConfig | null;
  cancelRequested: boolean;
  summary: Record<string, number> | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requestedByUserId: string | null;
}

export interface CompanyExecution {
  id: string;
  batchExecutionId: string;
  companyId: string;
  competencia: string;
  status: CompanyExecutionStatus;
  currentStep: string | null;
  requestsFound: number | null;
  postsFound: number | null;
  filesFound: number | null;
  filesNew: number | null;
  documentsRead: number | null;
  pendenciesGenerated: number | null;
  warningsCount: number | null;
  errorMessage: string | null;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  company: { id: string; name: string; document: string };
}

export type CompanyEligibility = {
  companyId: string;
  companyName: string;
  eligible: boolean;
  skipReason?: "NOT_LINKED_TO_PIER" | "INACTIVE";
};

export interface BatchExecutionPreview {
  competencia: string;
  operation: BatchOperationType;
  scope: BatchScopeType;
  totalCompanies: number;
  eligibleCompanies: number;
  unlinkedCompanies: number;
  inactiveCompanies: number;
  companies: CompanyEligibility[];
}

export interface CreateBatchExecutionInput {
  competencia: string;
  operation: BatchOperationType;
  scope: BatchScopeType;
  companyIds?: string[];
  sourceBatchExecutionId?: string;
  config?: BatchExecutionConfig;
}

export type DeliverySituation =
  | "DELIVERED_ON_TIME"
  | "DELIVERED_LATE"
  | "IN_PROGRESS"
  | "OVERDUE"
  | "WAITING_CLIENT"
  | "NEEDS_REVIEW";
export interface DeliverySummary {
  total: number;
  delivered: number;
  deliveryRate: number;
  DELIVERED_ON_TIME: number;
  DELIVERED_LATE: number;
  IN_PROGRESS: number;
  OVERDUE: number;
  WAITING_CLIENT: number;
  NEEDS_REVIEW: number;
}
export interface ManagementDashboardItem {
  requestId: string;
  companyId: string;
  companyName: string;
  linkedToPier: boolean;
  teamId: string | null;
  teamName: string;
  collaboratorName: string;
  responsibleExternalId: string | null;
  typeExternalId: string;
  typeName: string;
  deadlineAt: string | null;
  finishedAt: string | null;
  situation: DeliverySituation;
  confidence: number;
  evidence: { type: string; at: string | null; text: string } | null;
}
export interface ManagementDashboard {
  competenciaInicio: string;
  competenciaFim: string;
  summary: DeliverySummary;
  /** Cada departamento já traz seus responsáveis agrupados em `collaborators` — "entrega por responsável conforme o departamento". */
  byTeam: Array<
    { name: string } & DeliverySummary & {
        collaborators: Array<{ name: string } & DeliverySummary>;
      }
  >;
  companyIds: string[];
  items: ManagementDashboardItem[];
  options: {
    teams: { id: string | null; name: string }[];
    collaborators: { externalId: string | null; name: string }[];
    requestTypes: { id: string; name: string }[];
  };
}
export interface PierUsuario {
  id: number;
  nome: string | null;
  tipo: string | null;
  login: string | null;
  email: string | null;
  whatsapp: string | null;
  status: string | null;
  departamentoPrincipalId: number;
}
export interface PierDepartmentMapping {
  id: string;
  externalDepartmentId: string;
  name: string | null;
}
export interface PierSolicitacao {
  id: number;
  idResponsavel: number | null;
  idTipoSolicitacao: number;
  idDepartamentoPrincipalResponsavel?: number;
  lida: boolean;
  numero: string | null;
  descricao: string | null;
  nomeCliente: string | null;
  prioridade: string | null;
  nomeResponsavel: string | null;
  status: string | null;
  dataUltimaExecucao: string | null;
  prazo: string | null;
  solicitadaEm: string;
  finalizadaEm: string | null;
  flgAbertaPeloMeuContador: boolean;
  flgWhatsApp: boolean;
  publicadaAoCliente: boolean;
  flgTemAnexo: boolean;
}
export interface PierArquivo {
  id: number;
  nomeArquivo: string | null;
  idSolicitacao: number;
  idUsuarioEnvio: number;
  categoria: string | null;
  subcategoria: string | null;
  enviadoEm: string;
}
export interface PierRequestReview {
  id?: string;
  externalRequestId: string;
  observation: string | null;
  conversationReviewed: boolean;
  attachmentsReviewed: boolean;
  reconciled: boolean;
  conclusion: string | null;
  updatedAt?: string;
}

export interface ListBatchExecutionsParams {
  page?: number;
  pageSize?: number;
  competencia?: string;
  status?: BatchExecutionStatus;
  origin?: BatchOrigin;
  scope?: BatchScopeType;
  from?: string;
  to?: string;
}

export type MonthlySyncSituation =
  | "NAO_SINCRONIZADA"
  | "NA_FILA"
  | "SINCRONIZANDO"
  | "SINCRONIZADA"
  | "SINCRONIZADA_COM_AVISOS"
  | "FALHA"
  | "CANCELADA"
  | "SEM_VINCULO_PIER"
  | "EMPRESA_INATIVA";

export const MONTHLY_SITUATION_LABELS: Record<MonthlySyncSituation, string> = {
  NAO_SINCRONIZADA: "Não sincronizada",
  NA_FILA: "Na fila",
  SINCRONIZANDO: "Sincronizando",
  SINCRONIZADA: "Sincronizada",
  SINCRONIZADA_COM_AVISOS: "Sincronizada com avisos",
  FALHA: "Falha",
  CANCELADA: "Cancelada",
  SEM_VINCULO_PIER: "Sem vínculo PIER",
  EMPRESA_INATIVA: "Empresa inativa",
};

export interface MonthlyMatrixRow {
  companyId: string;
  companyName: string;
  companyDocument: string;
  situacao: MonthlySyncSituation;
  requestsFound: number | null;
  filesFound: number | null;
  filesNew: number | null;
  warningsCount: number | null;
  lastSyncedAt: string | null;
  lastBatchExecutionId: string | null;
}

export interface ImplementationStats {
  chartAccountsImported: number;
  sourceAccounts: number;
  targetAccounts: number;
  accountSuggestionsGenerated: number;
  accountHighConfidence: number;
  accountNeedsReview: number;
  accountNoMatch: number;
  accountConfirmed: number;
  accountsMapped: number;
  accountsPending: number;
  costCentersImported: number;
  sourceCostCenters: number;
  targetCostCenters: number;
  costCenterSuggestionsGenerated: number;
  costCenterHighConfidence: number;
  costCenterNeedsReview: number;
  costCenterNoMatch: number;
  costCentersMapped: number;
  costCentersPending: number;
  filesImported: number;
  filesTotal: number;
  rowsAutoAccepted: number;
  rowsNeedingReview: number;
  rowsRejected: number;
  warningsCount: number;
  pendingImpediments: boolean;
}
