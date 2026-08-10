import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { PierClienteCache, PierSolicitacao, PierUsuario } from "../../api/types";
import { PierRequestDossier } from "./PierRequestDossier";
import { useDepartmentNames } from "../../lib/useDepartmentNames";
import { DepartmentNameField } from "../../components/DepartmentNameField";
import { formatDateTime } from "../../lib/format";

export function PierSolicitacoesPage() {
  const [users, setUsers] = useState<PierUsuario[]>([]);
  const [types, setTypes] = useState<Array<{ id: number; descricao: string | null }>>([]);
  const [clients, setClients] = useState<PierClienteCache[]>([]);
  const [clientesLastSyncedAt, setClientesLastSyncedAt] = useState<string | null>(null);
  const [syncingClientes, setSyncingClientes] = useState(false);
  const [rows, setRows] = useState<PierSolicitacao[]>([]);
  const [department, setDepartment] = useState("");
  const [responsible, setResponsible] = useState("");
  const [type, setType] = useState("");
  const [client, setClient] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PierSolicitacao | null>(null);

  // Usuários/tipos de solicitação (só para popular filtros) continuam lidos
  // do PIER ao vivo, uma vez por visita — leves e sem paralelo local hoje.
  // Clientes agora vêm da base local (nunca ao vivo aqui) — sincronize pela
  // tela "Clientes" ou pelo botão abaixo.
  useEffect(() => {
    Promise.all([
      api.gestaoFechamentos.pier.listUsuarios({ status: "Todos" }),
      api.gestaoFechamentos.pier.listTiposSolicitacao(),
    ])
      .then(([u, t]) => {
        setUsers(u);
        setTypes(t);
      })
      .catch((e) => setError(String(e)));
    loadClientesCache();
  }, []);

  async function loadClientesCache() {
    const [list, lastSynced] = await Promise.all([
      api.gestaoFechamentos.pier.clientesCache.list({ status: "Ativo" }),
      api.gestaoFechamentos.pier.clientesCache.lastSyncedAt(),
    ]);
    setClients(list);
    setClientesLastSyncedAt(lastSynced.lastSyncedAt);
  }

  async function syncClientesCache() {
    setSyncingClientes(true);
    setError("");
    try {
      await api.gestaoFechamentos.pier.clientesCache.sync();
      await loadClientesCache();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao sincronizar clientes");
    } finally {
      setSyncingClientes(false);
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows(
        await api.gestaoFechamentos.pier.listSolicitacoes({
          idDepartamentoPrincipalResponsavel: department ? Number(department) : undefined,
          idResponsavel: responsible ? Number(responsible) : undefined,
          idTipoSolicitacao: type ? Number(type) : undefined,
          idCliente: client ? Number(client) : undefined,
          busca: search || undefined,
          status: status || undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao ler PIER");
    } finally {
      setLoading(false);
    }
  }

  // Só busca solicitações quando o usuário pede (botão "Atualizar PIER" ou
  // "Consultar") — nada de atualização automática em segundo plano, que era
  // o motivo da lentidão relatada ao entrar na tela.
  useEffect(() => {
    void load();
  }, []);
  const {
    nameFor: departmentName,
    rename: renameDepartment,
    unnamed: unnamedDepartments,
  } = useDepartmentNames(users);
  const departments = useMemo(
    () =>
      [...new Set(users.map((x) => x.departamentoPrincipalId))].sort((a, b) =>
        departmentName(a).localeCompare(departmentName(b), "pt-BR"),
      ),
    [users, departmentName],
  );
  const visibleUsers = useMemo(
    () =>
      department ? users.filter((x) => x.departamentoPrincipalId === Number(department)) : users,
    [users, department],
  );
  const stats = useMemo(
    () => ({
      total: rows.length,
      open: rows.filter((x) => !x.finalizadaEm && !/finaliz/i.test(x.status ?? "")).length,
      unread: rows.filter((x) => !x.lida).length,
      overdue: rows.filter((x) => x.prazo && new Date(x.prazo) < new Date() && !x.finalizadaEm)
        .length,
    }),
    [rows],
  );
  const departmentOf = (row: PierSolicitacao) =>
    row.idDepartamentoPrincipalResponsavel ??
    users.find((user) => user.id === row.idResponsavel)?.departamentoPrincipalId;

  return (
    <main className="pier-page">
      <header className="pier-title">
        <div>
          <span>PIER EM TEMPO REAL</span>
          <h1>Solicitações</h1>
          <p>Carteira lida por departamento do responsável. Nenhuma alteração é feita no PIER.</p>
        </div>
        <button onClick={load} disabled={loading}>
          {loading ? "Lendo…" : "Atualizar PIER"}
        </button>
      </header>
      <section className="pier-filters">
        <label>
          Departamento do responsável
          <select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setResponsible("");
            }}
          >
            <option value="">Todos</option>
            {departments.map((id) => (
              <option key={id} value={id}>
                {departmentName(id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Responsável / BPO
          <select value={responsible} onChange={(e) => setResponsible(e.target.value)}>
            <option value="">Todos do departamento</option>
            {visibleUsers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo de solicitação
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Todos</option>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {x.descricao}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cliente
          <select value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">Todos</option>
            {clients.map((x) => (
              <option key={x.id} value={x.externalId}>
                {x.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            <option value="pendentes">Pendentes</option>
            <option value="finalizadas">Finalizadas</option>
          </select>
        </label>
        <div className="pier-search">
          <input
            placeholder="Buscar por descrição ou número"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <button onClick={load}>Consultar</button>
        </div>
      </section>
      <p className="wf-subtitle" style={{ margin: "0 0 0.75rem" }}>
        Lista de clientes do filtro acima vem da base local
        {clientesLastSyncedAt
          ? ` (sincronizada em ${formatDateTime(clientesLastSyncedAt)})`
          : " (ainda não sincronizada)"}
        .{" "}
        <button
          type="button"
          className="btn-link"
          onClick={syncClientesCache}
          disabled={syncingClientes}
        >
          {syncingClientes ? "Sincronizando…" : "Sincronizar clientes agora"}
        </button>
      </p>
      {unnamedDepartments.length > 0 && (
        <details className="mg-unnamed">
          <summary>
            {unnamedDepartments.length} departamento(s) do PIER ainda sem nome configurado
          </summary>
          <p>
            O PIER não informa o nome do departamento, só o número — dê um nome para cada um
            aparecer certo nos filtros.
          </p>
          {unnamedDepartments.map((id) => (
            <DepartmentNameField key={id} id={id} onSave={(name) => renameDepartment(id, name)} />
          ))}
        </details>
      )}
      {error && <div className="mg-error">{error}</div>}
      <section className="pier-stats">
        <article>
          <span>Em aberto</span>
          <b>{stats.open}</b>
        </article>
        <article className="orange">
          <span>Não lidas</span>
          <b>{stats.unread}</b>
        </article>
        <article className="red">
          <span>Fora do prazo</span>
          <b>{stats.overdue}</b>
        </article>
        <article className="dark">
          <span>Total consultado</span>
          <b>{stats.total}</b>
        </article>
      </section>
      <section className="pier-table">
        <table>
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Número</th>
              <th>Cliente</th>
              <th>Prioridade</th>
              <th>Responsável</th>
              <th>Departamento</th>
              <th>Status</th>
              <th>Última execução</th>
              <th>Prazo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>
                  <strong>{x.descricao}</strong>
                  {x.flgTemAnexo && <small>📎 possui anexo</small>}
                </td>
                <td>{x.numero}</td>
                <td>{x.nomeCliente}</td>
                <td>
                  <span className={`priority ${(x.prioridade ?? "").toLowerCase()}`}>
                    {x.prioridade ?? "—"}
                  </span>
                </td>
                <td>{x.nomeResponsavel}</td>
                <td>{departmentOf(x) ? departmentName(departmentOf(x)!) : "—"}</td>
                <td>{x.status}</td>
                <td>
                  {x.dataUltimaExecucao
                    ? new Date(x.dataUltimaExecucao).toLocaleString("pt-BR")
                    : "—"}
                </td>
                <td
                  className={
                    x.prazo && new Date(x.prazo) < new Date() && !x.finalizadaEm ? "is-late" : ""
                  }
                >
                  {x.prazo ? new Date(x.prazo).toLocaleDateString("pt-BR") : "—"}
                </td>
                <td>
                  <button className="pier-analyze" onClick={() => setSelected(x)}>
                    Analisar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {selected && <PierRequestDossier request={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
