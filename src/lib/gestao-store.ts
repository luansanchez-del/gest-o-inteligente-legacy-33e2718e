import type { ManagementFilters } from "@/lib/api-client";

const KEY = "gestao-atual";

export interface GestaoAtual {
  id: string;
  startedAt: string;
  filters: ManagementFilters;
}

export function salvarGestao(gestao: GestaoAtual) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(gestao));
}

export function carregarGestao(): GestaoAtual | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GestaoAtual;
  } catch {
    return null;
  }
}
