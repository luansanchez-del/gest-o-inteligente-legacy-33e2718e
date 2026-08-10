import type { AppContext } from "../../lib/context";
import { AppError } from "../../lib/errors";
import type { Situacao } from "../competencia/competencia.service";

export type Recorte =
  | "GERAL"
  | "EMPRESA"
  | "RESPONSAVEL"
  | "TIPO"
  | "SITUACAO";

export interface IndicadorFiltro {
  competenciaInicio: string;
  competenciaFim: string;
  recorte: Recorte;
  empresaId?: string;
  responsavel?: string;
}

export interface Indicador {
  codigo: string;
  titulo: string;
  numerador: number;
  denominador: number;
  regra: string;
  formato: "CONTAGEM" | "PERCENTUAL" | "DIAS";
  valor: number;
}

interface Registro {
  id: string;
  empresaId: string;
  empresaNome: string;
  competencia: string;
  tipo: string;
  situacao: Situacao;
  responsavel: string | null;
  prazo: string | null;
  entregueEm: string | null;
}

const ENTREGUES: Situacao[] = ["CONCLUIDA_NO_PRAZO", "CONCLUIDA_FORA_PRAZO"];

async function carregarRegistros(
  ctx: AppContext,
  filtro: IndicadorFiltro,
): Promise<Registro[]> {
  let query = ctx.db
    .from("closing_period")
    .select(
      "id, reference_month, type, situation, responsible_name, deadline_at, delivered_at, company:company_id(id, name)",
    )
    .eq("organization_id", ctx.organizationId)
    .gte("reference_month", filtro.competenciaInicio)
    .lte("reference_month", filtro.competenciaFim);

  if (filtro.empresaId) query = query.eq("company_id", filtro.empresaId);
  if (filtro.responsavel === "SEM_RESPONSAVEL") query = query.is("responsible_name", null);
  else if (filtro.responsavel) query = query.eq("responsible_name", filtro.responsavel);

  const { data, error } = await query.limit(5000);
  if (error)
    throw new AppError("INESPERADO", "Não foi possível apurar o índice.", error.message);

  return (data ?? []).map((row) => {
    const empresa = row.company as unknown as { id: string; name: string };
    return {
      id: row.id,
      empresaId: empresa?.id ?? "",
      empresaNome: empresa?.name ?? "—",
      competencia: row.reference_month,
      tipo: row.type,
      situacao: row.situation as Situacao,
      responsavel: row.responsible_name,
      prazo: row.deadline_at,
      entregueEm: row.delivered_at,
    };
  });
}

function dias(de: string | null, ate: string | null) {
  if (!de || !ate) return null;
  const inicio = new Date(de).getTime();
  const fim = new Date(ate).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return null;
  return (fim - inicio) / 86400000;
}

function indicador(
  codigo: string,
  titulo: string,
  numerador: number,
  denominador: number,
  regra: string,
  formato: Indicador["formato"] = "CONTAGEM",
): Indicador {
  const valor =
    formato === "PERCENTUAL"
      ? denominador > 0
        ? (numerador / denominador) * 100
        : 0
      : numerador;
  return { codigo, titulo, numerador, denominador, regra, formato, valor };
}

export interface PainelIndice {
  indicadores: Indicador[];
  serie: { competencia: string; entregues: number; previstos: number; indice: number }[];
  porRecorte: { chave: string; previstos: number; entregues: number; indice: number }[];
  totalRegistros: number;
}

export async function apurarIndice(
  ctx: AppContext,
  filtro: IndicadorFiltro,
): Promise<PainelIndice> {
  const registros = await carregarRegistros(ctx, filtro);
  const total = registros.length;
  const conta = (predicado: (r: Registro) => boolean) => registros.filter(predicado).length;

  const entregues = conta((r) => ENTREGUES.includes(r.situacao));
  const prazosEntrega = registros
    .filter((r) => ENTREGUES.includes(r.situacao))
    .map((r) => dias(r.prazo, r.entregueEm))
    .filter((v): v is number => v !== null);
  const atrasos = prazosEntrega.filter((v) => v > 0);

  const indicadores: Indicador[] = [
    indicador("PREVISTO", "Previsto para entrega", total, total, "Competências abertas no recorte."),
    indicador(
      "ENTREGUE",
      "Entregue",
      entregues,
      total,
      "Competências classificadas como concluídas (no prazo ou fora do prazo).",
    ),
    indicador(
      "INDICE",
      "Índice de entrega",
      entregues,
      total,
      "Entregues ÷ previstos, no recorte e período selecionados.",
      "PERCENTUAL",
    ),
    indicador(
      "NO_PRAZO",
      "Entregues no prazo",
      conta((r) => r.situacao === "CONCLUIDA_NO_PRAZO"),
      entregues,
      "Concluídas até a data de prazo.",
    ),
    indicador(
      "FORA_PRAZO",
      "Entregues fora do prazo",
      conta((r) => r.situacao === "CONCLUIDA_FORA_PRAZO"),
      entregues,
      "Concluídas após a data de prazo.",
    ),
    indicador(
      "EM_ANDAMENTO",
      "Em andamento",
      conta((r) => r.situacao === "EM_ANDAMENTO_NO_PRAZO"),
      total,
      "Em execução com prazo ainda vigente.",
    ),
    indicador(
      "ATRASADA",
      "Atrasadas",
      conta((r) => r.situacao === "ATRASADA"),
      total,
      "Prazo vencido sem conclusão.",
    ),
    indicador(
      "AGUARDANDO",
      "Aguardando cliente",
      conta((r) => r.situacao === "AGUARDANDO_CLIENTE"),
      total,
      "Pendência sob responsabilidade do cliente.",
    ),
    indicador(
      "SEM_EVIDENCIA",
      "Sem evidência suficiente",
      conta((r) => r.situacao === "SEM_EVIDENCIA"),
      total,
      "Não há postagem, arquivo ou data que sustente uma conclusão.",
    ),
    indicador(
      "REVISAO",
      "Exigem revisão humana",
      conta((r) => r.situacao === "PRECISA_REVISAO"),
      total,
      "Classificação automática com confiança abaixo do limite aceito.",
    ),
    indicador(
      "SEM_RESPONSAVEL",
      "Sem responsável definido",
      conta((r) => !r.responsavel),
      total,
      "Competências sem responsável: contam no denominador e nunca são omitidas.",
    ),
    indicador(
      "PRAZO_MEDIO",
      "Prazo médio de entrega (dias)",
      prazosEntrega.length
        ? Math.round(
            (prazosEntrega.reduce((soma, valor) => soma + valor, 0) / prazosEntrega.length) * 10,
          ) / 10
        : 0,
      prazosEntrega.length,
      "Média de dias entre o prazo e a entrega (negativo = antecipado).",
      "DIAS",
    ),
    indicador(
      "ATRASO_MEDIO",
      "Atraso médio (dias)",
      atrasos.length
        ? Math.round((atrasos.reduce((soma, valor) => soma + valor, 0) / atrasos.length) * 10) / 10
        : 0,
      atrasos.length,
      "Média de dias de atraso apenas entre as entregas fora do prazo.",
      "DIAS",
    ),
  ];

  const porCompetencia = new Map<string, { previstos: number; entregues: number }>();
  for (const registro of registros) {
    const atual = porCompetencia.get(registro.competencia) ?? { previstos: 0, entregues: 0 };
    atual.previstos += 1;
    if (ENTREGUES.includes(registro.situacao)) atual.entregues += 1;
    porCompetencia.set(registro.competencia, atual);
  }

  const chaveDoRecorte = (registro: Registro) => {
    switch (filtro.recorte) {
      case "EMPRESA":
        return registro.empresaNome;
      case "RESPONSAVEL":
        return registro.responsavel ?? "Sem responsável";
      case "TIPO":
        return registro.tipo;
      case "SITUACAO":
        return registro.situacao;
      default:
        return "Carteira geral";
    }
  };

  const agrupado = new Map<string, { previstos: number; entregues: number }>();
  for (const registro of registros) {
    const chave = chaveDoRecorte(registro);
    const atual = agrupado.get(chave) ?? { previstos: 0, entregues: 0 };
    atual.previstos += 1;
    if (ENTREGUES.includes(registro.situacao)) atual.entregues += 1;
    agrupado.set(chave, atual);
  }

  return {
    indicadores,
    serie: [...porCompetencia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([competencia, valores]) => ({
        competencia,
        ...valores,
        indice: valores.previstos ? (valores.entregues / valores.previstos) * 100 : 0,
      })),
    porRecorte: [...agrupado.entries()]
      .map(([chave, valores]) => ({
        chave,
        ...valores,
        indice: valores.previstos ? (valores.entregues / valores.previstos) * 100 : 0,
      }))
      .sort((a, b) => b.previstos - a.previstos),
    totalRegistros: total,
  };
}

/** Drill-down: a lista de competências que compõe um indicador. */
export async function detalharIndicador(
  ctx: AppContext,
  filtro: IndicadorFiltro & { codigo: string },
) {
  const registros = await carregarRegistros(ctx, filtro);
  const filtros: Record<string, (r: Registro) => boolean> = {
    PREVISTO: () => true,
    ENTREGUE: (r) => ENTREGUES.includes(r.situacao),
    INDICE: (r) => ENTREGUES.includes(r.situacao),
    NO_PRAZO: (r) => r.situacao === "CONCLUIDA_NO_PRAZO",
    FORA_PRAZO: (r) => r.situacao === "CONCLUIDA_FORA_PRAZO",
    EM_ANDAMENTO: (r) => r.situacao === "EM_ANDAMENTO_NO_PRAZO",
    ATRASADA: (r) => r.situacao === "ATRASADA",
    AGUARDANDO: (r) => r.situacao === "AGUARDANDO_CLIENTE",
    SEM_EVIDENCIA: (r) => r.situacao === "SEM_EVIDENCIA",
    REVISAO: (r) => r.situacao === "PRECISA_REVISAO",
    SEM_RESPONSAVEL: (r) => !r.responsavel,
    PRAZO_MEDIO: (r) => ENTREGUES.includes(r.situacao),
    ATRASO_MEDIO: (r) => r.situacao === "CONCLUIDA_FORA_PRAZO",
  };

  const predicado = filtros[filtro.codigo] ?? (() => true);
  return registros.filter(predicado);
}
