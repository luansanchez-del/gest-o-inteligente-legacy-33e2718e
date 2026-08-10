import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "../../router-compat";
import { api } from "../../api/client";
import type { AccountingImplementation, ImplementationStats } from "../../api/types";
import { IMPLEMENTATION_STATUS_LABELS } from "../../lib/statusLabels";
import { formatCnpj, formatCompetencia, formatDate } from "../../lib/format";
import { Stepper } from "./Stepper";
import type { StepDefinition, StepState } from "./Stepper";
import { ErrorState } from "./components/States";
import { FilesStep } from "./steps/FilesStep";
import { ReadingStep } from "./steps/ReadingStep";
import { AccountsStep } from "./steps/AccountsStep";
import { CostCentersStep } from "./steps/CostCentersStep";
import { MappingStep } from "./steps/MappingStep";
import { ReviewStep } from "./steps/ReviewStep";

const STEP_LABELS: { key: string; label: string }[] = [
  { key: "files", label: "Arquivos" },
  { key: "reading", label: "Leitura" },
  { key: "accounts", label: "Contas" },
  { key: "costCenters", label: "Centros de Custo" },
  { key: "mapping", label: "De/Para" },
  { key: "review", label: "Revisão" },
  { key: "conclude", label: "Concluir" },
];

export function ImplantacaoWorkflowPage() {
  const { implementationId } = useParams<{ implementationId: string }>();
  const [implementation, setImplementation] = useState<AccountingImplementation | null>(null);
  const [stats, setStats] = useState<ImplementationStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState("files");
  const [focusImportId, setFocusImportId] = useState<string | null>(null);
  const [mappingInitialType, setMappingInitialType] = useState<"accounts" | "cost-centers">(
    "accounts",
  );

  const load = useCallback(() => {
    if (!implementationId) return;
    api.implementations
      .get(implementationId)
      .then(setImplementation)
      .catch((err) => setError(err.message));
    api.implementations
      .stats(implementationId)
      .then(setStats)
      .catch(() => undefined);
  }, [implementationId]);

  useEffect(load, [load]);

  if (!implementationId) return null;

  function handleAnalyze(importId: string) {
    setFocusImportId(importId);
    setActiveStep("reading");
  }

  function stepState(key: string): StepState {
    if (!stats) return key === activeStep ? "current" : "pending";
    if (key === activeStep) return "current";

    switch (key) {
      case "files":
        return stats.filesImported > 0 ? "done" : "pending";
      case "reading":
        return stats.filesImported > 0 ? "done" : "pending";
      case "accounts":
        return stats.sourceAccounts > 0 ? "done" : "pending";
      case "costCenters":
        return stats.sourceCostCenters > 0 ? "done" : "pending";
      case "mapping":
        if (stats.accountNeedsReview > 0 || stats.accountNoMatch > 0) return "attention";
        return stats.sourceAccounts > 0 && stats.accountsPending === 0 ? "done" : "pending";
      case "review":
        if (stats.sourceAccounts === 0) return "pending";
        return stats.pendingImpediments ? "attention" : "done";
      case "conclude":
        return implementation?.status === "CONCLUDED" ? "done" : "pending";
      default:
        return "pending";
    }
  }

  const steps: StepDefinition[] = STEP_LABELS.map(({ key, label }) => ({
    key,
    label,
    state: stepState(key),
  }));
  const doneCount = steps.filter((step) => step.state === "done").length;
  // O status persistido é a fonte de verdade do encerramento. A etapa aberta
  // fica visualmente como "current", portanto não pode reduzir uma implantação
  // já concluída para 86% (ou, durante o carregamento das estatísticas, 0%).
  const progressPercent =
    implementation?.status === "CONCLUDED" ? 100 : Math.round((doneCount / steps.length) * 100);

  return (
    <div className="workflow">
      <div className="wf-shell">
        <Link to="/implantacoes" className="wf-back">
          ← Implantações
        </Link>

        {error && <ErrorState message={error} onRetry={load} />}

        {!implementation ? (
          <p>Carregando…</p>
        ) : (
          <>
            <div className="wf-panel wf-header">
              <div className="wf-header-fields">
                <h1 style={{ gridColumn: "1 / -1" }}>
                  Implantação Contábil — {implementation.company?.name ?? implementation.name}
                </h1>
                <div className="wf-field">
                  <dt>Empresa</dt>
                  <dd className={implementation.company ? undefined : "wf-muted"}>
                    {implementation.company?.name ?? "Não informado"}
                  </dd>
                </div>
                <div className="wf-field">
                  <dt>CNPJ</dt>
                  <dd className={implementation.company ? undefined : "wf-muted"}>
                    {implementation.company
                      ? formatCnpj(implementation.company.document)
                      : "Não informado"}
                  </dd>
                </div>
                <div className="wf-field">
                  <dt>Competência</dt>
                  <dd className={implementation.referencePeriod ? undefined : "wf-muted"}>
                    {formatCompetencia(implementation.referencePeriod)}
                  </dd>
                </div>
                <div className="wf-field">
                  <dt>Sistema de origem → destino</dt>
                  <dd
                    className={
                      implementation.sourceSystem || implementation.targetSystem
                        ? undefined
                        : "wf-muted"
                    }
                  >
                    {implementation.sourceSystem?.name ?? "Não informado"} →{" "}
                    {implementation.targetSystem?.name ?? "Não informado"}
                  </dd>
                </div>
                <div className="wf-field">
                  <dt>Criada em</dt>
                  <dd>{formatDate(implementation.createdAt)}</dd>
                </div>
              </div>
              <div className="wf-header-side">
                <span
                  className={`pill ${implementation.status === "CONCLUDED" ? "pill-success" : "pill-info"}`}
                >
                  {IMPLEMENTATION_STATUS_LABELS[implementation.status]}
                </span>
                <div style={{ width: "100%" }}>
                  <div className="wf-progress-track">
                    <div className="wf-progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="wf-progress-label">
                    {progressPercent}% da implantação concluída
                  </div>
                </div>
              </div>
            </div>

            <Stepper steps={steps} activeKey={activeStep} onSelect={setActiveStep} />

            <div className="wf-panel">
              {activeStep === "files" && (
                <FilesStep
                  implementationId={implementationId}
                  onDataChanged={load}
                  onAnalyze={handleAnalyze}
                />
              )}
              {activeStep === "reading" && (
                <ReadingStep implementationId={implementationId} focusImportId={focusImportId} />
              )}
              {activeStep === "accounts" && <AccountsStep implementationId={implementationId} />}
              {activeStep === "costCenters" && (
                <CostCentersStep
                  implementationId={implementationId}
                  onDataChanged={load}
                  onContinue={() => {
                    setMappingInitialType("cost-centers");
                    setActiveStep("mapping");
                  }}
                />
              )}
              {activeStep === "mapping" && (
                <MappingStep implementationId={implementationId} initialType={mappingInitialType} />
              )}
              {activeStep === "review" && (
                <ReviewStep
                  implementationId={implementationId}
                  stats={stats}
                  onNavigate={(stepKey) => {
                    if (stepKey === "mapping") setMappingInitialType("accounts");
                    setActiveStep(stepKey);
                  }}
                  onConcluded={() => {
                    load();
                    setActiveStep("conclude");
                  }}
                />
              )}
              {activeStep === "conclude" && (
                <div className="wf-content">
                  <h2>
                    {implementation.status === "CONCLUDED"
                      ? "Implantação concluída"
                      : "Concluir implantação"}
                  </h2>
                  {implementation.status === "CONCLUDED" ? (
                    <>
                      <p className="wf-subtitle">
                        A revisão foi encerrada sem pendências. Concluir registra o fim do processo;
                        não envia dados para outro sistema automaticamente.
                      </p>

                      {stats && (
                        <dl
                          className="wf-drawer-grid wf-section"
                          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
                        >
                          <div>
                            <dt>Contas mapeadas</dt>
                            <dd>{stats.accountsMapped}</dd>
                          </div>
                          <div>
                            <dt>Centros de custo mapeados</dt>
                            <dd>{stats.costCentersMapped}</dd>
                          </div>
                          <div>
                            <dt>Arquivos importados</dt>
                            <dd>{stats.filesImported}</dd>
                          </div>
                          <div>
                            <dt>Pendências</dt>
                            <dd>0</dd>
                          </div>
                        </dl>
                      )}

                      <div className="wf-toolbar">
                        <button
                          type="button"
                          className="wf-btn"
                          onClick={() => setActiveStep("accounts")}
                        >
                          Consultar contas
                        </button>
                        <button
                          type="button"
                          className="wf-btn"
                          onClick={() => setActiveStep("mapping")}
                        >
                          Consultar De/Para
                        </button>
                        <Link
                          to="/implantacoes"
                          className="wf-btn wf-btn-primary"
                          style={{ textDecoration: "none", display: "inline-flex", color: "#fff" }}
                        >
                          Voltar para implantações
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="wf-subtitle">Esta implantação ainda não foi concluída.</p>
                      <button
                        className="wf-btn wf-btn-primary"
                        onClick={() => setActiveStep("review")}
                      >
                        Ir para Revisão
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
