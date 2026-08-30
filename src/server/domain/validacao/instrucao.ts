/**
 * Interpretação da instrução da solicitação.
 *
 * O título traz a competência nominal ("Fechamento Contábil - 01/2026"), mas as
 * postagens podem ampliar ou substituir o período ("Período de 01.2026 à 05.2026").
 * A instrução mais recente com período explícito vence — o motor nunca reprova
 * apenas porque o documento diverge do título.
 *
 * Postagens de observação costumam citar datas soltas sem relação com o
 * período do fechamento (ex.: "COFINS em atraso dos meses 01/2026-03/2026",
 * "cliente enviou documentos em 04/2026"). Para não deixar esse ruído virar
 * o período "oficial" da instrução, só contam datas próximas de uma palavra
 * que efetivamente declara período (fechamento/período/competência/etc.).
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
// \b não delimita "à"/"às"/"até" (o "b" de \b usa \w, que não inclui letras
// acentuadas), então essas formas são casadas sem fronteira de palavra.
const CONECTOR = /\ba\b|\bas\b|à|às|至|\bate\b|até|\.\.\.|—|–|-/i;
const PALAVRA_PERIODO = /fech(ament|ar|e|ando)|per[íi]od|compet[êe]nc|encerr|referente|relativo/gi;
/** Raio, em caracteres, em que uma data precisa estar de uma palavra-gatilho para contar como período declarado. */
const JANELA_PALAVRA_PERIODO = 80;

function competencia(mes: string, ano: string) {
  return `${ano}-${mes.padStart(2, "0")}`;
}

/** Máximo de caracteres entre duas datas para considerá-las um par "de X a Y". */
const JANELA_PAR_DE_DATAS = 12;

/**
 * Competências AAAA-MM citadas perto de uma palavra que declara período
 * (fechamento/período/competência/...) OU que formam um par explícito
 * "de X a Y" entre si, na ordem em que aparecem. Datas soltas em outro
 * contexto (pagamento em atraso, documento recebido em tal mês etc.) são
 * ignoradas de propósito — inclusive quando a postagem cita, em outro
 * trecho qualquer, uma palavra-gatilho sem relação com aquela data.
 */
export function extrairCompetencias(texto: string): string[] {
  type Bruta = { indice: number; fim: number; valor: string };
  const brutas: Bruta[] = [];

  for (const m of texto.matchAll(DATA_COMPLETA)) {
    const indice = m.index ?? 0;
    brutas.push({ indice, fim: indice + m[0].length, valor: competencia(m[2]!, m[3]!) });
  }
  // Remove as datas completas antes de procurar MM/AAAA para não contar duas vezes.
  const semDatas = texto.replace(DATA_COMPLETA, (m) => " ".repeat(m.length));
  for (const m of semDatas.matchAll(MES_ANO)) {
    const indice = m.index ?? 0;
    brutas.push({ indice, fim: indice + m[0].length, valor: competencia(m[1]!, m[2]!) });
  }
  brutas.sort((a, b) => a.indice - b.indice);

  const gatilhos = [...texto.matchAll(PALAVRA_PERIODO)].map((m) => m.index ?? 0);
  const pertoDeGatilho = (indice: number) =>
    gatilhos.some((g) => Math.abs(g - indice) <= JANELA_PALAVRA_PERIODO);
  const formamPar = (a: Bruta, b: Bruta) => {
    const entre = texto.slice(a.fim, b.indice);
    return entre.length <= JANELA_PAR_DE_DATAS && CONECTOR.test(entre);
  };

  const relevantes = brutas.filter((data, indice) => {
    if (pertoDeGatilho(data.indice)) return true;
    const anterior = brutas[indice - 1];
    const proxima = brutas[indice + 1];
    return (
      (anterior !== undefined && formamPar(anterior, data)) ||
      (proxima !== undefined && formamPar(data, proxima))
    );
  });

  return relevantes.map((e) => e.valor);
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
