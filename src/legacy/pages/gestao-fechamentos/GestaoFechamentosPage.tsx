import { useEffect, useState } from "react";
import { useSearchParams } from "../../router-compat";
import { api } from "../../api/client";
import type {
  ClosingBucket,
  CompetenciaSnapshot,
  Company,
  ExternalFile,
  ExternalRequest,
  GestaoSyncResult,
  PierClienteCache,
  PierCompanyLink,
  PierPostagem,
  RequestAnalysisResult,
} from "../../api/types";
import { CLOSING_PERIOD_STATUS_LABELS, EXTERNAL_REQUEST_PURPOSE_LABELS } from "../../api/types";
import { formatDateTime } from "../../lib/format";
import { CompanyPicker } from "../implantacoes/CompanyPicker";

const FINISHED_STATUS = "Finalizada";
const LAST_COMPANY_KEY = "gestao-fechamentos:last-company-id";
const LAST_COMPETENCIA_KEY = "gestao-fechamentos:last-competencia";
const METADATA_REFRESH_MS = 60_000;

/**
 * Prazo é o `prazo` do PIER (combinado, não confundir com `finishedAt` real)
 * — o pedido do gestor foi "apontar quando não fechou / entregou fora do
 * prazo do PIER", não recalcular um prazo próprio.
 */
function deadlineState(
  request: ExternalRequest,
): "no-deadline" | "on-track" | "late-open" | "late-delivered" | "delivered-on-time" {
  const isFinished = request.status === FINISHED_STATUS;
  if (!request.deadlineAt) return isFinished ? "delivered-on-time" : "on-track";
  const deadline = new Date(request.deadlineAt).getTime();
  if (isFinished) {
    if (!request.finishedAt) return "on-track";
    return new Date(request.finishedAt).getTime() > deadline
      ? "late-delivered"
      : "delivered-on-time";
  }
  return Date.now() > deadline ? "late-open" : "on-track";
}

/**
 * Tela operacional mínima da FASE B (ETAPA GESTÃO "FASE B" ponto 20) —
 * empresa + competência, botão "Sincronizar PIER", e o resultado real
 * (contábil/fiscal/não classificados). Não é o dashboard completo (Fase F):
 * sem gráficos, sem carteira multi-empresa, sem aprovação/devolução ainda.
 * Dados sempre reais — nenhum mock.
 */
export function GestaoFechamentosPage() {
  const [searchParams] = useSearchParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [competencia, setCompetencia] = useState(
    searchParams.get("competencia") ?? localStorage.getItem(LAST_COMPETENCIA_KEY) ?? "",
  );
  const [link, setLink] = useState<PierCompanyLink | null | "checking">("checking");
  const [linking, setLinking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<GestaoSyncResult | null>(null);
  const [snapshot, setSnapshot] = useState<CompetenciaSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPierClients, setShowPierClients] = useState(false);
  const [pierSearch, setPierSearch] = useState("");
  const [pierStatus, setPierStatus] = useState("Ativo");
  const [pierTributacao, setPierTributacao] = useState("");
  const [pierClients, setPierClients] = useState<PierClienteCache[]>([]);
  const [loadingPierClients, setLoadingPierClients] = useState(false);
  const [importingClientId, setImportingClientId] = useState<string | null>(null);
  const [importingAll, setImportingAll] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    found: number;
    linked: number;
    created: number;
    existing: number;
    skipped: number;
  } | null>(null);
  const [clientesLastSyncedAt, setClientesLastSyncedAt] = useState<string | null>(null);
  const [syncingClientesCache, setSyncingClientesCache] = useState(false);

  useEffect(() => {
    const companyId = searchParams.get("companyId") ?? localStorage.getItem(LAST_COMPANY_KEY);
    if (!companyId) return;
    api.companies
      .get(companyId)
      .then(setCompany)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (company) localStorage.setItem(LAST_COMPANY_KEY, company.id);
  }, [company]);
  useEffect(() => {
    if (competencia) localStorage.setItem(LAST_COMPETENCIA_KEY, competencia);
  }, [competencia]);

  useEffect(() => {
    setSyncResult(null);
    setSnapshot(null);
    setError(null);
    if (!company) {
      setLink("checking");
      return;
    }
    setLink("checking");
    api.gestaoFechamentos.pier
      .getLink(company.id)
      .then((result) => setLink(result))
      .catch(() => setLink(null));
  }, [company]);

  useEffect(() => {
    if (!company || !competencia || link === "checking" || !link) {
      setSnapshot(null);
      return;
    }
    loadSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, competencia, link]);

  // Atualiza somente metadados do PIER; PDFs só são relidos quando o
  // usuário aciona explicitamente a validação.
  useEffect(() => {
    if (!company || !competencia || !link || link === "checking") return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (cancelled || syncing) return;
      try {
        await api.gestaoFechamentos.sync(company.id, competencia, "INCREMENTAL");
        if (!cancelled) await loadSnapshot();
      } catch {
        /* preserva os dados locais e tenta novamente */
      }
    }, METADATA_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, competencia, link, syncing]);

  async function handleLink() {
    if (!company) return;
    setLinking(true);
    setError(null);
    try {
      const result = await api.gestaoFechamentos.pier.link(company.id);
      if (!result.linked) {
        setError("Nenhum Cliente PIER encontrado com o CNPJ desta empresa.");
      }
      setLink(result.link);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLinking(false);
    }
  }

  async function loadSnapshot() {
    if (!company || !competencia) return;
    setLoadingSnapshot(true);
    try {
      const result = await api.gestaoFechamentos.getSnapshot(company.id, competencia);
      setSnapshot(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingSnapshot(false);
    }
  }

  async function handleSync() {
    if (!company || !competencia) return;
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const result = await api.gestaoFechamentos.sync(company.id, competencia, "FULL");
      setSyncResult(result);
      await loadSnapshot();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  // Lê a base local (nunca chama o PIER) — evita o custo de uma busca ao vivo
  // toda vez que a tela de clientes é aberta. A carteira só é atualizada de
  // verdade via syncClientesCache(), sob comando explícito do usuário.
  async function searchPierClients() {
    setLoadingPierClients(true);
    setError(null);
    try {
      const [clients, lastSynced] = await Promise.all([
        api.gestaoFechamentos.pier.clientesCache.list({
          search: pierSearch || undefined,
          status: pierStatus || undefined,
          tributacao: pierTributacao || undefined,
        }),
        api.gestaoFechamentos.pier.clientesCache.lastSyncedAt(),
      ]);
      setPierClients(clients);
      setClientesLastSyncedAt(lastSynced.lastSyncedAt);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingPierClients(false);
    }
  }

  async function syncClientesCache() {
    setSyncingClientesCache(true);
    setError(null);
    try {
      const result = await api.gestaoFechamentos.pier.clientesCache.sync();
      setClientesLastSyncedAt(result.syncedAt);
      await searchPierClients();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncingClientesCache(false);
    }
  }

  async function importPierClient(client: PierClienteCache) {
    setImportingClientId(client.id);
    setError(null);
    try {
      const result = await api.gestaoFechamentos.pier.importCliente(Number(client.externalId));
      setCompany(result.company);
      setLink(result.link);
      setShowPierClients(false);
      setPierClients([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImportingClientId(null);
    }
  }

  async function importAllPierClients() {
    if (
      !window.confirm(
        "Vincular todos os clientes ativos do PIER? O processo compara CNPJ/CPF e não cria duplicidades.",
      )
    )
      return;
    setImportingAll(true);
    setError(null);
    setBulkResult(null);
    try {
      setBulkResult(await api.gestaoFechamentos.pier.importAllClientes());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImportingAll(false);
    }
  }

  const canSync = !!company && !!competencia && link !== "checking" && !!link;

  return (
    <div className="workflow">
      <main className="wf-shell">
        <div className="closing-hero">
          <div>
            <span className="closing-eyebrow">OPERAÇÃO CONTÁBIL</span>
            <h1>Gestão de Fechamentos</h1>
            <p>Acompanhe solicitações, documentos e pendências de cada competência.</p>
          </div>
          <div className="closing-connection">
            <span className="closing-live-dot" />
            PIER conectado · monitorando metadados
          </div>
        </div>

        <div className="closing-command">
          <div className="closing-command-main">
            <div className="closing-control closing-control-company">
              <span className="closing-control-number">1</span>
              <div>
                <label>Escolha a empresa</label>
                <CompanyPicker selected={company} onSelect={setCompany} />
                <button
                  type="button"
                  className="btn-link"
                  style={{ display: "block", marginTop: "0.35rem" }}
                  onClick={() => {
                    setShowPierClients((current) => !current);
                    if (!showPierClients && pierClients.length === 0) void searchPierClients();
                  }}
                >
                  {showPierClients ? "Fechar clientes PIER" : "Buscar clientes no PIER"}
                </button>
              </div>
            </div>
            <div className="closing-control">
              <span className="closing-control-number">2</span>
              <div>
                <label>Defina a competência</label>
                <input
                  type="month"
                  value={competencia}
                  onChange={(event) => setCompetencia(event.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="closing-command-action">
            <button
              className="closing-sync-button"
              onClick={handleSync}
              disabled={!canSync || syncing}
            >
              <span>{syncing ? "↻" : "⟳"}</span>
              {syncing ? "Sincronizando…" : "Sincronizar agora"}
            </button>
            <small>
              {canSync
                ? "Busca os dados mais recentes no PIER"
                : "Selecione empresa, vínculo e competência"}
            </small>
          </div>

          {company && link === null && (
            <div className="closing-alert">
              <div>
                <strong>Vínculo necessário</strong>
                <span>Esta empresa ainda não está conectada ao PIER.</span>
              </div>
              <button className="wf-btn wf-btn-sm" onClick={handleLink} disabled={linking}>
                {linking ? "Vinculando…" : "Vincular pelo CNPJ"}
              </button>
            </div>
          )}
          {company && typeof link === "object" && link && (
            <div className="closing-linked">
              <span>✓</span>
              <div>
                <small>CLIENTE PIER VINCULADO</small>
                <strong>{link.externalName ?? link.externalId}</strong>
              </div>
            </div>
          )}

          {error && <p className="error">{error}</p>}
        </div>

        {showPierClients && (
          <div className="closing-client-browser">
            <div className="closing-section-heading">
              <div>
                <span>CARTEIRA PIER</span>
                <h2>Encontre uma empresa</h2>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="closing-search-button"
                  onClick={syncClientesCache}
                  disabled={syncingClientesCache}
                >
                  {syncingClientesCache ? "Sincronizando…" : "⟳ Sincronizar carteira PIER"}
                </button>
                <button
                  type="button"
                  className="closing-bulk-button"
                  onClick={importAllPierClients}
                  disabled={importingAll}
                >
                  {importingAll ? "Vinculando carteira…" : "⚡ Vincular todos"}
                </button>
              </div>
            </div>
            <p className="wf-subtitle">
              Selecione uma empresa ou use a ferramenta para vincular toda a carteira ativa pelo
              CNPJ/CPF. Lista lida da base local — nunca busca no PIER sozinha; use "Sincronizar
              carteira PIER" para atualizar.
              {clientesLastSyncedAt
                ? ` Última sincronização: ${formatDateTime(clientesLastSyncedAt)}.`
                : " Ainda não sincronizada."}
            </p>
            {bulkResult && (
              <div className="closing-bulk-result">
                <strong>Carteira processada com sucesso.</strong>
                <span>
                  {bulkResult.linked} vinculados · {bulkResult.created} novos cadastros ·{" "}
                  {bulkResult.existing} já existentes · {bulkResult.skipped} ignorados
                </span>
              </div>
            )}
            <div className="closing-search">
              <input
                type="search"
                placeholder="Buscar por nome"
                value={pierSearch}
                onChange={(event) => setPierSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchPierClients();
                }}
              />
              <select
                aria-label="Filtrar por status"
                value={pierStatus}
                onChange={(event) => setPierStatus(event.target.value)}
              >
                <option value="Ativo">Ativos</option>
                <option value="Inativo">Inativos</option>
                <option value="">Todos os status</option>
              </select>
              <select
                aria-label="Filtrar por tributação"
                value={pierTributacao}
                onChange={(event) => setPierTributacao(event.target.value)}
              >
                <option value="">Todas as tributações</option>
                <option value="Simples Nacional">Simples Nacional</option>
                <option value="Lucro Presumido">Lucro Presumido</option>
                <option value="Lucro Real">Lucro Real</option>
                <option value="MEI">MEI</option>
                <option value="Pessoa Física">Pessoa Física</option>
              </select>
              <button
                type="button"
                className="closing-search-button"
                onClick={searchPierClients}
                disabled={loadingPierClients}
              >
                {loadingPierClients ? "Buscando…" : "Buscar"}
              </button>
            </div>

            {loadingPierClients ? (
              <p>Carregando clientes…</p>
            ) : pierClients.length === 0 ? (
              <p className="wf-subtitle">
                {clientesLastSyncedAt
                  ? "Nenhum cliente encontrado com esses filtros."
                  : 'Nenhum cliente sincronizado ainda — clique em "Sincronizar carteira PIER".'}
              </p>
            ) : (
              <div className="closing-client-grid">
                {pierClients.map((client) => (
                  <article className="closing-client-card" key={client.id}>
                    <div className="closing-client-avatar">{(client.nome ?? "P").charAt(0)}</div>
                    <div className="closing-client-info">
                      <strong>{client.nome ?? `Cliente ${client.externalId}`}</strong>
                      <span>{client.documento ?? "Documento não informado"}</span>
                      <div>
                        <span className="closing-tag">
                          {client.tributacao ?? "Tributação não informada"}
                        </span>
                        <span className="closing-status-dot">
                          {client.status ?? "Não informado"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="closing-client-action"
                      onClick={() => importPierClient(client)}
                      disabled={importingClientId !== null || !client.documento}
                    >
                      {importingClientId === client.id ? "Vinculando…" : "Selecionar"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {syncResult && (
          <div className="closing-sync-result">
            <div className="closing-section-heading">
              <div>
                <span>RESULTADO</span>
                <h2>Sincronização concluída</h2>
              </div>
            </div>
            <div className="closing-metric-grid">
              <Metric value={syncResult.solicitacoesEncontradas} label="Solicitações" tone="blue" />
              <Metric value={syncResult.arquivosEncontrados} label="Arquivos" tone="violet" />
              <Metric value={syncResult.novos} label="Novos" tone="green" />
              <Metric value={syncResult.atualizados} label="Atualizados" tone="amber" />
              <Metric value={syncResult.naoClassificados} label="A classificar" tone="red" />
            </div>
            {syncResult.warnings.length > 0 && (
              <ul style={{ marginTop: "0.75rem" }}>
                {syncResult.warnings.map((warning, index) => (
                  <li
                    key={index}
                    className="error"
                    style={{ listStyle: "disc", marginLeft: "1.2rem" }}
                  >
                    {warning}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {loadingSnapshot && <p style={{ marginTop: "1rem" }}>Carregando…</p>}

        {snapshot && (
          <>
            <p style={{ marginTop: "1rem", fontSize: "0.85rem", opacity: 0.75 }}>
              Última sincronização: {formatDateTime(snapshot.lastSyncedAt)}
            </p>
            <ClosingSection title="Contábil" bucket={snapshot.contabil} />
            <ClosingSection title="Fiscal" bucket={snapshot.fiscal} />
            <UnclassifiedSection
              requests={snapshot.naoClassificados.requests}
              files={snapshot.naoClassificados.files}
            />
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className={`closing-metric closing-metric-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ClosingSection({ title, bucket }: { title: string; bucket: ClosingBucket }) {
  return (
    <div className="wf-panel wf-section" style={{ marginTop: "1rem" }}>
      <div className="wf-toolbar" style={{ margin: 0 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {bucket.closingPeriod && (
          <span className="pill pill-info">
            {CLOSING_PERIOD_STATUS_LABELS[bucket.closingPeriod.status]}
          </span>
        )}
      </div>

      {!bucket.closingPeriod ? (
        <p style={{ opacity: 0.7 }}>
          Nenhuma solicitação {title.toLowerCase()} encontrada nesta competência.
        </p>
      ) : (
        <>
          <RequestsTable requests={bucket.requests} />
          <FilesTable files={bucket.files} />
        </>
      )}
    </div>
  );
}

function UnclassifiedSection({
  requests,
  files,
}: {
  requests: ExternalRequest[];
  files: ExternalFile[];
}) {
  if (requests.length === 0 && files.length === 0) return null;
  return (
    <div className="wf-panel wf-section" style={{ marginTop: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>Não classificados</h3>
      <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
        Tipo de solicitação ainda sem finalidade configurada — ajuste em type-mappings para que
        apareçam em Contábil/Fiscal na próxima sincronização.
      </p>
      <RequestsTable requests={requests} />
      <FilesTable files={files} />
    </div>
  );
}

function RequestsTable({ requests }: { requests: ExternalRequest[] }) {
  const [openConversationId, setOpenConversationId] = useState<string | null>(null);

  if (requests.length === 0) return null;
  return (
    <div className="wf-table-wrapper" style={{ marginTop: "0.75rem" }}>
      <table className="wf-table">
        <thead>
          <tr>
            <th>Solicitação</th>
            <th>Tipo</th>
            <th>Analista responsável</th>
            <th>Status</th>
            <th>Prazo (PIER)</th>
            <th>Finalidade</th>
            <th>Conversa</th>
            <th>Validação</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              open={openConversationId === request.id}
              onToggleConversation={() =>
                setOpenConversationId((current) => (current === request.id ? null : request.id))
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RequestRow({
  request,
  open,
  onToggleConversation,
}: {
  request: ExternalRequest;
  open: boolean;
  onToggleConversation: () => void;
}) {
  const state = deadlineState(request);
  const isClosed = request.status === FINISHED_STATUS;
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<RequestAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  async function analyze() {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      setAnalysis(await api.gestaoFechamentos.analyzeRequest(request.id));
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Falha ao validar a solicitação");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <>
      <tr>
        <td>{request.number ?? request.externalId}</td>
        <td>{request.typeName ?? request.typeExternalId}</td>
        <td>
          <strong>{request.responsibleExternalName ?? "Não informado"}</strong>
        </td>
        <td>
          {request.status ?? "Não informado"}{" "}
          {!isClosed && <span className="pill pill-danger">Não fechado</span>}
        </td>
        <td>
          {request.deadlineAt ? formatDateTime(request.deadlineAt) : "Não informado"}
          {state === "late-open" && <span className="pill pill-danger">Prazo vencido</span>}
          {state === "late-delivered" && (
            <span className="pill pill-danger">Entregue fora do prazo</span>
          )}
          {state === "delivered-on-time" && (
            <span className="pill pill-success">Entregue no prazo</span>
          )}
        </td>
        <td>{EXTERNAL_REQUEST_PURPOSE_LABELS[request.purpose]}</td>
        <td>
          <button type="button" className="btn-link" onClick={onToggleConversation}>
            {open ? "Fechar" : "Ver conversa"}
          </button>
        </td>
        <td>
          <button type="button" className="btn-link" disabled={analyzing} onClick={analyze}>
            {analyzing ? "Lendo PDFs…" : "Validar arquivos"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8}>
            <ConversationPanel idSolicitacao={request.externalId} />
          </td>
        </tr>
      )}
      {(analysis || analysisError) && (
        <tr>
          <td colSpan={8}>
            {analysisError ? (
              <p className="error">{analysisError}</p>
            ) : (
              analysis && (
                <div style={{ padding: "0.5rem" }}>
                  <strong>
                    {analysis.validated
                      ? "✓ Relatório e GNRE estão de acordo"
                      : `Validação concluída: ${analysis.findings.length} ponto(s) para revisar`}
                  </strong>
                  <p style={{ margin: "0.35rem 0", opacity: 0.75 }}>
                    {analysis.documents.length} PDF(s) lido(s) nesta solicitação.
                  </p>
                  {analysis.findings.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                      {analysis.findings.map((finding, index) => (
                        <li key={`${finding.code}-${index}`}>
                          <strong>
                            {finding.severity === "CRITICAL" ? "Crítico" : "Aviso"}: {finding.title}
                          </strong>{" "}
                          — {finding.description}
                          <br />
                          <small>{finding.guidance}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Conversa (postagens) da solicitação — texto bruto, para o gestor conferir
 * manualmente se balancete/razão foram mencionados/combinados. Não tenta
 * classificar automaticamente: dados reais do PIER não vêm com nomenclatura
 * nem categoria confiável o bastante para isso (ver docs/pier-integration.md).
 */
function ConversationPanel({ idSolicitacao }: { idSolicitacao: string }) {
  const [postagens, setPostagens] = useState<PierPostagem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.gestaoFechamentos.pier
      .listPostagens(idSolicitacao)
      .then((result) => {
        if (!cancelled) setPostagens(result);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idSolicitacao]);

  if (loading) return <p style={{ opacity: 0.7 }}>Carregando conversa…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!postagens || postagens.length === 0)
    return <p style={{ opacity: 0.7 }}>Sem mensagens nesta solicitação.</p>;

  return (
    <ul
      style={{
        margin: 0,
        paddingLeft: "1.2rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      {postagens.map((postagem) => (
        <li key={postagem.idPostagem}>
          <small style={{ opacity: 0.7 }}>
            {formatDateTime(postagem.postadoEm)} — usuário PIER #{postagem.idRemetente}
          </small>
          <p style={{ margin: "0.15rem 0 0", whiteSpace: "pre-wrap" }}>
            {postagem.postagemTexto ?? "(sem texto)"}
          </p>
        </li>
      ))}
    </ul>
  );
}

function FilesTable({ files }: { files: ExternalFile[] }) {
  if (files.length === 0) return null;
  return (
    <div className="wf-table-wrapper" style={{ marginTop: "0.75rem" }}>
      <table className="wf-table">
        <thead>
          <tr>
            <th>Arquivo</th>
            <th>Categoria</th>
            <th>Subcategoria</th>
            <th>Enviado em</th>
            <th>Download</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id}>
              <td>{file.name ?? "Não informado"}</td>
              <td>{file.categoria ?? "Não informado"}</td>
              <td>{file.subcategoria ?? "Não informado"}</td>
              <td>{formatDateTime(file.enviadoEm)}</td>
              <td>
                {file.processingStatus === "DOWNLOADED" ? (
                  <span className="pill pill-success">Baixado</span>
                ) : file.processingStatus === "DOWNLOAD_FAILED" ? (
                  <span className="pill pill-danger">Falhou</span>
                ) : (
                  <span className="pill pill-neutral">Pendente</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
