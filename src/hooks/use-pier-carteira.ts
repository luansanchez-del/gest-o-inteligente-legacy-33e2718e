import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/legacy/api/client";
import type { Company, PierClienteCache } from "@/legacy/api/types";

export type FiltrosCarteira = {
  search?: string;
  status?: string;
  tributacao?: string;
};

export type SituacaoVinculo = "VINCULADO" | "SEM_EMPRESA_LOCAL" | "NAO_IDENTIFICADO";

export type LinhaCarteira = {
  cliente: PierClienteCache;
  empresaLocal: Company | null;
  situacao: SituacaoVinculo;
};

export function somenteDigitos(valor: string | null | undefined) {
  return (valor ?? "").replace(/\D/g, "");
}

/** Lê a base local de clientes do PIER (nunca chama o PIER direto do navegador). */
export function useClientesCache(filtros: FiltrosCarteira) {
  return useQuery({
    queryKey: ["pier", "clientes-cache", filtros],
    queryFn: () =>
      api.gestaoFechamentos.pier.clientesCache.list({
        search: filtros.search || undefined,
        status: filtros.status || undefined,
        tributacao: filtros.tributacao || undefined,
      }),
  });
}

export function useUltimaSincronizacao() {
  return useQuery({
    queryKey: ["pier", "clientes-cache", "last-synced-at"],
    queryFn: () => api.gestaoFechamentos.pier.clientesCache.lastSyncedAt(),
  });
}

export function useEmpresasLocais() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: () => api.companies.list(),
  });
}

/** Cruza cache do PIER com empresas locais pelo documento normalizado. */
export function montarLinhas(
  clientes: PierClienteCache[],
  empresas: Company[],
): LinhaCarteira[] {
  const porDocumento = new Map<string, Company>();
  for (const empresa of empresas) {
    const doc = somenteDigitos(empresa.document);
    if (doc) porDocumento.set(doc, empresa);
  }

  return clientes.map((cliente) => {
    const doc = somenteDigitos(cliente.documento);
    if (!doc) return { cliente, empresaLocal: null, situacao: "NAO_IDENTIFICADO" as const };
    const empresaLocal = porDocumento.get(doc) ?? null;
    return {
      cliente,
      empresaLocal,
      situacao: empresaLocal ? ("VINCULADO" as const) : ("SEM_EMPRESA_LOCAL" as const),
    };
  });
}

export function useAcoesCarteira() {
  const queryClient = useQueryClient();
  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["pier", "clientes-cache"] });
    queryClient.invalidateQueries({ queryKey: ["companies"] });
  };

  const sincronizar = useMutation({
    mutationFn: () => api.gestaoFechamentos.pier.clientesCache.sync(),
    onSuccess: invalidar,
  });

  const importar = useMutation({
    mutationFn: (cliente: PierClienteCache) =>
      api.gestaoFechamentos.pier.importCliente(Number(cliente.externalId)),
    onSuccess: invalidar,
  });

  const importarTodos = useMutation({
    mutationFn: () => api.gestaoFechamentos.pier.importAllClientes(),
    onSuccess: invalidar,
  });

  const vincular = useMutation({
    mutationFn: (companyId: string) => api.gestaoFechamentos.pier.link(companyId),
    onSuccess: invalidar,
  });

  return { sincronizar, importar, importarTodos, vincular };
}
