import type { AppContext } from "../../lib/context";

const PAGINA = 1000;

/**
 * O Data API limita cada resposta a 1.000 linhas. Tabelas de cache do PIER
 * (pier_user, pier_client) têm milhares de registros, então qualquer leitura
 * completa precisa paginar — senão linhas no fim da ordenação simplesmente somem.
 */
export async function carregarTodasAsLinhas<T>(
  ctx: AppContext,
  tabela: "pier_user" | "pier_client",
  colunas: string,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await ctx.db
      .from(tabela)
      .select(colunas)
      .eq("organization_id", ctx.organizationId)
      .order("external_id")
      .range(inicio, inicio + PAGINA - 1);

    if (error) throw error;
    const lote = (data ?? []) as unknown as T[];
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return linhas;
}

export function carregarUsuariosPier<T>(ctx: AppContext, colunas: string) {
  return carregarTodasAsLinhas<T>(ctx, "pier_user", colunas);
}
