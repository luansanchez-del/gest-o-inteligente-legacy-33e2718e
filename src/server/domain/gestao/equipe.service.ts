import { audit } from "../../lib/audit";
import { assertCanWrite, type AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import { carregarUsuariosPier } from "./pier-user.repo";


/** Tipos considerados internos do escritório (o PIER também lista usuários "Cliente"). */
const TIPOS_INTERNOS = new Set(["colaborador", "gestor", "encarregado"]);

export interface LinhaImportacao {
  nome: string;
  tipo?: string | null;
  email?: string | null;
  departamento?: string | null;
  status?: string | null;
}

export interface DepartamentoLinha {
  id: string;
  codigo: string;
  nome: string;
  personalizado: boolean;
  usuariosAtivos: number;
  usuariosTotal: number;
}

export interface UsuarioLinha {
  id: string;
  nome: string;
  tipo: string | null;
  email: string | null;
  status: string | null;
  departamentoId: string | null;
  departamentoNome: string | null;
}

function nomePadraoDepartamento(externalId: string) {
  return `Departamento ${externalId}`;
}

function normalizarTexto(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Visão operacional completa da equipe: departamentos + usuários internos. */
export async function listarEquipeCompleta(ctx: AppContext) {
  const [{ data: departamentos, error }, usuarios] = await Promise.all([
    ctx.db
      .from("pier_department")
      .select("external_id, name, user_count, synced_at")
      .eq("organization_id", ctx.organizationId)
      .order("name"),
    carregarUsuariosPier<{
      external_id: string;
      name: string;
      kind: string | null;
      email: string | null;
      status: string | null;
      department_external_id: string | null;
    }>(ctx, "external_id, name, kind, email, status, department_external_id"),
  ]);

  if (error)
    throw new AppError("INESPERADO", "Não foi possível carregar os departamentos.", error.message);

  const internos = usuarios
    .filter((u) => TIPOS_INTERNOS.has((u.kind ?? "").toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));


  const nomes = new Map((departamentos ?? []).map((d) => [d.external_id, d.name]));
  const ativos = new Map<string, number>();
  const totais = new Map<string, number>();
  for (const u of internos) {
    const dep = u.department_external_id;
    if (!dep) continue;
    totais.set(dep, (totais.get(dep) ?? 0) + 1);
    if ((u.status ?? "").toLowerCase() === "ativo")
      ativos.set(dep, (ativos.get(dep) ?? 0) + 1);
  }

  const linhasDepartamento = (departamentos ?? [])
    .map<DepartamentoLinha>((d) => ({
      id: d.external_id,
      codigo: d.external_id,
      nome: d.name,
      personalizado: d.name !== nomePadraoDepartamento(d.external_id),
      usuariosAtivos: ativos.get(d.external_id) ?? 0,
      usuariosTotal: totais.get(d.external_id) ?? 0,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    departamentos: linhasDepartamento,
    usuarios: internos.map<UsuarioLinha>((u) => ({
      id: u.external_id,
      nome: u.name,
      tipo: u.kind,
      email: u.email,
      status: u.status,
      departamentoId: u.department_external_id,
      departamentoNome: u.department_external_id
        ? (nomes.get(u.department_external_id) ?? nomePadraoDepartamento(u.department_external_id))
        : null,
    })),
    totais: {
      departamentos: linhasDepartamento.length,
      usuariosAtivos: internos.filter((u) => (u.status ?? "").toLowerCase() === "ativo").length,
      semDepartamento: internos.filter((u) => !u.department_external_id).length,
    },
    sincronizadoEm: departamentos?.[0]?.synced_at ?? null,
  };
}

interface Casamento {
  linha: LinhaImportacao;
  usuario: { external_id: string; name: string; department_external_id: string | null };
  por: "EMAIL" | "NOME";
}

async function analisar(ctx: AppContext, rows: LinhaImportacao[]) {
  const { data: usuarios, error } = await ctx.db
    .from("pier_user")
    .select("external_id, name, email, kind, department_external_id")
    .eq("organization_id", ctx.organizationId);

  if (error)
    throw new AppError("INESPERADO", "Não foi possível carregar os usuários.", error.message);

  const internos = (usuarios ?? []).filter((u) =>
    TIPOS_INTERNOS.has((u.kind ?? "").toLowerCase()),
  );

  const porEmail = new Map<string, typeof internos>();
  const porNome = new Map<string, typeof internos>();
  for (const u of internos) {
    const email = normalizarTexto(u.email);
    if (email) porEmail.set(email, [...(porEmail.get(email) ?? []), u]);
    const nome = normalizarTexto(u.name);
    if (nome) porNome.set(nome, [...(porNome.get(nome) ?? []), u]);
  }

  const encontrados: Casamento[] = [];
  const naoEncontrados: string[] = [];
  const ambiguos: string[] = [];

  for (const linha of rows) {
    const email = normalizarTexto(linha.email);
    const candidatosEmail = email ? (porEmail.get(email) ?? []) : [];
    if (candidatosEmail.length === 1) {
      encontrados.push({ linha, usuario: candidatosEmail[0]!, por: "EMAIL" });
      continue;
    }
    const candidatosNome = porNome.get(normalizarTexto(linha.nome)) ?? [];
    if (candidatosNome.length === 1) {
      encontrados.push({ linha, usuario: candidatosNome[0]!, por: "NOME" });
      continue;
    }
    if (candidatosNome.length > 1 || candidatosEmail.length > 1)
      ambiguos.push(linha.nome || (linha.email ?? "(sem nome)"));
    else naoEncontrados.push(linha.nome || (linha.email ?? "(sem nome)"));
  }

  // Departamento PIER -> nomes propostos pela planilha.
  const nomesPorDepartamento = new Map<string, Set<string>>();
  for (const item of encontrados) {
    const dep = item.usuario.department_external_id;
    const nome = (item.linha.departamento ?? "").trim();
    if (!dep || !nome) continue;
    const atual = nomesPorDepartamento.get(dep) ?? new Set<string>();
    atual.add(nome);
    nomesPorDepartamento.set(dep, atual);
  }

  const atualizacoes: { departamentoId: string; nome: string }[] = [];
  const conflitos: { departamentoId: string; nomes: string[] }[] = [];
  for (const [dep, nomes] of nomesPorDepartamento) {
    const lista = [...nomes];
    const unicos = new Map(lista.map((n) => [normalizarTexto(n), n]));
    if (unicos.size === 1) atualizacoes.push({ departamentoId: dep, nome: [...unicos.values()][0]! });
    else conflitos.push({ departamentoId: dep, nomes: lista });
  }

  return { encontrados, naoEncontrados, ambiguos, atualizacoes, conflitos };
}

function resumir(
  rows: LinhaImportacao[],
  analise: Awaited<ReturnType<typeof analisar>>,
) {
  const departamentosPlanilha = new Set(
    rows.map((r) => (r.departamento ?? "").trim()).filter(Boolean),
  );
  return {
    totalLinhas: rows.length,
    departamentosDetectados: departamentosPlanilha.size,
    usuariosEncontrados: analise.encontrados.length,
    usuariosNaoEncontrados: analise.naoEncontrados.length,
    usuariosAmbiguos: analise.ambiguos.length,
    departamentosAtualizaveis: analise.atualizacoes.length,
    amostraNaoEncontrados: analise.naoEncontrados.slice(0, 15),
    amostraAmbiguos: analise.ambiguos.slice(0, 15),
    atualizacoes: analise.atualizacoes,
    conflitos: analise.conflitos,
  };
}

export type ResumoImportacao = ReturnType<typeof resumir>;

/** Simulação da importação: não grava nada. */
export async function previsualizarImportacaoEquipe(ctx: AppContext, rows: LinhaImportacao[]) {
  if (!rows.length) throw new AppError("VALIDACAO", "A planilha não tem linhas para importar.");
  return resumir(rows, await analisar(ctx, rows));
}

/**
 * Aplica somente o nome legível dos departamentos. Nunca altera external_id,
 * status, e-mail ou o vínculo real do usuário no PIER.
 */
export async function aplicarImportacaoEquipe(ctx: AppContext, rows: LinhaImportacao[]) {
  assertCanWrite(ctx);
  if (!rows.length) throw new AppError("VALIDACAO", "A planilha não tem linhas para importar.");

  const analise = await analisar(ctx, rows);
  let atualizados = 0;
  const falhas: string[] = [];

  for (const item of analise.atualizacoes) {
    const { error } = await ctx.db
      .from("pier_department")
      .update({ name: item.nome })
      .eq("organization_id", ctx.organizationId)
      .eq("external_id", item.departamentoId);
    if (error) falhas.push(`${item.departamentoId}: ${error.message}`);
    else atualizados += 1;
  }

  const resumo = resumir(rows, analise);

  await audit(ctx, {
    action: "IMPORTAR_EQUIPE",
    entity: "pier_department",
    after: {
      linhas: rows.length,
      departamentosAtualizados: atualizados,
      conflitos: analise.conflitos.length,
      naoEncontrados: analise.naoEncontrados.length,
    },
  });

  return { ...resumo, departamentosAtualizados: atualizados, falhas };
}
