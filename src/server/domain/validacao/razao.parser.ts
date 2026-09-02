/**
 * Parser do razão (livro-razão) em PDF textual.
 *
 * Trabalha apenas sobre o texto já extraído (uma string por página), no
 * mesmo espírito de `balancete.parser.ts`. O layout do razão é lançamento a
 * lançamento por conta, não um resumo — mas para conciliar com o balancete só
 * precisamos do saldo final de cada conta, então o parser não interpreta
 * lançamento a lançamento: só abre/fecha blocos por "Conta:" e guarda o
 * último saldo corrente (impresso como "1.234,56D" ou "1.234,56C", colado
 * sem espaço) visto dentro daquele bloco — inclusive quando a conta atravessa
 * uma quebra de página ("*****Continuação").
 */

export interface ContaRazao {
  /** Classificação contábil (ex.: 1.1.01.001.001) — mesma chave usada no balancete. */
  codigo: string;
  /** Número interno de conta do sistema contábil. */
  contaInterna: string | null;
  nome: string;
  /** Magnitude — sinal não é usado na conciliação (convenções diferentes entre os dois documentos). */
  saldoAnterior: number | null;
  /** Magnitude do saldo final impresso, ou derivado quando não há valor com D/C explícito. */
  saldoFinal: number | null;
  saldoFinalSinal: "D" | "C" | null;
  /** Somatório da linha "Totais da conta", quando presente — só contexto extra. */
  totalDebito: number | null;
  totalCredito: number | null;
  temMovimento: boolean;
}

export interface RazaoDocumento {
  empresa: string | null;
  cnpj: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  paginas: number;
  contas: ContaRazao[];
}

const CONTA_LINHA = /^Conta:\s+(\d+)\s+(\d+(?:\.\d+)+)\s+(.+)$/;
const CNPJ = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/;
const PERIODO = /per[íi]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i;
const VALOR_SIMPLES = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const VALOR_COM_SINAL = /(-?\d{1,3}(?:\.\d{3})*,\d{2})([CD])(?![A-Za-z0-9])/g;

const ESPACO_NAO_SEPARAVEL = String.fromCharCode(160);

function limparNumero(bruto: string): number {
  const limpo = bruto.replace(/\./g, "").replace(",", ".");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : Number.NaN;
}

function limparNome(nome: string) {
  return nome
    .replace(/\*+\s*Continua[çc][ãa]o\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function parseRazao(paginas: string[]): RazaoDocumento {
  const contas = new Map<string, ContaRazao>();
  const ordemCodigos: string[] = [];
  let codigoAtual: string | null = null;

  let empresa: string | null = null;
  let cnpj: string | null = null;
  let periodoInicio: string | null = null;
  let periodoFim: string | null = null;

  paginas.forEach((pagina) => {
    const linhasTexto = pagina.split(/\r?\n/);

    linhasTexto.forEach((bruta, posicao) => {
      const texto = bruta.split(ESPACO_NAO_SEPARAVEL).join(" ").trim();
      if (!texto) return;

      if (!cnpj) {
        const achado = texto.match(CNPJ);
        if (achado) {
          cnpj = achado[1]!.replace(/\D/g, "");
          if (!empresa) {
            const anterior = linhasTexto[posicao - 1]?.trim() ?? "";
            const semCodigo = anterior
              .replace(/^\d+\s+/, "")
              .replace(/\s*-\s*Matriz\s*$/i, "")
              .trim();
            empresa = semCodigo || null;
          }
        }
      }

      if (!periodoInicio) {
        const achado = texto.match(PERIODO);
        if (achado) {
          periodoInicio = achado[1]!;
          periodoFim = achado[2]!;
        }
      }

      const contaMatch = texto.match(CONTA_LINHA);
      if (contaMatch) {
        const contaInterna = contaMatch[1]!;
        const codigo = contaMatch[2]!;
        codigoAtual = codigo;
        if (!contas.has(codigo)) {
          contas.set(codigo, {
            codigo,
            contaInterna,
            nome: limparNome(contaMatch[3]!),
            saldoAnterior: null,
            saldoFinal: null,
            saldoFinalSinal: null,
            totalDebito: null,
            totalCredito: null,
            temMovimento: false,
          });
          ordemCodigos.push(codigo);
        }
        return;
      }

      if (!codigoAtual) return;
      const conta = contas.get(codigoAtual);
      if (!conta) return;

      if (/saldo anterior/i.test(texto)) {
        if (conta.saldoAnterior === null) {
          const valores = texto.match(VALOR_SIMPLES);
          if (valores?.length) conta.saldoAnterior = limparNumero(valores[valores.length - 1]!);
        }
        return;
      }

      if (/totais da conta/i.test(texto)) {
        const valores = texto.match(VALOR_SIMPLES);
        if (valores?.[0] !== undefined) conta.totalDebito = limparNumero(valores[0]);
        if (valores?.[1] !== undefined) conta.totalCredito = limparNumero(valores[1]);
        conta.temMovimento = true;
        return;
      }

      const comSinal = [...texto.matchAll(VALOR_COM_SINAL)];
      if (comSinal.length) {
        const ultimo = comSinal[comSinal.length - 1]!;
        conta.saldoFinal = limparNumero(ultimo[1]!);
        conta.saldoFinalSinal = ultimo[2] as "D" | "C";
        conta.temMovimento = true;
      }
    });
  });

  const listaContas = ordemCodigos.map((codigo) => {
    const conta = contas.get(codigo)!;
    if (conta.saldoFinal === null) {
      if (conta.temMovimento && conta.saldoAnterior !== null) {
        const debito = conta.totalDebito ?? 0;
        const credito = conta.totalCredito ?? 0;
        conta.saldoFinal = Math.abs(conta.saldoAnterior + debito - credito);
      } else {
        conta.saldoFinal = conta.saldoAnterior;
      }
    }
    return conta;
  });

  return {
    empresa,
    cnpj,
    periodoInicio,
    periodoFim,
    paginas: paginas.length,
    contas: listaContas,
  };
}
