/**
 * Parser de balancete em PDF textual.
 *
 * Trabalha apenas sobre o texto já extraído (uma string por página), o que
 * mantém o módulo puro e testável sem depender do runtime de PDF.
 */

export interface LinhaBalancete {
  codigo: string;
  nome: string;
  nivel: number;
  raiz: string;
  saldoAnterior: number;
  debito: number;
  credito: number;
  movimento: number | null;
  saldoAtual: number;
  analitica: boolean;
  pagina: number;
  textoOriginal: string;
}

export interface LinhaNaoInterpretada {
  pagina: number;
  texto: string;
  motivo: string;
}

export interface BalanceteDocumento {
  empresa: string | null;
  cnpj: string | null;
  emissaoEm: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  paginas: number;
  colunasDetectadas: string[];
  linhas: LinhaBalancete[];
  naoInterpretadas: LinhaNaoInterpretada[];
}

const VALOR = /\(?-?\d{1,3}(?:\.\d{3})*,\d{2}\)?\s?[CD]?/g;
const CODIGO_LINHA = /^(\d(?:\.\d+)*)\s+(.+)$/;
const CNPJ = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/;
const DATA = /(\d{2}\/\d{2}\/\d{4})/g;

/**
 * Converte "1.688.184,24", "(448.800,00)" ou "12,34 C" em número.
 * Parênteses e sinal "-" representam valor negativo.
 */
export function parseValorBR(bruto: string): number {
  const texto = bruto.trim();
  const negativo = /^\(.*\)?\s?[CD]?$/.test(texto) || texto.startsWith("-");
  const limpo = texto
    .replace(/[()]/g, "")
    .replace(/\s?[CD]$/, "")
    .replace(/-/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const numero = Number(limpo);
  if (!Number.isFinite(numero)) return Number.NaN;
  return negativo ? -numero : numero;
}

export function formatarBR(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function extrairValores(trecho: string): { valores: number[]; brutos: string[] } {
  const brutos = trecho.match(VALOR) ?? [];
  return { brutos, valores: brutos.map(parseValorBR) };
}

function nivelDoCodigo(codigo: string) {
  return codigo.split(".").filter(Boolean).length;
}

function detectarColunas(texto: string): string[] {
  const colunas: string[] = [];
  const t = texto.toLowerCase();
  if (t.includes("saldo anterior")) colunas.push("Saldo Anterior");
  if (/\bd[ée]bito/.test(t)) colunas.push("Débito");
  if (/\bcr[ée]dito/.test(t)) colunas.push("Crédito");
  if (/\bmovimento/.test(t)) colunas.push("Movimento");
  if (/saldo\s+(atual|final)/.test(t)) colunas.push("Saldo Atual");
  return colunas;
}

function limparNome(nome: string) {
  return nome.replace(/\s{2,}/g, " ").replace(/[.\s]+$/, "").trim();
}

export function parseBalancete(paginas: string[]): BalanceteDocumento {
  const linhas: LinhaBalancete[] = [];
  const naoInterpretadas: LinhaNaoInterpretada[] = [];
  const colunas = new Set<string>();

  let empresa: string | null = null;
  let cnpj: string | null = null;
  let emissaoEm: string | null = null;
  let periodoInicio: string | null = null;
  let periodoFim: string | null = null;

  paginas.forEach((pagina, indice) => {
    const numeroPagina = indice + 1;
    for (const coluna of detectarColunas(pagina)) colunas.add(coluna);

    const linhasTexto = pagina.split(/\r?\n/);

    linhasTexto.forEach((bruta, posicao) => {
      const texto = bruta.replace(/\u00a0/g, " ").trim();
      if (!texto) return;

      if (!cnpj) {
        const achado = texto.match(CNPJ);
        if (achado) {
          cnpj = achado[1]!.replace(/\D/g, "");
          if (!empresa) {
            const antes = texto.slice(0, achado.index ?? 0).replace(/CNPJ:?/i, "").trim();
            const anterior = linhasTexto[posicao - 1]?.trim() ?? "";
            empresa = limparNome(antes.length > 3 ? antes : anterior) || null;
          }
        }
      }

      if (!periodoInicio && /per[íi]odo/i.test(texto)) {
        const datas = texto.match(DATA);
        if (datas?.length) {
          periodoInicio = datas[0]!;
          periodoFim = datas[1] ?? datas[0]!;
        }
      }

      if (!emissaoEm && /emiss[ãa]o|impress[ãa]o/i.test(texto)) {
        const datas = texto.match(DATA);
        if (datas?.length) emissaoEm = datas[datas.length - 1]!;
      }

      const casamento = texto.match(CODIGO_LINHA);
      if (!casamento) return;

      const codigo = casamento[1]!;
      const resto = casamento[2]!;
      const { valores, brutos } = extrairValores(resto);

      if (valores.length < 3) {
        if (/\d,\d{2}/.test(resto))
          naoInterpretadas.push({
            pagina: numeroPagina,
            texto: texto.slice(0, 200),
            motivo: "Menos de três colunas numéricas reconhecidas.",
          });
        return;
      }
      if (valores.some((v) => Number.isNaN(v))) {
        naoInterpretadas.push({
          pagina: numeroPagina,
          texto: texto.slice(0, 200),
          motivo: "Valor numérico fora do padrão pt-BR.",
        });
        return;
      }

      const primeiroValor = resto.indexOf(brutos[0]!);
      const nome = limparNome(resto.slice(0, primeiroValor));
      if (!nome) {
        naoInterpretadas.push({
          pagina: numeroPagina,
          texto: texto.slice(0, 200),
          motivo: "Descrição da conta não identificada.",
        });
        return;
      }

      let saldoAnterior: number;
      let debito: number;
      let credito: number;
      let movimento: number | null = null;
      let saldoAtual: number;

      if (valores.length >= 5) {
        [saldoAnterior, debito, credito, movimento] = [
          valores[0]!,
          valores[1]!,
          valores[2]!,
          valores[3]!,
        ];
        saldoAtual = valores[4]!;
      } else if (valores.length === 4) {
        [saldoAnterior, debito, credito, saldoAtual] = [
          valores[0]!,
          valores[1]!,
          valores[2]!,
          valores[3]!,
        ];
      } else {
        saldoAnterior = 0;
        [debito, credito, saldoAtual] = [valores[0]!, valores[1]!, valores[2]!];
      }

      linhas.push({
        codigo,
        nome,
        nivel: nivelDoCodigo(codigo),
        raiz: codigo.split(".")[0]!,
        saldoAnterior,
        debito,
        credito,
        movimento,
        saldoAtual,
        analitica: true,
        pagina: numeroPagina,
        textoOriginal: texto.slice(0, 240),
      });
    });
  });

  // Sintética = existe outra conta cujo código começa com "codigo."
  const codigos = linhas.map((l) => l.codigo);
  for (const linha of linhas) {
    linha.analitica = !codigos.some((c) => c !== linha.codigo && c.startsWith(`${linha.codigo}.`));
  }

  return {
    empresa,
    cnpj,
    emissaoEm,
    periodoInicio,
    periodoFim,
    paginas: paginas.length,
    colunasDetectadas: [...colunas],
    linhas,
    naoInterpretadas,
  };
}
