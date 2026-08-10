import type { AppContext } from "./context";

export interface AuditInput {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  actorKind?: "user" | "job" | "adapter";
  correlationId?: string | null;
}

/** Registra uma ação relevante. Nunca lança: auditoria não pode derrubar a operação. */
export async function audit(ctx: AppContext, input: AuditInput): Promise<void> {
  try {
    await ctx.db.from("audit_log").insert({
      organization_id: ctx.organizationId,
      actor_id: ctx.userId,
      actor_kind: input.actorKind ?? "user",
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      before_data: (input.before ?? null) as never,
      after_data: (input.after ?? null) as never,
      correlation_id: input.correlationId ?? null,
    });
  } catch (error) {
    console.error("[audit] falha ao registrar", error);
  }
}
