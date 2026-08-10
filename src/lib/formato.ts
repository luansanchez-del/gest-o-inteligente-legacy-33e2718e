export function formatarData(valor: string | null | undefined): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatarDataHora(valor: string | null | undefined): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarCnpj(valor: string | null | undefined): string {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (digitos.length !== 14) return valor || "—";
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function formatarPercentual(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return `${(valor * 100).toFixed(1).replace(".", ",")}%`;
}

export function formatarCompetencia(valor: string | null | undefined): string {
  if (!valor || !/^\d{4}-\d{2}$/.test(valor)) return valor || "—";
  const [ano, mes] = valor.split("-");
  return `${mes}/${ano}`;
}

export function competenciaAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

export function competenciaDeslocada(meses: number): string {
  const hoje = new Date();
  hoje.setMonth(hoje.getMonth() + meses);
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}
