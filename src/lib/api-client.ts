// ÚNICO PONTO DE TROCA: hoje devolve dados fictícios; amanhã chama a API REST (NestJS).
// Basta reimplementar as funções abaixo com fetch(`${API_BASE_URL}/...`).

import {
  companies,
  closingPeriods,
  externalRequests,
  pendencies,
  batchExecutions,
  availableMonths,
  type BatchExecution,
  type ClosingPeriod,
  type Company,
  type ExternalRequest,
  type Pendency,
} from "./mock-data";

export const API_BASE_URL = "/api";
const USE_MOCK = true;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 120));
}

export async function listCompanies(): Promise<Company[]> {
  if (!USE_MOCK) return fetch(`${API_BASE_URL}/companies`).then((r) => r.json());
  return delay(companies);
}

export async function listClosingPeriods(): Promise<ClosingPeriod[]> {
  if (!USE_MOCK) return fetch(`${API_BASE_URL}/closing-periods`).then((r) => r.json());
  return delay(closingPeriods);
}

export async function listRequests(): Promise<ExternalRequest[]> {
  if (!USE_MOCK) return fetch(`${API_BASE_URL}/external-requests`).then((r) => r.json());
  return delay(externalRequests);
}

export async function listPendencies(): Promise<Pendency[]> {
  if (!USE_MOCK) return fetch(`${API_BASE_URL}/pendencies`).then((r) => r.json());
  return delay(pendencies);
}

export async function listBatchExecutions(): Promise<BatchExecution[]> {
  if (!USE_MOCK) return fetch(`${API_BASE_URL}/batch-executions`).then((r) => r.json());
  return delay(batchExecutions);
}

export async function listMonths(): Promise<string[]> {
  return delay(availableMonths);
}

export async function linkCompanyToPier(companyId: string): Promise<Company> {
  const company = companies.find((c) => c.id === companyId);
  if (!company) throw new Error("Empresa não encontrada");
  company.linkedToPier = true;
  return delay(company);
}

export interface ManagementFilters {
  companyIds: string[];
  responsibles: string[];
  requestTypes: string[];
  referenceMonth: string | null;
}

export async function startManagement(filters: ManagementFilters) {
  return delay({ id: `gestao-${Date.now()}`, startedAt: new Date().toISOString(), filters });
}

export type { BatchExecution, ClosingPeriod, Company, ExternalRequest, Pendency };
