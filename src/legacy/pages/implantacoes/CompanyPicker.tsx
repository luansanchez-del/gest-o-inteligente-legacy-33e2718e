import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { Company } from "../../api/types";

interface Props {
  selected: Company | null;
  onSelect: (company: Company) => void;
}

const DEBOUNCE_MS = 300;

/**
 * Busca/seleção de empresas reais do tenant (ETAPA 18) — a implantação nunca
 * recebe um `companyId` digitado à mão. Permite também cadastrar uma empresa
 * nova inline, para o fluxo "Criar empresa → criar implantação" sem sair da tela.
 */
export function CompanyPicker({ selected, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDocument, setNewDocument] = useState("");
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setLoading(true);
      api.companies
        .list(query || undefined)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query, open]);

  async function handleCreate() {
    if (!newName.trim() || !newDocument.trim()) return;
    setError(null);
    try {
      const company = await api.companies.create({
        name: newName.trim(),
        document: newDocument.trim(),
      });
      onSelect(company);
      setCreating(false);
      setOpen(false);
      setNewName("");
      setNewDocument("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!open) {
    return (
      <button type="button" className="wf-btn" onClick={() => setOpen(true)}>
        {selected ? `${selected.name} (alterar)` : "Selecionar empresa…"}
      </button>
    );
  }

  return (
    <div className="wf-autocomplete" style={{ minWidth: 280 }}>
      <input
        type="text"
        autoFocus
        placeholder="Buscar empresa por nome ou CNPJ…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="wf-autocomplete-list">
        {loading && <div className="wf-autocomplete-item">Buscando…</div>}
        {!loading &&
          results.map((company) => (
            <div
              key={company.id}
              className="wf-autocomplete-item"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(company);
                setOpen(false);
              }}
            >
              <span>
                {company.name} — {company.document}
              </span>
            </div>
          ))}
        {!loading && results.length === 0 && !creating && (
          <div className="wf-autocomplete-item" onMouseDown={(event) => event.preventDefault()}>
            Nenhuma empresa encontrada.
          </div>
        )}
        {!creating ? (
          <div
            className="wf-autocomplete-item"
            onMouseDown={(event) => {
              event.preventDefault();
              setCreating(true);
              setNewName(query);
            }}
          >
            <strong>+ Nova empresa</strong>
          </div>
        ) : (
          <div
            style={{
              padding: "0.6rem 0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
            }}
          >
            <input
              type="text"
              placeholder="Nome da empresa"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <input
              type="text"
              placeholder="CNPJ"
              value={newDocument}
              onChange={(event) => setNewDocument(event.target.value)}
            />
            {error && <span className="error">{error}</span>}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="wf-btn wf-btn-primary wf-btn-sm"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleCreate}
              >
                Criar empresa
              </button>
              <button
                type="button"
                className="wf-btn wf-btn-sm"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setCreating(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        <div
          className="wf-autocomplete-item"
          onMouseDown={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
        >
          <em>Fechar</em>
        </div>
      </div>
    </div>
  );
}
