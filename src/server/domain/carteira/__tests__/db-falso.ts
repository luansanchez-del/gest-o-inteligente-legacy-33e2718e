import type { AppContext } from "../../../lib/context";

type Linha = Record<string, unknown>;

/**
 * Banco falso, só para teste: registra quais tabelas foram lidas/escritas e
 * aplica os filtros usados pelos serviços (eq/in/ilike/range/limit).
 */
export function criarDbFalso(tabelas: Record<string, Linha[]>) {
  const tabelasLidas: string[] = [];
  const tabelasEscritas: string[] = [];

  function construir(tabela: string) {
    let linhas = [...(tabelas[tabela] ?? [])];
    let unico = false;

    const api = {
      select: () => api,
      order: () => api,
      eq: (coluna: string, valor: unknown) => {
        linhas = linhas.filter((l) => l[coluna] === valor);
        return api;
      },
      in: (coluna: string, valores: unknown[]) => {
        linhas = linhas.filter((l) => valores.includes(l[coluna]));
        return api;
      },
      ilike: (coluna: string, padrao: string) => {
        const alvo = padrao.replace(/%/g, "").toLowerCase();
        linhas = linhas.filter((l) => String(l[coluna] ?? "").toLowerCase().includes(alvo));
        return api;
      },
      range: (de: number, ate: number) => {
        linhas = linhas.slice(de, ate + 1);
        return api;
      },
      limit: (n: number) => {
        linhas = linhas.slice(0, n);
        return api;
      },
      maybeSingle: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
      then: (resolver: (r: { data: Linha[] | null; error: null }) => unknown) =>
        Promise.resolve(resolver({ data: unico ? linhas.slice(0, 1) : linhas, error: null })),
    };
    return api;
  }

  const db = {
    from(tabela: string) {
      return {
        select: (...args: unknown[]) => {
          tabelasLidas.push(tabela);
          return construir(tabela).select(...(args as []));
        },
        insert: () => {
          tabelasEscritas.push(tabela);
          return {
            select: () => ({ single: () => Promise.resolve({ data: { id: "x" }, error: null }) }),
            then: (r: (v: { data: null; error: null }) => unknown) =>
              Promise.resolve(r({ data: null, error: null })),
          };
        },
        upsert: () => {
          tabelasEscritas.push(tabela);
          return {
            select: () => ({ single: () => Promise.resolve({ data: { id: "x" }, error: null }) }),
            then: (r: (v: { data: null; error: null }) => unknown) =>
              Promise.resolve(r({ data: null, error: null })),
          };
        },
        update: () => {
          tabelasEscritas.push(tabela);
          const chain = {
            eq: () => chain,
            then: (r: (v: { data: null; error: null }) => unknown) =>
              Promise.resolve(r({ data: null, error: null })),
          };
          return chain;
        },
        delete: () => {
          tabelasEscritas.push(tabela);
          const chain = {
            eq: () => chain,
            then: (r: (v: { data: null; error: null }) => unknown) =>
              Promise.resolve(r({ data: null, error: null })),
          };
          return chain;
        },
      };
    },
  };

  const ctx = {
    db: db as unknown as AppContext["db"],
    organizationId: "org-1",
    organizationName: "Escritório",
    userId: "user-1",
    roles: ["admin"],
    canWrite: true,
    isAdmin: true,
  } as AppContext;

  return { ctx, tabelasLidas, tabelasEscritas };
}
