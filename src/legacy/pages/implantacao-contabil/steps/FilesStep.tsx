import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { api } from "../../../api/client";
import type {
  ImportedFileDetail,
  ImportedFileSummary,
  ImportFileKind,
  RecognizedField,
} from "../../../api/types";
import { FIELD_LABELS, IMPORT_KIND_LABELS } from "../../../api/types";
import { formatDateTime, formatNumber } from "../../../lib/format";
import { IMPORT_STATUS_CLASS, IMPORT_STATUS_LABELS } from "../../../lib/statusLabels";
import { EmptyState, TableSkeleton } from "../components/States";

interface Props {
  implementationId: string;
  onDataChanged: () => void;
  onAnalyze: (importId: string) => void;
}

const KIND_OPTIONS: { value: ImportFileKind; label: string }[] = [
  { value: "TRIAL_BALANCE_SOURCE", label: "Balancete (Origem)" },
  { value: "LEDGER_SOURCE", label: "Razão (Origem)" },
  { value: "CHART_SOURCE", label: "Plano de Contas (Origem)" },
  { value: "CHART_TARGET", label: "Plano de Contas (Destino)" },
  { value: "COST_CENTER_SOURCE", label: "Centros de Custo (Origem)" },
  { value: "COST_CENTER_TARGET", label: "Centros de Custo (Destino)" },
  { value: "QUESTOR_JOURNAL_SOURCE", label: "Lançamentos Questor (.nli)" },
];

const SPREADSHEET_EXTENSIONS = [".xlsx", ".xls", ".csv"];
// Balancete/Razão também aceitam PDF (leitura inteligente do texto real do PDF) — ver docs/pdf-balancete.md.
const SPREADSHEET_AND_PDF_EXTENSIONS = [".xlsx", ".xls", ".csv", ".pdf"];
const PDF_ACCEPTING_KINDS: ImportFileKind[] = [
  "TRIAL_BALANCE_SOURCE",
  "LEDGER_SOURCE",
  "CHART_SOURCE",
  "CHART_TARGET",
  "COST_CENTER_SOURCE",
  "COST_CENTER_TARGET",
];
const QUESTOR_EXTENSIONS = [".nli"];
const ALL_FIELDS = Object.keys(FIELD_LABELS) as RecognizedField[];

export function FilesStep({ implementationId, onDataChanged, onAnalyze }: Props) {
  const [files, setFiles] = useState<ImportedFileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ImportFileKind>("TRIAL_BALANCE_SOURCE");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, setPending] = useState<ImportedFileDetail | null>(null);
  const [fieldByColumn, setFieldByColumn] = useState<(RecognizedField | "")[]>([]);
  const [viewing, setViewing] = useState<ImportedFileDetail | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    api.imports
      .list(implementationId)
      .then((result) => {
        setFiles(result);
        setError(null);
        // Um arquivo pode ter sido corrigido ou removido em outra requisição.
        // Não mantenha aberto o mapeamento de um registro que já não existe.
        setPending((current) =>
          current && !result.some((file) => file.id === current.id) ? null : current,
        );
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [implementationId]);

  async function handleFile(file: File) {
    const acceptsPdf = PDF_ACCEPTING_KINDS.includes(kind);
    const allowedExtensions =
      kind === "QUESTOR_JOURNAL_SOURCE"
        ? QUESTOR_EXTENSIONS
        : acceptsPdf
          ? SPREADSHEET_AND_PDF_EXTENSIONS
          : SPREADSHEET_EXTENSIONS;
    const hasAllowedExtension = allowedExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext),
    );
    if (!hasAllowedExtension) {
      setUploadError(
        kind === "QUESTOR_JOURNAL_SOURCE"
          ? "Formato não suportado. Envie um arquivo .nli."
          : acceptsPdf
            ? "Formato não suportado. Envie XLSX, XLS, CSV ou PDF."
            : "Formato não suportado. Envie XLSX, XLS ou CSV.",
      );
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const result = await api.imports.upload(implementationId, kind, file);
      if (result.needsConfirmation) {
        setPending(result);
        setFieldByColumn(
          result.headers.map((_, index) => result.detectedFields[index]?.field ?? ""),
        );
      }
      load();
      onDataChanged();
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) handleFile(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function handleConfirmMapping() {
    if (!pending) return;
    const columnMapping: Partial<Record<RecognizedField, number>> = {};
    fieldByColumn.forEach((field, index) => {
      if (field) columnMapping[field] = index;
    });
    setUploading(true);
    try {
      await api.imports.confirmMapping(implementationId, pending.id, columnMapping);
      await api.imports.commit(implementationId, pending.id);
      setPending(null);
      setUploadError(null);
      load();
      onDataChanged();
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleReprocess(id: string) {
    setError(null);
    try {
      await api.imports.commit(implementationId, id);
      setError(null);
      load();
      onDataChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRemove(file: ImportedFileSummary) {
    if (
      !window.confirm(
        `Excluir o arquivo "${file.originalName}" enviado em ${formatDateTime(file.createdAt)}?\n\nAs linhas importadas por este envio serão removidas. Contas e centros de custo consolidados serão preservados.`,
      )
    ) {
      return;
    }

    setRemovingId(file.id);
    setError(null);
    try {
      await api.imports.remove(implementationId, file.id);
      if (viewing?.id === file.id) setViewing(null);
      load();
      onDataChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemovingId(null);
    }
  }

  async function handleView(id: string) {
    const detail = await api.imports.get(implementationId, id);
    setViewing(detail);
  }

  return (
    <div className="wf-content">
      <h2>Arquivos</h2>
      <p className="wf-subtitle">
        Envie os arquivos contábeis desta implantação. Cada envio fica registrado abaixo.
      </p>

      <div className="wf-section">
        <div className="wf-toolbar">
          <label htmlFor="import-kind" style={{ fontSize: "0.85rem" }}>
            Tipo de arquivo:
          </label>
          <select
            id="import-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as ImportFileKind)}
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div
          className={`wf-dropzone${dragging ? " is-dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept={
              kind === "QUESTOR_JOURNAL_SOURCE"
                ? ".nli"
                : PDF_ACCEPTING_KINDS.includes(kind)
                  ? ".xlsx,.xls,.csv,.pdf"
                  : ".xlsx,.xls,.csv"
            }
            style={{ display: "none" }}
            onChange={onInputChange}
          />
          <div className="wf-dropzone-title">
            {uploading ? "Processando…" : "Envie os arquivos contábeis"}
          </div>
          <div className="wf-dropzone-subtitle">
            {kind === "QUESTOR_JOURNAL_SOURCE"
              ? "Arquivo .nli da Questor (layout de lançamentos ou dados de largura fixa) — arraste aqui ou clique para selecionar"
              : PDF_ACCEPTING_KINDS.includes(kind)
                ? "Excel, CSV ou PDF (leitura inteligente, inclusive com centro de custo) — arraste aqui ou clique para selecionar"
                : "Balancete, Razão, DRE, Balanço, Excel, CSV ou TXT — arraste aqui ou clique para selecionar"}
          </div>
        </div>
        {uploadError && <p className="error">{uploadError}</p>}
      </div>

      {pending && (
        <div className="wf-panel wf-section">
          <h3>Confirme o layout de "{pending.originalName}"</h3>
          <p className="wf-subtitle">
            Não identifiquei todas as colunas com certeza. Confirme abaixo antes de importar.
          </p>
          <div className="wf-table-wrapper">
            <table className="wf-table">
              <thead>
                <tr>
                  {pending.headers.map((header, index) => (
                    <th key={index}>
                      {pending.detectedFields[index]?.column ?? ""} — {header}
                    </th>
                  ))}
                </tr>
                <tr>
                  {pending.headers.map((_, index) => (
                    <th key={index}>
                      <select
                        value={fieldByColumn[index] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value as RecognizedField | "";
                          setFieldByColumn((prev) => {
                            const next = [...prev];
                            next[index] = value;
                            return next;
                          });
                        }}
                      >
                        <option value="">Ignorar coluna</option>
                        {ALL_FIELDS.map((fieldOption) => (
                          <option key={fieldOption} value={fieldOption}>
                            {FIELD_LABELS[fieldOption]}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.sampleRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="wf-toolbar" style={{ marginTop: "0.85rem" }}>
            <button
              className="wf-btn wf-btn-primary"
              onClick={handleConfirmMapping}
              disabled={uploading}
            >
              {uploading ? "Importando…" : "Confirmar layout e importar"}
            </button>
            <button className="wf-btn" onClick={() => setPending(null)} disabled={uploading}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="wf-section">
        <h3>Arquivos importados</h3>
        {error && <p className="error">{error}</p>}
        {loading ? (
          <TableSkeleton />
        ) : files.length === 0 ? (
          <EmptyState
            icon="📂"
            title="Nenhum arquivo enviado ainda"
            description="Use a área acima para começar."
          />
        ) : (
          <div className="wf-table-wrapper">
            <table className="wf-table">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Tipo</th>
                  <th>Aba</th>
                  <th>Data</th>
                  <th>Linhas</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id}>
                    <td>{file.originalName}</td>
                    <td>{IMPORT_KIND_LABELS[file.kind]}</td>
                    <td>{file.sheetName ?? "Não disponível"}</td>
                    <td>{formatDateTime(file.createdAt)}</td>
                    <td className="wf-table-num">{formatNumber(file.rowCount)}</td>
                    <td>
                      <span className={IMPORT_STATUS_CLASS[file.status]}>
                        {IMPORT_STATUS_LABELS[file.status]}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button className="btn-link" onClick={() => handleView(file.id)}>
                        Visualizar
                      </button>
                      {file.status === "IMPORTED" && (
                        <button className="btn-link" onClick={() => onAnalyze(file.id)}>
                          Analisar
                        </button>
                      )}
                      {(file.status === "READY_TO_IMPORT" || file.status === "ERROR") && (
                        <button className="btn-link" onClick={() => handleReprocess(file.id)}>
                          Reprocessar
                        </button>
                      )}
                      <button
                        className="btn-link"
                        onClick={() => handleRemove(file)}
                        disabled={removingId === file.id}
                      >
                        {removingId === file.id ? "Excluindo…" : "Excluir"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && (
        <div className="wf-drawer-overlay" onClick={() => setViewing(null)}>
          <div className="wf-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="wf-drawer-header">
              <h2>{viewing.originalName}</h2>
              <button
                className="wf-drawer-close"
                onClick={() => setViewing(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <p className="wf-hint">
              {IMPORT_KIND_LABELS[viewing.kind]} · {formatNumber(viewing.rowCount)} linha(s) · aba{" "}
              {viewing.sheetName ?? "não disponível"}
            </p>
            <div className="wf-table-wrapper">
              <table className="wf-table">
                <thead>
                  <tr>
                    {viewing.headers.map((header, index) => (
                      <th key={index}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewing.sampleRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
