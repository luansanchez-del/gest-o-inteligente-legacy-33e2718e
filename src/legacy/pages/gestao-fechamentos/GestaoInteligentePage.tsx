import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "../../router-compat";
import { api } from "../../api/client";
import type { DeliverySituation, ManagementDashboard, PierUsuario } from "../../api/types";
import { useDepartmentNames } from "../../lib/useDepartmentNames";
import { DepartmentNameField } from "../../components/DepartmentNameField";

const labels: Record<DeliverySituation, string> = {
  DELIVERED_ON_TIME: "Entregue no prazo",
  DELIVERED_LATE: "Entregue em atraso",
  IN_PROGRESS: "Em andamento",
  OVERDUE: "Prazo vencido",
  WAITING_CLIENT: "Aguardando cliente",
  NEEDS_REVIEW: "Precisa revisar",
};
const initialMonth = new Date().toISOString().slice(0, 7);

export function GestaoInteligentePage() {
  const navigate = useNavigate();
  const [competenciaInicio, setCompetenciaInicio] = useState(initialMonth);
  const [competenciaFim, setCompetenciaFim] = useState(initialMonth);
  const [teamId, setTeamId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [pierUsers, setPierUsers] = useState<PierUsuario[]>([]);
  const [pierTypes, setPierTypes] = useState<Array<{ id: number; descricao: string | null }>>([]);
  const [data, setData] = useState<ManagementDashboard | null>(null);
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [dashboardFailed, setDashboardFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const { nameFor, rename, unnamed } = useDepartmentNames(pierUsers);
  const rangeInvalid = competenciaFim < competenciaInicio;

  useEffect(() => {
    if (rangeInvalid) return;
    setLoading(true);
    setError("");
    setDashboardFailed(false);
    api.gestaoFechamentos.management
      .dashboard({
        competenciaInicio,
        competenciaFim,
        teamId,
        responsibleExternalId: responsibleId,
        typeExternalId: typeId,
      })
      .then((result) => {
        setData(result);
        setDashboardFailed(false);
      })
      .catch((e) => {
        setData(null);
        setDashboardFailed(true);
        setError(describeApiError(e));
      })
      .finally(() => setLoading(false));
  }, [competenciaInicio, competenciaFim, teamId, responsibleId, typeId, rangeInvalid]);
  useEffect(() => {
    Promise.allSettled([
      api.gestaoFechamentos.pier.listUsuarios({ status: "Todos" }),
      api.gestaoFechamentos.pier.listTiposSolicitacao(),
    ]).then(([users, types]) => {
      const messages: string[] = [];
      if (users.status === "fulfilled") setPierUsers(users.value);
      else messages.push(describeApiError(users.reason));
      if (types.status === "fulfilled") setPierTypes(types.value);
      else messages.push(describeApiError(types.reason));
      setCatalogError([...new Set(messages)].join(" "));
    });
  }, []);
  async function startManagement() {
    if (!data?.companyIds.length) return;
    setStarting(true);
    setError("");
    try {
      const input = {
        competencia: competenciaFim,
        operation: "SYNC" as const,
        scope: "SELECTED_COMPANIES" as const,
        companyIds: data.companyIds,
        config: { syncMode: "INCREMENTAL" as const },
      };
      const preview = await api.gestaoFechamentos.batchExecutions.preview(input);
      if (!preview.eligibleCompanies)
        throw new Error(
          "Nenhuma empresa vinculada ao PIER está elegível. Vincule os clientes primeiro.",
        );
      const batch = await api.gestaoFechamentos.batchExecutions.create(input);
      navigate(`/gestao-fechamentos/central/${batch.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível iniciar");
    } finally {
      setStarting(false);
    }
  }
  const departments = useMemo(
    () =>
      [...new Set(pierUsers.map((user) => user.departamentoPrincipalId))]
        .map((id) => ({ id, name: nameFor(id) }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [pierUsers, nameFor],
  );
  const visibleResponsibles = useMemo(
    () =>
      teamId
        ? pierUsers.filter((user) => String(user.departamentoPrincipalId) === teamId)
        : pierUsers,
    [pierUsers, teamId],
  );
  const s = data?.summary;
  return (
    <main className="mg-page">
      <header className="mg-header">
        <div>
          <span>GESTÃO CONTÁBIL INTELIGENTE</span>
          <h1>Fechamento contábil</h1>
          <p>
            O painel lê prazo, status, arquivos e conversas do PIER para indicar o que exige ação.
          </p>
        </div>
        <nav>
          <Link to="/gestao-fechamentos/empresa">Vincular clientes PIER</Link>
          <Link to="/gestao-fechamentos/central">Histórico</Link>
        </nav>
      </header>
      <section className="mg-command">
        <div className="mg-filters">
          <label>
            Competência de
            <input
              type="month"
              value={competenciaInicio}
              onChange={(e) => setCompetenciaInicio(e.target.value)}
            />
          </label>
          <label>
            até
            <input
              type="month"
              value={competenciaFim}
              onChange={(e) => setCompetenciaFim(e.target.value)}
            />
          </label>
          <label>
            Departamento do responsável
            <select
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                setResponsibleId("");
              }}
            >
              <option value="">Todos os departamentos</option>
              {departments.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsável
            <select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
              <option value="">Todos do departamento</option>
              {visibleResponsibles.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de solicitação
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Todos os tipos</option>
              {pierTypes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.descricao}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="mg-start"
          disabled={starting || !data?.companyIds.length}
          onClick={startManagement}
        >
          {starting ? "Iniciando…" : `Iniciar gestão (${data?.companyIds.length ?? 0} empresas)`}
        </button>
      </section>
      <div className="mg-source">
        Catálogo lido do PIER: <strong>{pierUsers.length} responsáveis/BPOs</strong> e{" "}
        <strong>{pierTypes.length} tipos de solicitação</strong>.
      </div>
      {unnamed.length > 0 && (
        <details className="mg-unnamed">
          <summary>{unnamed.length} departamento(s) do PIER ainda sem nome configurado</summary>
          <p>
            O PIER não informa o nome do departamento, só o número — dê um nome para cada um
            aparecer certo nos filtros e nos índices abaixo.
          </p>
          {unnamed.map((id) => (
            <DepartmentNameField key={id} id={id} onSave={(name) => rename(id, name)} />
          ))}
        </details>
      )}
      {rangeInvalid && (
        <div className="mg-error">A competência final não pode ser anterior à inicial.</div>
      )}
      {error && <div className="mg-error">{error}</div>}
      {loading ? (
        <div className="mg-empty">Lendo dados do PIER…</div>
      ) : !data?.items.length ? (
        <div className="mg-empty">
          <strong>Nenhuma solicitação sincronizada nesta competência.</strong>
          <span>
            Os clientes continuam vinculados. Clique em Iniciar gestão para buscar as demandas,
            prazos e arquivos deste período.
          </span>
        </div>
      ) : (
        <>
          <section className="mg-kpis">
            <article>
              <span>Índice de entrega</span>
              <strong>{s?.deliveryRate}%</strong>
              <small>
                {s?.delivered} de {s?.total}
              </small>
            </article>
            <article className="ok">
              <span>No prazo</span>
              <strong>{s?.DELIVERED_ON_TIME}</strong>
            </article>
            <article className="bad">
              <span>Prazo vencido</span>
              <strong>{s?.OVERDUE}</strong>
            </article>
            <article className="warn">
              <span>Aguardando cliente</span>
              <strong>{s?.WAITING_CLIENT}</strong>
            </article>
            <article>
              <span>Revisar evidência</span>
              <strong>{s?.NEEDS_REVIEW}</strong>
            </article>
          </section>
          <section className="mg-card">
            <h2>Índice por departamento e responsável</h2>
            {data.byTeam.map((team) => (
              <div className="mg-team-group" key={team.name}>
                <div className="mg-ranking mg-ranking-team">
                  <span>{team.name}</span>
                  <div>
                    <i style={{ width: `${team.deliveryRate}%` }} />
                  </div>
                  <strong>{team.deliveryRate}%</strong>
                </div>
                <div className="mg-team-collaborators">
                  {team.collaborators.map((collab) => (
                    <div className="mg-ranking" key={collab.name}>
                      <span>{collab.name}</span>
                      <div>
                        <i style={{ width: `${collab.deliveryRate}%` }} />
                      </div>
                      <strong>{collab.deliveryRate}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
          <section className="mg-card">
            <h2>Empresas que precisam de atenção</h2>
            <div className="mg-table">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Equipe / responsável</th>
                    <th>Solicitação</th>
                    <th>Prazo</th>
                    <th>Situação inteligente</th>
                    <th>Por quê?</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((x) => (
                    <tr key={x.requestId}>
                      <td>
                        <strong>{x.companyName}</strong>
                      </td>
                      <td>
                        {x.teamName}
                        <small>{x.collaboratorName}</small>
                      </td>
                      <td>{x.typeName}</td>
                      <td>
                        {x.deadlineAt
                          ? new Date(x.deadlineAt).toLocaleDateString("pt-BR")
                          : "Sem prazo"}
                      </td>
                      <td>
                        <span className={`mg-status ${x.situation.toLowerCase()}`}>
                          {labels[x.situation]}
                        </span>
                        <small>{x.confidence}% confiança</small>
                      </td>
                      <td className="mg-evidence">
                        {x.evidence?.text ?? "Sem evidência conclusiva"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
