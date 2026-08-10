import { useEffect, useMemo, useState } from "react";
import { api } from "../../../api/client";
import type { CostCenter, CostCenterMapping, CostCenterMappingStats } from "../../../api/types";
import { formatNumber } from "../../../lib/format";
import {
  MAPPING_STATUS_CLASS,
  MAPPING_STATUS_LABELS,
  confidenceLabel,
} from "../../../lib/statusLabels";
import { EmptyState, ErrorState, TableSkeleton } from "../components/States";

interface Props {
  implementationId: string;
}

interface TargetPickerProps {
  targets: CostCenter[];
  currentLabel?: string;
  disabled?: boolean;
  onSelect: (target: CostCenter) => void;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function TargetCostCenterPicker({
  targets,
  currentLabel = "",
  disabled,
  onSelect,
}: TargetPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const normalizedQuery = normalizeSearch(query.trim());
  const matches = targets
    .filter((target) => normalizeSearch(`${target.code} ${target.name}`).includes(normalizedQuery))
    .slice(0, 12);

  return (
    <div className="wf-autocomplete">
      <input
        type="search"
        value={query}
        disabled={disabled}
        placeholder={currentLabel || "Digite o código ou nome do destino…"}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ width: "100%" }}
      />
      {open && (
        <div className="wf-autocomplete-list">
          {matches.length === 0 ? (
            <div className="wf-autocomplete-item">Nenhum centro encontrado</div>
          ) : (
            matches.map((target) => (
              <div
                key={target.id}
                className="wf-autocomplete-item"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setQuery(`${target.code} — ${target.name}`);
                  setOpen(false);
                  onSelect(target);
                }}
              >
                <span>
                  <strong>{target.code}</strong> — {target.name}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function CostCenterMappingPanel({ implementationId }: Props) {
  const [stats, setStats] = useState<CostCenterMappingStats | null>(null);
  const [mappings, setMappings] = useState<CostCenterMapping[] | null>(null);
  const [sources, setSources] = useState<CostCenter[]>([]);
  const [targets, setTargets] = useState<CostCenter[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [nextStats, nextMappings, nextSources, nextTargets] = await Promise.all([
        api.costCenterMappings.stats(implementationId),
        api.costCenterMappings.list(implementationId),
        api.costCenters.list(implementationId, "SOURCE"),
        api.costCenters.list(implementationId, "TARGET"),
      ]);
      setStats(nextStats);
      setMappings(nextMappings);
      setSources(nextSources);
      setTargets(nextTargets);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [implementationId]);

  const filteredMappings = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return mappings ?? [];
    return (mappings ?? []).filter((mapping) =>
      [
        mapping.sourceCostCenter.code,
        mapping.sourceCostCenter.name,
        mapping.targetCostCenter.code,
        mapping.targetCostCenter.name,
      ].some((value) => value.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [mappings, search]);

  const unmatchedSources = useMemo(() => {
    const mappedIds = new Set((mappings ?? []).map((mapping) => mapping.sourceCostCenterId));
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return sources.filter((source) => {
      if (mappedIds.has(source.id)) return false;
      return (
        !term ||
        [source.code, source.name].some((value) => value.toLocaleLowerCase("pt-BR").includes(term))
      );
    });
  }, [mappings, search, sources]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await api.costCenterMappings.generateSuggestions(implementationId);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleConfirm(id: string) {
    await runAction(id, () => api.costCenterMappings.confirm(implementationId, id));
  }

  async function handleReject(id: string) {
    await runAction(id, () => api.costCenterMappings.reject(implementationId, id));
  }

  async function handleChangeTarget(mapping: CostCenterMapping, targetCostCenterId: string) {
    if (!targetCostCenterId) return;
    await runAction(mapping.id, () =>
      api.costCenterMappings.create(implementationId, {
        sourceCostCenterId: mapping.sourceCostCenterId,
        targetCostCenterId,
      }),
    );
  }

  async function handleCreateManual(sourceCostCenterId: string, targetCostCenterId: string) {
    if (!targetCostCenterId) return;
    await runAction(sourceCostCenterId, () =>
      api.costCenterMappings.create(implementationId, { sourceCostCenterId, targetCostCenterId }),
    );
  }

  async function runAction(id: string, action: () => Promise<unknown>) {
    setSavingId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function handleConfirmSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Aprovar ${selected.size} mapeamento(s) de centro de custo?`)) return;
    setSavingId("bulk");
    try {
      await api.costCenterMappings.confirmMany(implementationId, Array.from(selected));
      setSelected(new Set());
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function handleConfirmHighConfidence() {
    setSavingId("high-confidence");
    try {
      await api.costCenterMappings.confirmBulk(implementationId, 95);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pendingHighConfidence = (mappings ?? []).filter(
    (mapping) => mapping.status !== "CONFIRMED" && (mapping.confidence ?? 0) >= 95,
  ).length;

  return (
    <div>
      <h2>DE/PARA de Centros de Custo</h2>
      <p className="wf-subtitle">
        Confira as correspondências entre os centros identificados na origem e no destino.
      </p>

      {stats && (
        <div className="wf-headline">
          <div className="wf-headline-item">
            <span className="wf-headline-value">{formatNumber(stats.sourceCostCenters)}</span>
            <span className="wf-headline-label">centros na origem</span>
          </div>
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
          onClick={handleConfirmHighConfidence}
          disabled={savingId === "high-confidence" || pendingHighConfidence === 0}
        >
          Aprovar {formatNumber(pendingHighConfidence)} de alta confiança
        </button>
        <div className="wf-spacer" />
        <input
          type="search"
          placeholder="Buscar centro de custo…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {selected.size > 0 && (
        <div className="wf-bulk-bar">
          <span>{selected.size} selecionado(s)</span>
          <button
            className="wf-btn wf-btn-sm wf-btn-primary"
            onClick={handleConfirmSelected}
            disabled={savingId === "bulk"}
          >
            Aprovar selecionados
          </button>
          <button className="wf-btn wf-btn-sm" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}

      {error && <ErrorState message={error} />}
      {loading && <TableSkeleton />}

      {!loading &&
        !error &&
        stats &&
        (stats.sourceCostCenters === 0 || stats.targetCostCenters === 0) && (
          <EmptyState
            icon="🏷️"
            title="Faltam centros de custo para comparar"
            description={`Origem: ${stats.sourceCostCenters}. Destino: ${stats.targetCostCenters}. Importe os centros dos dois lados na etapa Arquivos.`}
          />
        )}

      {!loading &&
        !error &&
        stats &&
        stats.sourceCostCenters > 0 &&
        stats.targetCostCenters > 0 &&
        filteredMappings.length === 0 &&
        unmatchedSources.length === 0 && (
          <EmptyState
            icon="🔗"
            title="Nenhuma sugestão encontrada"
            description='Clique em "Gerar sugestões". Centros sem similaridade suficiente continuam contabilizados como sem correspondência.'
          />
        )}

      {!loading && filteredMappings.length > 0 && (
        <div className="wf-table-wrapper">
          <table className="wf-table">
            <thead>
              <tr>
                <th className="wf-checkbox-cell" />
                <th>Centro de origem</th>
                <th>Centro de destino</th>
                <th>Confiança</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredMappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td className="wf-checkbox-cell">
                    <input
                      type="checkbox"
                      checked={selected.has(mapping.id)}
                      onChange={() => toggleSelected(mapping.id)}
                    />
                  </td>
                  <td>
                    <div>{mapping.sourceCostCenter.code}</div>
                    <div className="wf-hint">{mapping.sourceCostCenter.name}</div>
                  </td>
                  <td>
                    <TargetCostCenterPicker
                      targets={targets}
                      currentLabel={`${mapping.targetCostCenter.code} — ${mapping.targetCostCenter.name}`}
                      disabled={savingId === mapping.id}
                      onSelect={(target) => handleChangeTarget(mapping, target.id)}
                    />
                  </td>
                  <td>{confidenceLabel(mapping.confidence)}</td>
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
      )}

      {!loading && unmatchedSources.length > 0 && (
        <div
          className="wf-section"
          style={{ marginTop: filteredMappings.length > 0 ? "1.5rem" : 0 }}
        >
          <h3>Sem correspondência automática</h3>
          <p className="wf-hint">
            Selecione manualmente o destino correto para concluir estes centros de custo.
          </p>
          <div className="wf-table-wrapper">
            <table className="wf-table">
              <thead>
                <tr>
                  <th>Centro de origem</th>
                  <th>Centro de destino</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {unmatchedSources.map((source) => (
                  <tr key={source.id}>
                    <td>
                      <div>{source.code}</div>
                      <div className="wf-hint">{source.name}</div>
                    </td>
                    <td>
                      <TargetCostCenterPicker
                        targets={targets}
                        disabled={savingId === source.id}
                        onSelect={(target) => handleCreateManual(source.id, target.id)}
                      />
                    </td>
                    <td>
                      <span className="pill pill-neutral">Sem sugestão</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
