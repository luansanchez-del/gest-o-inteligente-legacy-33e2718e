/** Formatação pt-BR para valores monetários e datas usadas na interface. Puramente apresentacional — nunca recalcula nada que já vem do backend. */

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Não disponível";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(numeric)) return "Não disponível";
  return currencyFormatter.format(numeric);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Não disponível";
  return numberFormatter.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Não disponível";
  return `${Math.round(value)}%`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Não informado";
  return new Date(value).toLocaleString("pt-BR");
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Não informado";
  return new Date(value).toLocaleDateString("pt-BR");
}

/** "2026-06-01T00:00:00.000Z" (referencePeriod) -> "06/2026". Lê ano/mês em UTC — o backend sempre grava o dia 1 em UTC, então usar métodos locais poderia "voltar" um mês conforme o fuso do navegador. */
export function formatCompetencia(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${month}/${date.getUTCFullYear()}`;
}

/** "2026-06-01T00:00:00.000Z" -> "2026-06" (o formato que <input type="month"> espera/devolve). */
export function toMonthInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

/** CNPJ de 14 dígitos -> "XX.XXX.XXX/XXXX-XX". Documentos fora desse padrão (ex.: CPF, placeholder) voltam como digitados — nunca inventamos máscara para um formato que não reconhecemos. */
export function formatCnpj(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return value;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}
