import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { CostCenterWithMapping } from "../../../api/types";
import { formatNumber } from "../../../lib/format";
import {
  MAPPING_STATUS_CLASS,
  MAPPING_STATUS_LABELS,
  confidenceLabel,
} from "../../../lib/statusLabels";
import { EmptyState, ErrorState, TableSkeleton } from "../components/States";

interface Props {
  implementationId: string;
  onContinue: () => void;
  onDataChanged: () => void;
}

export function CostCentersStep({ implementationId, onContinue, onDataChanged }: Props) {
  const [costCenters, setCostCenters] = useState<CostCenterWithMapping[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.costCenters
      .withMappings(implementationId, "SOURCE")
      .then(setCostCenters)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [implementationId]);

  const suggested = (costCenters ?? []).filter(
    (costCenter) => costCenter.mappingId && costCenter.mappingStatus !== "CONFIRMED",
  );
  const confirmed = (costCenters ?? []).filter(
    (costCenter) => costCenter.mappingStatus === "CONFIRMED",
  );
  const withoutSuggestion = (costCenters ?? []).filter((costCenter) => !costCenter.mappingId);

  async function handleApproveAndContinue() {
    setApproving(true);
    setError(null);
    try {
      if (suggested.length > 0) {
        await api.costCenterMappings.confirmMany(
          implementationId,
          suggested.map((costCenter) => costCenter.mappingId!),
        );
      }
      onDataChanged();
      onContinue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="wf-content">
      <h2>Centros de Custo</h2>
      <p className="wf-subtitle">
        O sistema já comparou os centros do balancete com os centros da Questor.
      </p>

      {error && <ErrorState message={error} />}
      {loading && <TableSkeleton />}

      {!loading && !error && (!costCenters || costCenters.length === 0) && (
        <EmptyState
          icon="🏷️"
          title="Nenhum centro de custo identificado"
          description="Volte para Arquivos e importe um balancete ou razão com centros de custo."
        />
      )}

      {!loading && !error && costCenters && costCenters.length > 0 && (
        <>
          <div
            className="wf-panel"
            style={{ padding: "1rem", marginBottom: "1rem", background: "#f8fafc" }}
          >
            <h3 style={{ marginTop: 0 }}>Só falta confirmar</h3>
            <p>
              <strong>{suggested.length}</strong> correspondência(s) foram sugeridas,{" "}
              <strong>{confirmed.length}</strong> já estão aprovadas e{" "}
              <strong>{withoutSuggestion.length}</strong> precisam de escolha manual.
            </p>
            <button
              className="wf-btn wf-btn-primary"
              onClick={handleApproveAndContinue}
              disabled={approving}
            >
              {approving
                ? "Aprovando…"
                : `Aprovar sugestões e resolver ${withoutSuggestion.length} pendência(s) →`}
            </button>
          </div>

          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: "0.75rem" }}>
              Ver detalhes das correspondências
            </summary>
            <div className="wf-table-wrapper">
              <table className="wf-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Centro encontrado</th>
                    <th>Destino sugerido</th>
                    <th>Confiança</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {costCenters.map((costCenter) => (
                    <tr key={costCenter.id}>
                      <td>{costCenter.code}</td>
                      <td>
                        {costCenter.name}
                        <div className="wf-hint">
                          {formatNumber(costCenter.occurrences)} ocorrência(s)
                        </div>
                      </td>
                      <td>
                        {costCenter.suggestedTarget
                          ? `${costCenter.suggestedTarget.code} — ${costCenter.suggestedTarget.name}`
                          : "Precisa escolher"}
                      </td>
                      <td>{confidenceLabel(costCenter.mappingConfidence)}</td>
                      <td>
                        {costCenter.mappingStatus ? (
                          <span className={MAPPING_STATUS_CLASS[costCenter.mappingStatus]}>
                            {MAPPING_STATUS_LABELS[costCenter.mappingStatus]}
                          </span>
                        ) : (
                          <span className="pill pill-neutral">Pendente</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
