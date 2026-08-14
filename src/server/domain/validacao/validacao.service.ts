import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { erroSeguro, mascarar, mascararTexto } from "../../lib/mascara";
import { pierAdapter } from "../../integrations/pier/pier.adapter";
import { parseBalancete } from "./balancete.parser";
import { validarBalancete, VALIDATOR_VERSION, type Achado } from "./balancete.validator";
import { instrucaoEfetiva, interpretarTexto, type Instrucao } from "./instrucao";

const BUCKET = "request-attachments";
const TAMANHO_MAXIMO = 25 * 1024 * 1024;

export type Severidade = "INFO" | "WARNING" | "ERROR" | "BLOCKER";

/** Aviso fixo: esta etapa nunca escreve no PIER. */
export const AVISO_PIER = "PIER não alterado — aguardando integração de escrita.";

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64ParaBytes(base64: string): Uint8Array {
  const limpo = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binario = atob(limpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export async function carregarSolicitacao(ctx: AppContext, externalId: string) {
  const { data, error } = await ctx.db
    .from("request")
    .select(
      "id, external_id, number, description, type_name, status, reference_month, responsible_name, client_name, client_document, company_id, has_attachment, requested_at, deadline_at, finished_at",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("external_id", externalId)
    .maybeSingle();

  if (error)
    throw new AppError("INESPERADO", "Não foi possível carregar a solicitação.", error.message);
  if (!data)
    throw new AppError(
      "REGRA_NEGOCIO",
      "Solicitação não encontrada no cache. Carregue as solicitações da competência primeiro.",
    );
  return data;
}

/** Título + postagens viram instruções persistidas e interpretadas. */
async function sincronizarInstrucoes(
  ctx: AppContext,
  solicitacao: { id: string; external_id: string; description: string | null },
) {
  const instrucoes: { source: "TITLE" | "POST"; id: string | null; texto: string; em: string | null }[] =
    [];

  if (solicitacao.description)
    instrucoes.push({ source: "TITLE", id: null, texto: solicitacao.description, em: null });

  try {
    const postagens = await pierAdapter.listPosts({ requestExternalId: solicitacao.external_id });
    for (const p of postagens) {
      if (!p.content?.trim()) continue;
      instrucoes.push({ source: "POST", id: p.externalId, texto: p.content, em: p.postedAt });
    }
  } catch (error) {
    console.error("[validacao] postagens indisponíveis:", erroSeguro(error));
  }

  const { data: existentes } = await ctx.db
    .from("request_instruction")
    .select("id, source, source_external_id")
    .eq("organization_id", ctx.organizationId)
    .eq("request_id", solicitacao.id);

  const jaSalvas = new Set((existentes ?? []).map((e) => `${e.source}|${e.source_external_id ?? ""}`));
  const novas = instrucoes.filter((i) => !jaSalvas.has(`${i.source}|${i.id ?? ""}`));

  if (novas.length) {
    await ctx.db.from("request_instruction").insert(
      novas.map((i) => {
        const texto = mascararTexto(i.texto);
        return {
          organization_id: ctx.organizationId,
          request_id: solicitacao.id,
          source: i.source,
          source_external_id: i.id,
          occurred_at: i.em,
          text: texto,
          interpreted: mascarar(interpretarTexto(texto)) as never,
        };
      }),
    );
  }
}

async function listarInstrucoes(ctx: AppContext, requestId: string): Promise<Instrucao[]> {
  const { data } = await ctx.db
    .from("request_instruction")
    .select("source, source_external_id, occurred_at, text, interpreted, created_at")
    .eq("organization_id", ctx.organizationId)
    .eq("request_id", requestId)
    .order("occurred_at", { ascending: false, nullsFirst: false });

  return (data ?? []).map((i) => ({
    origem: i.source as Instrucao["origem"],
    origemExternalId: i.source_external_id,
    ocorridoEm: i.occurred_at ?? i.created_at,
    texto: i.text,
    interpretado: (i.interpreted ?? interpretarTexto(i.text)) as Instrucao["interpretado"],
  }));
}

export async function detalharSolicitacao(
  ctx: AppContext,
  input: { solicitacaoExternalId: string; sincronizarPostagens?: boolean },
) {
  const solicitacao = await carregarSolicitacao(ctx, input.solicitacaoExternalId);

  if (input.sincronizarPostagens !== false && ctx.canWrite) {
    await sincronizarInstrucoes(ctx, solicitacao);
  }

  const instrucoes = await listarInstrucoes(ctx, solicitacao.id);
  const efetiva = instrucaoEfetiva(instrucoes);

  const { data: processamento } = await ctx.db
    .from("request_processing")
    .select(
      "outcome, reason, pier_post_external_id, posted_at, finalized_at, pier_status, execution_id, updated_at",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("request_id", solicitacao.id)
    .maybeSingle();


  const [{ data: anexos }, { data: execucoes }, { data: decisoes }, { data: auditoria }] =
    await Promise.all([
      ctx.db
        .from("request_attachment")
        .select("id, filename, mime_type, size_bytes, sha256, status, metadata, created_at")
        .eq("organization_id", ctx.organizationId)
        .eq("request_id", solicitacao.id)
        .order("created_at", { ascending: false }),
      ctx.db
        .from("validation_execution")
        .select(
          "id, attachment_id, status, validator_version, result, summary, totals, error_message, started_at, finished_at, instruction_snapshot",
        )
        .eq("organization_id", ctx.organizationId)
        .eq("request_id", solicitacao.id)
        .order("created_at", { ascending: false }),
      ctx.db
        .from("request_decision")
        .select("id, execution_id, decision, notes, decided_at, pier_action_status")
        .eq("organization_id", ctx.organizationId)
        .eq("request_id", solicitacao.id)
        .order("decided_at", { ascending: false }),
      ctx.db
        .from("audit_log")
        .select("id, action, entity, entity_id, created_at, after_data")
        .eq("organization_id", ctx.organizationId)
        .eq("correlation_id", solicitacao.external_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  return mascarar({
    solicitacao: {
      id: solicitacao.id,
      externalId: solicitacao.external_id,
      numero: solicitacao.number,
      descricao: solicitacao.description,
      tipoNome: solicitacao.type_name,
      status: solicitacao.status,
      competencia: solicitacao.reference_month,
      responsavelNome: solicitacao.responsible_name,
      clienteNome: solicitacao.client_name,
      documento: solicitacao.client_document,
      empresaId: solicitacao.company_id,
      possuiAnexo: solicitacao.has_attachment,
      solicitadaEm: solicitacao.requested_at,
      prazoEm: solicitacao.deadline_at,
      finalizadaEm: solicitacao.finished_at,
    },
    instrucoes,
    instrucaoEfetiva: efetiva,
    anexos: (anexos ?? []).map((a) => ({
      id: a.id,
      nome: a.filename,
      tipo: a.mime_type,
      tamanho: a.size_bytes,
      hash: a.sha256,
      status: a.status,
      enviadoEm: a.created_at,
    })),
    execucoes: (execucoes ?? []).map((e) => ({
      id: e.id,
      anexoId: e.attachment_id,
      status: e.status,
      versao: e.validator_version,
      resultado: e.result,
      resumo: e.summary,
      totais: e.totals,
      erro: e.error_message,
      iniciadaEm: e.started_at,
      finalizadaEm: e.finished_at,
      instrucaoUsada: e.instruction_snapshot,
    })),
    decisoes: (decisoes ?? []).map((d) => ({
      id: d.id,
      execucaoId: d.execution_id,
      decisao: d.decision,
      notas: d.notes,
      decididaEm: d.decided_at,
      statusPier: d.pier_action_status,
    })),
    auditoria: (auditoria ?? []).map((a) => ({
      id: a.id,
      acao: a.action,
      entidade: a.entity,
      entidadeId: a.entity_id,
      em: a.created_at,
      dados: a.after_data,
    })),
    avisoPier: AVISO_PIER,
  });
}

/**
 * Guarda um PDF na solicitação (armazenamento + registro), com idempotência por hash.
 * Usado tanto pelo upload manual quanto pelo processamento automático do PIER.
 */
export async function salvarAnexoBytes(
  ctx: AppContext,
  solicitacao: { id: string; external_id: string },
  input: { filename: string; bytes: Uint8Array },
) {
  const bytes = input.bytes;

  const assinatura = String.fromCharCode(...bytes.slice(0, 5));
  if (!assinatura.startsWith("%PDF"))
    throw new AppError("VALIDACAO", "Envie um arquivo PDF válido.");

  const hash = await sha256(bytes);
  const nome = input.filename.replace(/[^\w.\-() ]+/g, "_").slice(0, 120) || "documento.pdf";
  const caminho = `${ctx.organizationId}/${solicitacao.id}/${hash}.pdf`;

  const { error: uploadError } = await ctx.db.storage
    .from(BUCKET)
    .upload(caminho, bytes as unknown as ArrayBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError)
    throw new AppError("INESPERADO", "Não foi possível guardar o documento.", uploadError.message);

  const { data: existente } = await ctx.db
    .from("request_attachment")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("request_id", solicitacao.id)
    .eq("sha256", hash)
    .maybeSingle();

  if (existente) return { anexoId: existente.id, reaproveitado: true, hash };

  const { data: anexo, error } = await ctx.db
    .from("request_attachment")
    .insert({
      organization_id: ctx.organizationId,
      request_id: solicitacao.id,
      filename: nome,
      mime_type: "application/pdf",
      size_bytes: bytes.length,
      storage_path: caminho,
      sha256: hash,
      status: "UPLOADED",
      uploaded_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !anexo)
    throw new AppError("INESPERADO", "Não foi possível registrar o documento.", error?.message);

  await audit(ctx, {
    action: "UPLOAD_DOCUMENTO",
    entity: "request_attachment",
    entityId: anexo.id,
    correlationId: solicitacao.external_id,
    after: { nome, tamanho: bytes.length, hash },
  });

  return { anexoId: anexo.id, reaproveitado: false, hash };
}

export async function enviarAnexo(
  ctx: AppContext,
  input: {
    solicitacaoExternalId: string;
    filename: string;
    mimeType: string;
    conteudoBase64: string;
  },
) {
  assertCanWrite(ctx);
  const solicitacao = await carregarSolicitacao(ctx, input.solicitacaoExternalId);

  const bytes = base64ParaBytes(input.conteudoBase64);
  if (!bytes.length) throw new AppError("VALIDACAO", "Arquivo vazio.");
  if (bytes.length > TAMANHO_MAXIMO)
    throw new AppError("VALIDACAO", "Arquivo acima do limite de 25 MB.");

  return salvarAnexoBytes(ctx, solicitacao, { filename: input.filename, bytes });
}


export async function executarValidacao(
  ctx: AppContext,
  input: { solicitacaoExternalId: string; anexoId: string; reprocessar?: boolean },
) {
  assertCanWrite(ctx);
  const solicitacao = await carregarSolicitacao(ctx, input.solicitacaoExternalId);

  const { data: anexo } = await ctx.db
    .from("request_attachment")
    .select("id, filename, storage_path, sha256")
    .eq("organization_id", ctx.organizationId)
    .eq("request_id", solicitacao.id)
    .eq("id", input.anexoId)
    .maybeSingle();

  if (!anexo) throw new AppError("REGRA_NEGOCIO", "Documento não encontrado nesta solicitação.");

  // Idempotência: mesmo conteúdo + mesma versão do validador reaproveita a execução.
  const { data: anterior } = await ctx.db
    .from("validation_execution")
    .select("id, status")
    .eq("organization_id", ctx.organizationId)
    .eq("content_hash", anexo.sha256)
    .eq("validator_version", VALIDATOR_VERSION)
    .maybeSingle();

  if (anterior && anterior.status === "COMPLETED" && !input.reprocessar)
    return { execucaoId: anterior.id, reaproveitada: true };

  await sincronizarInstrucoes(ctx, solicitacao);
  const instrucoes = await listarInstrucoes(ctx, solicitacao.id);
  const efetiva = instrucaoEfetiva(instrucoes);

  const agora = new Date().toISOString();
  const registro = {
    organization_id: ctx.organizationId,
    request_id: solicitacao.id,
    attachment_id: anexo.id,
    status: "RUNNING" as const,
    validator_version: VALIDATOR_VERSION,
    content_hash: anexo.sha256,
    instruction_snapshot: mascarar({
      titulo: solicitacao.description,
      efetiva,
      todas: instrucoes,
    }) as never,
    started_at: agora,
    actor_id: ctx.userId,
  };

  const { data: execucao, error: execError } = await ctx.db
    .from("validation_execution")
    .upsert(registro, { onConflict: "organization_id,content_hash,validator_version" })
    .select("id")
    .single();

  if (execError || !execucao)
    throw new AppError("INESPERADO", "Não foi possível iniciar a análise.", execError?.message);

  try {
    const { data: arquivo, error: downloadError } = await ctx.db.storage
      .from(BUCKET)
      .download(anexo.storage_path);
    if (downloadError || !arquivo)
      throw new AppError("INESPERADO", "Documento indisponível no armazenamento.");

    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const { extrairTextoPdf } = await import("./pdf.server");
    const { paginas } = await extrairTextoPdf(bytes);

    const documento = parseBalancete(paginas);
    const relatorio = validarBalancete(documento, {
      cnpjSolicitacao: solicitacao.client_document,
      empresaSolicitacao: solicitacao.client_name,
      tituloSolicitacao: solicitacao.description,
      instrucao: efetiva,
    });

    await ctx.db
      .from("validation_finding")
      .delete()
      .eq("organization_id", ctx.organizationId)
      .eq("execution_id", execucao.id);

    if (relatorio.achados.length) {
      await ctx.db.from("validation_finding").insert(
        relatorio.achados.map((a: Achado) => ({
          organization_id: ctx.organizationId,
          execution_id: execucao.id,
          code: a.code,
          severity: a.severity,
          title: mascararTexto(a.title),
          detail: a.detail ? mascararTexto(a.detail) : null,
          evidence: mascarar(a.evidence ?? {}) as never,
          account_code: a.accountCode ?? null,
          account_name: a.accountName ?? null,
          page: a.page ?? null,
          requires_human: Boolean(a.requiresHuman),
        })),
      );
    }

    await ctx.db
      .from("validation_execution")
      .update({
        status: "COMPLETED",
        result: relatorio.resultado,
        summary: mascararTexto(relatorio.resumo),
        totals: mascarar({
          ...relatorio.totais,
          documento: {
            empresa: documento.empresa,
            cnpj: documento.cnpj,
            emissaoEm: documento.emissaoEm,
            periodoInicio: documento.periodoInicio,
            periodoFim: documento.periodoFim,
            paginas: documento.paginas,
            colunas: documento.colunasDetectadas,
            contas: documento.linhas.length,
          },
        }) as never,
        finished_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", execucao.id);

    await ctx.db
      .from("request_attachment")
      .update({
        status: "PARSED",
        metadata: mascarar({
          paginas: documento.paginas,
          contas: documento.linhas.length,
          periodo: [documento.periodoInicio, documento.periodoFim],
        }) as never,
      })
      .eq("id", anexo.id);

    await audit(ctx, {
      action: "EXECUTAR_VALIDACAO",
      entity: "validation_execution",
      entityId: execucao.id,
      correlationId: solicitacao.external_id,
      after: { resultado: relatorio.resultado, achados: relatorio.achados.length },
    });

    return { execucaoId: execucao.id, reaproveitada: false, resultado: relatorio.resultado };
  } catch (error) {
    await ctx.db
      .from("validation_execution")
      .update({
        status: "FAILED",
        error_message: erroSeguro(error),
        finished_at: new Date().toISOString(),
      })
      .eq("id", execucao.id);
    await ctx.db.from("request_attachment").update({ status: "FAILED" }).eq("id", anexo.id);
    if (error instanceof AppError) throw error;
    throw new AppError("INESPERADO", "Não foi possível analisar o documento.", erroSeguro(error));
  }
}

export async function listarAchados(
  ctx: AppContext,
  input: { execucaoId: string; severidade?: Severidade | null; busca?: string | null },
) {
  let query = ctx.db
    .from("validation_finding")
    .select("id, code, severity, title, detail, evidence, account_code, account_name, page, requires_human")
    .eq("organization_id", ctx.organizationId)
    .eq("execution_id", input.execucaoId);

  if (input.severidade) query = query.eq("severity", input.severidade);

  const { data, error } = await query;
  if (error)
    throw new AppError("INESPERADO", "Não foi possível carregar os achados.", error.message);

  const ordem: Record<string, number> = { BLOCKER: 0, ERROR: 1, WARNING: 2, INFO: 3 };
  const termo = (input.busca ?? "").trim().toLowerCase();

  return mascarar(
    (data ?? [])
      .filter((f) =>
        termo
          ? [f.title, f.detail, f.account_name, f.account_code, f.code]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(termo))
          : true,
      )
      .sort((a, b) => (ordem[a.severity] ?? 9) - (ordem[b.severity] ?? 9))
      .map((f) => ({
        id: f.id,
        codigo: f.code,
        severidade: f.severity,
        titulo: f.title,
        detalhe: f.detail,
        evidencia: f.evidence,
        contaCodigo: f.account_code,
        contaNome: f.account_name,
        pagina: f.page,
        exigeHumano: f.requires_human,
      })),
  );
}

export async function registrarDecisao(
  ctx: AppContext,
  input: {
    solicitacaoExternalId: string;
    execucaoId?: string | null;
    decisao: "APPROVED" | "RETURNED" | "NEEDS_REVIEW";
    notas?: string | null;
  },
) {
  assertCanWrite(ctx);
  const solicitacao = await carregarSolicitacao(ctx, input.solicitacaoExternalId);

  if (input.execucaoId) {
    const { data: exec } = await ctx.db
      .from("validation_execution")
      .select("id, result")
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.execucaoId)
      .maybeSingle();
    if (!exec) throw new AppError("REGRA_NEGOCIO", "Análise não encontrada.");
    if (input.decisao === "APPROVED" && exec.result === "REPROVADO")
      throw new AppError(
        "REGRA_NEGOCIO",
        "A análise apontou impedimentos objetivos. Devolva ou envie para revisão.",
      );
  }

  const notas = input.notas ? mascararTexto(input.notas).slice(0, 2000) : null;

  const { data: decisao, error } = await ctx.db
    .from("request_decision")
    .insert({
      organization_id: ctx.organizationId,
      request_id: solicitacao.id,
      execution_id: input.execucaoId ?? null,
      decision: input.decisao,
      notes: notas,
      decided_by: ctx.userId,
      pier_action_status: "NOT_SENT",
    })
    .select("id, decided_at")
    .single();

  if (error || !decisao)
    throw new AppError("INESPERADO", "Não foi possível registrar a decisão.", error?.message);

  await audit(ctx, {
    action: "REGISTRAR_DECISAO",
    entity: "request_decision",
    entityId: decisao.id,
    correlationId: solicitacao.external_id,
    after: { decisao: input.decisao, notas, pier: "NOT_SENT" },
  });

  return { decisaoId: decisao.id, decididaEm: decisao.decided_at, avisoPier: AVISO_PIER };
}

/** Resultado consolidado de uma execução (usado pela UI e pelo MCP). */
export async function obterResultadoValidacao(
  ctx: AppContext,
  input: { execucaoId: string },
) {
  const { data: execucao, error } = await ctx.db
    .from("validation_execution")
    .select(
      "id, request_id, attachment_id, status, validator_version, result, summary, totals, error_message, started_at, finished_at, instruction_snapshot",
    )
    .eq("organization_id", ctx.organizationId)
    .eq("id", input.execucaoId)
    .maybeSingle();

  if (error)
    throw new AppError("INESPERADO", "Não foi possível carregar a análise.", error.message);
  if (!execucao) throw new AppError("REGRA_NEGOCIO", "Análise não encontrada.");

  const achados = await listarAchados(ctx, { execucaoId: execucao.id });

  return mascarar({
    id: execucao.id,
    status: execucao.status,
    versao: execucao.validator_version,
    resultado: execucao.result,
    resumo: execucao.summary,
    totais: execucao.totals,
    erro: execucao.error_message,
    iniciadaEm: execucao.started_at,
    finalizadaEm: execucao.finished_at,
    instrucaoUsada: execucao.instruction_snapshot,
    achados,
    avisoPier: AVISO_PIER,
  });
}
