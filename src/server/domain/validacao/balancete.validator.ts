/**
 * Validador do balancete.
 *
 * Regras de integridade do arquivo/linha (ex.: fórmula da linha não bate)
 * geram ERROR/BLOCKER e impedem aprovação. Débitos x créditos e equação
 * patrimonial geram WARNING com requires_human, não BLOCKER: uma divergência
 * pode ser um erro real da empresa ou uma falha nossa de leitura do PDF (ex.:
 * grupo não extraído), então nunca reprovam sozinhos — vão para revisão
 * humana. Julgamentos contábeis (natureza invertida, caixa parado,
 * adiantamentos) seguem o mesmo padrão: WARNING com requires_human.
 */

import {
  formatarBR,
  type BalanceteDocumento,
  type LinhaBalancete,
} from "./balancete.parser";
import { competenciaDaData, type Instrucao } from "./instrucao";

export const VALIDATOR_VERSION = "balancete-v3";

export type Severidade = "INFO" | "WARNING" | "ERROR" | "BLOCKER";

export interface Achado {
  code: string;
  severity: Severidade;
  title: string;
  detail?: string;
  evidence?: Record<string, unknown>;
  accountCode?: string | null;
  accountName?: string | null;
  page?: number | null;
  requiresHuman?: boolean;
}

export interface TotaisBalancete {
  ativo: number;
  passivoPl: number;
  receitas: number;
  despesas: number;
  resultado: number;
  totalDebitos: number;
  totalCreditos: number;
  metodoTotais: string;
  equacaoEsquerda: number;
  equacaoDireita: number;
  diferencaEquacao: number;
  /** Quantidade de contas efetivamente extraídas do documento. */
  totalContas: number;
}

export type ResultadoValidacao =
  "APROVADO" | "COM_ALERTAS" | "REPROVADO" | "REVISAO_HUMANA";

export interface RelatorioValidacao {
  resultado: ResultadoValidacao;
  resumo: string;
  totais: TotaisBalancete;
  achados: Achado[];
  periodoDocumento: { inicio: string | null; fim: string | null };
}

export interface ContextoValidacao {
  /** CNPJ do cliente na solicitação (somente dígitos). */
  cnpjSolicitacao?: string | null;
  empresaSolicitacao?: string | null;
  /** Título/descrição original da solicitação. */
  tituloSolicitacao?: string | null;
  /** Instrução efetiva (título ou postagem mais recente). */
  instrucao?: Instrucao | null;
  /** Valor mínimo para considerar um saldo material. */
  materialidade?: number;
}

const TOLERANCIA = 0.02;
const MATERIALIDADE_PADRAO = 1000;

type Natureza = "ATIVO" | "PASSIVO_PL" | "RECEITA" | "DESPESA" | "OUTRO";

interface ComposicaoGrupo {
  raiz: string;
  nome: string;
  natureza: Natureza;
  nivelUsado: number;
  linhas: number;
  saldo: number;
}

function naturezaDaRaiz(linha: LinhaBalancete): Natureza {
  const nome = linha.nome.toUpperCase();
  if (/RECEITA/.test(nome)) return "RECEITA";
  if (/DESPESA|CUSTO/.test(nome)) return "DESPESA";
  if (/PASSIVO|PATRIM/.test(nome)) return "PASSIVO_PL";
  if (/ATIVO/.test(nome)) return "ATIVO";
  switch (linha.raiz) {
    case "1":
      return "ATIVO";
    case "2":
      return "PASSIVO_PL";
    case "3":
      return "RECEITA";
    case "4":
      return "DESPESA";
    default:
      return "OUTRO";
  }
}

function mapearNaturezaPorRaiz(documento: BalanceteDocumento) {
  const naturezas = new Map<string, Natureza>();
  for (const linha of documento.linhas.filter((item) => item.nivel === 1)) {
    const natureza = naturezaDaRaiz(linha);
    if (natureza !== "OUTRO") naturezas.set(linha.raiz, natureza);
  }
  return naturezas;
}

/**
 * A natureza dos descendentes vem do grupo raiz do plano apresentado no
 * próprio documento. Isso evita assumir que, por exemplo, o grupo 4 sempre é
 * despesa: em alguns planos ele é o grupo de receitas.
 */
function naturezaDaConta(
  linha: LinhaBalancete,
  naturezaPorRaiz: Map<string, Natureza>,
): Natureza {
  return naturezaPorRaiz.get(linha.raiz) ?? naturezaDaRaiz(linha);
}

/** Contas explicitamente redutoras podem ter saldo negativo sem inversão. */
function contaRedutora(linha: LinhaBalancete): boolean {
  const nome = linha.nome.toUpperCase().replace(/\s+/g, " ").trim();
  return (
    /^\(-\)/.test(nome) ||
    /\bPREJU[ÍI]ZOS? ACUMULADOS?\b/.test(nome) ||
    /\bCAPITAL A INTEGRALIZAR\b/.test(nome) ||
    /\bAÇÕES EM TESOURARIA\b/.test(nome) ||
    /\b(DEPRECIAÇÃO|AMORTIZAÇÃO|EXAUSTÃO).*ACUMULAD/.test(nome) ||
    /\bAJUSTE A VALOR PRESENTE\b/.test(nome) ||
    /\b(PERDAS ESTIMADAS|PROVISÃO PARA PERDAS)\b/.test(nome)
  );
}

function arredondar(valor: number) {
  return Math.round(valor * 100) / 100;
}

/** Fórmula da linha aceita apresentação devedora ou credora. */
function linhaFecha(l: LinhaBalancete) {
  const devedora = l.saldoAnterior + l.debito - l.credito;
  const credora = l.saldoAnterior - l.debito + l.credito;
  return (
    Math.abs(devedora - l.saldoAtual) <= TOLERANCIA ||
    Math.abs(credora - l.saldoAtual) <= TOLERANCIA
  );
}

export function validarBalancete(
  documento: BalanceteDocumento,
  contexto: ContextoValidacao = {},
): RelatorioValidacao {
  const achados: Achado[] = [];
  const materialidade = contexto.materialidade ?? MATERIALIDADE_PADRAO;
  const naturezaPorRaiz = mapearNaturezaPorRaiz(documento);

  // 1. Integridade do arquivo -------------------------------------------------
  if (documento.paginas === 0 || documento.linhas.length === 0) {
    achados.push({
      code: "ARQUIVO_SEM_CONTEUDO",
      severity: "BLOCKER",
      title: "Não foi possível ler contas no documento",
      detail:
        "O PDF não trouxe texto reconhecível de balancete. Se o arquivo for digitalizado (imagem), será necessário enviar a versão em texto.",
      evidence: { paginas: documento.paginas, linhas: documento.linhas.length },
    });
  }

  if (documento.naoInterpretadas.length) {
    achados.push({
      code: "LINHAS_NAO_INTERPRETADAS",
      severity: "WARNING",
      title: `${documento.naoInterpretadas.length} linha(s) não interpretada(s)`,
      detail: "Linhas com estrutura fora do padrão foram ignoradas no cálculo.",
      evidence: { amostra: documento.naoInterpretadas.slice(0, 10) },
      requiresHuman: true,
    });
  }

  // 2. Empresa / CNPJ ---------------------------------------------------------
  const cnpjEsperado = (contexto.cnpjSolicitacao ?? "").replace(/\D/g, "");
  if (cnpjEsperado && documento.cnpj && cnpjEsperado !== documento.cnpj) {
    achados.push({
      code: "CNPJ_DIVERGENTE",
      severity: "ERROR",
      title: "CNPJ do documento diverge da solicitação",
      detail: `Solicitação: ${cnpjEsperado} · Documento: ${documento.cnpj}`,
      evidence: { esperado: cnpjEsperado, encontrado: documento.cnpj },
    });
  }
  if (!documento.cnpj) {
    achados.push({
      code: "CNPJ_NAO_ENCONTRADO",
      severity: "WARNING",
      title: "CNPJ não localizado no documento",
      requiresHuman: true,
    });
  }

  // 3. Período ----------------------------------------------------------------
  const inicioDoc = competenciaDaData(documento.periodoInicio);
  const fimDoc = competenciaDaData(documento.periodoFim);
  const instrucao = contexto.instrucao ?? null;
  const alvoInicio = instrucao?.interpretado.inicio ?? null;
  const alvoFim = instrucao?.interpretado.fim ?? null;

  if (inicioDoc && fimDoc && alvoInicio && alvoFim) {
    const cobre = inicioDoc <= alvoInicio && fimDoc >= alvoFim;
    const igual = inicioDoc === alvoInicio && fimDoc === alvoFim;
    achados.push({
      code: igual || cobre ? "PERIODO_COMPATIVEL" : "PERIODO_DIVERGENTE",
      severity: igual || cobre ? "INFO" : "WARNING",
      title:
        igual || cobre
          ? "Período do documento compatível com a instrução efetiva"
          : "Período do documento diverge da instrução efetiva",
      detail: `Instrução (${instrucao?.origem}): ${alvoInicio} a ${alvoFim} · Documento: ${inicioDoc} a ${fimDoc}`,
      evidence: {
        titulo: contexto.tituloSolicitacao ?? null,
        instrucaoEfetiva: instrucao?.texto ?? null,
        origemInstrucao: instrucao?.origem ?? null,
        periodoInstrucao: { inicio: alvoInicio, fim: alvoFim },
        periodoDocumento: { inicio: inicioDoc, fim: fimDoc },
      },
      requiresHuman: !(igual || cobre),
    });
  } else if (!inicioDoc) {
    achados.push({
      code: "PERIODO_NAO_ENCONTRADO",
      severity: "WARNING",
      title: "Período do documento não localizado",
      requiresHuman: true,
    });
  }

  // 4. Fórmula por linha ------------------------------------------------------
  const linhasComFalha = documento.linhas.filter((l) => !linhaFecha(l));
  if (linhasComFalha.length) {
    achados.push({
      code: "LINHA_FORMULA_INCONSISTENTE",
      severity: "ERROR",
      title: `${linhasComFalha.length} linha(s) com fórmula inconsistente`,
      detail: "Saldo anterior ± movimentos não resulta no saldo apresentado.",
      evidence: {
        amostra: linhasComFalha.slice(0, 10).map((l) => ({
          codigo: l.codigo,
          nome: l.nome,
          saldoAnterior: l.saldoAnterior,
          debito: l.debito,
          credito: l.credito,
          saldoAtual: l.saldoAtual,
          pagina: l.pagina,
        })),
      },
    });
  }

  // 5. Totais pelos grupos raiz ----------------------------------------------
  // Para cada grupo (raiz), usa o nível mais raso PRESENTE NAQUELE GRUPO —
  // não um nível fixo (ex.: sempre 1) para o documento inteiro. Um balancete
  // pode ter a linha-resumo de nível 1 do Passivo mal extraída ou ausente
  // enquanto os outros grupos estão completos; exigir nível 1 em todo o
  // documento fazia o grupo faltante contar como zero, derrubando a equação
  // patrimonial por um problema de leitura, não da empresa.
  const raizesPresentes = new Set(documento.linhas.map((l) => l.raiz));
  const base: LinhaBalancete[] = [];
  const composicaoPorGrupo: ComposicaoGrupo[] = [];
  for (const raiz of raizesPresentes) {
    const linhasDoGrupo = documento.linhas.filter((l) => l.raiz === raiz);
    const nivelMaisRaso = Math.min(...linhasDoGrupo.map((l) => l.nivel));
    const linhasDoNivel = linhasDoGrupo.filter(
      (l) => l.nivel === nivelMaisRaso,
    );
    base.push(...linhasDoNivel);
    composicaoPorGrupo.push({
      raiz,
      nome: [...new Set(linhasDoNivel.map((l) => l.nome))].join("; "),
      natureza:
        naturezaPorRaiz.get(raiz) ?? naturezaDaRaiz(linhasDoNivel[0]!),
      nivelUsado: nivelMaisRaso,
      linhas: linhasDoNivel.length,
      saldo: arredondar(
        linhasDoNivel.reduce((soma, l) => soma + l.saldoAtual, 0),
      ),
    });
  }

  let ativo = 0;
  let passivoPl = 0;
  let receitas = 0;
  let despesas = 0;
  let totalDebitos = 0;
  let totalCreditos = 0;

  for (const linha of base) {
    totalDebitos += linha.debito;
    totalCreditos += linha.credito;
    switch (naturezaDaRaiz(linha)) {
      case "ATIVO":
        ativo += linha.saldoAtual;
        break;
      case "PASSIVO_PL":
        passivoPl += linha.saldoAtual;
        break;
      case "RECEITA":
        receitas += Math.abs(linha.saldoAtual);
        break;
      case "DESPESA":
        despesas += Math.abs(linha.saldoAtual);
        break;
      default:
        break;
    }
  }

  ativo = arredondar(ativo);
  passivoPl = arredondar(passivoPl);
  receitas = arredondar(receitas);
  despesas = arredondar(despesas);
  totalDebitos = arredondar(totalDebitos);
  totalCreditos = arredondar(totalCreditos);

  const resultado = arredondar(receitas - despesas);
  const equacaoEsquerda = arredondar(ativo + despesas);
  const equacaoDireita = arredondar(passivoPl + receitas);
  const diferencaEquacao = arredondar(equacaoEsquerda - equacaoDireita);

  const totais: TotaisBalancete = {
    ativo,
    passivoPl,
    receitas,
    despesas,
    resultado,
    totalDebitos,
    totalCreditos,
    metodoTotais:
      "Somatório das contas sintéticas de nível raiz (evita duplicar a hierarquia do plano de contas).",
    equacaoEsquerda,
    equacaoDireita,
    diferencaEquacao,
    totalContas: documento.linhas.length,
  };

  if (base.length) {
    // Grupos com natureza "OUTRO" ficam de fora do cálculo de
    // Ativo/Passivo/Receita/Despesa. Quando o saldo ignorado é material —
    // e principalmente quando ele coincide com a diferença da equação —,
    // é um indício de falha de leitura do PDF (grupo não classificado),
    // não necessariamente um erro do cliente.
    const gruposIgnorados = composicaoPorGrupo.filter(
      (g) => g.natureza === "OUTRO" && Math.abs(g.saldo) >= materialidade,
    );
    const grupoCoincidente = gruposIgnorados.find(
      (g) =>
        Math.abs(Math.abs(diferencaEquacao) - Math.abs(g.saldo)) <=
        TOLERANCIA,
    );

    const diferenca = arredondar(totalDebitos - totalCreditos);
    achados.push({
      code:
        Math.abs(diferenca) <= TOLERANCIA
          ? "PARTIDAS_DOBRADAS_OK"
          : "PARTIDAS_DOBRADAS_DIVERGENTE",
      // WARNING + revisão humana, não BLOCKER: essa conferência depende da
      // extração do PDF ter ido bem para todos os grupos. Uma divergência
      // pode ser um erro real da empresa ou uma falha nossa de leitura — não
      // dá para saber sem um humano olhar, então não reprova sozinho.
      severity: Math.abs(diferenca) <= TOLERANCIA ? "INFO" : "WARNING",
      title:
        Math.abs(diferenca) <= TOLERANCIA
          ? "Total de débitos igual ao total de créditos"
          : "Total de débitos diferente do total de créditos",
      detail: `Débitos R$ ${formatarBR(totalDebitos)} · Créditos R$ ${formatarBR(totalCreditos)} · Diferença R$ ${formatarBR(diferenca)}. Método: ${totais.metodoTotais}`,
      evidence: {
        totalDebitos,
        totalCreditos,
        diferenca,
        metodo: totais.metodoTotais,
      },
      requiresHuman: Math.abs(diferenca) > TOLERANCIA,
    });

    achados.push({
      code:
        Math.abs(diferencaEquacao) <= TOLERANCIA
          ? "EQUACAO_PATRIMONIAL_OK"
          : "EQUACAO_PATRIMONIAL_DIVERGENTE",
      // Mesmo raciocínio: pode ser um grupo (ex.: Passivo/PL) que não foi
      // lido corretamente do PDF, não necessariamente um balancete errado.
      severity: Math.abs(diferencaEquacao) <= TOLERANCIA ? "INFO" : "WARNING",
      title:
        Math.abs(diferencaEquacao) <= TOLERANCIA
          ? "Equação patrimonial fecha (resultado ainda não encerrado)"
          : "Equação patrimonial não fecha",
      detail: [
        `Ativo (R$ ${formatarBR(ativo)}) + Despesas (R$ ${formatarBR(despesas)}) = R$ ${formatarBR(equacaoEsquerda)} · Passivo/PL (R$ ${formatarBR(passivoPl)}) + Receitas (R$ ${formatarBR(receitas)}) = R$ ${formatarBR(equacaoDireita)}`,
        grupoCoincidente
          ? `A diferença coincide com o saldo do grupo "${grupoCoincidente.raiz} — ${grupoCoincidente.nome}" (R$ ${formatarBR(grupoCoincidente.saldo)}), que não entrou na equação por não ter natureza identificada. Provável falha de leitura do PDF, não necessariamente erro do cliente.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
      evidence: {
        ativo,
        despesas,
        passivoPl,
        receitas,
        equacaoEsquerda,
        equacaoDireita,
        diferencaEquacao,
        composicaoPorGrupo,
        grupoCoincidenteComDiferenca: grupoCoincidente ?? null,
      },
      requiresHuman: Math.abs(diferencaEquacao) > TOLERANCIA,
    });

    for (const grupo of gruposIgnorados) {
      achados.push({
        code: "GRUPO_NAO_CLASSIFICADO",
        severity: "WARNING",
        title: `Grupo "${grupo.raiz} — ${grupo.nome || "sem nome"}" não classificado na equação patrimonial`,
        detail:
          grupo === grupoCoincidente
            ? `Saldo de R$ ${formatarBR(grupo.saldo)} não entrou no cálculo de Ativo/Passivo/Receita/Despesa e coincide com a diferença da equação patrimonial — provável falha de leitura do PDF, não erro do cliente.`
            : `Saldo de R$ ${formatarBR(grupo.saldo)} não entrou no cálculo de Ativo/Passivo/Receita/Despesa por não ter sido possível identificar a natureza do grupo pelo nome ou pela raiz.`,
        evidence: {
          raiz: grupo.raiz,
          nome: grupo.nome,
          nivelUsado: grupo.nivelUsado,
          linhas: grupo.linhas,
          saldo: grupo.saldo,
          coincideComDiferencaEquacao: grupo === grupoCoincidente,
        },
        requiresHuman: true,
      });
    }

    achados.push({
      code: "RESULTADO_PERIODO",
      severity: "INFO",
      title:
        resultado >= 0
          ? `Lucro do período: R$ ${formatarBR(resultado)}`
          : `Prejuízo do período: R$ ${formatarBR(Math.abs(resultado))}`,
      detail: `Receitas R$ ${formatarBR(receitas)} − Despesas R$ ${formatarBR(despesas)}`,
      evidence: { receitas, despesas, resultado },
    });
  }

  // 6. Julgamentos contábeis (sempre WARNING + revisão humana) ----------------
  const analiticas = documento.linhas.filter((l) => l.analitica);
  const jaAlertadas = new Set<string>();

  for (const linha of analiticas) {
    const nome = linha.nome.toUpperCase();
    const natureza = naturezaDaConta(linha, naturezaPorRaiz);

    // Investimento analítico com saldo credor/negativo
    if (
      /INVESTIMENT|PARTICIPA[ÇC]|EMPREENDIMENT/.test(nome) ||
      linha.codigo.startsWith("1.2.3")
    ) {
      if (linha.saldoAtual < 0) {
        jaAlertadas.add(linha.codigo);
        achados.push({
          code: "INVESTIMENTO_SALDO_CREDOR",
          severity: "WARNING",
          title: "Investimento com saldo credor",
          detail: `${linha.nome}: R$ ${formatarBR(linha.saldoAtual)}. Conta de investimento com saldo credor exige conferência do registro (equivalência, aporte ou baixa).`,
          evidence: {
            codigo: linha.codigo,
            saldo: linha.saldoAtual,
            pagina: linha.pagina,
          },
          accountCode: linha.codigo,
          accountName: linha.nome,
          page: linha.pagina,
          requiresHuman: true,
        });
      }
    }

    // Caixa material sem movimento
    if (/\bCAIXA\b/.test(nome) && Math.abs(linha.saldoAtual) >= materialidade) {
      if (linha.debito === 0 && linha.credito === 0) {
        jaAlertadas.add(linha.codigo);
        achados.push({
          code: "CAIXA_SEM_MOVIMENTO",
          severity: "WARNING",
          title: "Caixa com saldo material e sem movimento no período",
          detail: `${linha.nome}: R$ ${formatarBR(linha.saldoAtual)} sem débitos nem créditos.`,
          evidence: {
            codigo: linha.codigo,
            saldo: linha.saldoAtual,
            pagina: linha.pagina,
          },
          accountCode: linha.codigo,
          accountName: linha.nome,
          page: linha.pagina,
          requiresHuman: true,
        });
      }
    }

    // Adiantamentos / distribuição de lucros
    const materialAbs = Math.abs(linha.saldoAtual) >= materialidade;
    if (
      materialAbs &&
      /(ADIANTAMENT|DISTRIBUI).*LUCRO|LUCRO.*(ADIANTAMENT|DISTRIBU)/.test(nome)
    ) {
      jaAlertadas.add(linha.codigo);
      achados.push({
        code: "ADIANTAMENTO_LUCROS",
        severity: "WARNING",
        title: "Adiantamento/distribuição de lucros material",
        detail: `${linha.nome}: R$ ${formatarBR(Math.abs(linha.saldoAtual))}. Exige revisão documental (lucro disponível, ata/contrato e reflexo fiscal).`,
        evidence: {
          codigo: linha.codigo,
          saldo: linha.saldoAtual,
          pagina: linha.pagina,
        },
        accountCode: linha.codigo,
        accountName: linha.nome,
        page: linha.pagina,
        requiresHuman: true,
      });
    } else if (materialAbs && /ADIANTAMENT/.test(nome)) {
      jaAlertadas.add(linha.codigo);
      achados.push({
        code: "ADIANTAMENTO_MATERIAL",
        severity: "WARNING",
        title: "Adiantamento material em aberto",
        detail: `${linha.nome}: R$ ${formatarBR(Math.abs(linha.saldoAtual))}. Confirmar a documentação de suporte e a baixa esperada.`,
        evidence: {
          codigo: linha.codigo,
          saldo: linha.saldoAtual,
          pagina: linha.pagina,
        },
        accountCode: linha.codigo,
        accountName: linha.nome,
        page: linha.pagina,
        requiresHuman: true,
      });
    }

    // Natureza potencialmente invertida
    if (
      !jaAlertadas.has(linha.codigo) &&
      !contaRedutora(linha) &&
      Math.abs(linha.saldoAtual) >= materialidade
    ) {
      const esperadoDevedor = natureza === "ATIVO" || natureza === "DESPESA";
      const esperadoCredor =
        natureza === "PASSIVO_PL" || natureza === "RECEITA";
      const invertido =
        (esperadoDevedor && linha.saldoAtual < 0) ||
        (esperadoCredor && linha.saldoAtual < 0);
      if (invertido) {
        achados.push({
          code: "NATUREZA_INVERTIDA",
          severity: "WARNING",
          title: "Saldo com natureza potencialmente invertida",
          detail: `${linha.nome}: R$ ${formatarBR(linha.saldoAtual)}.`,
          evidence: { codigo: linha.codigo, saldo: linha.saldoAtual, natureza },
          accountCode: linha.codigo,
          accountName: linha.nome,
          page: linha.pagina,
          requiresHuman: true,
        });
      }
    }
  }

  return {
    resultado: classificar(achados),
    resumo: montarResumo(achados, totais, documento.linhas.length),
    totais,
    achados,
    periodoDocumento: { inicio: inicioDoc, fim: fimDoc },
  };
}

export function classificar(achados: Achado[]): ResultadoValidacao {
  if (achados.some((a) => a.severity === "BLOCKER" || a.severity === "ERROR"))
    return "REPROVADO";
  const alertas = achados.filter((a) => a.severity === "WARNING");
  if (!alertas.length) return "APROVADO";
  return alertas.some((a) => a.requiresHuman)
    ? "REVISAO_HUMANA"
    : "COM_ALERTAS";
}

function montarResumo(
  achados: Achado[],
  totais: TotaisBalancete,
  totalContas: number,
) {
  const bloqueios = achados.filter(
    (a) => a.severity === "BLOCKER" || a.severity === "ERROR",
  ).length;
  const alertas = achados.filter((a) => a.severity === "WARNING").length;

  // Sem contas extraídas não existe conferência matemática possível.
  if (totalContas === 0)
    return [
      "Documento não lido: nenhuma conta foi extraída do PDF.",
      "Totais não calculados.",
      `${bloqueios} impedimento(s) e ${alertas} alerta(s) para revisão.`,
    ].join(" ");

  const fecha = Math.abs(totais.diferencaEquacao) <= TOLERANCIA;
  return [
    fecha
      ? "Balancete fecha matematicamente."
      : "Balancete não fecha matematicamente.",
    `Ativo R$ ${formatarBR(totais.ativo)} · Passivo/PL R$ ${formatarBR(totais.passivoPl)} · Resultado R$ ${formatarBR(totais.resultado)}.`,
    `${bloqueios} impedimento(s) e ${alertas} alerta(s) para revisão.`,
  ].join(" ");
}
