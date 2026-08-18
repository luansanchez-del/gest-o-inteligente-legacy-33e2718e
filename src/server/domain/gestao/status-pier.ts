export type StatusPierFiltro = "PENDENTES" | "FINALIZADAS" | "TODOS";

/**
 * O PIER pode indicar encerramento tanto pelo campo finishedAt quanto pelo texto do status.
 * Usar as duas fontes evita que uma solicitação marcada como "Finalizada" apareça como pendente
 * quando o timestamp de finalização ainda não veio preenchido na sincronização.
 */
export function solicitacaoFinalizadaPier(
  status: string | null | undefined,
  finishedAt: string | null | undefined,
) {
  return Boolean(finishedAt) || /finaliz|conclu|encerr/i.test(status ?? "");
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
