import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "../../router-compat";
import { api } from "../../api/client";
import type { AccountingImplementation, AccountingSystem, Company } from "../../api/types";
import { formatCompetencia, formatDate } from "../../lib/format";
import { CompanyPicker } from "./CompanyPicker";

export function ImplantacoesListPage() {
  const navigate = useNavigate();
  const [implementations, setImplementations] = useState<AccountingImplementation[]>([]);
  const [systems, setSystems] = useState<AccountingSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [referencePeriod, setReferencePeriod] = useState("");
  const [sourceSystemId, setSourceSystemId] = useState("");
  const [targetSystemId, setTargetSystemId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.implementations
      .list()
      .then(setImplementations)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(() => {
    api.accountingSystems
      .list()
      .then(setSystems)
      .catch(() => undefined);
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !company) {
      setFormError("Informe o nome da implantação e selecione a empresa.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await api.implementations.create({
        name: name.trim(),
        companyId: company.id,
        referencePeriod: referencePeriod || undefined,
        sourceSystemId: sourceSystemId || undefined,
        targetSystemId: targetSystemId || undefined,
      });
      setShowForm(false);
      setName("");
      setCompany(null);
      setReferencePeriod("");
      setSourceSystemId("");
      setTargetSystemId("");
      navigate(`/implantacao-contabil/${created.id}`);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="workflow">
      <main className="wf-shell">
        <div className="wf-toolbar">
          <h1 style={{ margin: 0 }}>Implantações Contábeis</h1>
          <div className="wf-spacer" />
          <button className="wf-btn wf-btn-primary" onClick={() => setShowForm((value) => !value)}>
            Nova implantação
          </button>
        </div>

        {showForm && (
          <form
            className="wf-panel wf-section"
            onSubmit={handleCreate}
            style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "1rem" }}
          >
            <div>
              <label
                className="wf-field-label"
                style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem" }}
              >
                Nome da implantação
              </label>
              <input
                autoFocus
                type="text"
                placeholder="Nome da implantação"
                value={name}
                onChange={(event) => setName(event.target.value)}
                style={{ width: "100%", maxWidth: 420 }}
              />
            </div>

            <div>
              <label
                className="wf-field-label"
                style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem" }}
              >
                Empresa
              </label>
              <CompanyPicker selected={company} onSelect={setCompany} />
            </div>

            <div className="wf-toolbar" style={{ margin: 0 }}>
              <div>
                <label
                  className="wf-field-label"
                  style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem" }}
                >
                  Competência
                </label>
                <input
                  type="month"
                  value={referencePeriod}
                  onChange={(event) => setReferencePeriod(event.target.value)}
                />
              </div>

              <div>
                <label
                  className="wf-field-label"
                  style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem" }}
                >
                  Sistema de origem
                </label>
                <select
                  value={sourceSystemId}
                  onChange={(event) => setSourceSystemId(event.target.value)}
                >
                  <option value="">Não informado</option>
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="wf-field-label"
                  style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem" }}
                >
                  Sistema de destino
                </label>
                <select
                  value={targetSystemId}
                  onChange={(event) => setTargetSystemId(event.target.value)}
                >
                  <option value="">Não informado</option>
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {formError && <p className="error">{formError}</p>}

            <div>
              <button className="wf-btn wf-btn-primary" type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Criar implantação"}
              </button>
            </div>
          </form>
        )}

        {error && <p className="error">{error}</p>}
        {loading ? (
          <p>Carregando…</p>
        ) : implementations.length === 0 ? (
          <p>Nenhuma implantação cadastrada ainda.</p>
        ) : (
          <div className="wf-table-wrapper" style={{ marginTop: "1rem" }}>
            <table className="wf-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Empresa</th>
                  <th>Competência</th>
                  <th>Criada em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {implementations.map((implementation) => (
                  <tr key={implementation.id}>
                    <td>{implementation.name}</td>
                    <td>{implementation.company?.name ?? "Não informado"}</td>
                    <td>{formatCompetencia(implementation.referencePeriod)}</td>
                    <td>{formatDate(implementation.createdAt)}</td>
                    <td>
                      <Link to={`/implantacao-contabil/${implementation.id}`}>Abrir</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
