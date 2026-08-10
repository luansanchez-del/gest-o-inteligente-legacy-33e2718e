import { useQuery } from "@tanstack/react-query";
import {
  listCompanies,
  listClosingPeriods,
  listRequests,
  listPendencies,
  listBatchExecutions,
} from "@/lib/api-client";

export function useCompanies() {
  return useQuery({ queryKey: ["companies"], queryFn: listCompanies });
}

export function useClosingPeriods() {
  return useQuery({ queryKey: ["closing-periods"], queryFn: listClosingPeriods });
}

export function useRequests() {
  return useQuery({ queryKey: ["requests"], queryFn: listRequests });
}

export function usePendencies() {
  return useQuery({ queryKey: ["pendencies"], queryFn: listPendencies });
}

export function useBatchExecutions() {
  return useQuery({ queryKey: ["batch-executions"], queryFn: listBatchExecutions });
}

export function useDominio() {
  const companies = useCompanies();
  const periods = useClosingPeriods();
  const requests = useRequests();
  const pendencies = usePendencies();

  return {
    companies: companies.data ?? [],
    periods: periods.data ?? [],
    requests: requests.data ?? [],
    pendencies: pendencies.data ?? [],
    isLoading:
      companies.isLoading || periods.isLoading || requests.isLoading || pendencies.isLoading,
  };
}
