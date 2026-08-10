import { useEffect, useRef, useState } from "react";
import { api } from "../../../api/client";
import type { ChartAccount } from "../../../api/types";

interface Props {
  implementationId: string;
  currentLabel: string;
  onSelect: (account: ChartAccount) => void;
  onCancel: () => void;
}

const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 20;

/**
 * Busca/autocomplete de contas TARGET — nunca carrega o plano de destino
 * inteiro num select gigante. Reaproveita o mesmo endpoint paginado/pesquisável
 * usado pela tela "Contas" (`GET .../chart-accounts/search`).
 */
export function TargetAccountPicker({ implementationId, currentLabel, onSelect, onCancel }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setLoading(true);
      api.chartAccounts
        .search(implementationId, { origin: "TARGET", search: query, pageSize: RESULT_LIMIT })
        .then((result) => setResults(result.data))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [implementationId, query]);

  if (!open) return null;

  return (
    <div className="wf-autocomplete">
      <input
        type="text"
        autoFocus
        placeholder={`Buscar conta destino (atual: ${currentLabel})`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      <div className="wf-autocomplete-list">
        {loading && <div className="wf-autocomplete-item">Buscando…</div>}
        {!loading && results.length === 0 && (
          <div className="wf-autocomplete-item">Nenhuma conta encontrada</div>
        )}
        {!loading &&
          results.map((account) => (
            <div
              key={account.id}
              className="wf-autocomplete-item"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(account);
                setOpen(false);
              }}
            >
              <span>
                {account.code} — {account.name}
              </span>
            </div>
          ))}
        <div
          className="wf-autocomplete-item"
          onMouseDown={(event) => {
            event.preventDefault();
            onCancel();
            setOpen(false);
          }}
        >
          <em>Cancelar</em>
        </div>
      </div>
    </div>
  );
}
