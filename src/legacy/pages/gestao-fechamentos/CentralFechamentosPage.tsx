import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "../../router-compat";
import { api } from "../../api/client";
import type {
  BatchExecution,
  BatchExecutionPreview,
  BatchScopeType,
  Company,
  MonthlyMatrixRow,
} from "../../api/types";
import {
  BATCH_EXECUTION_STATUS_LABELS,
  BATCH_ORIGIN_LABELS,
  BATCH_SCOPE_LABELS,
  MONTHLY_SITUATION_LABELS,
} from "../../api/types";
import { formatCnpj, formatDateTime } from "../../lib/format";
import { CompanyPicker } from "../implantacoes/CompanyPicker";

type Tab = "nova" | "historico" | "matriz";

/**
 * "Central de Fechamentos" (/gestao-fechamentos/central) — interface
 * operacional para as APIs de execução em lote já existentes
 * (`BatchExecutionsService`, ver docs/gestao-fechamentos.md "Central de
 * Sincronização"). Centrada em empresa+competência, não no tipo de
 * solicitação. Só `SYNC` está disponível como ação — `VALIDATE`/
 * `SYNC_AND_VALIDATE` aparecem desabilitados com explicação, nunca como
 * ações reais (o motor de leitura+validação não existe, Fase C/D).
 */
export function CentralFechamentosPage() {
  const [tab, setTab] = useState<Tab>("nova");

  return (
    <div className="workflow">
      <main className="wf-shell">
        <div className="closing-hero">
          <div>
            <span className="closing-eyebrow">OPERAÇÃO EM LOTE</span>
            <h1>Central de Fechamentos</h1>
            <p>
              Sincronize e acompanhe várias empresas de uma vez, com fila persistida e progresso em
              tempo real.
            </p>
          </div>
        </div>

        <div className="wf-toolbar" style={{ marginBottom: "1rem", gap: "0.5rem" }}>
          <button
            type="button"
            className={`tab-button ${tab === "nova" ? "active" : ""}`}
            onClick={() => setTab("nova")}
          >
            Nova execução
          </button>
          <button
            type="button"
            className={`tab-button ${tab === "historico" ? "active" : ""}`}
            onClick={() => setTab("historico")}
          >
            Histórico
          </button>
          <button
            type="button"
            className={`tab-button ${tab === "matriz" ? "active" : ""}`}
            onClick={() => setTab("matriz")}
          >
            Matriz mensal
          </button>
        </div>

        {tab === "nova" && <NewExecutionPanel />}
        {tab === "historico" && <HistoryPanel />}
        {tab === "matriz" && <MatrixPanel />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nova execução — prévia obrigatória antes de iniciar.
// ---------------------------------------------------------------------------

function NewExecutionPanel() {
  const navigate = useNavigate();
  const [competencia, setCompetencia] = useState("");
  const [scope, setScope] = useState<BatchScopeType>("ALL_COMPANIES");
  const [selectedCompanies, setSelectedCompanies] = useState<Company[]>([]);
  const [singleCompany, setSingleCompany] = useState<Company | null>(null);
  const [sourceBatchForRetry, setSourceBatchForRetry] = useState<BatchExecution | null>(null);
  const [candidateFailedBatches, setCandidateFailedBatches] = useState<BatchExecution[]>([]);

  const [preview, setPreview] = useState<BatchExecutionPreview | null>(null);
  const [previewSignature, setPreviewSignature] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [fullSync, setFullSync] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyIds = useMemo(() => {
    if (scope === "SELECTED_COMPANIES") return selectedCompanies.map((c) => c.id);
    if (scope === "SINGLE_COMPANY") return singleCompany ? [singleCompany.id] : [];
    return undefined;
  }, [scope, selectedCompanies, singleCompany]);

  const currentSignature = JSON.stringify({
    competencia,
    scope,
    companyIds,
    sourceBatchForRetry: sourceBatchForRetry?.id ?? null,
    fullSync,
  });
  const previewStale = preview !== null && previewSignature !== currentSignature;

  const canPreview =
    !!competencia &&
    (scope !== "SELECTED_COMPANIES" || selectedCompanies.length > 0) &&
    (scope !== "SINGLE_COMPANY" || !!singleCompany) &&
    (scope !== "FAILED_COMPANIES" || !!sourceBatchForRetry);

  useEffect(() => {
    if (scope !== "FAILED_COMPANIES" || !competencia) {
      setCandidateFailedBatches([]);
      return;
    }
    api.gestaoFechamentos.batchExecutions
      .list({ competencia, pageSize: 20 })
      .then((result) => setCandidateFailedBatches(result.data.filter((b) => b.errorCompanies > 0)))
      .catch(() => setCandidateFailedBatches([]));
  }, [scope, competencia]);

  async function handlePreview() {
    setError(null);
    setPreviewLoading(true);
    try {
      const result = await api.gestaoFechamentos.batchExecutions.preview({
        competencia,
        operation: "SYNC",
        scope,
        companyIds,
        sourceBatchExecutionId: sourceBatchForRetry?.id,
        config: { syncMode: fullSync ? "FULL" : "INCREMENTAL" },
      });
      setPreview(result);
      setPreviewSignature(currentSignature);
    } catch (err) {
      setError((err as Error).message);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleStart() {
    if (creating || !preview || previewStale) return;
    setCreating(true);
    setError(null);
    try {
      const batch = await api.gestaoFechamentos.batchExecutions.create({
        competencia,
        operation: "SYNC",
        scope,
        companyIds,
        sourceBatchExecutionId: sourceBatchForRetry?.id,
        config: { syncMode: fullSync ? "FULL" : "INCREMENTAL" },
      });
      navigate(`/gestao-fechamentos/central/${batch.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  }

  function resetPreview() {
    setPreview(null);
    setPreviewSignature(null);
  }

  return (
    <div className="wf-panel wf-section">
      <div className="batch-prerequisite">
        <div>
          <span>1</span>
          <div>
            <strong>Prepare a carteira PIER</strong>
            <small>
              Vincule os clientes antes de processar. Empresas sem vínculo serão ignoradas.
            </small>
          </div>
        </div>
        <Link to="/gestao-fechamentos/empresa">⚡ Abrir ferramenta Vincular todos</Link>
      </div>
      <h3>Iniciar sincronização em lote</h3>

      <div
        className="closing-command-main"
        style={{
          paddingRight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(220px,1fr) minmax(280px,1.6fr)",
          gap: "1rem",
        }}
      >
        <div className="closing-control">
          <span className="closing-control-number">1</span>
          <div>
            <label>Competência</label>
            <input
              type="month"
              value={competencia}
              onChange={(event) => {
                setCompetencia(event.target.value);
                resetPreview();
              }}
            />
          </div>
        </div>

        <div className="closing-control">
          <span className="closing-control-number">2</span>
          <div>
            <label>Escopo</label>
            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as BatchScopeType);
                setSelectedCompanies([]);
                setSingleCompany(null);
                setSourceBatchForRetry(null);
                resetPreview();
              }}
            >
              <option value="ALL_COMPANIES">{BATCH_SCOPE_LABELS.ALL_COMPANIES}</option>
              <option value="SELECTED_COMPANIES">{BATCH_SCOPE_LABELS.SELECTED_COMPANIES}</option>
              <option value="SINGLE_COMPANY">{BATCH_SCOPE_LABELS.SINGLE_COMPANY}</option>
              <option value="FAILED_COMPANIES">{BATCH_SCOPE_LABELS.FAILED_COMPANIES}</option>
              <option value="COMPANIES_WITH_CHANGES">
                {BATCH_SCOPE_LABELS.COMPANIES_WITH_CHANGES}
              </option>
            </select>
          </div>
        </div>
      </div>

      {scope === "SINGLE_COMPANY" && (
        <div style={{ marginTop: "0.85rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "#64748b",
              marginBottom: "0.35rem",
            }}
          >
            Empresa
          </label>
          <CompanyPicker
            selected={singleCompany}
            onSelect={(company) => {
              setSingleCompany(company);
              resetPreview();
            }}
          />
        </div>
      )}

      {scope === "SELECTED_COMPANIES" && (
        <div style={{ marginTop: "0.85rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "#64748b",
              marginBottom: "0.35rem",
            }}
          >
            Empresas selecionadas ({selectedCompanies.length})
          </label>
          <CompanyPicker
            selected={null}
            onSelect={(company) => {
              if (selectedCompanies.some((c) => c.id === company.id)) return;
              setSelectedCompanies((current) => [...current, company]);
              resetPreview();
            }}
          />
          {selectedCompanies.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.6rem" }}>
              {selectedCompanies.map((company) => (
                <span
                  key={company.id}
                  className="closing-tag"
                  style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
                >
                  {company.name}
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                      setSelectedCompanies((current) => current.filter((c) => c.id !== company.id));
                      resetPreview();
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {scope === "FAILED_COMPANIES" && (
        <div style={{ marginTop: "0.85rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "#64748b",
              marginBottom: "0.35rem",
            }}
          >
            Reprocessar falhas de qual execução?
          </label>
          {!competencia ? (
            <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>Escolha a competência primeiro.</p>
          ) : candidateFailedBatches.length === 0 ? (
            <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>
              Nenhuma execução com falhas encontrada nesta competência.
            </p>
          ) : (
            <select
              value={sourceBatchForRetry?.id ?? ""}
              onChange={(event) => {
                setSourceBatchForRetry(
                  candidateFailedBatches.find((b) => b.id === event.target.value) ?? null,
                );
                resetPreview();
              }}
            >
              <option value="">Selecione…</option>
              {candidateFailedBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {formatDateTime(batch.createdAt)} — {batch.errorCompanies} falha(s) de{" "}
                  {batch.totalCompanies}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div style={{ marginTop: "0.85rem" }}>
        <label
          style={{
            display: "block",
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "#64748b",
            marginBottom: "0.35rem",
          }}
        >
          Operação
        </label>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <span className="pill pill-info">Sincronizar (SYNC)</span>
          <span
            className="pill pill-neutral"
            title="Motor de leitura de documentos e validação contábil ainda não existe."
          >
            Validar — indisponível
          </span>
          <span
            className="pill pill-neutral"
            title="Motor de leitura de documentos e validação contábil ainda não existe."
          >
            Sincronizar e validar — indisponível
          </span>
        </div>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.55rem",
          marginTop: "0.85rem",
          fontSize: "0.85rem",
        }}
      >
        <input
          type="checkbox"
          checked={fullSync}
          onChange={(event) => {
            setFullSync(event.target.checked);
            resetPreview();
          }}
        />
        Sincronização completa
        <small style={{ opacity: 0.65 }}>
          (mais lenta; o padrão incremental consulta somente a janela posterior ao último sucesso)
        </small>
      </label>

      <div style={{ marginTop: "1.1rem", display: "flex", gap: "0.6rem" }}>
        <button
          type="button"
          className="wf-btn"
          onClick={handlePreview}
          disabled={!canPreview || previewLoading}
        >
          {previewLoading ? "Calculando prévia…" : "Ver prévia"}
        </button>
        <button
          type="button"
          className="wf-btn wf-btn-primary"
          onClick={handleStart}
          disabled={!preview || previewStale || creating}
        >
          {creating ? "Iniciando…" : "Iniciar execução"}
        </button>
      </div>
      {!preview && (
        <small style={{ display: "block", marginTop: "0.4rem", opacity: 0.65 }}>
          É preciso ver a prévia antes de iniciar.
        </small>
      )}
      {previewStale && (
        <small style={{ display: "block", marginTop: "0.4rem", color: "#b45309" }}>
          Os parâmetros mudaram — gere a prévia de novo.
        </small>
      )}

      {error && (
        <p className="error" style={{ marginTop: "0.75rem" }}>
          {error}
        </p>
      )}

      {preview && !previewStale && (
        <div className="closing-sync-result" style={{ marginTop: "1.1rem" }}>
          <div className="closing-section-heading">
            <div>
              <span>PRÉVIA</span>
              <h2>
                Serão processadas {preview.eligibleCompanies} de {preview.totalCompanies} empresas
              </h2>
            </div>
            <small>Nada foi gravado ainda — a prévia não inicia processamento.</small>
          </div>
          <div className="closing-metric-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
            <MiniMetric value={preview.totalCompanies} label="Total no escopo" tone="blue" />
            <MiniMetric value={preview.eligibleCompanies} label="Serão processadas" tone="green" />
            <MiniMetric value={preview.unlinkedCompanies} label="Sem vínculo PIER" tone="amber" />
            <MiniMetric value={preview.inactiveCompanies} label="Inativas" tone="red" />
          </div>
          {preview.totalCompanies - preview.eligibleCompanies > 0 && (
            <p style={{ fontSize: "0.82rem", opacity: 0.75, marginTop: "0.75rem" }}>
              {preview.totalCompanies - preview.eligibleCompanies} empresa(s) serão ignoradas (sem
              vínculo PIER ou inativas) — nunca derrubam a execução, aparecem marcadas
              individualmente no acompanhamento.
            </p>
          )}
        </div>
      )}
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

// ---------------------------------------------------------------------------
// Histórico — paginado, filtrado, tenant-scoped (o filtro de tenant é
// implícito: a API só devolve execuções do tenant atual).
// ---------------------------------------------------------------------------

function HistoryPanel() {
  const navigate = useNavigate();
  const [competencia, setCompetencia] = useState("");
  const [status, setStatus] = useState("");
  const [origin, setOrigin] = useState("");
  const [scope, setScope] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{
    data: BatchExecution[];
    total: number;
    page: number;
    pageSize: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.gestaoFechamentos.batchExecutions
      .list({
        page,
        pageSize: 15,
        competencia: competencia || undefined,
        status: (status || undefined) as BatchExecution["status"] | undefined,
        origin: (origin || undefined) as BatchExecution["origin"] | undefined,
        scope: (scope || undefined) as BatchScopeType | undefined,
      })
      .then(setResult)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [competencia, status, origin, scope, page]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="wf-panel wf-section">
      <div className="wf-toolbar">
        <input
          type="month"
          value={competencia}
          onChange={(event) => {
            setCompetencia(event.target.value);
            setPage(1);
          }}
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os status</option>
          {Object.entries(BATCH_EXECUTION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={origin}
          onChange={(event) => {
            setOrigin(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas as origens</option>
          {Object.entries(BATCH_ORIGIN_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={scope}
          onChange={(event) => {
            setScope(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os escopos</option>
          {Object.entries(BATCH_SCOPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p style={{ opacity: 0.7 }}>Carregando…</p>}
      {!loading && result && result.data.length === 0 && (
        <p style={{ opacity: 0.7 }}>Nenhuma execução encontrada.</p>
      )}

      {!loading && result && result.data.length > 0 && (
        <div className="wf-table-wrapper">
          <table className="wf-table">
            <thead>
              <tr>
                <th>Competência</th>
                <th>Operação</th>
                <th>Escopo</th>
                <th>Origem</th>
                <th>Status</th>
                <th>Empresas</th>
                <th>Concluídas</th>
                <th>Com erro</th>
                <th>Ignoradas</th>
                <th>Início</th>
                <th>Conclusão</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((batch) => (
                <tr
                  key={batch.id}
                  className="is-clickable"
                  onClick={() => navigate(`/gestao-fechamentos/central/${batch.id}`)}
                >
                  <td>{batch.competencia}</td>
                  <td>{batch.operation}</td>
                  <td>{BATCH_SCOPE_LABELS[batch.scope]}</td>
                  <td>{BATCH_ORIGIN_LABELS[batch.origin]}</td>
                  <td>
                    <StatusPill status={batch.status} />
                  </td>
                  <td className="wf-table-num">{batch.totalCompanies}</td>
                  <td className="wf-table-num">{batch.completedCompanies}</td>
                  <td className="wf-table-num">{batch.errorCompanies}</td>
                  <td className="wf-table-num">{batch.skippedCompanies}</td>
                  <td>{formatDateTime(batch.startedAt)}</td>
                  <td>{formatDateTime(batch.finishedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/gestao-fechamentos/central/${batch.id}`);
                      }}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "0.75rem",
            }}
          >
            <small style={{ opacity: 0.7 }}>
              {result.total} execuç{result.total === 1 ? "ão" : "ões"} no total
            </small>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="wf-btn wf-btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                className="wf-btn wf-btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StatusPill({ status }: { status: BatchExecution["status"] }) {
  const tone =
    status === "COMPLETED"
      ? "success"
      : status === "COMPLETED_WITH_WARNINGS"
        ? "warning"
        : status === "FAILED"
          ? "danger"
          : status === "CANCELLED"
            ? "neutral"
            : "info";
  return <span className={`pill pill-${tone}`}>{BATCH_EXECUTION_STATUS_LABELS[status]}</span>;
}

// ---------------------------------------------------------------------------
// Matriz mensal — só dados de sincronização (ver seção 9 do pedido: "não
// invente status de validação/pendência/pronto para fechar").
// ---------------------------------------------------------------------------

function MatrixPanel() {
  const [competencia, setCompetencia] = useState("");
  const [rows, setRows] = useState<MonthlyMatrixRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!competencia) {
      setRows(null);
      return;
    }
    setLoading(true);
    setError(null);
    api.gestaoFechamentos.batchExecutions
      .matrix(competencia)
      .then(setRows)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [competencia]);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (row) => row.companyName.toLowerCase().includes(term) || row.companyDocument.includes(term),
    );
  }, [rows, search]);

  return (
    <div className="wf-panel wf-section">
      <div className="wf-toolbar">
        <input
          type="month"
          value={competencia}
          onChange={(event) => setCompetencia(event.target.value)}
        />
        {rows && (
          <input
            type="search"
            placeholder="Buscar por nome ou documento…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
      </div>

      {!competencia && <p style={{ opacity: 0.7 }}>Escolha uma competência para ver a matriz.</p>}
      {error && <p className="error">{error}</p>}
      {loading && <p style={{ opacity: 0.7 }}>Carregando…</p>}

      {!loading && rows && (
        <div className="wf-table-wrapper">
          <table className="wf-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Situação</th>
                <th>Solicitações</th>
                <th>Arquivos</th>
                <th>Avisos</th>
                <th>Última sincronização</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.companyId}>
                  <td>
                    {row.companyName}{" "}
                    <small style={{ opacity: 0.6 }}>{formatCnpj(row.companyDocument)}</small>
                  </td>
                  <td>
                    <MatrixSituationPill situacao={row.situacao} />
                  </td>
                  <td className="wf-table-num">{row.requestsFound ?? "—"}</td>
                  <td className="wf-table-num">{row.filesFound ?? "—"}</td>
                  <td className="wf-table-num">{row.warningsCount ?? "—"}</td>
                  <td>{formatDateTime(row.lastSyncedAt)}</td>
                  <td>
                    {row.lastBatchExecutionId && (
                      <a
                        className="btn-link"
                        href={`/gestao-fechamentos/central/${row.lastBatchExecutionId}`}
                      >
                        Ver execução
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MatrixSituationPill({ situacao }: { situacao: MonthlyMatrixRow["situacao"] }) {
  const tone =
    situacao === "SINCRONIZADA"
      ? "success"
      : situacao === "SINCRONIZADA_COM_AVISOS"
        ? "warning"
        : situacao === "FALHA"
          ? "danger"
          : situacao === "SEM_VINCULO_PIER" ||
              situacao === "EMPRESA_INATIVA" ||
              situacao === "CANCELADA"
            ? "neutral"
            : "info";
  return <span className={`pill pill-${tone}`}>{MONTHLY_SITUATION_LABELS[situacao]}</span>;
}
