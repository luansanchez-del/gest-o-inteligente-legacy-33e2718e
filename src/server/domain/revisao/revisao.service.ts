import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";

export async function listarFilaRevisao(ctx: AppContext) {
  const { data, error } = await ctx.db
    .from("review_task")
    .select(
      "id, status, reason, notes, created_at, decided_at, closing_period:closing_period_id(id, reference_month, type, situation, responsible_name, company:company_id(name))",
    )
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error)
    throw new AppError("INESPERADO", "Não foi possível carregar a fila de revisão.", error.message);

  return (data ?? []).map((row) => {
    const periodo = row.closing_period as unknown as {
      id: string;
      reference_month: string;
      type: string;
      situation: string;
      responsible_name: string | null;
      company: { name: string } | null;
    } | null;
    return {
      id: row.id,
      status: row.status,
      motivo: row.reason,
      notas: row.notes,
      criadoEm: row.created_at,
      decididoEm: row.decided_at,
      competenciaId: periodo?.id ?? null,
      competencia: periodo?.reference_month ?? "—",
      tipo: periodo?.type ?? "—",
      situacao: periodo?.situation ?? "—",
      responsavel: periodo?.responsible_name ?? null,
      empresaNome: periodo?.company?.name ?? "—",
    };
  });
}

export async function decidirRevisao(
  ctx: AppContext,
  input: { tarefaId: string; decisao: "APPROVED" | "RETURNED" | "IGNORED"; notas?: string },
) {
  assertCanWrite(ctx);
  const { error } = await ctx.db
    .from("review_task")
    .update({
      status: input.decisao,
      notes: input.notas ?? null,
      decided_by: ctx.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("organization_id", ctx.organizationId)
    .eq("id", input.tarefaId);

  if (error)
    throw new AppError("INESPERADO", "Não foi possível registrar a decisão.", error.message);

  await audit(ctx, {
    action: "DECIDIR_REVISAO",
    entity: "review_task",
    entityId: input.tarefaId,
    after: { decisao: input.decisao, notas: input.notas ?? null },
  });
  return { ok: true };
}
