import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { ImportedJournalEntry, RowImportStatus } from "../../../api/types";
import { formatCurrency, formatDate } from "../../../lib/format";
import { ROW_STATUS_CLASS, ROW_STATUS_LABELS } from "../../../lib/statusLabels";
import { EmptyState, TableSkeleton } from "../components/States";

interface Props {
  implementationId: string;
  importId: string;
}

const PAGE_SIZE = 25;

/**
 * Listagem PAGINADA no servidor (nunca carrega tudo de uma vez no frontend —
 * ETAPA 21, requisito de performance para arquivos de até 500 mil
 * lançamentos) dos lançamentos Questor identificados num arquivo `.nli`,
 * com um drawer de detalhe por lançamento.
 */
export function JournalEntriesPanel({ implementationId, importId }: Props) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"ALL" | RowImportStatus>("ALL");
  const [data, setData] = useState<{ total: number; entries: ImportedJournalEntry[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ImportedJournalEntry | null>(null);

  useEffect(() => {
    setPage(1);
  }, [importId, statusFilter]);

  useEffect(() => {
    setLoading(true);
    api.imports.journalEntries
      .list(implementationId, importId, { page, pageSize: PAGE_SIZE, status: statusFilter })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [implementationId, importId, page, statusFilter]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="wf-section">
      <div className="wf-toolbar">
        <h3 style={{ margin: 0 }}>Lançamentos identificados</h3>
        <div className="wf-spacer" />
        <label htmlFor="journal-status-filter" style={{ fontSize: "0.85rem" }}>
          Status:
        </label>
        <select
          id="journal-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "ALL" | RowImportStatus)}
        >
          <option value="ALL">Todos</option>
          <option value="AUTO_ACCEPT">Automático</option>
          <option value="REVIEW">Revisar</option>
          <option value="REJECTED">Rejeitado</option>
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <TableSkeleton rows={5} />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState
          icon="📒"
          title="Nenhum lançamento nesta página"
          description="Ajuste o filtro de status ou verifique o arquivo."
        />
      ) : (
        <>
          <div className="wf-table-wrapper">
            <table className="wf-table">
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Data</th>
                  <th>Conta débito</th>
                  <th>Conta crédito</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => {
                  const debit = entry.lines.find((line) => line.lineType === "DEBIT");
                  const credit = entry.lines.find((line) => line.lineType === "CREDIT");
                  return (
                    <tr key={entry.id} className="is-clickable" onClick={() => setSelected(entry)}>
                      <td>{entry.sourceRow}</td>
                      <td>{formatDate(entry.entryDate)}</td>
                      <td>{debit?.accountCode ?? "Não disponível"}</td>
                      <td>{credit?.accountCode ?? "Não disponível"}</td>
                      <td className="wf-table-num">{formatCurrency(entry.amount)}</td>
                      <td>
                        <span className={ROW_STATUS_CLASS[entry.status]}>
                          {ROW_STATUS_LABELS[entry.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="wf-toolbar" style={{ marginTop: "0.75rem" }}>
            <button className="wf-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </button>
            <span style={{ fontSize: "0.85rem" }}>
              Página {page} de {totalPages} — {data.total} lançamento(s)
            </span>
            <button
              className="wf-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      )}

      {selected && (
        <div className="wf-drawer-overlay" onClick={() => setSelected(null)}>
          <div className="wf-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="wf-drawer-header">
              <h2>Lançamento — linha {selected.sourceRow}</h2>
              <button
                className="wf-drawer-close"
                onClick={() => setSelected(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <dl className="wf-drawer-grid">
              <div>
                <dt>Data</dt>
                <dd>{formatDate(selected.entryDate)}</dd>
              </div>
              <div>
                <dt>Competência</dt>
                <dd>{selected.period ?? "Não disponível"}</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>{formatCurrency(selected.amount)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={ROW_STATUS_CLASS[selected.status]}>
                    {ROW_STATUS_LABELS[selected.status]}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Histórico</dt>
                <dd>{selected.historyDescription ?? "Não disponível"}</dd>
              </div>
              <div>
                <dt>Código do histórico</dt>
                <dd>{selected.historyCode ?? "Não disponível"}</dd>
              </div>
              <div>
                <dt>Empresa (Questor)</dt>
                <dd>{selected.companyCode ?? "Não disponível"}</dd>
              </div>
              <div>
                <dt>Estabelecimento (Questor)</dt>
                <dd>{selected.establishmentCode ?? "Não disponível"}</dd>
              </div>
            </dl>

            <div className="wf-section">
              <h3>Partidas</h3>
              <div className="wf-table-wrapper">
                <table className="wf-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Conta</th>
                      <th>Nome da conta</th>
                      <th>Centro de custo</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.lineType === "DEBIT" ? "Débito" : "Crédito"}</td>
                        <td>{line.accountCode}</td>
                        <td>{line.accountName ?? "Não disponível"}</td>
                        <td>{line.costCenterName ?? line.costCenterCode ?? "Não informado"}</td>
                        <td className="wf-table-num">{formatCurrency(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {selected.warnings.length > 0 && (
              <div className="wf-section">
                <h3>Avisos</h3>
                <p className="wf-subtitle">{selected.warnings.join(", ")}</p>
              </div>
            )}
            {selected.ignoredReason && (
              <div className="wf-section">
                <h3>Motivo de ignorado</h3>
                <p className="wf-subtitle">{selected.ignoredReason}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
