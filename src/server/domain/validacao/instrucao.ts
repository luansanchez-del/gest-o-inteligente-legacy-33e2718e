/**
 * Interpretação da instrução da solicitação.
 *
 * O título traz a competência nominal ("Fechamento Contábil - 01/2026"), mas as
 * postagens podem ampliar ou substituir o período ("de 01.2026 à 05.2026").
 * A instrução mais recente com período explícito vence — o motor nunca reprova
 * apenas porque o documento diverge do título.
 */

export type OrigemInstrucao = "TITLE" | "POST" | "USER";

export interface InstrucaoInterpretada {
  /** Competência inicial AAAA-MM. */
  inicio: string | null;
  /** Competência final AAAA-MM. */
  fim: string | null;
  tipo: "MES" | "INTERVALO" | "INDEFINIDO";
  /** Trecho do texto que gerou a interpretação. */
  trecho: string | null;
}

export interface Instrucao {
  origem: OrigemInstrucao;
  origemExternalId?: string | null;
  ocorridoEm?: string | null;
  texto: string;
  interpretado: InstrucaoInterpretada;
}

const MES_ANO = /(?<![\d./-])(0[1-9]|1[0-2])[./-](20\d{2})(?![\d/-])/g;
const DATA_COMPLETA = /(?<![\d./-])(0?[1-9]|[12]\d|3[01])[./-](0[1-9]|1[0-2])[./-](20\d{2})(?![\d])/g;
const CONECTOR = /\b(?:a|à|as|às|至|ate|até)\b|\.\.\.|—|–|-/i;

function competencia(mes: string, ano: string) {
  return `${ano}-${mes.padStart(2, "0")}`;
}

/** Todas as competências AAAA-MM citadas no texto, na ordem em que aparecem. */
export function extrairCompetencias(texto: string): string[] {
  const encontrados: { indice: number; valor: string }[] = [];

  for (const m of texto.matchAll(DATA_COMPLETA)) {
    encontrados.push({ indice: m.index ?? 0, valor: competencia(m[2]!, m[3]!) });
  }
  // Remove as datas completas antes de procurar MM/AAAA para não contar duas vezes.
  const semDatas = texto.replace(DATA_COMPLETA, (m) => " ".repeat(m.length));
  for (const m of semDatas.matchAll(MES_ANO)) {
    encontrados.push({ indice: m.index ?? 0, valor: competencia(m[1]!, m[2]!) });
  }

  return encontrados.sort((a, b) => a.indice - b.indice).map((e) => e.valor);
}

export function interpretarTexto(texto: string): InstrucaoInterpretada {
  const limpo = (texto ?? "").trim();
  const competencias = extrairCompetencias(limpo);

  if (competencias.length === 0)
    return { inicio: null, fim: null, tipo: "INDEFINIDO", trecho: null };

  const ordenadas = [...competencias].sort();
  const inicio = ordenadas[0]!;
  const fim = ordenadas[ordenadas.length - 1]!;

  if (inicio === fim) return { inicio, fim, tipo: "MES", trecho: limpo.slice(0, 240) };

  const temConector = CONECTOR.test(limpo);
  return {
    inicio,
    fim,
    tipo: temConector ? "INTERVALO" : "INTERVALO",
    trecho: limpo.slice(0, 240),
  };
}

/**
 * Escolhe a instrução efetiva: a postagem mais recente que traga período
 * explícito; se nenhuma trouxer, o título da solicitação.
 */
export function instrucaoEfetiva(instrucoes: Instrucao[]): Instrucao | null {
  if (!instrucoes.length) return null;

  const comPeriodo = instrucoes.filter((i) => i.interpretado.tipo !== "INDEFINIDO");
  const candidatas = comPeriodo.length ? comPeriodo : instrucoes;

  const peso = (i: Instrucao) => (i.origem === "USER" ? 2 : i.origem === "POST" ? 1 : 0);

  return [...candidatas].sort((a, b) => {
    if (peso(a) !== peso(b)) return peso(b) - peso(a);
    const da = a.ocorridoEm ? Date.parse(a.ocorridoEm) : 0;
    const db = b.ocorridoEm ? Date.parse(b.ocorridoEm) : 0;
    return db - da;
  })[0]!;
}

/** Competência (AAAA-MM) de uma data ISO/BR. */
export function competenciaDaData(iso: string | null): string | null {
  if (!iso) return null;
  const br = iso.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}`;
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}
