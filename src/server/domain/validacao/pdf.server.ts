/**
 * Extração de texto de PDF no servidor.
 *
 * Usa apenas as APIs públicas do unpdf. extractTextItems preserva as posições
 * necessárias para reconstruir as linhas do balancete; extractText é o fallback
 * quando um PDF não fornece coordenadas utilizáveis.
 */

import { parseBalancete } from "./balancete.parser";

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
  fontSize?: number;
  height?: number;
  width?: number;
  dir?: string;
}

type ItemPosicionado = ItemEstruturado & { str: string; x: number; y: number };

interface GrupoLinha {
  coordenada: number;
  tolerancia: number;
  itens: ItemPosicionado[];
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

/**
 * O unpdf fornece o tamanho da fonte de cada item. A tolerância proporcional
 * evita quebrar uma mesma linha quando o gerador do PDF desloca alguns itens
 * por décimos de ponto, sem juntar linhas vizinhas de fontes maiores.
 */
export function toleranciaLinha(item: ItemEstruturado): number {
  const fontSize = Number(item.fontSize);
  if (!Number.isFinite(fontSize) || fontSize <= 0) return 1.5;
  return Math.min(4, Math.max(0.75, Math.abs(fontSize) * 0.35));
}

function agruparPorEixo(itens: ItemPosicionado[], eixo: "x" | "y"): GrupoLinha[] {
  const ordenados = [...itens].sort((a, b) => a[eixo] - b[eixo]);
  const grupos: GrupoLinha[] = [];

  for (const item of ordenados) {
    const coordenada = item[eixo];
    const tolerancia = toleranciaLinha(item);
    let melhor: GrupoLinha | null = null;
    let menorDistancia = Number.POSITIVE_INFINITY;

    for (const grupo of grupos) {
      const distancia = Math.abs(coordenada - grupo.coordenada);
      if (distancia <= Math.max(tolerancia, grupo.tolerancia) && distancia < menorDistancia) {
        melhor = grupo;
        menorDistancia = distancia;
      }
    }

    if (!melhor) {
      grupos.push({ coordenada, tolerancia, itens: [item] });
      continue;
    }

    melhor.itens.push(item);
    melhor.tolerancia = Math.max(melhor.tolerancia, tolerancia);
    melhor.coordenada =
      melhor.itens.reduce((soma, atual) => soma + atual[eixo], 0) / melhor.itens.length;
  }

  return grupos;
}

function montarOrientacao(itens: ItemPosicionado[], eixoDaLinha: "x" | "y"): string {
  const eixoDaColuna: "x" | "y" = eixoDaLinha === "x" ? "y" : "x";
  const grupos = agruparPorEixo(itens, eixoDaLinha);
  const direcaoDasLinhas = eixoDaLinha === "x" ? 1 : -1;

  return grupos
    .sort((a, b) => (a.coordenada - b.coordenada) * direcaoDasLinhas)
    .map((grupo) =>
      grupo.itens
        .sort((a, b) => a[eixoDaColuna] - b[eixoDaColuna])
        .map((item) => item.str)
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

function pontuarOrientacao(texto: string): number {
  if (!texto.trim()) return 0;
  return parseBalancete([texto]).integridadeValores.capturados;
}

/** Converte a estrutura pública do unpdf no formato do reconstrutor de linhas. */
export function montarTextoDeItensEstruturados(itens: ItemEstruturado[]): string {
  const posicionados = itens.filter(
    (item): item is ItemPosicionado =>
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

  const contarGruposDeLinha = (eixo: "x" | "y") =>
    agruparPorEixo(posicionados, eixo).filter((grupo) => grupo.itens.length >= 3).length;

  const gruposX = contarGruposDeLinha("x");
  const gruposY = contarGruposDeLinha("y");

  // Página normal: Y claramente representa as linhas. Sai direto sem montar
  // uma segunda orientação, preservando o caminho barato do caso comum.
  if (gruposX <= gruposY) return montarOrientacao(posicionados, "y");

  // Quando X parece ser o eixo das linhas, há dois casos: página realmente
  // rotacionada ou layout transposto pelo gerador. Em vez de apostar na
  // geometria, monta as duas leituras e fica com a que efetivamente entrega
  // mais valores monetários dentro de linhas contábeis reconhecidas.
  const porX = montarOrientacao(posicionados, "x");
  const porY = montarOrientacao(posicionados, "y");
  return pontuarOrientacao(porY) > pontuarOrientacao(porX) ? porY : porX;
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

/** Abaixo disso, a extração "simples" perdeu valores demais — tenta a posicional. */
const LIMIAR_INTEGRIDADE_EXTRACAO = 0.85;

/**
 * Alguns geradores de balancete emitem, no stream do PDF, os campos de cada
 * linha fora de ordem e sem espaço entre eles (ex.: "463.480,32(16.315,86)
 * ...ATIVO1S1" em vez de "1 S 1 ATIVO ... 463.480,32"). `extractText` segue
 * a ordem do stream e produz esse texto colado; `textoTemColunasInvertidas`
 * só pega esse caso quando cabeçalho e dados ficam numa única linha, o que
 * nem sempre acontece. Reaproveita a mesma checagem de integridade do
 * validador (valores no texto bruto vs. valores capturados em alguma linha)
 * para decidir isso de forma mais geral: se a extração simples perdeu
 * valores demais, tenta a extração posicional (ordena por coordenada X/Y,
 * não pela ordem do stream) e fica com a que capturar mais.
 */
function razaoIntegridade(paginas: string[]): number {
  if (!paginas.some((pagina) => pagina.trim())) return 0;
  return parseBalancete(paginas).integridadeValores.razao;
}

export async function extrairTextoPdf(bytes: Uint8Array): Promise<PdfExtraido> {
  const { extractText, extractTextItems } = await import("unpdf");

  // Fonte principal: o extrator textual oficial preserva as quebras de linha
  // do relatório. Validado com o PDF real do piloto 35806843.
  const simples = await extractText(new Uint8Array(bytes), { mergePages: false });
  const paginasSimples = Array.isArray(simples.text) ? simples.text : [simples.text];
  const integridadeSimples = razaoIntegridade(paginasSimples);
  if (
    paginasSimples.some((pagina) => pagina.trim()) &&
    !textoTemColunasInvertidas(paginasSimples) &&
    integridadeSimples >= LIMIAR_INTEGRIDADE_EXTRACAO
  ) {
    return { paginas: paginasSimples, totalPaginas: simples.totalPages };
  }

  // Fallback: extração posicional (ordena os itens por coordenada, não pela
  // ordem do stream do PDF) — mais robusta a coluna colada/fora de ordem.
  const estruturado = await extractTextItems(new Uint8Array(bytes));
  const paginasPosicional = estruturado.items.map((itens) =>
    montarTextoDeItensEstruturados(itens as ItemEstruturado[]),
  );

  // Se a posicional não sair melhor que a simples (ex.: PDF sem coordenadas
  // utilizáveis), fica com a que capturou mais — nunca troca por algo pior.
  if (razaoIntegridade(paginasPosicional) < integridadeSimples) {
    return { paginas: paginasSimples, totalPaginas: simples.totalPages };
  }
  return { paginas: paginasPosicional, totalPaginas: estruturado.totalPages };
}
