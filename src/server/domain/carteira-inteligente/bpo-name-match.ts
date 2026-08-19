function texto(v: unknown) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

export function normalizarNomeBpo(v: unknown) {
  return texto(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bcontabilidade\b/g, " ")
    .replace(/\bbpo\b/g, " ")
    .replace(/\bcb\b/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^michelle$/, "michele");
}

export function localizarPerfilBpo<T extends { name?: string | null }>(perfis: T[], nomePlanilha: unknown) {
  const alvo = normalizarNomeBpo(nomePlanilha);
  if (!alvo) return null;
  return perfis.find((p) => normalizarNomeBpo(p.name) === alvo) ?? null;
}
