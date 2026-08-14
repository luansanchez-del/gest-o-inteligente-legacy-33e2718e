/**
 * Extração de texto de PDF no servidor.
 *
 * Usa apenas as APIs públicas do unpdf. extractTextItems preserva as posições
 * necessárias para reconstruir as linhas do balancete; extractText é o fallback
 * quando um PDF não fornece coordenadas utilizáveis.
 */

interface ItemTexto {
  str?: string;
  hasEOL?: boolean;
  transform?: unknown;
}

interface ItemEstruturado {
  str?: string;
  x?: number;
  y?: number;
  hasEOL?: boolean;
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
  const comTexto = itens.filter((i) => typeof i?.str === "string" && i.str.length > 0);
  if (!comTexto.length) return "";

  const posicionados = comTexto
    .map((item) => ({ item, transform: normalizarTransform(item.transform) }))
    .filter((i): i is { item: ItemTexto; transform: number[] } => i.transform !== null);

  if (!posicionados.length) {
    const texto = comTexto
      .map((i) => (i.hasEOL ? `${i.str}\n` : i.str))
      .join(" ")
      .replace(/[ \t]{2,}/g, " ");
    return texto
      .split("\n")
      .map((linha) => linha.trim())
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
        .map((item) => item.str)
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

/** Converte a estrutura pública do unpdf no formato do reconstrutor de linhas. */
export function montarTextoDeItensEstruturados(itens: ItemEstruturado[]): string {
  const posicionados = itens.filter(
    (item): item is ItemEstruturado & { str: string; x: number; y: number } =>
      typeof item.str === "string" &&
      item.str.length > 0 &&
      typeof item.x === "number" &&
      Number.isFinite(item.x) &&
      typeof item.y === "number" &&
      Number.isFinite(item.y),
  );

  if (!posicionados.length) {
    return montarTextoDaPagina(itens.map((item) => ({ str: item.str, hasEOL: item.hasEOL })));
  }

  const contarGruposDeLinha = (eixo: "x" | "y") => {
    const grupos = new Map<number, number>();
    for (const item of posicionados) {
      const coordenada = Math.round(item[eixo] * 2) / 2;
      grupos.set(coordenada, (grupos.get(coordenada) ?? 0) + 1);
    }
    return [...grupos.values()].filter((quantidade) => quantidade >= 3).length;
  };

  // Em PDFs rotacionados em 90 graus, o pdf.js troca o papel prático dos
  // eixos: as células de uma mesma linha compartilham X, e não Y.
  const eixoDaLinha: "x" | "y" =
    contarGruposDeLinha("x") > contarGruposDeLinha("y") ? "x" : "y";
  const eixoDaColuna: "x" | "y" = eixoDaLinha === "x" ? "y" : "x";
  const porLinha = new Map<number, typeof posicionados>();

  for (const item of posicionados) {
    const coordenada = Math.round(item[eixoDaLinha] * 2) / 2;
    const lista = porLinha.get(coordenada);
    if (lista) lista.push(item);
    else porLinha.set(coordenada, [item]);
  }

  const direcaoDasLinhas = eixoDaLinha === "x" ? 1 : -1;
  return [...porLinha.entries()]
    .sort((a, b) => (a[0] - b[0]) * direcaoDasLinhas)
    .map(([, linha]) =>
      linha
        .sort((a, b) => a[eixoDaColuna] - b[eixoDaColuna])
        .map((item) => item.str)
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

function textoTemColunasInvertidas(paginas: string[]): boolean {
  return paginas.some((pagina) => {
    const cabecalho = pagina
      .split(/\r?\n/)
      .find((linha) => /conta cont[áa]bil/i.test(linha) && /saldo (atual|final)/i.test(linha));
    if (!cabecalho) return false;
    return cabecalho.search(/saldo (atual|final)/i) < cabecalho.search(/conta cont[áa]bil/i);
  });
}

export async function extrairTextoPdf(bytes: Uint8Array): Promise<PdfExtraido> {
  const { extractText, extractTextItems } = await import("unpdf");

  // Fonte principal: o extrator textual oficial preserva as quebras de linha
  // do relatório. Validado com o PDF real do piloto 35806843.
  const simples = await extractText(new Uint8Array(bytes), { mergePages: false });
  const paginasSimples = Array.isArray(simples.text) ? simples.text : [simples.text];
  if (
    paginasSimples.some((pagina) => pagina.trim()) &&
    !textoTemColunasInvertidas(paginasSimples)
  ) {
    return { paginas: paginasSimples, totalPaginas: simples.totalPages };
  }

  // Fallback para PDFs que só disponibilizam itens posicionados.
  const estruturado = await extractTextItems(new Uint8Array(bytes));
  const paginas = estruturado.items.map((itens) =>
    montarTextoDeItensEstruturados(itens as ItemEstruturado[]),
  );
  return { paginas, totalPaginas: estruturado.totalPages };
}
