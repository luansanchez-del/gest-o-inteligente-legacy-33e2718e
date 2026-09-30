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
  /** Número interno de conta do sistema contábil, quando o layout traz. */
  contaInterna: string | null;

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
  /**
   * Sanidade da extração: quantos valores monetários existem no texto bruto
   * do PDF vs. quantos acabaram dentro de alguma linha capturada. Alguns
   * geradores de balancete emitem a coluna de descrição como um bloco de
   * texto contínuo separado das colunas numéricas — nesse caso a linha
   * inteira falha silenciosamente em casar com o padrão de código no início
   * e some sem deixar rastro em `naoInterpretadas`. Uma razão baixa aqui é
   * o único sinal de que isso aconteceu.
   */
  integridadeValores: { brutos: number; capturados: number; razao: number };
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

interface InicioDeLinha {
  /** Classificação contábil (ex.: 1.1.01.001.001). */
  codigo: string;
  /** Número interno de conta do sistema contábil, quando presente. */
  contaInterna: string | null;
  /** true = sintética (marcador "S"), false = analítica (marcador "A"), null = inferir. */
  sintetica: boolean | null;
  /** Restante da linha (nome + valores). */
  resto: string;
}

/**
 * Layout (c): "Conta S Descrição Saldo Ant. Débito Crédito Saldo" — só o
 * número interno da conta e o marcador "S" das sintéticas, sem nenhuma
 * classificação (ex.: "1 S ATIVO ...", "5 Caixa ..."). A hierarquia só
 * existe pela ordem das linhas; ela é reconstruída depois, pelas somas.
 * Sem detectar isso no documento inteiro, "1 S ATIVO" cairia no layout (a)
 * com o número interno lido como classificação.
 */
export function layoutSemClassificacao(paginas: string[]): boolean {
  let sinteticasSemClassificacao = 0;
  for (const pagina of paginas) {
    for (const bruta of pagina.split(/\r?\n/)) {
      const texto = bruta.replace(/ /g, " ").trim();
      if (
        /^\d+(?:\.\d+)+\s/.test(texto) ||
        /^\d+\s+(?:[SA]\s+)?\d+(?:\.\d+)+\s/.test(texto) ||
        /^\d+\s+[SA]\s+\d+\s+\D/.test(texto)
      )
        return false;
      if (/^\d+\s+S\s+\D/.test(texto)) sinteticasSemClassificacao++;
    }
  }
  return sinteticasSemClassificacao > 0;
}

/**
 * Suporta três layouts encontrados nos balancetes:
 *  a) "1.1.1.01.0001 CAIXA GERAL 1.688,24 ..."  → classificação no início
 *  b) "5   1.1.01.001.001 Caixa ..." ou "1 S 1 ATIVO ..." → conta interna,
 *     marcador sintético opcional (S/A) e então a classificação.
 *  c) "1 S ATIVO ..." / "5 Caixa ..." → conta interna e marcador, sem
 *     classificação (só quando `semClassificacao`; ver layoutSemClassificacao).
 */
export function interpretarInicioDaLinha(
  texto: string,
  semClassificacao = false,
): InicioDeLinha | null {
  if (semClassificacao) {
    // A descrição pode começar com dígito ("13º Salário"), só não com valor.
    const m = texto.match(/^(\d+)\s+(?:(S)\s+)?(?!\(?-?\d{1,3}(?:\.\d{3})*,\d{2})(\S.*)$/);
    if (!m) return null;
    // Código provisório: a classificação é montada em inferirHierarquia.
    return { codigo: m[1]!, contaInterna: m[1]!, sintetica: m[2] === "S", resto: m[3]! };
  }


  // (b) conta interna + marcador S/A + classificação
  const comMarcador = texto.match(/^(\d+)\s+([SA])\s+(\d+(?:\.\d+)*)\s+(\D.*)$/);
  if (comMarcador) {
    return {
      codigo: comMarcador[3]!,
      contaInterna: comMarcador[1]!,
      sintetica: comMarcador[2] === "S",
      resto: comMarcador[4]!,
    };
  }

  // (b) conta interna + classificação com separadores, sem marcador
  const semMarcador = texto.match(/^(\d+)\s+(\d+(?:\.\d+)+)\s+(\D.*)$/);
  if (semMarcador) {
    return {
      codigo: semMarcador[2]!,
      contaInterna: semMarcador[1]!,
      sintetica: null,
      resto: semMarcador[3]!,
    };
  }

  // (a) classificação diretamente no início
  const direto = texto.match(CODIGO_LINHA);
  if (direto) {
    return { codigo: direto[1]!, contaInterna: null, sintetica: null, resto: direto[2]! };
  }
  return null;
}

function emCentavos(l: LinhaBalancete): number[] {
  return [l.saldoAnterior, l.debito, l.credito, l.saldoAtual].map((v) => Math.round(v * 100));
}

/**
 * Reconstrói a classificação do layout (c) pela própria aritmética do
 * balancete: cada sintética é a soma das linhas que vêm logo abaixo dela, nas
 * quatro colunas. Uma sintética fica "aberta" recebendo filhas até a soma
 * delas bater com os seus valores; aí fecha e a próxima linha passa a ser
 * irmã dela. A classificação gerada (1, 1.1, 1.1.2...) é sequencial e serve só
 * para hierarquia/nível/raiz — a identidade da conta continua em contaInterna.
 *
 * Sintética que não fecha é devolvida para virar "linha não interpretada":
 * nesse caso a hierarquia abaixo dela pode estar errada e isso não pode
 * passar em silêncio.
 */
export function inferirHierarquia(linhas: LinhaBalancete[]): LinhaBalancete[] {
  interface Aberta {
    linha: LinhaBalancete;
    alvo: number[];
    soma: number[];
    filhas: number;
  }
  const pilha: Aberta[] = [];
  const naoFecharam: LinhaBalancete[] = [];
  let raizes = 0;

  const fechada = (a: Aberta) =>
    a.filhas > 0 && a.alvo.every((v, i) => Math.abs(v - a.soma[i]!) <= 1);

  for (const linha of linhas) {
    const mae = pilha[pilha.length - 1];
    if (mae) {
      mae.filhas += 1;
      linha.codigo = `${mae.linha.codigo}.${mae.filhas}`;
      emCentavos(linha).forEach((v, i) => (mae.soma[i]! += v));
    } else {
      raizes += 1;
      linha.codigo = String(raizes);
    }
    linha.nivel = nivelDoCodigo(linha.codigo);
    linha.raiz = linha.codigo.split(".")[0]!;

    if (!linha.analitica) {
      pilha.push({ linha, alvo: emCentavos(linha), soma: [0, 0, 0, 0], filhas: 0 });
    }
    while (pilha.length && fechada(pilha[pilha.length - 1]!)) pilha.pop();
  }

  for (const aberta of pilha) if (aberta.filhas > 0) naoFecharam.push(aberta.linha);
  return naoFecharam;
}

export function parseBalancete(paginas: string[]): BalanceteDocumento {
  const linhas: LinhaBalancete[] = [];
  const naoInterpretadas: LinhaNaoInterpretada[] = [];
  const colunas = new Set<string>();
  const marcadores = new Map<string, boolean | null>();
  const semClassificacao = layoutSemClassificacao(paginas);


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

      const casamento = interpretarInicioDaLinha(texto, semClassificacao);
      if (!casamento) return;

      const { codigo, contaInterna, sintetica } = casamento;
      const resto = casamento.resto;

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
        analitica: sintetica === null ? true : !sintetica,
        contaInterna,
        pagina: numeroPagina,
        textoOriginal: texto.slice(0, 240),
      });
      marcadores.set(codigo, sintetica);
    });
  });

  if (semClassificacao) {
    // No layout (c) o marcador é exaustivo: sem "S" é analítica.
    for (const linha of linhas) linha.analitica = !marcadores.get(linha.codigo);
    for (const linha of inferirHierarquia(linhas)) {
      naoInterpretadas.push({
        pagina: linha.pagina,
        texto: linha.textoOriginal.slice(0, 200),
        motivo:
          "Conta sintética não bate com a soma das contas abaixo dela; a hierarquia a partir daqui pode estar incorreta.",
      });
    }
  }

  // Marcador "S" do próprio arquivo vence; sem marcador, infere-se por filhos.
  const codigos = linhas.map((l) => l.codigo);
  for (const linha of linhas) {
    if (semClassificacao) continue;
    const marcador = marcadores.get(linha.codigo) ?? null;
    if (marcador !== null) {
      linha.analitica = !marcador;
      continue;
    }
    linha.analitica = !codigos.some((c) => c !== linha.codigo && c.startsWith(`${linha.codigo}.`));
  }


  const valoresBrutos = paginas.reduce(
    (soma, pagina) => soma + (pagina.match(VALOR)?.length ?? 0),
    0,
  );
  const valoresCapturados = linhas.reduce(
    (soma, l) => soma + (l.movimento === null ? 4 : 5),
    0,
  );

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
    integridadeValores: {
      brutos: valoresBrutos,
      capturados: valoresCapturados,
      razao: valoresBrutos > 0 ? valoresCapturados / valoresBrutos : 1,
    },
  };
}
