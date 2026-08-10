import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type {
  AccountMapping,
  AccountMappingStats,
  ChartAccount,
  MappingCandidate,
  MappingStatus,
} from "../../../api/types";
import { formatNumber } from "../../../lib/format";
import {
  MAPPING_STATUS_CLASS,
  MAPPING_STATUS_LABELS,
  confidenceLabel,
} from "../../../lib/statusLabels";
import { EmptyState, ErrorState, TableSkeleton } from "../components/States";
import { Pagination } from "../components/Pagination";
import { TargetAccountPicker } from "../components/TargetAccountPicker";
import { CostCenterMappingPanel } from "./CostCenterMappingPanel";

interface Props {
  implementationId: string;
  initialType?: "accounts" | "cost-centers";
}

const PAGE_SIZE = 50;

type StatusFilter = "ALL" | MappingStatus;

/** Resumo apresentacional dos sinais que provavelmente contribuíram para o score — não recalcula o score, só descreve os campos reais já carregados. */
function explainMatch(mapping: AccountMapping): string {
  const reasons: string[] = [];
  if (
    mapping.sourceAccount.code.trim().toLowerCase() ===
    mapping.targetAccount.code.trim().toLowerCase()
  ) {
    reasons.push("código idêntico");
  }
  if (
    mapping.sourceAccount.nature &&
    mapping.sourceAccount.nature === mapping.targetAccount.nature
  ) {
    reasons.push("mesma natureza");
  }
  if (
    mapping.sourceAccount.classification &&
    mapping.sourceAccount.classification === mapping.targetAccount.classification
  ) {
    reasons.push("mesma classificação");
  }
  if (reasons.length === 0) reasons.push("similaridade de descrição");
  return reasons.join(" + ");
}

function AccountCell({ account }: { account: ChartAccount }) {
  return (
    <div>
      <div>{account.code}</div>
      <div className="wf-hint">{account.name}</div>
    </div>
  );
}

function AccountMappingPanel({ implementationId }: Props) {
  const [tab, setTab] = useState<"all" | "exceptions">("all");
  const [stats, setStats] = useState<AccountMappingStats | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [result, setResult] = useState<{ data: AccountMapping[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingBulk, setConfirmingBulk] = useState(false);

  const [reviewMappings, setReviewMappings] = useState<AccountMapping[] | null>(null);
  const [rejectedMappings, setRejectedMappings] = useState<AccountMapping[] | null>(null);
  const [candidatesByMapping, setCandidatesByMapping] = useState<
    Record<string, MappingCandidate[]>
  >({});

  function loadStats() {
    api.accountMappings
      .stats(implementationId)
      .then(setStats)
      .catch(() => undefined);
  }

  function loadList() {
    setLoading(true);
    setError(null);
    api.accountMappings
      .list(implementationId, {
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        status: statusFilter,
      })
      .then(setResult)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function loadExceptions() {
    setLoading(true);
    setError(null);
    Promise.all([
      api.accountMappings.list(implementationId, { page: 1, pageSize: 30, status: "NEEDS_REVIEW" }),
      api.accountMappings.list(implementationId, { page: 1, pageSize: 30, status: "REJECTED" }),
    ])
      .then(([review, rejected]) => {
        setReviewMappings(review.data);
        setRejectedMappings(rejected.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadStats, [implementationId]);
  useEffect(() => setPage(1), [search, statusFilter]);
  useEffect(() => {
    if (tab === "all") loadList();
    else loadExceptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [implementationId, tab, page, search, statusFilter]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await api.accountMappings.generateSuggestions(implementationId);
      loadStats();
      if (tab === "all") loadList();
      else loadExceptions();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleConfirm(id: string) {
    await api.accountMappings.confirm(implementationId, id);
    loadStats();
    if (tab === "all") loadList();
    else loadExceptions();
  }

  async function handleReject(id: string) {
    await api.accountMappings.reject(implementationId, id);
    loadStats();
    if (tab === "all") loadList();
    else loadExceptions();
  }

  async function handleChangeTarget(mappingId: string, target: ChartAccount) {
    await api.accountMappings.update(implementationId, mappingId, { targetAccountId: target.id });
    setEditingId(null);
    loadStats();
    if (tab === "all") loadList();
    else loadExceptions();
  }

  async function handleChooseCandidate(mapping: AccountMapping, candidate: MappingCandidate) {
    await api.accountMappings.update(implementationId, mapping.id, {
      targetAccountId: candidate.targetAccount.id,
    });
    await api.accountMappings.confirm(implementationId, mapping.id);
    loadStats();
    loadExceptions();
  }

  async function loadCandidates(mappingId: string) {
    if (candidatesByMapping[mappingId]) return;
    const candidates = await api.accountMappings.candidates(implementationId, mappingId);
    setCandidatesByMapping((prev) => ({ ...prev, [mappingId]: candidates }));
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleApproveSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Aprovar ${selected.size} mapeamento(s) selecionado(s)?`)) return;
    await api.accountMappings.confirmMany(implementationId, Array.from(selected));
    setSelected(new Set());
    loadStats();
    loadList();
  }

  async function handleApproveHighConfidence() {
    if (!stats || stats.pendingHighConfidence === 0) return;
    if (
      !window.confirm(
        `Aprovar ${stats.pendingHighConfidence} correspondência(s) de alta confiança?`,
      )
    )
      return;
    setConfirmingBulk(true);
    try {
      await api.accountMappings.confirmBulk(implementationId, 95);
      loadStats();
      loadList();
    } finally {
      setConfirmingBulk(false);
    }
  }

  return (
    <div>
      <h2>DE/PARA de Contas</h2>
      <p className="wf-subtitle">O sistema sugere; você revisa apenas as exceções.</p>

      {stats && (
        <div className="wf-headline">
          <div className="wf-headline-item">
            <span className="wf-headline-value">{formatNumber(stats.suggestionsGenerated)}</span>
            <span className="wf-headline-label">sugestões geradas</span>
          </div>
          <div className="wf-headline-item">
            <span className="wf-headline-value wf-accent-success">
              {formatNumber(stats.confirmed)}
            </span>
            <span className="wf-headline-label">confirmadas</span>
          </div>
          <div className="wf-headline-item">
            <span className="wf-headline-value wf-accent-warning">
              {formatNumber(stats.needsReview)}
            </span>
            <span className="wf-headline-label">precisam revisão</span>
          </div>
          <div className="wf-headline-item">
            <span className="wf-headline-value">{formatNumber(stats.noMatch)}</span>
            <span className="wf-headline-label">sem correspondência</span>
          </div>
        </div>
      )}

      <div className="wf-toolbar">
        <button className="wf-btn wf-btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating ? "Gerando…" : "Gerar sugestões"}
        </button>
        <button
          className="wf-btn"
          onClick={handleApproveHighConfidence}
          disabled={confirmingBulk || !stats || stats.pendingHighConfidence === 0}
        >
          {confirmingBulk
            ? "Aprovando…"
            : `Aprovar ${stats ? formatNumber(stats.pendingHighConfidence) : 0} correspondência(s) de alta confiança`}
        </button>
        <div className="wf-spacer" />
        <div className="wf-view-toggle">
          <button className={tab === "all" ? "is-active" : ""} onClick={() => setTab("all")}>
            Todas
          </button>
          <button
            className={tab === "exceptions" ? "is-active" : ""}
            onClick={() => setTab("exceptions")}
          >
            Exceções
          </button>
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {tab === "all" && (
        <>
          <div className="wf-toolbar">
            <input
              type="search"
              placeholder="Buscar conta origem por código ou descrição…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="wf-filter-group">
              {(
                ["ALL", "SUGGESTED", "NEEDS_REVIEW", "CONFIRMED", "REJECTED"] as StatusFilter[]
              ).map((value) => (
                <button
                  key={value}
                  className={`wf-chip${statusFilter === value ? " is-active" : ""}`}
                  onClick={() => setStatusFilter(value)}
                >
                  {value === "ALL" ? "Todos" : MAPPING_STATUS_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="wf-bulk-bar">
              <span>{selected.size} selecionada(s)</span>
              <button className="wf-btn wf-btn-sm wf-btn-primary" onClick={handleApproveSelected}>
                Aprovar selecionadas
              </button>
              <button className="wf-btn wf-btn-sm" onClick={() => setSelected(new Set())}>
                Limpar seleção
              </button>
            </div>
          )}

          {loading && <TableSkeleton />}

          {!loading && result && result.data.length === 0 && (
            <EmptyState
              icon="🔗"
              title="Nenhum mapeamento ainda"
              description='Importe os planos de contas e clique em "Gerar sugestões".'
            />
          )}

          {!loading && result && result.data.length > 0 && (
            <>
              <div className="wf-table-wrapper">
                <table className="wf-table">
                  <thead>
                    <tr>
                      <th className="wf-checkbox-cell" />
                      <th>Origem</th>
                      <th>Destino sugerido</th>
                      <th>Confiança</th>
                      <th>Motivo</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((mapping) => (
                      <tr key={mapping.id}>
                        <td className="wf-checkbox-cell">
                          <input
                            type="checkbox"
                            checked={selected.has(mapping.id)}
                            onChange={() => toggleSelected(mapping.id)}
                          />
                        </td>
                        <td>
                          <AccountCell account={mapping.sourceAccount} />
                        </td>
                        <td>
                          {editingId === mapping.id ? (
                            <TargetAccountPicker
                              implementationId={implementationId}
                              currentLabel={`${mapping.targetAccount.code} — ${mapping.targetAccount.name}`}
                              onSelect={(account) => handleChangeTarget(mapping.id, account)}
                              onCancel={() => setEditingId(null)}
                            />
                          ) : (
                            <AccountCell account={mapping.targetAccount} />
                          )}
                        </td>
                        <td>{confidenceLabel(mapping.confidence)}</td>
                        <td className="wf-hint">{explainMatch(mapping)}</td>
                        <td>
                          <span className={MAPPING_STATUS_CLASS[mapping.status]}>
                            {MAPPING_STATUS_LABELS[mapping.status]}
                          </span>
                        </td>
                        <td className="actions-cell">
                          {mapping.status !== "CONFIRMED" && (
                            <button className="btn-link" onClick={() => handleConfirm(mapping.id)}>
                              Aprovar
                            </button>
                          )}
                          <button className="btn-link" onClick={() => setEditingId(mapping.id)}>
                            Alterar
                          </button>
                          {mapping.status !== "REJECTED" && (
                            <button className="btn-link" onClick={() => handleReject(mapping.id)}>
                              Ignorar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={result.total}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}

      {tab === "exceptions" && (
        <>
          {loading && <TableSkeleton />}
          {!loading && reviewMappings?.length === 0 && rejectedMappings?.length === 0 && (
            <EmptyState
              icon="🎉"
              title="Nenhuma exceção pendente"
              description="Todas as sugestões já foram tratadas."
            />
          )}

          {!loading && reviewMappings && reviewMappings.length > 0 && (
            <div className="wf-section">
              <h3>Precisam revisão</h3>
              {reviewMappings.map((mapping) => (
                <div
                  key={mapping.id}
                  className="wf-exception-card"
                  onMouseEnter={() => loadCandidates(mapping.id)}
                >
                  <div className="wf-exception-head">
                    <span className="wf-exception-account">
                      {mapping.sourceAccount.code} — {mapping.sourceAccount.name}
                    </span>
                    <span className={MAPPING_STATUS_CLASS[mapping.status]}>
                      {MAPPING_STATUS_LABELS[mapping.status]}
                    </span>
                  </div>
                  <div className="wf-exception-reason">
                    {candidatesByMapping[mapping.id]
                      ? `${candidatesByMapping[mapping.id].length} destino(s) possível(is)`
                      : "Carregando alternativas…"}
                  </div>
                  <div className="wf-suggestion-list">
                    {(candidatesByMapping[mapping.id] ?? []).map((candidate) => (
                      <div key={candidate.targetAccount.id} className="wf-suggestion-row">
                        <span>
                          {candidate.targetAccount.code} — {candidate.targetAccount.name}
                        </span>
                        <span style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                          <strong>{confidenceLabel(candidate.score)}</strong>
                          <button
                            className="btn-link"
                            onClick={() => handleChooseCandidate(mapping, candidate)}
                          >
                            Aprovar este
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="actions-cell" style={{ marginTop: "0.6rem" }}>
                    <button className="btn-link" onClick={() => handleReject(mapping.id)}>
                      Ignorar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && rejectedMappings && rejectedMappings.length > 0 && (
            <div className="wf-section">
              <h3>Rejeitadas</h3>
              {rejectedMappings.map((mapping) => (
                <div key={mapping.id} className="wf-exception-card">
                  <div className="wf-exception-head">
                    <span className="wf-exception-account">
                      {mapping.sourceAccount.code} — {mapping.sourceAccount.name}
                    </span>
                    <span className={MAPPING_STATUS_CLASS[mapping.status]}>
                      {MAPPING_STATUS_LABELS[mapping.status]}
                    </span>
                  </div>
                  <div className="actions-cell">
                    <button className="btn-link" onClick={() => handleConfirm(mapping.id)}>
                      Aprovar mesmo assim
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function MappingStep({ implementationId, initialType = "accounts" }: Props) {
  const [mappingType, setMappingType] = useState<"accounts" | "cost-centers">(initialType);

  return (
    <div className="wf-content">
      <div className="wf-view-toggle" style={{ width: "fit-content", marginBottom: "1.25rem" }}>
        <button
          className={mappingType === "accounts" ? "is-active" : ""}
          onClick={() => setMappingType("accounts")}
        >
          Contas contábeis
        </button>
        <button
          className={mappingType === "cost-centers" ? "is-active" : ""}
          onClick={() => setMappingType("cost-centers")}
        >
          Centros de custo
        </button>
      </div>

      {mappingType === "accounts" ? (
        <AccountMappingPanel implementationId={implementationId} />
      ) : (
        <CostCenterMappingPanel implementationId={implementationId} />
      )}
    </div>
  );
}
