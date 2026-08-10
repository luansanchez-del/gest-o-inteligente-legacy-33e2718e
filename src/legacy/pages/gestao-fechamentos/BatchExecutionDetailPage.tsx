import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "../../router-compat";
import { api } from "../../api/client";
import type { BatchExecution, CompanyExecution, CompanyExecutionStatus } from "../../api/types";
import {
  BATCH_ORIGIN_LABELS,
  BATCH_SCOPE_LABELS,
  COMPANY_EXECUTION_ACTIVE_STATUSES,
  COMPANY_EXECUTION_STATUS_LABELS,
} from "../../api/types";
import { formatCnpj, formatDateTime } from "../../lib/format";
import { StatusPill } from "./CentralFechamentosPage";

const POLL_INTERVAL_MS = 2500;
const ACTIVE_BATCH_STATUSES: BatchExecution["status"][] = ["QUEUED", "RUNNING"];

type CompanyFilter = "ALL" | CompanyExecutionStatus;

/**
 * Acompanhamento de UMA execução em lote — polling controlado enquanto
 * ativa, parado assim que chega a um estado terminal (ver seção 4 do pedido
 * "Central de Sincronização"). Nunca mantém a requisição HTTP original
 * aberta: essa tela só CONSULTA o progresso que já está sendo processado em
 * segundo plano pelo backend.
 */
export function BatchExecutionDetailPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<BatchExecution | null>(null);
  const [companies, setCompanies] = useState<CompanyExecution[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState<CompanyFilter>("ALL");
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);

  async function load() {
    if (!batchId) return;
    try {
      const [batchResult, companiesResult] = await Promise.all([
        api.gestaoFechamentos.batchExecutions.get(batchId),
        api.gestaoFechamentos.batchExecutions.listCompanies(batchId),
      ]);
      setBatch(batchResult);
      setCompanies(companiesResult);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const isActive = batch ? ACTIVE_BATCH_STATUSES.includes(batch.status) : false;

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      void load();
      setNow(Date.now());
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, batchId]);

  const elapsed = useMemo(() => {
    if (!batch?.startedAt) return null;
    const end = batch.finishedAt ? new Date(batch.finishedAt).getTime() : now;
    const seconds = Math.max(0, Math.round((end - new Date(batch.startedAt).getTime()) / 1000));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }, [batch?.startedAt, batch?.finishedAt, now]);

  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    let list = companies;
    if (filter !== "ALL") list = list.filter((c) => c.status === filter);
    const term = search.trim().toLowerCase();
    if (term)
      list = list.filter(
        (c) => c.company.name.toLowerCase().includes(term) || c.company.document.includes(term),
      );
    return list;
  }, [companies, filter, search]);

  async function handleCancel() {
    if (!batchId || cancelling) return;
    if (
      !window.confirm(
        "Empresas já em processamento NÃO serão interrompidas — só os itens ainda na fila serão cancelados. Continuar?",
      )
    )
      return;
    setCancelling(true);
    try {
      await api.gestaoFechamentos.batchExecutions.cancel(batchId);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  async function handleRetryFailed() {
    if (!batchId || retrying || !batch) return;
    if (batch.errorCompanies === 0) return;
    if (
      !window.confirm(
        `${batch.errorCompanies} empresa(s) com falha serão reprocessadas numa nova execução. Continuar?`,
      )
    )
      return;
    setRetrying(true);
    try {
      const retryBatch = await api.gestaoFechamentos.batchExecutions.retryFailed(batchId);
      navigate(`/gestao-fechamentos/central/${retryBatch.id}`);
    } catch (err) {
      setError((err as Error).message);
      setRetrying(false);
    }
  }

  const statusCounts = useMemo(() => {
    if (!companies) return {} as Record<CompanyExecutionStatus, number>;
    return companies.reduce<Record<string, number>>(
      (acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }),
      {},
    ) as Record<CompanyExecutionStatus, number>;
  }, [companies]);

  if (error && !batch) {
    return (
      <div className="workflow">
        <main className="wf-shell">
          <p className="error">{error}</p>
          <Link to="/gestao-fechamentos/central" className="btn-link">
            ← Voltar ao histórico
          </Link>
        </main>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="workflow">
        <main className="wf-shell">
          <p style={{ opacity: 0.7 }}>Carregando…</p>
        </main>
      </div>
    );
  }

  const percent =
    batch.totalCompanies > 0
      ? Math.round(((batch.totalCompanies - batch.pendingCompanies) / batch.totalCompanies) * 100)
      : 0;
  const inProcessing = companies
    ? companies.filter(
        (c) => COMPANY_EXECUTION_ACTIVE_STATUSES.includes(c.status) && c.status !== "QUEUED",
      ).length
    : 0;
  const queuedCount = statusCounts.QUEUED ?? 0;
  const cancelledCount = statusCounts.CANCELLED ?? 0;

  return (
    <div className="workflow">
      <main className="wf-shell">
        <Link to="/gestao-fechamentos/central" className="btn-link">
          ← Voltar ao histórico
        </Link>

        <div className="closing-hero" style={{ marginTop: "0.5rem" }}>
          <div>
            <span className="closing-eyebrow">EXECUÇÃO EM LOTE</span>
            <h1>
              {batch.competencia} — {BATCH_SCOPE_LABELS[batch.scope]}
            </h1>
            <p>
              Origem: {BATCH_ORIGIN_LABELS[batch.origin]} · Iniciada em{" "}
              {formatDateTime(batch.startedAt)}
              {elapsed && ` · ${elapsed} decorrido${batch.finishedAt ? "" : " (em andamento)"}`}
            </p>
          </div>
          <StatusPill status={batch.status} />
        </div>

        {isActive && (
          <p
            style={{
              fontSize: "0.8rem",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span className="closing-live-dot" /> Processando em segundo plano — esta tela só
            consulta o progresso, atualizando a cada {POLL_INTERVAL_MS / 1000}s.
          </p>
        )}

        <div className="wf-panel wf-section">
          <div className="wf-toolbar" style={{ margin: "0 0 0.75rem" }}>
            <strong>{percent}% concluído</strong>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: "#e2e8f0",
              overflow: "hidden",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${percent}%`,
                background: "#2563eb",
                transition: "width .3s ease",
              }}
            />
          </div>
          <div className="closing-metric-grid" style={{ gridTemplateColumns: "repeat(7,1fr)" }}>
            <MiniMetric value={batch.totalCompanies} label="Total" tone="blue" />
            <MiniMetric value={queuedCount} label="Na fila" tone="violet" />
            <MiniMetric value={inProcessing} label="Processando" tone="amber" />
            <MiniMetric value={batch.completedCompanies} label="Concluídas" tone="green" />
            <MiniMetric value={batch.warningCompanies} label="Com avisos" tone="amber" />
            <MiniMetric value={batch.errorCompanies} label="Com erro" tone="red" />
            <MiniMetric value={batch.skippedCompanies} label="Ignoradas" tone="violet" />
          </div>
          {cancelledCount > 0 && (
            <small style={{ display: "block", marginTop: "0.6rem", opacity: 0.7 }}>
              {cancelledCount} cancelada(s).
            </small>
          )}
        </div>

        <div className="wf-toolbar" style={{ marginTop: "1rem" }}>
          <button type="button" className="wf-btn" onClick={() => void load()}>
            ↻ Atualizar
          </button>
          {isActive && (
            <button
              type="button"
              className="wf-btn wf-btn-danger"
              onClick={handleCancel}
              disabled={cancelling || queuedCount === 0}
            >
              {cancelling ? "Cancelando…" : "Cancelar itens na fila"}
            </button>
          )}
          <button
            type="button"
            className="wf-btn"
            onClick={handleRetryFailed}
            disabled={retrying || batch.errorCompanies === 0}
          >
            {retrying ? "Iniciando…" : `Reprocessar falhas (${batch.errorCompanies})`}
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="wf-panel wf-section" style={{ marginTop: "1rem" }}>
          <div className="wf-toolbar">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as CompanyFilter)}
            >
              <option value="ALL">Todas</option>
              {Object.entries(COMPANY_EXECUTION_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder="Buscar por nome ou documento…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {companies === null ? (
            <p style={{ opacity: 0.7 }}>Carregando empresas…</p>
          ) : filteredCompanies.length === 0 ? (
            <p style={{ opacity: 0.7 }}>Nenhuma empresa corresponde ao filtro.</p>
          ) : (
            <div className="wf-table-wrapper">
              <table className="wf-table">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Status</th>
                    <th>Solicitações</th>
                    <th>Arquivos</th>
                    <th>Novos</th>
                    <th>Avisos</th>
                    <th>Tentativas</th>
                    <th>Início</th>
                    <th>Conclusão</th>
                    <th>Erro</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanies.map((execution) => (
                    <tr key={execution.id}>
                      <td>
                        {execution.company.name}{" "}
                        <small style={{ opacity: 0.6 }}>
                          {formatCnpj(execution.company.document)}
                        </small>
                      </td>
                      <td>
                        <CompanyStatusPill
                          status={execution.status}
                          errorMessage={execution.errorMessage}
                        />
                      </td>
                      <td className="wf-table-num">{execution.requestsFound ?? "—"}</td>
                      <td className="wf-table-num">{execution.filesFound ?? "—"}</td>
                      <td className="wf-table-num">{execution.filesNew ?? "—"}</td>
                      <td className="wf-table-num">{execution.warningsCount ?? "—"}</td>
                      <td className="wf-table-num">{execution.attempts}</td>
                      <td>{formatDateTime(execution.startedAt)}</td>
                      <td>{formatDateTime(execution.finishedAt)}</td>
                      <td
                        style={{
                          maxWidth: 220,
                          whiteSpace: "normal",
                          fontSize: "0.78rem",
                          opacity: 0.8,
                        }}
                      >
                        {execution.errorMessage ?? ""}
                      </td>
                      <td>
                        <Link
                          className="btn-link"
                          to={`/gestao-fechamentos?companyId=${execution.companyId}&competencia=${execution.competencia}`}
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function MiniMetric({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className={`closing-metric closing-metric-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function CompanyStatusPill({
  status,
  errorMessage,
}: {
  status: CompanyExecutionStatus;
  errorMessage: string | null;
}) {
  const tone =
    status === "COMPLETED"
      ? "success"
      : status === "COMPLETED_WITH_WARNINGS"
        ? "warning"
        : status === "FAILED"
          ? "danger"
          : status === "CANCELLED" || status === "SKIPPED"
            ? "neutral"
            : "info";
  const skipReason =
    status === "SKIPPED" && errorMessage
      ? ` — ${errorMessage.replace("Não processada — ", "")}`
      : "";
  return (
    <span className={`pill pill-${tone}`}>
      {COMPANY_EXECUTION_STATUS_LABELS[status]}
      {skipReason}
    </span>
  );
}
