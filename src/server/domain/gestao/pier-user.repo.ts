import type { AppContext } from "../../lib/context";

const PAGINA = 1000;

/**
 * O Data API limita cada resposta a 1.000 linhas. A tabela pier_user tem
 * milhares de registros (inclusive usuários "Cliente"), então qualquer leitura
 * precisa paginar — senão usuários no fim da ordenação simplesmente somem.
 */
export async function carregarUsuariosPier<T>(
  ctx: AppContext,
  colunas: string,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await ctx.db
      .from("pier_user")
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
