/**
 * Extração de texto de PDF no servidor (runtime Worker).
 * Reconstrói as linhas a partir da posição vertical dos itens de texto,
 * porque o parser do balancete depende da quebra de linha real.
 *
 * O pdf.js (via unpdf) pode devolver `transform` como Array, Float32Array ou
 * objeto array-like. Nenhum item de texto pode ser descartado por causa disso:
 * quando não houver coordenadas utilizáveis, caímos para a concatenação simples
 * usando `hasEOL` como quebra de linha.
 */

interface ItemTexto {
  str?: string;
  hasEOL?: boolean;
  transform?: unknown;
}

export interface PdfExtraido {
  paginas: string[];
  totalPaginas: number;
}

/** Aceita Array, TypedArray e array-like; devolve null quando não há coordenadas. */
export function normalizarTransform(transform: unknown): number[] | null {
  if (transform == null || typeof transform !== "object") return null;
  const bruto = transform as ArrayLike<unknown>;
  const tamanho = typeof bruto.length === "number" ? bruto.length : 0;
  if (tamanho < 6) return null;
  const valores: number[] = [];
  for (let i = 0; i < 6; i++) {
    const n = Number(bruto[i]);
    if (!Number.isFinite(n)) return null;
    valores.push(n);
  }
  return valores;
}

/** Reconstrói o texto de uma página a partir dos itens do pdf.js. */
export function montarTextoDaPagina(itens: ItemTexto[]): string {
  const comTexto = itens.filter((i) => typeof i?.str === "string");
  if (!comTexto.length) return "";

  const posicionados = comTexto
    .map((item) => ({ item, transform: normalizarTransform(item.transform) }))
    .filter((i): i is { item: ItemTexto; transform: number[] } => i.transform !== null);

  // Fallback seguro: sem coordenadas utilizáveis, concatena respeitando hasEOL.
  if (!posicionados.length) {
    const texto = comTexto
      .map((i) => (i.hasEOL ? `${i.str}\n` : i.str))
      .join("")
      .replace(/[ \t]{2,}/g, " ");
    return texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");
  }

  const porLinha = new Map<number, { x: number; str: string }[]>();
  for (const { item, transform } of posicionados) {
    const y = Math.round((transform[5] ?? 0) * 2) / 2;
    const registro = { x: transform[4] ?? 0, str: item.str ?? "" };
    const lista = porLinha.get(y);
    if (lista) lista.push(registro);
    else porLinha.set(y, [registro]);
  }

  return [...porLinha.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, itensDaLinha]) =>
      itensDaLinha
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

export async function extrairTextoPdf(bytes: Uint8Array): Promise<PdfExtraido> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const paginas: string[] = [];

  for (let numero = 1; numero <= pdf.numPages; numero++) {
    const page = await pdf.getPage(numero);
    const conteudo = (await page.getTextContent()) as { items?: unknown[] };
    const itens = Array.isArray(conteudo?.items) ? (conteudo.items as ItemTexto[]) : [];
    paginas.push(montarTextoDaPagina(itens));
  }

  return { paginas, totalPaginas: pdf.numPages };
}
