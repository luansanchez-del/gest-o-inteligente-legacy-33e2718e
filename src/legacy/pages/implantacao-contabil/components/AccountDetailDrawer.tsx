import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { ChartAccountDetail } from "../../../api/types";
import { formatCurrency, formatDateTime } from "../../../lib/format";
import { ROW_STATUS_CLASS, ROW_STATUS_LABELS, confidenceLabel } from "../../../lib/statusLabels";

interface Props {
  implementationId: string;
  accountId: string;
  onClose: () => void;
}

export function AccountDetailDrawer({ implementationId, accountId, onClose }: Props) {
  const [detail, setDetail] = useState<ChartAccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    setDetail(null);
    setShowRaw(false);
    api.chartAccounts
      .detail(implementationId, accountId)
      .then(setDetail)
      .catch((err) => setError(err.message));
  }, [implementationId, accountId]);

  return (
    <div className="wf-drawer-overlay" onClick={onClose}>
      <div className="wf-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="wf-drawer-header">
          <h2>{detail ? `${detail.account.code}` : "Carregando…"}</h2>
          <button className="wf-drawer-close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {!detail && !error && <p>Carregando detalhes…</p>}

        {detail && (
          <>
            <dl className="wf-drawer-grid">
              <div>
                <dt>Código</dt>
                <dd>{detail.account.code}</dd>
              </div>
              <div>
                <dt>Descrição</dt>
                <dd>{detail.account.name}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>
                  {detail.account.analytic === null
                    ? "Não disponível"
                    : detail.account.analytic
                      ? "Analítica"
                      : "Sintética"}
                </dd>
              </div>
              <div>
                <dt>Nível</dt>
                <dd>{detail.account.level ?? "Não disponível"}</dd>
              </div>
              <div>
                <dt>Conta pai</dt>
                <dd>{detail.account.parentCode ?? "Não disponível"}</dd>
              </div>
              <div>
                <dt>Natureza</dt>
                <dd>{detail.account.nature ?? "Não informado"}</dd>
              </div>
              <div>
                <dt>Saldo anterior</dt>
                <dd>{formatCurrency(detail.lastImportedRow?.previousBalance)}</dd>
              </div>
              <div>
                <dt>Débito</dt>
                <dd>{formatCurrency(detail.lastImportedRow?.debit)}</dd>
              </div>
              <div>
                <dt>Crédito</dt>
                <dd>{formatCurrency(detail.lastImportedRow?.credit)}</dd>
              </div>
              <div>
                <dt>Saldo final</dt>
                <dd>{formatCurrency(detail.lastImportedRow?.finalBalance)}</dd>
              </div>
              <div>
                <dt>Centro de custo</dt>
                <dd>
                  {detail.costCenter
                    ? `${detail.costCenter.code} — ${detail.costCenter.name}`
                    : "Não informado"}
                </dd>
              </div>
              <div>
                <dt>Arquivo de origem</dt>
                <dd>{detail.lastImportedRow?.importedFile?.originalName ?? "Cadastro manual"}</dd>
              </div>
              <div>
                <dt>Aba</dt>
                <dd>{detail.lastImportedRow?.importedFile?.sheetName ?? "Não disponível"}</dd>
              </div>
              <div>
                <dt>Linha original</dt>
                <dd>
                  {detail.lastImportedRow ? detail.lastImportedRow.sourceRow + 1 : "Não disponível"}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {detail.lastImportedRow ? (
                    <span className={ROW_STATUS_CLASS[detail.lastImportedRow.status]}>
                      {ROW_STATUS_LABELS[detail.lastImportedRow.status]}
                    </span>
                  ) : (
                    "Cadastro manual"
                  )}
                </dd>
              </div>
              <div>
                <dt>Confiança</dt>
                <dd>{confidenceLabel(detail.account.lastImportConfidence)}</dd>
              </div>
            </dl>

            {detail.lastImportedRow?.warnings && detail.lastImportedRow.warnings.length > 0 && (
              <div className="wf-section">
                <h3>Avisos</h3>
                <ul>
                  {detail.lastImportedRow.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {detail.lastImportedRow && (
              <div className="wf-section">
                <button className="wf-btn wf-btn-sm" onClick={() => setShowRaw((value) => !value)}>
                  {showRaw ? "Ocultar dado original" : "Ver dado original"}
                </button>
                {showRaw && (
                  <pre className="wf-raw-data">
                    {JSON.stringify(detail.lastImportedRow.rawData, null, 2)}
                  </pre>
                )}
                <p className="wf-hint">
                  Importado em {formatDateTime(detail.lastImportedRow.createdAt)}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
