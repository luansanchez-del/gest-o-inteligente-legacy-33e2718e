import { useState } from "react";
import { api } from "../../../api/client";
import type { ImplementationStats } from "../../../api/types";
import { formatNumber } from "../../../lib/format";

interface Props {
  implementationId: string;
  stats: ImplementationStats | null;
  onNavigate: (stepKey: string) => void;
  onConcluded: () => void;
}

export function ReviewStep({ implementationId, stats, onNavigate, onConcluded }: Props) {
  const [concluding, setConcluding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConclude() {
    setConcluding(true);
    setError(null);
    try {
      await api.implementations.conclude(implementationId);
      onConcluded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConcluding(false);
    }
  }

  if (!stats) {
    return (
      <div className="wf-content">
        <h2>Revisão</h2>
        <p className="wf-subtitle">Carregando resumo…</p>
      </div>
    );
  }

  const reasons: string[] = [];
  if (stats.accountsPending > 0)
    reasons.push(`${formatNumber(stats.accountsPending)} conta(s) sem mapeamento confirmado`);
  if (stats.costCentersPending > 0)
    reasons.push(
      `${formatNumber(stats.costCentersPending)} centro(s) de custo sem mapeamento confirmado`,
    );
  if (stats.rowsNeedingReview > 0)
    reasons.push(
      `${formatNumber(stats.rowsNeedingReview)} linha(s) importada(s) aguardando revisão`,
    );

  return (
    <div className="wf-content">
      <h2>Revisão</h2>
      <p className="wf-subtitle">Confira o resumo antes de concluir a implantação.</p>

      <div className="wf-section">
        <h3>Contas</h3>
        <dl
          className="wf-drawer-grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
        >
          <div>
            <dt>Contas encontradas</dt>
            <dd>{formatNumber(stats.sourceAccounts)}</dd>
          </div>
          <div>
            <dt>Contas mapeadas</dt>
            <dd>{formatNumber(stats.accountsMapped)}</dd>
          </div>
          <div>
            <dt>Contas pendentes</dt>
            <dd>{formatNumber(stats.accountsPending)}</dd>
          </div>
        </dl>
      </div>

      <div className="wf-section">
        <h3>Centros de Custo</h3>
        <dl
          className="wf-drawer-grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
        >
          <div>
            <dt>Centros de custo encontrados</dt>
            <dd>{formatNumber(stats.sourceCostCenters)}</dd>
          </div>
          <div>
            <dt>Centros mapeados</dt>
            <dd>{formatNumber(stats.costCentersMapped)}</dd>
          </div>
          <div>
            <dt>Centros pendentes</dt>
            <dd>{formatNumber(stats.costCentersPending)}</dd>
          </div>
        </dl>
      </div>

      <div className="wf-section">
        <h3>Qualidade da importação</h3>
        <dl
          className="wf-drawer-grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
        >
          <div>
            <dt>Automáticas (AUTO_ACCEPT)</dt>
            <dd>{formatNumber(stats.rowsAutoAccepted)}</dd>
          </div>
          <div>
            <dt>Para revisar (REVIEW)</dt>
            <dd>{formatNumber(stats.rowsNeedingReview)}</dd>
          </div>
          <div>
            <dt>Rejeitadas (REJECTED)</dt>
            <dd>{formatNumber(stats.rowsRejected)}</dd>
          </div>
          <div>
            <dt>Avisos críticos</dt>
            <dd>{formatNumber(stats.warningsCount)}</dd>
          </div>
        </dl>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="wf-toolbar">
        {stats.pendingImpediments ? (
          <>
            <button className="wf-btn wf-btn-primary" onClick={() => onNavigate("mapping")}>
              Revisar {formatNumber(stats.accountsPending)} conta(s) pendente(s)
            </button>
            <span className="wf-hint">Motivo: {reasons.join("; ") || "há itens pendentes"}.</span>
          </>
        ) : (
          <button className="wf-btn wf-btn-primary" onClick={handleConclude} disabled={concluding}>
            {concluding ? "Concluindo…" : "Concluir implantação"}
          </button>
        )}
      </div>
    </div>
  );
}
