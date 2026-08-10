import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { ChartAccount, ChartAccountOrigin, RowImportStatus } from "../../../api/types";
import { formatCurrency } from "../../../lib/format";
import { ROW_STATUS_CLASS, ROW_STATUS_LABELS, confidenceLabel } from "../../../lib/statusLabels";
import { EmptyState, ErrorState, TableSkeleton } from "../components/States";
import { Pagination } from "../components/Pagination";
import { AccountDetailDrawer } from "../components/AccountDetailDrawer";

interface Props {
  implementationId: string;
}

const PAGE_SIZE = 50;

type StatusFilter = "ALL" | RowImportStatus;
type AnalyticFilter = "ALL" | "true" | "false";
type MovementFilter = "ALL" | "true" | "false";

function accountTypeLabel(analytic: boolean | null): string {
  if (analytic === null) return "Não disponível";
  return analytic ? "Analítica" : "Sintética";
}

function AccountRow({
  account,
  onOpen,
  indent,
}: {
  account: ChartAccount;
  onOpen: (id: string) => void;
  indent?: number;
}) {
  return (
    <tr className="is-clickable" onClick={() => onOpen(account.id)}>
      <td style={indent ? { paddingLeft: `${0.85 + indent * 1.25}rem` } : undefined}>
        {account.code}
      </td>
      <td>{account.name}</td>
      <td>{accountTypeLabel(account.analytic)}</td>
      <td>{account.nature ?? "Não informado"}</td>
      <td className="wf-table-num">{formatCurrency(account.lastPreviousBalance)}</td>
      <td className="wf-table-num">{formatCurrency(account.lastDebit)}</td>
      <td className="wf-table-num">{formatCurrency(account.lastCredit)}</td>
      <td className="wf-table-num">{formatCurrency(account.lastFinalBalance)}</td>
      <td>{confidenceLabel(account.lastImportConfidence)}</td>
      <td>
        {account.lastImportStatus ? (
          <span className={ROW_STATUS_CLASS[account.lastImportStatus]}>
            {ROW_STATUS_LABELS[account.lastImportStatus]}
          </span>
        ) : (
          <span className="pill pill-neutral">Manual</span>
        )}
      </td>
    </tr>
  );
}

function TableHead() {
  return (
    <thead>
      <tr>
        <th>Código</th>
        <th>Descrição</th>
        <th>Tipo</th>
        <th>Natureza</th>
        <th>Saldo anterior</th>
        <th>Débito</th>
        <th>Crédito</th>
        <th>Saldo final</th>
        <th>Confiança</th>
        <th>Status</th>
      </tr>
    </thead>
  );
}

function HierarchyNode({
  implementationId,
  origin,
  account,
  depth,
  onOpen,
}: {
  implementationId: string;
  origin: ChartAccountOrigin;
  account: ChartAccount;
  depth: number;
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<ChartAccount[] | null>(null);
  const hasChildren = account.analytic === false;

  function toggle() {
    if (!hasChildren) return;
    if (!expanded && children === null) {
      api.chartAccounts
        .search(implementationId, { origin, parentCode: account.code, pageSize: 200 })
        .then((result) => setChildren(result.data));
    }
    setExpanded((value) => !value);
  }

  return (
    <>
      <tr className="is-clickable" onClick={() => onOpen(account.id)}>
        <td style={{ paddingLeft: `${0.85 + depth * 1.25}rem` }}>
          <span className="wf-tree-row">
            <button
              className="wf-tree-toggle"
              onClick={(event) => {
                event.stopPropagation();
                toggle();
              }}
              disabled={!hasChildren}
              aria-label={expanded ? "Recolher" : "Expandir"}
            >
              {hasChildren ? (expanded ? "▾" : "▸") : ""}
            </button>
            {account.code}
          </span>
        </td>
        <td>{account.name}</td>
        <td>{accountTypeLabel(account.analytic)}</td>
        <td>{account.nature ?? "Não informado"}</td>
        <td className="wf-table-num">{formatCurrency(account.lastPreviousBalance)}</td>
        <td className="wf-table-num">{formatCurrency(account.lastDebit)}</td>
        <td className="wf-table-num">{formatCurrency(account.lastCredit)}</td>
        <td className="wf-table-num">{formatCurrency(account.lastFinalBalance)}</td>
        <td>{confidenceLabel(account.lastImportConfidence)}</td>
        <td>
          {account.lastImportStatus ? (
            <span className={ROW_STATUS_CLASS[account.lastImportStatus]}>
              {ROW_STATUS_LABELS[account.lastImportStatus]}
            </span>
          ) : (
            <span className="pill pill-neutral">Manual</span>
          )}
        </td>
      </tr>
      {expanded &&
        children?.map((child) => (
          <HierarchyNode
            key={child.id}
            implementationId={implementationId}
            origin={origin}
            account={child}
            depth={depth + 1}
            onOpen={onOpen}
          />
        ))}
    </>
  );
}

export function AccountsStep({ implementationId }: Props) {
  const [origin, setOrigin] = useState<ChartAccountOrigin>("SOURCE");
  const [view, setView] = useState<"table" | "hierarchy">("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [analyticFilter, setAnalyticFilter] = useState<AnalyticFilter>("ALL");
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ data: ChartAccount[]; total: number } | null>(null);
  const [rootAccounts, setRootAccounts] = useState<ChartAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => setPage(1), [origin, search, statusFilter, analyticFilter, movementFilter, view]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    if (view === "hierarchy") {
      api.chartAccounts
        .search(implementationId, { origin, parentCode: "ROOT", pageSize: 200 })
        .then((result) => setRootAccounts(result.data))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
      return;
    }
    api.chartAccounts
      .search(implementationId, {
        origin,
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        status: statusFilter,
        analytic: analyticFilter,
        hasMovement: movementFilter,
      })
      .then((result) => setData(result))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [implementationId, origin, view, page, search, statusFilter, analyticFilter, movementFilter]);

  return (
    <div className="wf-content">
      <h2>Contas</h2>
      <p className="wf-subtitle">
        Contas identificadas a partir dos arquivos importados, com upsert automático — sem cadastro
        manual prévio.
      </p>

      <div className="wf-toolbar">
        <div className="wf-filter-group">
          <button
            className={`wf-chip${origin === "SOURCE" ? " is-active" : ""}`}
            onClick={() => setOrigin("SOURCE")}
          >
            Origem
          </button>
          <button
            className={`wf-chip${origin === "TARGET" ? " is-active" : ""}`}
            onClick={() => setOrigin("TARGET")}
          >
            Destino
          </button>
        </div>
        <div className="wf-spacer" />
        <div className="wf-view-toggle">
          <button className={view === "table" ? "is-active" : ""} onClick={() => setView("table")}>
            Tabela
          </button>
          <button
            className={view === "hierarchy" ? "is-active" : ""}
            onClick={() => setView("hierarchy")}
          >
            Hierarquia
          </button>
        </div>
      </div>

      {view === "table" && (
        <div className="wf-toolbar">
          <input
            type="search"
            placeholder="Buscar por código ou descrição…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="wf-filter-group">
            {(["ALL", "AUTO_ACCEPT", "REVIEW", "REJECTED"] as StatusFilter[]).map((value) => (
              <button
                key={value}
                className={`wf-chip${statusFilter === value ? " is-active" : ""}`}
                onClick={() => setStatusFilter(value)}
              >
                {value === "ALL" ? "Todas" : ROW_STATUS_LABELS[value]}
              </button>
            ))}
          </div>
          <div className="wf-filter-group">
            {(
              [
                ["ALL", "Sintéticas e Analíticas"],
                ["false", "Sintéticas"],
                ["true", "Analíticas"],
              ] as [AnalyticFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                className={`wf-chip${analyticFilter === value ? " is-active" : ""}`}
                onClick={() => setAnalyticFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={movementFilter}
            onChange={(event) => setMovementFilter(event.target.value as MovementFilter)}
          >
            <option value="ALL">Com ou sem movimentação</option>
            <option value="true">Com movimentação</option>
            <option value="false">Sem movimentação</option>
          </select>
        </div>
      )}

      {error && <ErrorState message={error} />}

      {loading && <TableSkeleton />}

      {!loading && !error && view === "table" && data && (
        <>
          {data.data.length === 0 ? (
            <EmptyState
              icon="🗂️"
              title="Nenhuma conta encontrada"
              description="Ajuste os filtros ou importe um arquivo na etapa Arquivos."
            />
          ) : (
            <>
              <div className="wf-table-wrapper">
                <table className="wf-table">
                  <TableHead />
                  <tbody>
                    {data.data.map((account) => (
                      <AccountRow key={account.id} account={account} onOpen={setSelectedId} />
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={data.total}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}

      {!loading && !error && view === "hierarchy" && (
        <>
          {!rootAccounts || rootAccounts.length === 0 ? (
            <EmptyState
              icon="🌳"
              title="Hierarquia não disponível"
              description="Nenhuma conta de nível raiz foi identificada com segurança para este plano. As contas continuam disponíveis na visão em tabela."
            />
          ) : (
            <div className="wf-table-wrapper">
              <table className="wf-table">
                <TableHead />
                <tbody>
                  {rootAccounts.map((account) => (
                    <HierarchyNode
                      key={account.id}
                      implementationId={implementationId}
                      origin={origin}
                      account={account}
                      depth={0}
                      onOpen={setSelectedId}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selectedId && (
        <AccountDetailDrawer
          implementationId={implementationId}
          accountId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
