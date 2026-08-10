import type {
  AccountingImplementation,
  AccountingSystem,
  AccountMapping,
  AccountMappingStats,
  BatchExecution,
  BatchExecutionPreview,
  ChartAccount,
  ChartAccountDetail,
  ChartAccountOrigin,
  CompanyExecution,
  CompetenciaSnapshot,
  Company,
  CostCenter,
  CostCenterMapping,
  CostCenterMappingStats,
  CostCenterWithMapping,
  CreateBatchExecutionInput,
  ExternalRequestPurpose,
  GestaoSyncResult,
  ImplementationStats,
  ImportedFileDetail,
  ImportedFileSummary,
  ImportedJournalEntry,
  ImportFileKind,
  ImportPreview,
  JournalEntryPage,
  ListBatchExecutionsParams,
  MappingCandidate,
  MappingStatus,
  MonthlyMatrixRow,
  ManagementDashboard,
  PagedResult,
  PierCompanyLink,
  PierPostagem,
  PierUsuario,
  PierSolicitacao,
  PierArquivo,
  PierRequestReview,
  RecognizedField,
  RowImportStatus,
} from "./types";

import { ApiHttpError, ApiNetworkError, resolveApiUrl } from "@/lib/api-config";

async function doFetch(path: string, init: RequestInit): Promise<Response> {
  const url = `${resolveApiUrl()}${path}`;
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new ApiNetworkError(url, error);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await doFetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiHttpError(response.status, path, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const response = await doFetch(path, { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.text();
    throw new ApiHttpError(response.status, path, body);
  }
  return (await response.json()) as T;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface ChartAccountSearchParams {
  origin?: ChartAccountOrigin;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "ALL" | RowImportStatus;
  analytic?: "ALL" | "true" | "false";
  hasMovement?: "ALL" | "true" | "false";
  parentCode?: string;
  sort?: "code" | "confidence";
}

export interface AccountMappingListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "ALL" | MappingStatus;
}

export interface CreateAccountingImplementationData {
  name: string;
  companyId: string;
  /** "YYYY-MM" — o que um <input type="month"> já devolve. */
  referencePeriod?: string;
  sourceSystemId?: string;
  targetSystemId?: string;
}

export const api = {
  companies: {
    list: (search?: string) => request<Company[]>(`/companies${buildQuery({ search })}`),
    get: (id: string) => request<Company>(`/companies/${id}`),
    create: (data: { name: string; document: string }) =>
      request<Company>("/companies", { method: "POST", body: JSON.stringify(data) }),
  },
  accountingSystems: {
    list: () => request<AccountingSystem[]>("/accounting-systems"),
  },
  implementations: {
    list: () => request<AccountingImplementation[]>("/accounting-implementations"),
    get: (id: string) => request<AccountingImplementation>(`/accounting-implementations/${id}`),
    stats: (id: string) => request<ImplementationStats>(`/accounting-implementations/${id}/stats`),
    create: (data: CreateAccountingImplementationData) =>
      request<AccountingImplementation>("/accounting-implementations", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    conclude: (id: string) =>
      request<AccountingImplementation>(`/accounting-implementations/${id}/conclude`, {
        method: "POST",
      }),
  },
  chartAccounts: {
    list: (implementationId: string, origin?: ChartAccountOrigin) =>
      request<ChartAccount[]>(
        `/accounting-implementations/${implementationId}/chart-accounts${origin ? `?origin=${origin}` : ""}`,
      ),
    search: (implementationId: string, params: ChartAccountSearchParams) =>
      request<PagedResult<ChartAccount>>(
        `/accounting-implementations/${implementationId}/chart-accounts/search${buildQuery(params as Record<string, string | number | undefined>)}`,
      ),
    detail: (implementationId: string, id: string) =>
      request<ChartAccountDetail>(
        `/accounting-implementations/${implementationId}/chart-accounts/${id}/detail`,
      ),
    create: (
      implementationId: string,
      data: { origin: ChartAccountOrigin; code: string; name: string },
    ) =>
      request<ChartAccount>(`/accounting-implementations/${implementationId}/chart-accounts`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    remove: (implementationId: string, id: string) =>
      request<void>(`/accounting-implementations/${implementationId}/chart-accounts/${id}`, {
        method: "DELETE",
      }),
  },
  costCenters: {
    list: (implementationId: string, origin?: ChartAccountOrigin) =>
      request<CostCenter[]>(
        `/accounting-implementations/${implementationId}/cost-centers${origin ? `?origin=${origin}` : ""}`,
      ),
    withMappings: (implementationId: string, origin: ChartAccountOrigin = "SOURCE") =>
      request<CostCenterWithMapping[]>(
        `/accounting-implementations/${implementationId}/cost-centers/with-mappings?origin=${origin}`,
      ),
    create: (
      implementationId: string,
      data: { origin: ChartAccountOrigin; code: string; name: string },
    ) =>
      request<CostCenter>(`/accounting-implementations/${implementationId}/cost-centers`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    remove: (implementationId: string, id: string) =>
      request<void>(`/accounting-implementations/${implementationId}/cost-centers/${id}`, {
        method: "DELETE",
      }),
  },
  accountMappings: {
    list: (implementationId: string, params: AccountMappingListParams = {}) =>
      request<PagedResult<AccountMapping>>(
        `/accounting-implementations/${implementationId}/account-mappings${buildQuery(params as Record<string, string | number | undefined>)}`,
      ),
    stats: (implementationId: string) =>
      request<AccountMappingStats>(
        `/accounting-implementations/${implementationId}/account-mappings/stats`,
      ),
    generateSuggestions: (implementationId: string) =>
      request<AccountMappingStats>(
        `/accounting-implementations/${implementationId}/account-mappings/generate-suggestions`,
        { method: "POST" },
      ),
    confirmBulk: (implementationId: string, minConfidence = 95) =>
      request<{ updated: number }>(
        `/accounting-implementations/${implementationId}/account-mappings/confirm-bulk?minConfidence=${minConfidence}`,
        { method: "POST" },
      ),
    confirmMany: (implementationId: string, ids: string[]) =>
      request<{ updated: number }>(
        `/accounting-implementations/${implementationId}/account-mappings/confirm-many`,
        {
          method: "POST",
          body: JSON.stringify({ ids }),
        },
      ),
    confirm: (implementationId: string, id: string) =>
      request<AccountMapping>(
        `/accounting-implementations/${implementationId}/account-mappings/${id}/confirm`,
        {
          method: "POST",
        },
      ),
    candidates: (implementationId: string, id: string) =>
      request<MappingCandidate[]>(
        `/accounting-implementations/${implementationId}/account-mappings/${id}/candidates`,
      ),
    reject: (implementationId: string, id: string) =>
      request<AccountMapping>(
        `/accounting-implementations/${implementationId}/account-mappings/${id}/reject`,
        {
          method: "POST",
        },
      ),
    create: (
      implementationId: string,
      data: { sourceAccountId: string; targetAccountId: string; costCenterId?: string },
    ) =>
      request<AccountMapping>(`/accounting-implementations/${implementationId}/account-mappings`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      implementationId: string,
      id: string,
      data: { sourceAccountId?: string; targetAccountId?: string; costCenterId?: string | null },
    ) =>
      request<AccountMapping>(
        `/accounting-implementations/${implementationId}/account-mappings/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      ),
    remove: (implementationId: string, id: string) =>
      request<void>(`/accounting-implementations/${implementationId}/account-mappings/${id}`, {
        method: "DELETE",
      }),
  },
  costCenterMappings: {
    list: (implementationId: string) =>
      request<CostCenterMapping[]>(
        `/accounting-implementations/${implementationId}/cost-center-mappings`,
      ),
    stats: (implementationId: string) =>
      request<CostCenterMappingStats>(
        `/accounting-implementations/${implementationId}/cost-center-mappings/stats`,
      ),
    generateSuggestions: (implementationId: string) =>
      request<CostCenterMappingStats>(
        `/accounting-implementations/${implementationId}/cost-center-mappings/generate-suggestions`,
        { method: "POST" },
      ),
    confirmBulk: (implementationId: string, minConfidence = 95) =>
      request<{ updated: number }>(
        `/accounting-implementations/${implementationId}/cost-center-mappings/confirm-bulk?minConfidence=${minConfidence}`,
        { method: "POST" },
      ),
    confirmMany: (implementationId: string, ids: string[]) =>
      request<{ updated: number }>(
        `/accounting-implementations/${implementationId}/cost-center-mappings/confirm-many`,
        { method: "POST", body: JSON.stringify({ ids }) },
      ),
    confirm: (implementationId: string, id: string) =>
      request<CostCenterMapping>(
        `/accounting-implementations/${implementationId}/cost-center-mappings/${id}/confirm`,
        { method: "POST" },
      ),
    reject: (implementationId: string, id: string) =>
      request<CostCenterMapping>(
        `/accounting-implementations/${implementationId}/cost-center-mappings/${id}/reject`,
        { method: "POST" },
      ),
    create: (
      implementationId: string,
      data: { sourceCostCenterId: string; targetCostCenterId: string },
    ) =>
      request<CostCenterMapping>(
        `/accounting-implementations/${implementationId}/cost-center-mappings`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),
    remove: (implementationId: string, id: string) =>
      request<void>(`/accounting-implementations/${implementationId}/cost-center-mappings/${id}`, {
        method: "DELETE",
      }),
  },
  imports: {
    list: (implementationId: string) =>
      request<ImportedFileSummary[]>(`/accounting-implementations/${implementationId}/imports`),
    get: (implementationId: string, importId: string) =>
      request<ImportedFileDetail>(
        `/accounting-implementations/${implementationId}/imports/${importId}`,
      ),
    preview: (implementationId: string, importId: string) =>
      request<ImportPreview>(
        `/accounting-implementations/${implementationId}/imports/${importId}/preview`,
      ),
    upload: (implementationId: string, kind: ImportFileKind, file: File) => {
      const formData = new FormData();
      formData.append("kind", kind);
      formData.append("file", file);
      return upload<ImportedFileDetail>(
        `/accounting-implementations/${implementationId}/imports`,
        formData,
      );
    },
    confirmMapping: (
      implementationId: string,
      importId: string,
      columnMapping: Partial<Record<RecognizedField, number>>,
    ) =>
      request<ImportedFileDetail>(
        `/accounting-implementations/${implementationId}/imports/${importId}/mapping`,
        { method: "PATCH", body: JSON.stringify({ columnMapping }) },
      ),
    commit: (implementationId: string, importId: string) =>
      request<ImportedFileDetail>(
        `/accounting-implementations/${implementationId}/imports/${importId}/commit`,
        { method: "POST" },
      ),
    createDetectedCostCenters: (
      implementationId: string,
      importId: string,
      origin: ChartAccountOrigin,
    ) =>
      request<{ created: number }>(
        `/accounting-implementations/${implementationId}/imports/${importId}/create-detected-cost-centers`,
        { method: "POST", body: JSON.stringify({ origin }) },
      ),
    remove: (implementationId: string, importId: string) =>
      request<void>(`/accounting-implementations/${implementationId}/imports/${importId}`, {
        method: "DELETE",
      }),
    journalEntries: {
      list: (
        implementationId: string,
        importId: string,
        params: { page?: number; pageSize?: number; status?: "ALL" | RowImportStatus } = {},
      ) =>
        request<JournalEntryPage>(
          `/accounting-implementations/${implementationId}/imports/${importId}/journal-entries${buildQuery(
            {
              page: params.page,
              pageSize: params.pageSize,
              status: params.status && params.status !== "ALL" ? params.status : undefined,
            },
          )}`,
        ),
      get: (implementationId: string, importId: string, entryId: string) =>
        request<ImportedJournalEntry>(
          `/accounting-implementations/${implementationId}/imports/${importId}/journal-entries/${entryId}`,
        ),
    },
  },
  gestaoFechamentos: {
    management: {
      dashboard: (params: {
        competenciaInicio: string;
        competenciaFim: string;
        teamId?: string;
        responsibleExternalId?: string;
        typeExternalId?: string;
      }) =>
        request<ManagementDashboard>(
          `/gestao-fechamentos/management/dashboard${buildQuery(params)}`,
        ),
      getReview: (externalRequestId: string) =>
        request<PierRequestReview | null>(
          `/gestao-fechamentos/management/reviews/${externalRequestId}`,
        ),
      saveReview: (
        externalRequestId: string,
        data: Omit<PierRequestReview, "id" | "externalRequestId" | "updatedAt">,
      ) =>
        request<PierRequestReview>(`/gestao-fechamentos/management/reviews/${externalRequestId}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
    },
    pier: {
      listUsuarios: (
        params: {
          tipo?: "Interno" | "Cliente" | "Todos";
          status?: "Ativo" | "Inativo" | "Todos";
          nomeParcial?: string;
        } = {},
      ) =>
        request<PierUsuario[]>(
          `/gestao-fechamentos/pier/usuarios${buildQuery({ ...params, pagina: 1, quantidadePorPagina: 500 })}`,
        ),
      listTiposSolicitacao: (status = "Ativo") =>
        request<Array<{ id: number; descricao: string | null; status: string | null }>>(
          `/gestao-fechamentos/pier/tipos-solicitacao${buildQuery({ status })}`,
        ),
      listSolicitacoes: (
        params: {
          idResponsavel?: number;
          idDepartamentoPrincipalResponsavel?: number;
          idTipoSolicitacao?: number;
          idCliente?: number;
          busca?: string;
          status?: string;
          dataAberturaInicio?: string;
          dataAberturaFim?: string;
        } = {},
      ) =>
        request<PierSolicitacao[]>(
          `/gestao-fechamentos/pier/solicitacoes${buildQuery({ ...params, DataAberturaInicio: params.dataAberturaInicio, DataAberturaFim: params.dataAberturaFim, pagina: 1, quantidadePorPagina: 30 })}`,
        ),
      listArquivos: (idSolicitacao: number) =>
        request<PierArquivo[]>(
          `/gestao-fechamentos/pier/arquivos${buildQuery({ idSolicitacao, pagina: 1, quantidadePorPagina: 25 })}`,
        ),
      getArquivoDownloadUrl: (id: number) =>
        request<{ url: string | null; validoAteUtc: string; nomeArquivo: string | null }>(
          `/gestao-fechamentos/pier/arquivos/${id}/download-url`,
        ),
      listClientes: (
        params: {
          nomeParcial?: string;
          status?: string;
          tributacao?: string;
          pagina?: number;
        } = {},
      ) =>
        request<import("./types").PierCliente[]>(
          `/gestao-fechamentos/pier/clientes${buildQuery({ nomeParcial: params.nomeParcial, status: params.status, tributacao: params.tributacao, pagina: params.pagina ?? 1, quantidadePorPagina: 25 })}`,
        ),
      importCliente: (idCliente: number) =>
        request<{ company: Company; link: PierCompanyLink; created: boolean }>(
          `/gestao-fechamentos/pier/clientes/${idCliente}/import`,
          { method: "POST" },
        ),
      importAllClientes: () =>
        request<{
          found: number;
          linked: number;
          created: number;
          existing: number;
          skipped: number;
          errors: Array<{ id: number; name: string | null; message: string }>;
        }>("/gestao-fechamentos/pier/clientes/import-all", { method: "POST" }),
      clientesCache: {
        list: (params: { search?: string; status?: string; tributacao?: string } = {}) =>
          request<import("./types").PierClienteCache[]>(
            `/gestao-fechamentos/pier/clientes-cache${buildQuery(params)}`,
          ),
        lastSyncedAt: () =>
          request<{ lastSyncedAt: string | null }>(
            "/gestao-fechamentos/pier/clientes-cache/last-synced-at",
          ),
        sync: () =>
          request<{ found: number; created: number; updated: number; syncedAt: string }>(
            "/gestao-fechamentos/pier/clientes-cache/sync",
            { method: "POST" },
          ),
      },
      getLink: (companyId: string) =>
        request<PierCompanyLink | null>(`/gestao-fechamentos/pier/companies/${companyId}/link`),
      listPostagens: (idSolicitacao: string) =>
        request<PierPostagem[]>(`/gestao-fechamentos/pier/solicitacoes/${idSolicitacao}/postagens`),
      link: (companyId: string) =>
        request<{ linked: boolean; link: PierCompanyLink | null }>(
          `/gestao-fechamentos/pier/companies/${companyId}/link`,
          {
            method: "POST",
          },
        ),
    },
    typeMappings: {
      list: () =>
        request<
          {
            id: string;
            externalTypeId: string;
            externalTypeName: string | null;
            purpose: ExternalRequestPurpose;
          }[]
        >("/gestao-fechamentos/pier/type-mappings"),
      setPurpose: (externalTypeId: string, purpose: ExternalRequestPurpose) =>
        request(`/gestao-fechamentos/pier/type-mappings/${externalTypeId}`, {
          method: "PUT",
          body: JSON.stringify({ purpose }),
        }),
    },
    departmentMappings: {
      list: () =>
        request<import("./types").PierDepartmentMapping[]>(
          "/gestao-fechamentos/pier/department-mappings",
        ),
      ensure: (externalDepartmentIds: Array<string | number>) =>
        request<import("./types").PierDepartmentMapping[]>(
          "/gestao-fechamentos/pier/department-mappings/ensure",
          {
            method: "POST",
            body: JSON.stringify({ externalDepartmentIds }),
          },
        ),
      setName: (externalDepartmentId: string, name: string) =>
        request<import("./types").PierDepartmentMapping>(
          `/gestao-fechamentos/pier/department-mappings/${externalDepartmentId}`,
          {
            method: "PUT",
            body: JSON.stringify({ name }),
          },
        ),
    },
    sync: (companyId: string, competencia: string, mode: "FULL" | "INCREMENTAL" = "FULL") =>
      request<GestaoSyncResult>(`/gestao-fechamentos/companies/${companyId}/sync`, {
        method: "POST",
        body: JSON.stringify({ competencia, mode }),
      }),
    analyzeRequest: (requestId: string) =>
      request<import("./types").RequestAnalysisResult>(
        `/gestao-fechamentos/solicitacoes/${requestId}/analyze`,
        {
          method: "POST",
          body: JSON.stringify({ triggeredBy: "Tela de Gestão de Fechamentos" }),
        },
      ),
    getSnapshot: (companyId: string, competencia: string) =>
      request<CompetenciaSnapshot>(
        `/gestao-fechamentos/companies/${companyId}/competencias/${competencia}`,
      ),
    batchExecutions: {
      preview: (input: CreateBatchExecutionInput) =>
        request<BatchExecutionPreview>("/gestao-fechamentos/batch-executions/preview", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      create: (input: CreateBatchExecutionInput) =>
        request<BatchExecution>("/gestao-fechamentos/batch-executions", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      list: (params: ListBatchExecutionsParams = {}) =>
        request<PagedResult<BatchExecution>>(
          `/gestao-fechamentos/batch-executions${buildQuery(params as Record<string, string | number | undefined>)}`,
        ),
      get: (id: string) => request<BatchExecution>(`/gestao-fechamentos/batch-executions/${id}`),
      listCompanies: (id: string) =>
        request<CompanyExecution[]>(`/gestao-fechamentos/batch-executions/${id}/companies`),
      cancel: (id: string) =>
        request<{ cancelledQueuedItems: number }>(
          `/gestao-fechamentos/batch-executions/${id}/cancel`,
          { method: "POST" },
        ),
      retryFailed: (id: string) =>
        request<BatchExecution>(`/gestao-fechamentos/batch-executions/${id}/retry-failed`, {
          method: "POST",
        }),
      matrix: (competencia: string) =>
        request<MonthlyMatrixRow[]>(
          `/gestao-fechamentos/batch-executions/matrix${buildQuery({ competencia })}`,
        ),
    },
  },
};
