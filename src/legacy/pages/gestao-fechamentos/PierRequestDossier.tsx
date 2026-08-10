import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type {
  PierArquivo,
  PierPostagem,
  PierRequestReview,
  PierSolicitacao,
} from "../../api/types";

const emptyReview = (id: string): PierRequestReview => ({
  externalRequestId: id,
  observation: "",
  conversationReviewed: false,
  attachmentsReviewed: false,
  reconciled: false,
  conclusion: "PENDING",
});
export function PierRequestDossier({
  request,
  onClose,
}: {
  request: PierSolicitacao;
  onClose: () => void;
}) {
  const [posts, setPosts] = useState<PierPostagem[]>([]),
    [files, setFiles] = useState<PierArquivo[]>([]),
    [review, setReview] = useState<PierRequestReview>(emptyReview(String(request.id))),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.gestaoFechamentos.pier.listPostagens(String(request.id)),
      api.gestaoFechamentos.pier.listArquivos(request.id),
      api.gestaoFechamentos.management.getReview(String(request.id)),
    ])
      .then(([p, f, r]) => {
        setPosts(p);
        setFiles(f);
        setReview(r ?? emptyReview(String(request.id)));
      })
      .finally(() => setLoading(false));
  }, [request.id]);
  async function openFile(file: PierArquivo) {
    const result = await api.gestaoFechamentos.pier.getArquivoDownloadUrl(file.id);
    if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
  }
  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const saved = await api.gestaoFechamentos.management.saveReview(String(request.id), {
        observation: review.observation,
        conversationReviewed: review.conversationReviewed,
        attachmentsReviewed: review.attachmentsReviewed,
        reconciled: review.reconciled,
        conclusion: review.conclusion,
      });
      setReview(saved);
      setMessage("Validação salva.");
    } finally {
      setSaving(false);
    }
  }
  const late = !!request.prazo && new Date(request.prazo) < new Date() && !request.finalizadaEm;
  return (
    <div
      className="dossier-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside className="dossier">
        <header>
          <div>
            <span>DOSSIÊ INTELIGENTE</span>
            <h2>
              {request.numero} · {request.descricao}
            </h2>
            <p>{request.nomeCliente}</p>
          </div>
          <button onClick={onClose}>×</button>
        </header>
        {loading ? (
          <div className="dossier-loading">Lendo conversa, anexos e validações…</div>
        ) : (
          <div className="dossier-body">
            <section className={`dossier-diagnosis ${late ? "danger" : "ok"}`}>
              <strong>
                {late ? "Prazo vencido sem conclusão" : "Solicitação dentro do fluxo"}
              </strong>
              <span>
                {request.status} · prazo{" "}
                {request.prazo
                  ? new Date(request.prazo).toLocaleDateString("pt-BR")
                  : "não informado"}{" "}
                · {posts.length} mensagens · {files.length} anexos
              </span>
            </section>
            <section>
              <h3>1. Conversa do PIER</h3>
              {posts.length ? (
                posts.map((p) => (
                  <article className="dossier-post" key={p.idPostagem}>
                    <small>
                      {new Date(p.postadoEm).toLocaleString("pt-BR")} · remetente #{p.idRemetente}
                    </small>
                    <p>{p.postagemTexto || "(sem texto)"}</p>
                  </article>
                ))
              ) : (
                <p className="dossier-muted">Nenhuma mensagem encontrada.</p>
              )}
            </section>
            <section>
              <h3>2. Anexos para conferir</h3>
              {files.length ? (
                files.map((f) => (
                  <button className="dossier-file" key={f.id} onClick={() => openFile(f)}>
                    <span>📎</span>
                    <div>
                      <strong>{f.nomeArquivo || `Arquivo ${f.id}`}</strong>
                      <small>
                        {f.categoria || "Sem categoria"} ·{" "}
                        {new Date(f.enviadoEm).toLocaleString("pt-BR")}
                      </small>
                    </div>
                    <b>Abrir ↗</b>
                  </button>
                ))
              ) : (
                <p className="dossier-muted">Nenhum anexo localizado.</p>
              )}
            </section>
            <section>
              <h3>3. Validação e conciliação</h3>
              <div className="dossier-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={review.conversationReviewed}
                    onChange={(e) =>
                      setReview({ ...review, conversationReviewed: e.target.checked })
                    }
                  />{" "}
                  Conversa revisada
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={review.attachmentsReviewed}
                    onChange={(e) =>
                      setReview({ ...review, attachmentsReviewed: e.target.checked })
                    }
                  />{" "}
                  Anexos conferidos
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={review.reconciled}
                    onChange={(e) => setReview({ ...review, reconciled: e.target.checked })}
                  />{" "}
                  Valores conciliados
                </label>
              </div>
              <label className="dossier-field">
                Conclusão
                <select
                  value={review.conclusion ?? "PENDING"}
                  onChange={(e) => setReview({ ...review, conclusion: e.target.value })}
                >
                  <option value="PENDING">Pendente</option>
                  <option value="APPROVED">Validado</option>
                  <option value="DIVERGENCE">Divergência encontrada</option>
                  <option value="WAITING_CLIENT">Aguardando cliente</option>
                </select>
              </label>
              <label className="dossier-field">
                Observação
                <textarea
                  value={review.observation ?? ""}
                  onChange={(e) => setReview({ ...review, observation: e.target.value })}
                  placeholder="Registre o que foi conferido, divergências e próxima ação…"
                />
              </label>
              <button className="dossier-save" onClick={save} disabled={saving}>
                {saving ? "Salvando…" : "Salvar validação"}
              </button>
              {message && <span className="dossier-saved">{message}</span>}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
