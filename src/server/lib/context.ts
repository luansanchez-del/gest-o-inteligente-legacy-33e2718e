import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { AppError, naoAutorizado } from "./errors";

export type Role = "admin" | "gestor" | "colaborador" | "leitura";

export interface AppContext {
  db: typeof supabaseAdmin;
  organizationId: string;
  organizationName: string;
  userId: string;
  roles: Role[];
  canWrite: boolean;
  isAdmin: boolean;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "escritorio"
  );
}

/**
 * Carrega o contexto do usuário autenticado (organização + papéis).
 * Na primeira entrada, provisiona a organização e concede o papel de administrador.
 */
export async function loadContext(userId: string, email?: string): Promise<AppContext> {
  const db = supabaseAdmin;

  const { data: membership, error } = await db
    .from("membership")
    .select("organization_id, organization:organization_id(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new AppError("INESPERADO", "Não foi possível carregar seu acesso.", error.message);

  let organizationId = membership?.organization_id ?? null;
  let organizationName =
    (membership?.organization as { name?: string } | null)?.name ?? "Minha organização";

  if (!organizationId) {
    const baseName = email ? email.split("@")[1] || email : "Minha organização";
    const { data: org, error: orgError } = await db
      .from("organization")
      .insert({ name: baseName, slug: `${slugify(baseName)}-${userId.slice(0, 8)}` })
      .select("id, name")
      .single();
    if (orgError || !org)
      throw new AppError(
        "INESPERADO",
        "Não foi possível preparar sua organização.",
        orgError?.message,
      );

    organizationId = org.id;
    organizationName = org.name;

    await db.from("membership").insert({
      organization_id: organizationId,
      user_id: userId,
      email: email ?? null,
    });
    await db
      .from("user_role")
      .insert({ organization_id: organizationId, user_id: userId, role: "admin" });
    await db.from("integration_credential_ref").insert({
      organization_id: organizationId,
      integration: "PIER",
      secret_name: "PIER_API_TOKEN",
      configured: false,
    });
  }

  const { data: roleRows } = await db
    .from("user_role")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId);

  const roles = (roleRows ?? []).map((r) => r.role as Role);

  return {
    db,
    organizationId,
    organizationName,
    userId,
    roles,
    canWrite: roles.some((r) => r === "admin" || r === "gestor" || r === "colaborador"),
    isAdmin: roles.includes("admin"),
  };
}

export function assertCanWrite(ctx: AppContext) {
  if (!ctx.canWrite) throw naoAutorizado("Seu perfil permite apenas consulta.");
}

export function assertAdmin(ctx: AppContext) {
  if (!ctx.isAdmin) throw naoAutorizado("Apenas administradores podem alterar configurações.");
}
