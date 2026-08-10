import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { ImportedFileSummary, ImportPreview } from "../../../api/types";
import { IMPORT_KIND_LABELS } from "../../../api/types";
import { formatCurrency, formatNumber } from "../../../lib/format";
import { FIELD_LABELS } from "../../../api/types";
import { confidenceBucketClass, confidenceLabel } from "../../../lib/statusLabels";
import { EmptyState, ErrorState, TableSkeleton } from "../components/States";
import { JournalEntriesPanel } from "./JournalEntriesPanel";

interface Props {
  implementationId: string;
  focusImportId: string | null;
}

function columnStatusLabel(confidence: number, field: string | null): string {
  if (!field) return "Não identificada";
  if (confidence >= 85) return "Alta confiança";
  if (confidence >= 50) return "Revisar";
  return "Baixa confiança";
}

export function ReadingStep({ implementationId, focusImportId }: Props) {
  const [files, setFiles] = useState<ImportedFileSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.imports
      .list(implementationId)
      .then((result) => {
        setFiles(result);
        const imported = result.filter((file) => file.status === "IMPORTED");
        const initial = focusImportId ?? imported[0]?.id ?? null;
        setSelectedId(initial);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [implementationId]);

  useEffect(() => {
    if (focusImportId) setSelectedId(focusImportId);
  }, [focusImportId]);

  useEffect(() => {
    if (!selectedId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.imports
      .preview(implementationId, selectedId)
      .then(setPreview)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [implementationId, selectedId]);

  const importedFiles = files.filter((file) => file.status === "IMPORTED");

  return (
    <div className="wf-content">
      <h2>Leitura</h2>
      <p className="wf-subtitle">
        O que o sistema identificou no arquivo importado — direto do motor de análise real.
      </p>

      {importedFiles.length === 0 ? (
        <EmptyState
          icon="🔎"
          title="Nenhum arquivo importado ainda"
          description="Envie um arquivo na etapa Arquivos para ver a leitura aqui."
        />
      ) : (
        <>
          <div className="wf-toolbar">
            <label htmlFor="reading-file" style={{ fontSize: "0.85rem" }}>
              Arquivo:
            </label>
            <select
              id="reading-file"
              value={selectedId ?? ""}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {importedFiles.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.originalName} ({IMPORT_KIND_LABELS[file.kind]})
                </option>
              ))}
            </select>
          </div>

          {error && <ErrorState message={error} />}
          {loading && <TableSkeleton rows={4} />}

          {!loading && preview && (
            <>
              {preview.questorAnalysis ? (
                <>
                  <div className="wf-headline">
                    <div className="wf-headline-item">
                      <span className="wf-headline-value">
                        {formatNumber(preview.questorAnalysis.entriesIdentified)}
                      </span>
                      <span className="wf-headline-label">lançamentos identificados</span>
                    </div>
                    <div className="wf-headline-item">
                      <span className="wf-headline-value wf-accent-success">
                        {formatNumber(preview.questorAnalysis.entriesAutoAccepted)}
                      </span>
                      <span className="wf-headline-label">tratados automaticamente</span>
                    </div>
                    <div className="wf-headline-item">
                      <span className="wf-headline-value wf-accent-warning">
                        {formatNumber(preview.questorAnalysis.entriesNeedingReview)}
                      </span>
                      <span className="wf-headline-label">precisam da sua revisão</span>
                    </div>
                  </div>

                  <div className="wf-section">
                    <dl
                      className="wf-drawer-grid"
                      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
                    >
                      <div>
                        <dt>Contas (débito+crédito) identificadas</dt>
                        <dd>{formatNumber(preview.questorAnalysis.accountsIdentified)}</dd>
                      </div>
                      <div>
                        <dt>Contas novas</dt>
                        <dd>{formatNumber(preview.questorAnalysis.accountsNew)}</dd>
                      </div>
                      <div>
                        <dt>Contas já existentes</dt>
                        <dd>{formatNumber(preview.questorAnalysis.accountsExisting)}</dd>
                      </div>
                      <div>
                        <dt>Total de débitos</dt>
                        <dd>{formatCurrency(preview.questorAnalysis.totalDebitAmount)}</dd>
                      </div>
                      <div>
                        <dt>Total de créditos</dt>
                        <dd>{formatCurrency(preview.questorAnalysis.totalCreditAmount)}</dd>
                      </div>
                      <div>
                        <dt>Lançamentos ignorados</dt>
                        <dd>{formatNumber(preview.questorAnalysis.entriesIgnored)}</dd>
                      </div>
                      <div>
                        <dt>Avisos</dt>
                        <dd>{formatNumber(preview.questorAnalysis.warningsCount)}</dd>
                      </div>
                    </dl>
                  </div>

                  {preview.questorAnalysis.ignoredEntries.length > 0 && (
                    <div className="wf-section">
                      <h3>Linhas ignoradas e motivo</h3>
                      <div className="wf-table-wrapper">
                        <table className="wf-table">
                          <thead>
                            <tr>
                              <th>Linha</th>
                              <th>Motivo</th>
                              <th>Avisos</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.questorAnalysis.ignoredEntries.slice(0, 50).map((row) => (
                              <tr key={row.sourceRow}>
                                <td>{row.sourceRow}</td>
                                <td>{row.reason ?? "Não disponível"}</td>
                                <td>{row.warnings.join(", ") || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {selectedId && (
                    <JournalEntriesPanel
                      implementationId={implementationId}
                      importId={selectedId}
                    />
                  )}
                </>
              ) : preview.ledgerAnalysis ? (
                <>
                  <div className="wf-headline">
                    <div className="wf-headline-item">
                      <span className="wf-headline-value">
                        {formatNumber(preview.ledgerAnalysis.accountsIdentified)}
                      </span>
                      <span className="wf-headline-label">contas identificadas</span>
                    </div>
                    <div className="wf-headline-item">
                      <span className="wf-headline-value wf-accent-success">
                        {formatNumber(preview.ledgerAnalysis.rowsAutoAccepted)}
                      </span>
                      <span className="wf-headline-label">linhas tratadas automaticamente</span>
                    </div>
                    <div className="wf-headline-item">
                      <span className="wf-headline-value wf-accent-warning">
                        {formatNumber(preview.ledgerAnalysis.rowsNeedingReview)}
                      </span>
                      <span className="wf-headline-label">precisam da sua revisão</span>
                    </div>
                  </div>

                  <div className="wf-section">
                    <dl
                      className="wf-drawer-grid"
                      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
                    >
                      <div>
                        <dt>Contas novas</dt>
                        <dd>{formatNumber(preview.ledgerAnalysis.accountsNew)}</dd>
                      </div>
                      <div>
                        <dt>Contas já existentes</dt>
                        <dd>{formatNumber(preview.ledgerAnalysis.accountsExisting)}</dd>
                      </div>
                      <div>
                        <dt>Contas sintéticas</dt>
                        <dd>{formatNumber(preview.ledgerAnalysis.syntheticAccounts)}</dd>
                      </div>
                      <div>
                        <dt>Contas analíticas</dt>
                        <dd>{formatNumber(preview.ledgerAnalysis.analyticAccounts)}</dd>
                      </div>
                      <div>
                        <dt>Centros de custo identificados</dt>
                        <dd>{formatNumber(preview.ledgerAnalysis.costCentersIdentified)}</dd>
                      </div>
                      <div>
                        <dt>Centros de custo novos</dt>
                        <dd>{formatNumber(preview.ledgerAnalysis.costCentersNew)}</dd>
                      </div>
                      <div>
                        <dt>Linhas ignoradas</dt>
                        <dd>{formatNumber(preview.ledgerAnalysis.rowsIgnored)}</dd>
                      </div>
                      <div>
                        <dt>Avisos</dt>
                        <dd>{formatNumber(preview.ledgerAnalysis.warningsCount)}</dd>
                      </div>
                    </dl>
                  </div>

                  {preview.ledgerAnalysis.ignoredRows.length > 0 && (
                    <div className="wf-section">
                      <h3>Linhas ignoradas e motivo</h3>
                      <div className="wf-table-wrapper">
                        <table className="wf-table">
                          <thead>
                            <tr>
                              <th>Linha</th>
                              <th>Motivo</th>
                              <th>Avisos</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.ledgerAnalysis.ignoredRows.slice(0, 50).map((row) => (
                              <tr key={row.sourceRow}>
                                <td>{row.sourceRow + 1}</td>
                                <td>{row.reason ?? "Não disponível"}</td>
                                <td>{row.warnings.join(", ") || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="wf-subtitle">
                  Este arquivo ({IMPORT_KIND_LABELS[preview.kind]}) não passa pelo motor de análise
                  de balancete/razão — apenas planos de contas e centros de custo lidos diretamente.
                </p>
              )}

              <div className="wf-section">
                <h3>Estrutura identificada</h3>
                <div className="wf-table-wrapper">
                  <table className="wf-table">
                    <thead>
                      <tr>
                        <th>Coluna encontrada</th>
                        <th>Interpretado como</th>
                        <th>Confiança</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.columnsDetected.map((detection) => (
                        <tr key={detection.index}>
                          <td>{detection.header}</td>
                          <td>
                            {detection.field ? FIELD_LABELS[detection.field] : "Não identificada"}
                          </td>
                          <td>{confidenceLabel(detection.confidence)}</td>
                          <td>
                            <span
                              className={confidenceBucketClass(
                                detection.field ? detection.confidence : null,
                              )}
                            >
                              {columnStatusLabel(detection.confidence, detection.field)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
