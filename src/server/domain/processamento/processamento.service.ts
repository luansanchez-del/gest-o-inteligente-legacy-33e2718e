/**
 * Processamento operacional do Fechamento Contábil no PIER.
 *
 * Ordem obrigatória e não negociável:
 *   1. GET do detalhe (corrige divergência entre cache e PIER)
 *   2. postagens + arquivos da solicitação
 *   3. download do balancete e execução do motor de validação existente
 *   4. só quando APROVADO sem erro/alerta: postagem privada -> finalizar -> reconferir
 *
 * Nada é finalizado sem balancete, com alerta, com erro, ou sem postagem confirmada.
 */
import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { erroSeguro, mascararTexto } from "../../lib/mascara";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import type { PierAdapter } from "../../integrations/pier/pier.types";
import { extrairTextoPdf } from "../validacao/pdf.server";
import {
  carregarSolicitacao,
  executarValidacao,
  obterResultadoValidacao,
  salvarAnexoBytes,
} from "../validacao/validacao.service";

export type SituacaoProcessamento =
  "FINALIZADO" | "JA_FINALIZADA" | "EM_REVISAO" | "PENDENTE" | "ERRO";

export interface ResultadoProcessamento {
  solicitacaoExternalId: string;
  clienteNome: string | null;
  situacao: SituacaoProcessamento;
  motivo: string;
  statusPier: string | null;
  /** true quando o status guardado divergia do status real da API. */
  divergenciaCorrigida: boolean;
  arquivo: string | null;
  periodo: string | null;
  execucaoId: string | null;
  resultado: string | null;
  totalErros: number;
  totalAlertas: number;
  postagemId: string | null;
  finalizadaEm: string | null;
  processadoEm: string;
}

export interface DepsProcessamento {
  pier: Pick<
    PierAdapter,
    | "getRequest"
    | "listPosts"
    | "listFiles"
    | "downloadFile"
    | "createPost"
    | "finalizeRequest"
  >;
  salvarAnexo: typeof salvarAnexoBytes;
  validar: typeof executarValidacao;
  obterResultado: typeof obterResultadoValidacao;
}

const DEPS_PADRAO: DepsProcessamento = {
  pier: pierAdapter,
  salvarAnexo: salvarAnexoBytes,
  validar: executarValidacao,
  obterResultado: obterResultadoValidacao,
};

const STATUS_FINALIZADO = /finaliz|conclu|encerr/i;

function pareceFinalizada(status: string | null, finishedAt: string | null) {
  return Boolean(finishedAt) || STATUS_FINALIZADO.test(status ?? "");
}

function competenciaParaTermos(competencia: string | null) {
  if (!competencia) return [];
  const [ano, mes] = competencia.split("-");
  return [
    competencia,
    `${mes}/${ano}`,
    `${mes}-${ano}`,
    `${mes}.${ano}`,
    `${mes}${ano}`,
  ].filter(Boolean) as string[];
}

/** Escolhe o PDF com maior chance de ser o balancete da competência. */
export function escolherBalancete(
  arquivos: {
    externalId: string;
    name: string | null;
    category: string | null;
    mimeType: string | null;
    createdAt: string | null;
  }[],
  contexto: { competencia: string | null; textoPostagens: string },
) {
  const termos = competenciaParaTermos(contexto.competencia);
  const candidatos = arquivos
    .filter((a) => {
      const nome = (a.name ?? "").toLowerCase();
      const mime = (a.mimeType ?? "").toLowerCase();
      return nome.endsWith(".pdf") || mime.includes("pdf");
    })
    // Razão (livro-razão) é um documento de apoio, não o balancete: tem
    // estrutura diferente (lançamento a lançamento, não saldo consolidado) e
    // nunca deve ser escolhido no lugar dele, mesmo se o nome do arquivo
    // bater com a competência.
    .filter((a) => !/\braz[aã]o\b/.test((a.name ?? "").toLowerCase()))
    .map((a) => {
      const alvo = `${a.name ?? ""} ${a.category ?? ""}`.toLowerCase();
      let pontos = 0;
      if (alvo.includes("balancete")) pontos += 10;
      if (alvo.includes("balanco") || alvo.includes("balanço")) pontos += 3;
      if (termos.some((t) => alvo.includes(t.toLowerCase()))) pontos += 5;
      if (
        contexto.textoPostagens
          .toLowerCase()
          .includes((a.name ?? "###").toLowerCase())
      )
        pontos += 2;
      return { arquivo: a, pontos };
    })
    .sort(
      (a, b) =>
        b.pontos - a.pontos ||
        String(b.arquivo.createdAt ?? "").localeCompare(
          String(a.arquivo.createdAt ?? ""),
        ),
    );

  return candidatos[0]?.arquivo ?? null;
}

/**
 * Escolhe o PDF com maior chance de ser o razão (livro-razão) da competência.
 * Espelha `escolherBalancete`, mas com o filtro invertido: exige "razão" no
 * nome em vez de descartá-lo. Reforço opcional para a conciliação —
 * ausência de razão não afeta o fluxo, quem não anexa segue igual a hoje.
 */
export function escolherRazao(
  arquivos: {
    externalId: string;
    name: string | null;
    category: string | null;
    mimeType: string | null;
    createdAt: string | null;
  }[],
  contexto: { competencia: string | null; textoPostagens: string },
) {
  const termos = competenciaParaTermos(contexto.competencia);
  const candidatos = arquivos
    .filter((a) => {
      const nome = (a.name ?? "").toLowerCase();
      const mime = (a.mimeType ?? "").toLowerCase();
      return nome.endsWith(".pdf") || mime.includes("pdf");
    })
    .filter((a) => /\braz[aã]o\b/.test((a.name ?? "").toLowerCase()))
    .map((a) => {
      const alvo = `${a.name ?? ""} ${a.category ?? ""}`.toLowerCase();
      let pontos = 0;
      if (termos.some((t) => alvo.includes(t.toLowerCase()))) pontos += 5;
      if (
        contexto.textoPostagens
          .toLowerCase()
          .includes((a.name ?? "###").toLowerCase())
      )
        pontos += 2;
      return { arquivo: a, pontos };
    })
    .sort(
      (a, b) =>
        b.pontos - a.pontos ||
        String(b.arquivo.createdAt ?? "").localeCompare(
          String(a.arquivo.createdAt ?? ""),
        ),
    );

  return candidatos[0]?.arquivo ?? null;
}

export interface ConferenciaMovimentoFinanceiro {
  situacao: "LIBERADO" | "BLOQUEADO";
  semMovimentoDeclarado: boolean;
  extratosBancarios: string[];
  extratosAplicacoes: string[];
  comprovantesEcac: string[];
  observacoes: string[];
}

function normalizarBusca(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

export function contemDeclaracaoSemMovimento(value: string) {
  const texto = normalizarBusca(value);
  return (
    /\b(empresa\s+)?sem\s+moviment(?:o|acao)\b/.test(texto) ||
    /\bnao\s+houve\s+moviment(?:o|acao)\b/.test(texto)
  );
}

function classificarFonte(value: string) {
  const texto = normalizarBusca(value);
  const ecac =
    /\b(e\s*cac|receita federal|situacao fiscal|conta corrente fiscal)\b/.test(
      texto,
    );
  const aplicacao =
    /\b(aplicac|investiment|cdb|renda fixa|fundo|poupanca)\w*/.test(texto);
  const bancario =
    !ecac && (/\bextrato\b/.test(texto) || /\bofx\b/.test(texto)) && !aplicacao;
  return { ecac, aplicacao, bancario };
}

function adicionarUnico(lista: string[], valor: string) {
  if (valor && !lista.includes(valor)) lista.push(valor);
}

/** Regra do escritório: extrato bancário OU declaração expressa de empresa sem movimento. */
export async function conferirMovimentoFinanceiro(
  arquivos: {
    externalId: string;
    name: string | null;
    category: string | null;
    mimeType: string | null;
    sizeBytes?: number | null;
  }[],
  textoPostagens: string,
  baixar: (externalId: string) => Promise<Uint8Array>,
): Promise<ConferenciaMovimentoFinanceiro> {
  const extratosBancarios: string[] = [];
  const extratosAplicacoes: string[] = [];
  const comprovantesEcac: string[] = [];
  const observacoes: string[] = [];
  let semMovimentoDeclarado = contemDeclaracaoSemMovimento(textoPostagens);

  for (const arquivo of arquivos.slice(0, 30)) {
    const nome = arquivo.name ?? arquivo.externalId;
    const metadados = `${arquivo.name ?? ""} ${arquivo.category ?? ""}`;
    let classificacao = classificarFonte(metadados);

    const ehPdf =
      (arquivo.name ?? "").toLowerCase().endsWith(".pdf") ||
      (arquivo.mimeType ?? "").toLowerCase().includes("pdf");
    if (
      ehPdf &&
      (!classificacao.bancario ||
        !classificacao.aplicacao ||
        !classificacao.ecac)
    ) {
      try {
        const bytes = await baixar(arquivo.externalId);
        const extraido = await extrairTextoPdf(bytes);
        const texto = extraido.paginas.join("\n").slice(0, 250_000);
        semMovimentoDeclarado ||= contemDeclaracaoSemMovimento(texto);
        const conteudo = classificarFonte(texto);
        classificacao = {
          bancario: classificacao.bancario || conteudo.bancario,
          aplicacao: classificacao.aplicacao || conteudo.aplicacao,
          ecac: classificacao.ecac || conteudo.ecac,
        };
      } catch {
        observacoes.push(
          `${nome}: conteúdo não pôde ser lido; classificação feita pelo nome.`,
        );
      }
    }

    if (classificacao.bancario) adicionarUnico(extratosBancarios, nome);
    if (classificacao.aplicacao) adicionarUnico(extratosAplicacoes, nome);
    if (classificacao.ecac) adicionarUnico(comprovantesEcac, nome);
  }

  return {
    situacao:
      semMovimentoDeclarado || extratosBancarios.length > 0
        ? "LIBERADO"
        : "BLOQUEADO",
    semMovimentoDeclarado,
    extratosBancarios,
    extratosAplicacoes,
    comprovantesEcac,
    observacoes,
  };
}

function mensagemMovimento(
  conferencia: ConferenciaMovimentoFinanceiro,
  competencia: string | null,
) {
  const encontrado = (lista: string[]) =>
    lista.length ? `identificado (${lista.length})` : "não identificado";
  return mascararTexto(
    [
      "Conferência automática do Movimento Financeiro Mensal concluída.",
      `Competência: ${competencia ?? "não identificada"}.`,
      `Extrato bancário: ${encontrado(conferencia.extratosBancarios)}.`,
      `Extrato de aplicações: ${encontrado(conferencia.extratosAplicacoes)}.`,
      `Comprovante da Receita/e-CAC: ${encontrado(conferencia.comprovantesEcac)}.`,
      conferencia.semMovimentoDeclarado
        ? "A empresa foi declarada sem movimento no período."
        : "",
      "Resultado: documentação mínima identificada; o fechamento contábil pode ser iniciado.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function gravarProcessamento(
  ctx: AppContext,
  requestId: string,
  dados: Record<string, unknown>,
) {
  await ctx.db.from("request_processing").upsert(
    {
      organization_id: ctx.organizationId,
      request_id: requestId,
      processed_by: ctx.userId,
      updated_at: new Date().toISOString(),
      ...dados,
    } as never,
    { onConflict: "organization_id,request_id" },
  );
}

function resumoDaValidacao(input: {
  arquivo: string | null;
  competencia: string | null;
  resumo: string | null;
  totalRegras: number;
}) {
  const linhas = [
    "Validação automática do balancete concluída.",
    `Arquivo analisado: ${input.arquivo ?? "não informado"}.`,
    `Competência: ${input.competencia ?? "não identificada"}.`,
    `Regras executadas: ${input.totalRegras}.`,
    "Resultado: aprovado, sem erros nem alertas que exijam revisão humana.",
    input.resumo ? `Resumo: ${input.resumo}` : "",
  ].filter(Boolean);
  return mascararTexto(linhas.join("\n"));
}

/**
 * Processa uma solicitação de ponta a ponta. Nunca lança para o chamador em lote:
 * devolve sempre um resultado com a situação e o motivo.
 */
export async function processarSolicitacao(
  ctx: AppContext,
  input: {
    solicitacaoExternalId: string;
    permitirFinalizar?: boolean;
    reprocessar?: boolean;
  },
  deps: DepsProcessamento = DEPS_PADRAO,
): Promise<ResultadoProcessamento> {
  assertCanWrite(ctx);
  const solicitacao = await carregarSolicitacao(
    ctx,
    input.solicitacaoExternalId,
  );
  let permitirFinalizar = input.permitirFinalizar !== false;

  const base: ResultadoProcessamento = {
    solicitacaoExternalId: solicitacao.external_id,
    clienteNome: solicitacao.client_name,
    situacao: "PENDENTE",
    motivo: "",
    statusPier: solicitacao.status,
    divergenciaCorrigida: false,
    arquivo: null,
    periodo: solicitacao.reference_month,
    execucaoId: null,
    resultado: null,
    totalErros: 0,
    totalAlertas: 0,
    postagemId: null,
    finalizadaEm: null,
    processadoEm: new Date().toISOString(),
  };

  const { data: anteriorProc } = await ctx.db
    .from("request_processing")
    .select("id, pier_post_external_id, finalized_at, content_hash")
    .eq("organization_id", ctx.organizationId)
    .eq("request_id", solicitacao.id)
    .maybeSingle();

  async function encerrar(
    situacao: SituacaoProcessamento,
    motivo: string,
    extra: Partial<ResultadoProcessamento> = {},
    persistir: Record<string, unknown> = {},
  ): Promise<ResultadoProcessamento> {
    const resultado = { ...base, ...extra, situacao, motivo };
    await gravarProcessamento(ctx, solicitacao.id, {
      outcome: situacao,
      reason: mascararTexto(motivo).slice(0, 1000),
      pier_status: resultado.statusPier,
      execution_id: resultado.execucaoId,
      pier_post_external_id: resultado.postagemId,
      finalized_at: resultado.finalizadaEm,
      ...persistir,
    });
    await audit(ctx, {
      action: "PROCESSAR_SOLICITACAO",
      entity: "request",
      entityId: solicitacao.id,
      correlationId: solicitacao.external_id,
      after: {
        situacao,
        motivo: mascararTexto(motivo),
        statusPier: resultado.statusPier,
        execucaoId: resultado.execucaoId,
        postagemId: resultado.postagemId,
        finalizadaEm: resultado.finalizadaEm,
      },
    });
    return resultado;
  }

  // 1. Estado real antes de qualquer ação.
  let detalhe;
  try {
    detalhe = await deps.pier.getRequest({
      requestExternalId: solicitacao.external_id,
    });
  } catch (error) {
    return encerrar(
      "ERRO",
      `Não foi possível consultar a solicitação no PIER. ${erroSeguro(error)}`,
    );
  }

  base.statusPier = detalhe.status ?? solicitacao.status;
  base.divergenciaCorrigida =
    (detalhe.status ?? null) !== (solicitacao.status ?? null);
  base.periodo = detalhe.referenceMonth ?? solicitacao.reference_month;

  await ctx.db
    .from("request")
    .update({
      status: detalhe.status ?? solicitacao.status,
      finished_at: detalhe.finishedAt ?? solicitacao.finished_at,
      has_attachment: detalhe.hasAttachment || solicitacao.has_attachment,
      ...(detalhe.referenceMonth
        ? { reference_month: detalhe.referenceMonth }
        : {}),
    })
    .eq("id", solicitacao.id);

  // Proteção: nunca refinalizar nem publicar de novo. A análise ainda roda
  // (somente leitura) para que seja possível conferir como ficou o
  // fechamento mesmo depois de finalizado no PIER.
  const jaFinalizadaNoPier = pareceFinalizada(detalhe.status, detalhe.finishedAt);
  if (jaFinalizadaNoPier) permitirFinalizar = false;
  const finalizadaEmAnterior =
    detalhe.finishedAt ?? anteriorProc?.finalized_at ?? null;

  // 2. Postagens (contexto para identificar o balancete).
  let textoPostagens = "";
  try {
    const postagens = await deps.pier.listPosts({
      requestExternalId: solicitacao.external_id,
    });
    textoPostagens = postagens.map((p) => p.content ?? "").join("\n");
  } catch (error) {
    console.error(
      "[processamento] postagens indisponíveis:",
      erroSeguro(error),
    );
  }

  // 3. Arquivos da solicitação.
  let arquivos;
  try {
    arquivos = await deps.pier.listFiles({
      requestExternalId: solicitacao.external_id,
    });
  } catch (error) {
    return encerrar(
      "ERRO",
      `Não foi possível listar os anexos no PIER. ${erroSeguro(error)}`,
    );
  }

  const ehMovimentoFinanceiro =
    solicitacao.purpose === "MONTHLY_FINANCIAL_MOVEMENT" ||
    (normalizarBusca(solicitacao.type_name ?? "").includes("movimento") &&
      normalizarBusca(solicitacao.type_name ?? "").includes("financeiro"));

  if (ehMovimentoFinanceiro) {
    const conferencia = await conferirMovimentoFinanceiro(
      arquivos,
      textoPostagens,
      (externalId) => deps.pier.downloadFile({ fileExternalId: externalId }),
    );

    await audit(ctx, {
      action: "ANALISAR_MOVIMENTO_FINANCEIRO",
      entity: "request",
      entityId: solicitacao.id,
      correlationId: solicitacao.external_id,
      after: { ...conferencia, competencia: base.periodo },
    });

    if (conferencia.situacao === "BLOQUEADO") {
      return encerrar(
        "EM_REVISAO",
        "Fechamento contábil bloqueado: não foi localizado extrato bancário nem declaração de empresa sem movimento.",
      );
    }

    base.resultado = "LIBERADO";
    base.totalAlertas =
      Number(conferencia.extratosAplicacoes.length === 0) +
      Number(conferencia.comprovantesEcac.length === 0);

    if (!permitirFinalizar) {
      return jaFinalizadaNoPier
        ? encerrar(
            "JA_FINALIZADA",
            "Já finalizada no PIER. Documentação conferida apenas para consulta — nenhuma nova ação foi enviada.",
            { finalizadaEm: finalizadaEmAnterior },
          )
        : encerrar(
            "PENDENTE",
            "Documentação mínima identificada. O fechamento contábil está liberado; finalização no PIER não solicitada.",
          );
    }

    let postagemId = anteriorProc?.pier_post_external_id ?? null;
    if (!postagemId) {
      try {
        const postagem = await deps.pier.createPost({
          requestExternalId: solicitacao.external_id,
          mensagem: mensagemMovimento(conferencia, base.periodo),
          privada: true,
        });
        postagemId = postagem.externalId;
      } catch (error) {
        return encerrar(
          "PENDENTE",
          `A conferência foi aprovada, mas a postagem no PIER falhou. ${erroSeguro(error)}`,
        );
      }
    }

    if (!postagemId)
      return encerrar(
        "PENDENTE",
        "O PIER não confirmou a postagem privada. A solicitação não foi finalizada.",
      );

    base.postagemId = postagemId;
    await gravarProcessamento(ctx, solicitacao.id, {
      outcome: "PENDENTE",
      reason: "Documentação mínima aprovada; aguardando finalização.",
      pier_post_external_id: postagemId,
      posted_at: new Date().toISOString(),
    });

    try {
      await deps.pier.finalizeRequest({
        requestExternalId: solicitacao.external_id,
      });
      const confirmacao = await deps.pier.getRequest({
        requestExternalId: solicitacao.external_id,
      });
      base.statusPier = confirmacao.status ?? base.statusPier;
      if (!pareceFinalizada(confirmacao.status, confirmacao.finishedAt))
        return encerrar(
          "PENDENTE",
          "O PIER ainda não confirmou a finalização da solicitação.",
        );

      await ctx.db
        .from("request")
        .update({
          status: confirmacao.status,
          finished_at: confirmacao.finishedAt ?? new Date().toISOString(),
        })
        .eq("id", solicitacao.id);

      return encerrar(
        "FINALIZADO",
        "Movimento Financeiro Mensal conferido e finalizado. Fechamento contábil liberado.",
        { finalizadaEm: confirmacao.finishedAt ?? new Date().toISOString() },
      );
    } catch (error) {
      return encerrar(
        "PENDENTE",
        `A postagem foi publicada, mas não foi possível confirmar a finalização. ${erroSeguro(error)}`,
      );
    }
  }

  const balancete = escolherBalancete(arquivos, {
    competencia: base.periodo,
    textoPostagens,
  });

  if (!balancete) {
    return encerrar(
      "EM_REVISAO",
      "Nenhum balancete em PDF foi localizado nos anexos da solicitação. Envie para revisão.",
    );
  }

  base.arquivo = balancete.name ?? balancete.externalId;

  // 4. Download + análise pelo motor existente.
  let anexoId: string;
  let hash: string;
  try {
    const bytes = await deps.pier.downloadFile({
      fileExternalId: balancete.externalId,
    });
    const anexo = await deps.salvarAnexo(ctx, solicitacao, {
      filename: balancete.name ?? `balancete-${balancete.externalId}.pdf`,
      bytes,
    });
    anexoId = anexo.anexoId;
    hash = anexo.hash;
  } catch (error) {
    return encerrar(
      "EM_REVISAO",
      `Não foi possível ler o documento anexado (PDF ilegível ou indisponível). ${erroSeguro(error)}`,
    );
  }

  // Razão é reforço opcional da conciliação: sem ele, ou se algo falhar ao
  // buscá-lo, o fluxo segue exatamente como antes, só com o balancete.
  let anexoRazaoId: string | undefined;
  const razao = escolherRazao(arquivos, {
    competencia: base.periodo,
    textoPostagens,
  });
  if (razao) {
    try {
      const bytesRazao = await deps.pier.downloadFile({
        fileExternalId: razao.externalId,
      });
      const anexo = await deps.salvarAnexo(ctx, solicitacao, {
        filename: razao.name ?? `razao-${razao.externalId}.pdf`,
        bytes: bytesRazao,
      });
      anexoRazaoId = anexo.anexoId;
    } catch (error) {
      console.error("[processamento] razão indisponível:", erroSeguro(error));
    }
  }

  let execucaoId: string;
  try {
    const execucao = await deps.validar(ctx, {
      solicitacaoExternalId: solicitacao.external_id,
      anexoId,
      ...(anexoRazaoId ? { anexoRazaoId } : {}),
      ...(input.reprocessar ? { reprocessar: true } : {}),
    });
    execucaoId = execucao.execucaoId;
  } catch (error) {
    return encerrar(
      "EM_REVISAO",
      `A análise do balancete falhou. ${erroSeguro(error)}`,
      {},
      {
        attachment_id: anexoId,
        content_hash: hash,
      },
    );
  }

  const resultado = await deps.obterResultado(ctx, { execucaoId });
  const achados = resultado.achados ?? [];
  const erros = achados.filter(
    (a) => a.severidade === "ERROR" || a.severidade === "BLOCKER",
  ).length;
  const alertas = achados.filter(
    (a) => a.severidade === "WARNING" || a.exigeHumano,
  ).length;

  base.execucaoId = execucaoId;
  base.resultado = resultado.resultado ?? null;
  base.totalErros = erros;
  base.totalAlertas = alertas;

  const persistirAnalise = {
    attachment_id: anexoId,
    content_hash: hash,
    execution_id: execucaoId,
  };

  const aprovado =
    resultado.resultado === "APROVADO" && erros === 0 && alertas === 0;

  if (!aprovado) {
    const sufixo = jaFinalizadaNoPier
      ? " A solicitação já está finalizada no PIER; nenhuma nova ação foi enviada."
      : " A solicitação não pode ser finalizada.";
    return encerrar(
      "EM_REVISAO",
      (erros
        ? `A análise apontou ${erros} erro(s) contábil(is).`
        : alertas
          ? `A análise apontou ${alertas} alerta(s) que exigem revisão humana.`
          : "A análise não resultou em aprovação objetiva.") + sufixo,
      jaFinalizadaNoPier ? { finalizadaEm: finalizadaEmAnterior } : {},
      persistirAnalise,
    );
  }

  if (!permitirFinalizar) {
    return jaFinalizadaNoPier
      ? encerrar(
          "JA_FINALIZADA",
          "Já finalizada no PIER. Balancete analisado apenas para consulta — nenhuma nova ação foi enviada.",
          { finalizadaEm: finalizadaEmAnterior },
          persistirAnalise,
        )
      : encerrar(
          "PENDENTE",
          "Análise aprovada. Finalização no PIER não solicitada nesta execução.",
          {},
          persistirAnalise,
        );
  }

  // 5. Postagem privada ANTES da finalização (reaproveitada se já existir).
  let postagemId = anteriorProc?.pier_post_external_id ?? null;
  if (!postagemId) {
    try {
      const postagem = await deps.pier.createPost({
        requestExternalId: solicitacao.external_id,
        mensagem: resumoDaValidacao({
          arquivo: base.arquivo,
          competencia: base.periodo,
          resumo:
            typeof resultado.resumo === "string" ? resultado.resumo : null,
          totalRegras: achados.length,
        }),
        privada: true,
      });
      postagemId = postagem.externalId;
    } catch (error) {
      return encerrar(
        "PENDENTE",
        `A postagem no PIER falhou. A solicitação não foi finalizada. ${erroSeguro(error)}`,
        {},
        persistirAnalise,
      );
    }
  }

  if (!postagemId) {
    return encerrar(
      "PENDENTE",
      "O PIER não confirmou o identificador da postagem. A finalização não foi executada.",
      {},
      persistirAnalise,
    );
  }

  base.postagemId = postagemId;

  await gravarProcessamento(ctx, solicitacao.id, {
    ...persistirAnalise,
    outcome: "PENDENTE",
    reason: "Postagem publicada; aguardando finalização.",
    pier_post_external_id: postagemId,
    posted_at: new Date().toISOString(),
  });

  // 6. Finalização.
  try {
    await deps.pier.finalizeRequest({
      requestExternalId: solicitacao.external_id,
    });
  } catch (error) {
    return encerrar(
      "PENDENTE",
      `A postagem foi publicada, mas a finalização falhou. Reprocessar tentará apenas finalizar. ${erroSeguro(error)}`,
      {},
      persistirAnalise,
    );
  }

  // 7. Confirmação: só mostramos "Finalizado no PIER" após novo GET.
  let confirmacao;
  try {
    confirmacao = await deps.pier.getRequest({
      requestExternalId: solicitacao.external_id,
    });
  } catch (error) {
    return encerrar(
      "PENDENTE",
      `Finalização enviada, mas a confirmação no PIER falhou. Reprocessar para confirmar. ${erroSeguro(error)}`,
      {},
      persistirAnalise,
    );
  }

  base.statusPier = confirmacao.status ?? base.statusPier;

  if (!pareceFinalizada(confirmacao.status, confirmacao.finishedAt)) {
    return encerrar(
      "PENDENTE",
      "O PIER ainda não confirmou a finalização desta solicitação.",
      {},
      persistirAnalise,
    );
  }

  await ctx.db
    .from("request")
    .update({
      status: confirmacao.status ?? base.statusPier,
      finished_at: confirmacao.finishedAt ?? new Date().toISOString(),
    })
    .eq("id", solicitacao.id);

  return encerrar(
    "FINALIZADO",
    "Balancete aprovado, postagem privada publicada e solicitação finalizada no PIER.",
    { finalizadaEm: confirmacao.finishedAt ?? new Date().toISOString() },
    persistirAnalise,
  );
}

type AchadoParaNotificacao = {
  severidade: string;
  titulo: string;
  detalhe?: string | null;
  contaCodigo?: string | null;
  pagina?: number | null;
  exigeHumano?: boolean;
};

export function montarMensagemRevisao(input: {
  clienteNome: string | null;
  numero: string | null;
  arquivo: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  achados: AchadoParaNotificacao[];
}) {
  const periodo =
    input.periodoInicio && input.periodoFim
      ? `${input.periodoInicio} a ${input.periodoFim}`
      : (input.periodoInicio ?? input.periodoFim ?? "não identificado");

  const relevantes = input.achados
    .filter(
      (a) =>
        a.severidade === "BLOCKER" ||
        a.severidade === "ERROR" ||
        a.severidade === "WARNING" ||
        a.exigeHumano,
    )
    .slice(0, 12);

  const valorEmReais = (texto: string | null | undefined) => {
    const match = texto?.match(/R\$\s*(-?[\d.]+,\d{2})/);
    if (!match) return null;
    const numero = Number(match[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(numero) ? numero : null;
  };
  const lucros = relevantes.filter((a) =>
    normalizarBusca(a.titulo).includes("lucro"),
  );
  const demais = relevantes.filter(
    (a) => !normalizarBusca(a.titulo).includes("lucro"),
  );
  const totalLucros = lucros.reduce(
    (total, a) => total + (valorEmReais(a.detalhe) ?? 0),
    0,
  );
  const pontos = demais.map(
    (a) => `• ${a.titulo}${a.detalhe ? ` — ${a.detalhe}` : ""}`,
  );
  if (lucros.length) {
    const total = totalLucros
      ? totalLucros.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })
      : null;
    pontos.push(
      `• Adiantamentos de lucros: ${lucros.length} lançamento(s)${total ? `, total de ${total}` : ""}. Conferir documentação e tratamento contábil/fiscal.`,
    );
  }

  const linhas = [
    "Olá! A validação automática do balancete foi concluída e precisa de revisão.",
    "",
    `Empresa: ${input.clienteNome ?? "não informada"}`,
    `Solicitação: ${input.numero ?? "não informada"}`,
    `Período analisado: ${periodo}`,
    "",
    "Pontos para conferir:",
    ...pontos,
    "",
    "Por favor, valide os documentos de suporte e confirme se é necessário algum ajuste.",
    "A solicitação permanecerá aberta até a revisão.",
  ];

  return mascararTexto(linhas.join("\n")).slice(0, 9000);
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object"
    ? (valor as Record<string, unknown>)
    : {};
}

/**
 * Publica uma mensagem privada com as evidências da última análise em revisão.
 * Não finaliza, não devolve ao cliente e não reutiliza o ID da postagem de aprovação.
 */
export async function notificarRevisaoPier(
  ctx: AppContext,
  input: { solicitacaoExternalId: string },
  deps: Pick<DepsProcessamento, "pier"> = { pier: pierAdapter },
) {
  assertCanWrite(ctx);
  const solicitacao = await carregarSolicitacao(
    ctx,
    input.solicitacaoExternalId,
  );

  const ehMovimentoFinanceiro =
    solicitacao.purpose === "MONTHLY_FINANCIAL_MOVEMENT" ||
    (normalizarBusca(solicitacao.type_name ?? "").includes("movimento") &&
      normalizarBusca(solicitacao.type_name ?? "").includes("financeiro"));

  if (ehMovimentoFinanceiro) {
    const { data: analises } = await ctx.db
      .from("audit_log")
      .select("id, after_data")
      .eq("organization_id", ctx.organizationId)
      .eq("correlation_id", solicitacao.external_id)
      .eq("action", "ANALISAR_MOVIMENTO_FINANCEIRO")
      .order("created_at", { ascending: false })
      .limit(1);
    const analise = analises?.[0];
    const dados = objeto(analise?.after_data);
    if (!analise || dados["situacao"] !== "BLOQUEADO")
      throw new AppError(
        "REGRA_NEGOCIO",
        "A solicitação precisa estar bloqueada por falta de extrato antes da notificação.",
      );

    const { data: notificacoes } = await ctx.db
      .from("audit_log")
      .select("after_data")
      .eq("organization_id", ctx.organizationId)
      .eq("correlation_id", solicitacao.external_id)
      .eq("action", "NOTIFICAR_REVISAO_PIER")
      .order("created_at", { ascending: false })
      .limit(20);
    for (const evento of notificacoes ?? []) {
      const anterior = objeto(evento.after_data);
      if (
        anterior["analiseMovimentoId"] === analise.id &&
        anterior["postagemId"]
      )
        return {
          postagemId: String(anterior["postagemId"]),
          jaEnviada: true,
          mensagem:
            "A responsável já foi notificada no PIER para esta conferência.",
        };
    }

    const mensagem = mascararTexto(
      [
        "Olá! Na conferência do Movimento Financeiro Mensal, não localizamos o extrato bancário da competência.",
        "Caso não existam lançamentos no período, registre expressamente essa condição na solicitação.",
        "Caso tenha movimentação, anexe o extrato bancário para liberar o início do fechamento contábil.",
        "A solicitação permanecerá aberta até a regularização.",
      ].join("\n"),
    );
    const postagem = await deps.pier.createPost({
      requestExternalId: solicitacao.external_id,
      mensagem,
      privada: true,
    });
    if (!postagem.externalId)
      throw new AppError(
        "INESPERADO",
        "O PIER não confirmou a postagem privada.",
      );

    await audit(ctx, {
      action: "NOTIFICAR_REVISAO_PIER",
      entity: "request",
      entityId: solicitacao.id,
      correlationId: solicitacao.external_id,
      after: {
        analiseMovimentoId: analise.id,
        postagemId: postagem.externalId,
        privada: true,
        finalizou: false,
      },
    });
    return {
      postagemId: postagem.externalId,
      jaEnviada: false,
      mensagem:
        "Responsável notificada no PIER. A solicitação permanece aberta.",
    };
  }

  const { data: processamento, error: procError } = await ctx.db
    .from("request_processing")
    .select("outcome, execution_id")
    .eq("organization_id", ctx.organizationId)
    .eq("request_id", solicitacao.id)
    .maybeSingle();

  if (procError)
    throw new AppError(
      "INESPERADO",
      "Não foi possível conferir o processamento.",
      procError.message,
    );
  if (
    !processamento ||
    processamento.outcome !== "EM_REVISAO" ||
    !processamento.execution_id
  )
    throw new AppError(
      "REGRA_NEGOCIO",
      "A solicitação precisa estar em revisão e possuir uma análise concluída antes da notificação.",
    );

  const execucaoId = processamento.execution_id;

  // Idempotência por solicitação + execução: repetir o clique não duplica a postagem.
  const { data: eventos } = await ctx.db
    .from("audit_log")
    .select("after_data")
    .eq("organization_id", ctx.organizationId)
    .eq("correlation_id", solicitacao.external_id)
    .eq("action", "NOTIFICAR_REVISAO_PIER")
    .order("created_at", { ascending: false })
    .limit(20);

  for (const evento of eventos ?? []) {
    const dados = objeto(evento.after_data);
    if (
      dados["executionId"] === execucaoId &&
      typeof dados["postagemId"] === "string" &&
      dados["postagemId"]
    ) {
      return {
        postagemId: dados["postagemId"] as string,
        jaEnviada: true,
        mensagem: "A responsável já foi notificada no PIER para esta análise.",
      };
    }
  }

  const [
    { data: execucao, error: execError },
    { data: achados, error: achadosError },
  ] = await Promise.all([
    ctx.db
      .from("validation_execution")
      .select("id, attachment_id, instruction_snapshot, totals")
      .eq("organization_id", ctx.organizationId)
      .eq("id", execucaoId)
      .maybeSingle(),
    ctx.db
      .from("validation_finding")
      .select("severity, title, detail, account_code, page, requires_human")
      .eq("organization_id", ctx.organizationId)
      .eq("execution_id", execucaoId),
  ]);

  if (execError || !execucao)
    throw new AppError(
      "REGRA_NEGOCIO",
      "A análise usada na revisão não foi encontrada.",
      execError?.message,
    );
  if (achadosError)
    throw new AppError(
      "INESPERADO",
      "Não foi possível carregar as evidências.",
      achadosError.message,
    );

  const relevantes = (achados ?? []).filter(
    (a) =>
      a.severity === "BLOCKER" ||
      a.severity === "ERROR" ||
      a.severity === "WARNING" ||
      a.requires_human,
  );
  if (!relevantes.length)
    throw new AppError(
      "REGRA_NEGOCIO",
      "A análise não possui alerta ou impedimento que justifique uma notificação de revisão.",
    );

  const { data: anexo } = await ctx.db
    .from("request_attachment")
    .select("filename")
    .eq("organization_id", ctx.organizationId)
    .eq("id", execucao.attachment_id)
    .maybeSingle();

  const totais = objeto(execucao.totals);
  const documento = objeto(totais["documento"]);
  const snapshot = objeto(execucao.instruction_snapshot);
  const efetiva = objeto(snapshot["efetiva"]);
  const interpretado = objeto(efetiva["interpretado"]);

  const mensagem = montarMensagemRevisao({
    clienteNome: solicitacao.client_name,
    numero: solicitacao.number,
    arquivo: anexo?.filename ?? null,
    periodoInicio:
      typeof interpretado["inicio"] === "string"
        ? interpretado["inicio"]
        : typeof documento["periodoInicio"] === "string"
          ? documento["periodoInicio"]
          : null,
    periodoFim:
      typeof interpretado["fim"] === "string"
        ? interpretado["fim"]
        : typeof documento["periodoFim"] === "string"
          ? documento["periodoFim"]
          : null,
    achados: relevantes.map((a) => ({
      severidade: a.severity,
      titulo: a.title,
      detalhe: a.detail,
      contaCodigo: a.account_code,
      pagina: a.page,
      exigeHumano: a.requires_human,
    })),
  });

  let postagem;
  try {
    postagem = await deps.pier.createPost({
      requestExternalId: solicitacao.external_id,
      mensagem,
      privada: true,
    });
  } catch (error) {
    throw new AppError(
      "INESPERADO",
      `Não foi possível notificar a responsável no PIER. ${erroSeguro(error)}`,
    );
  }

  if (!postagem.externalId)
    throw new AppError(
      "INESPERADO",
      "O PIER não confirmou o identificador da postagem privada.",
    );

  await audit(ctx, {
    action: "NOTIFICAR_REVISAO_PIER",
    entity: "request",
    entityId: solicitacao.id,
    correlationId: solicitacao.external_id,
    after: {
      executionId: execucaoId,
      postagemId: postagem.externalId,
      privada: true,
      finalizou: false,
    },
  });

  return {
    postagemId: postagem.externalId,
    jaEnviada: false,
    mensagem: "Responsável notificada no PIER. A solicitação permanece aberta.",
  };
}

export interface ResumoLote {
  total: number;
  finalizadas: number;
  emRevisao: number;
  pendentes: number;
  jaFinalizadas: number;
  erros: number;
  itens: ResultadoProcessamento[];
}

/** Processa o escopo filtrado, reutilizando exatamente o mesmo serviço unitário. */
export async function processarEscopo(
  ctx: AppContext,
  input: { solicitacoes: string[]; permitirFinalizar?: boolean },
  deps: DepsProcessamento = DEPS_PADRAO,
): Promise<ResumoLote> {
  assertCanWrite(ctx);
  const lista = [...new Set(input.solicitacoes.filter(Boolean))];
  if (!lista.length)
    throw new AppError(
      "REGRA_NEGOCIO",
      "Nenhuma solicitação no escopo filtrado.",
    );
  if (lista.length > 100)
    throw new AppError(
      "REGRA_NEGOCIO",
      "Processe no máximo 100 solicitações por vez. Refine os filtros.",
    );

  const itens: ResultadoProcessamento[] = [];
  for (const externalId of lista) {
    try {
      itens.push(
        await processarSolicitacao(
          ctx,
          {
            solicitacaoExternalId: externalId,
            ...(input.permitirFinalizar === false
              ? { permitirFinalizar: false }
              : {}),
          },
          deps,
        ),
      );
    } catch (error) {
      itens.push({
        solicitacaoExternalId: externalId,
        clienteNome: null,
        situacao: "ERRO",
        motivo: erroSeguro(error),
        statusPier: null,
        divergenciaCorrigida: false,
        arquivo: null,
        periodo: null,
        execucaoId: null,
        resultado: null,
        totalErros: 0,
        totalAlertas: 0,
        postagemId: null,
        finalizadaEm: null,
        processadoEm: new Date().toISOString(),
      });
    }
  }

  return {
    total: itens.length,
    finalizadas: itens.filter((i) => i.situacao === "FINALIZADO").length,
    emRevisao: itens.filter((i) => i.situacao === "EM_REVISAO").length,
    pendentes: itens.filter((i) => i.situacao === "PENDENTE").length,
    jaFinalizadas: itens.filter((i) => i.situacao === "JA_FINALIZADA").length,
    erros: itens.filter((i) => i.situacao === "ERRO").length,
    itens,
  };
}
