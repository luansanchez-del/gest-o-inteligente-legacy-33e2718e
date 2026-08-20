export type StatusPierFiltro = "PENDENTES" | "FINALIZADAS" | "TODOS";

function normalizarStatus(status: string | null | undefined) {
  return (status ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * O status atual do PIER prevalece sobre timestamps históricos.
 * Isso é essencial quando uma solicitação já finalizada é reaberta: alguns retornos/listagens
 * podem conservar finishedAt antigo, mas um status explícito de trabalho (Aberta/Andamento/etc.)
 * significa que a solicitação está ativa novamente.
 */
export function solicitacaoFinalizadaPier(
  status: string | null | undefined,
  finishedAt: string | null | undefined,
) {
  const atual = normalizarStatus(status);

  if (/finaliz|conclu|encerr/.test(atual)) return true;
  if (/abert|andament|penden|revis|aguard|retorn|reabert/.test(atual)) return false;

  // Fallback apenas quando o status não é conclusivo.
  return Boolean(finishedAt);
}

export function atendeFiltroStatusPier(
  filtro: StatusPierFiltro | null | undefined,
  status: string | null | undefined,
  finishedAt: string | null | undefined,
) {
  if (!filtro || filtro === "TODOS") return true;
  const finalizada = solicitacaoFinalizadaPier(status, finishedAt);
  return filtro === "FINALIZADAS" ? finalizada : !finalizada;
}

/**
 * Na carga operacional, solicitações finalizadas que nunca entraram na base podem ser ignoradas.
 * Se já existem localmente, continuam elegíveis para atualização de status/finishedAt, impedindo
 * que uma solicitação já concluída no PIER permaneça falsa e visualmente pendente no Gestor.
 */
export function selecionarParaCarga<
  T extends {
    externalId: string;
    status: string | null;
    finishedAt: string | null;
  },
>(solicitacoes: T[], existentes: Set<string>, incluirFinalizadas: boolean) {
  const elegiveis: T[] = [];
  let finalizadasIgnoradas = 0;

  for (const solicitacao of solicitacoes) {
    const finalizada = solicitacaoFinalizadaPier(
      solicitacao.status,
      solicitacao.finishedAt,
    );
    if (
      finalizada &&
      !incluirFinalizadas &&
      !existentes.has(solicitacao.externalId)
    ) {
      finalizadasIgnoradas += 1;
      continue;
    }
    elegiveis.push(solicitacao);
  }

  return { elegiveis, finalizadasIgnoradas };
}
