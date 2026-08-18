import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Inbox,
  MailCheck,
  Route as RouteIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ErroConsulta } from "@/components/common/EstadoConsulta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  analisarSolicitacaoInteligente,
  executarAcaoSolicitacaoInteligente,
} from "@/lib/api/caixa-inteligente.functions";
import { mensagemDeErro } from "@/lib/erros";

const ROTULOS: Record<string, string> = {
  BALANCETE: "Balancete / demonstrações",
  CONTABIL: "Contábil",
  FISCAL: "Fiscal / tributário",
  FOLHA: "Folha / DP",
  FINANCEIRO: "Financeiro",
  DOCUMENTO: "Documento",
  ADMINISTRATIVO: "Administrativo",
  OUTRO: "Outros",
};

type AcaoExecucao =
  | "RESPONDER_MANTER_ABERTA"
  | "RESPONDER_FINALIZAR"
  | "FINALIZAR_SEM_RESPONDER";

function dataPt(value: string | null | undefined) {
  if (!value) return "—";
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

function rotuloAcao(acao: string) {
  if (acao === "RESPONDER_FINALIZAR") return "Responder e finalizar";
  if (acao === "FINALIZAR_SEM_RESPONDER") return "Finalizar sem responder";
  if (acao === "RESPONDER_MANTER_ABERTA") return "Responder e manter aberta";
  if (acao === "ENCAMINHAR") return "Encaminhar";
  return "Revisão humana";
}

function classeAcao(acao: string) {
  if (acao === "RESPONDER_FINALIZAR" || acao === "FINALIZAR_SEM_RESPONDER")
    return "bg-success-soft text-success-strong";
  if (acao === "ENCAMINHAR") return "bg-warning-soft text-warning-strong";
  return "bg-muted text-muted-foreground";
}

function statusAnexo(status: string) {
  if (status === "LIDO") return <Badge variant="secondary">Lido</Badge>;
  if (status === "PARCIAL") return <Badge variant="outline">Parcial</Badge>;
  if (status === "NAO_SUPORTADO") return <Badge variant="outline">Não suportado</Badge>;
  return <Badge variant="destructive">Erro</Badge>;
}

export function AnaliseCaixaDialog(props: {
  externalId: string | null;
  onClose: () => void;
  onConcluido: () => void;
}) {
  const [mensagem, setMensagem] = useState("");
  const [privada, setPrivada] = useState(false);
  const [acaoFinalizacao, setAcaoFinalizacao] = useState<
    "RESPONDER_FINALIZAR" | "FINALIZAR_SEM_RESPONDER" | null
  >(null);
  const [justificativa, setJustificativa] = useState("");

  const analise = useQuery({
    queryKey: ["analise-caixa-inteligente", props.externalId],
    queryFn: () =>
      analisarSolicitacaoInteligente({
        data: { solicitacaoExternalId: props.externalId! },
      }),
    enabled: Boolean(props.externalId),
    staleTime: 0,
  });

  useEffect(() => {
    if (analise.data?.respostaSugerida !== undefined)
      setMensagem(analise.data.respostaSugerida ?? "");
  }, [analise.data?.respostaSugerida]);

  useEffect(() => {
    if (!props.externalId) {
      setMensagem("");
      setPrivada(false);
      setAcaoFinalizacao(null);
      setJustificativa("");
    }
  }, [props.externalId]);

  const executar = useMutation({
    mutationFn: (acao: AcaoExecucao) =>
      executarAcaoSolicitacaoInteligente({
        data: {
          solicitacaoExternalId: props.externalId!,
          acao,
          mensagem: acao === "FINALIZAR_SEM_RESPONDER" ? undefined : mensagem,
          privada,
          justificativaFinalizacao: justificativa.trim() || undefined,
        },
      }),
    onSuccess: (r) => {
      if (r.finalizada && !r.publicouResposta)
        toast.success("Solicitação finalizada no PIER sem criar postagem.");
      else if (r.finalizada)
        toast.success("Resposta publicada e finalização confirmada no PIER.");
      else toast.success("Resposta publicada no PIER. A solicitação permanece aberta.");
      setAcaoFinalizacao(null);
      setJustificativa("");
      props.onConcluido();
      props.onClose();
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const dados = analise.data;
  const recomendada = dados?.recomendacao.acao ?? null;
  const finalizacaoDiverge = Boolean(
    acaoFinalizacao && recomendada && acaoFinalizacao !== recomendada,
  );
  const arquivosLidos = dados?.leitura.arquivosLidos ?? [];
  const contextoDocumental = dados?.localizador.contextoDocumental;

  const podeConfirmar = useMemo(() => {
    if (!acaoFinalizacao) return false;
    if (
      acaoFinalizacao === "RESPONDER_FINALIZAR" &&
      mensagem.trim().length < 10
    )
      return false;
    if (finalizacaoDiverge && justificativa.trim().length < 10) return false;
    return true;
  }, [acaoFinalizacao, finalizacaoDiverge, justificativa, mensagem]);

  return (
    <Dialog
      open={Boolean(props.externalId)}
      onOpenChange={(aberto) => {
        if (!aberto && !executar.isPending) props.onClose();
      }}
    >
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Leitura e Localizador Inteligente</DialogTitle>
          <DialogDescription>
            O sistema lê a solicitação, postagens e anexos do PIER antes de recomendar a próxima ação. Nenhuma ação ocorre sem seu comando.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {analise.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Lendo PIER, postagens, PDF, planilhas e imagens anexadas…
            </div>
          ) : analise.isError ? (
            <ErroConsulta error={analise.error} onRetry={() => void analise.refetch()} />
          ) : dados ? (
            <div className="space-y-5 pb-4">
              <div className="grid gap-3 md:grid-cols-4">
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Assunto</p>
                  <p className="mt-1 font-medium">
                    {ROTULOS[dados.leitura.categoria] ?? dados.leitura.categoria}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Confiança {dados.leitura.confianca.toLowerCase()}
                  </p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Competência</p>
                  <p className="mt-1 font-medium">
                    {dados.solicitacao.competencia ?? "Não identificada"}
                  </p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Responsável atual</p>
                  <p className="mt-1 font-medium">
                    {dados.solicitacao.responsavelNome ?? "—"}
                  </p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Prazo</p>
                  <p className="mt-1 font-medium">{dataPt(dados.solicitacao.prazoEm)}</p>
                </Card>
              </div>

              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <Inbox className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="min-w-0">
                    <p className="font-medium">O que a solicitação pede</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {dados.solicitacao.descricao ?? dados.solicitacao.tipo ?? "Sem descrição disponível."}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {dados.leitura.postagens} postagem(ns) · {dados.leitura.arquivos.length} arquivo(s) no contexto
                    </p>
                  </div>
                </div>
              </Card>

              {dados.leitura.resumoContexto ? (
                <Card className="border-primary/20 p-4">
                  <div className="flex items-start gap-3">
                    <FileSearch className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Leitura consolidada</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {dados.leitura.resumoContexto}
                      </p>
                    </div>
                  </div>
                </Card>
              ) : null}

              {arquivosLidos.length ? (
                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <FileSearch className="h-5 w-5" />
                    <p className="font-medium">Arquivos lidos</p>
                  </div>
                  <div className="mt-3 space-y-3">
                    {arquivosLidos.map((arquivo) => (
                      <div key={arquivo.arquivoId} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">{arquivo.nome}</p>
                          {statusAnexo(arquivo.status)}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          {arquivo.resumo}
                        </p>
                        {arquivo.motivo ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {arquivo.motivo}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <RouteIcon className="h-5 w-5" />
                    <p className="font-medium">Responsável provável</p>
                  </div>
                  {dados.localizador.responsavelSugerido ? (
                    <div className="mt-3">
                      <p className="font-medium">
                        {dados.localizador.responsavelSugerido.nome ?? "Usuário identificado"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {dados.localizador.responsavelSugerido.departamento ?? "Departamento não identificado"}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Nenhum responsável alternativo foi identificado com segurança no histórico.
                    </p>
                  )}
                  {!dados.localizador.encaminhamentoDisponivel ? (
                    <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
                      Encaminhamento automático indisponível: {dados.localizador.motivoEncaminhamentoIndisponivel}
                    </p>
                  ) : null}
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <FileSearch className="h-5 w-5" />
                    <p className="font-medium">
                      {contextoDocumental?.titulo ?? "Documentos e evidências"}
                    </p>
                  </div>
                  {dados.localizador.fechamento ? (
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span>Fechamento</span>
                        <Badge variant="secondary">{dados.localizador.fechamento.status}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Balancete localizado</span>
                        <strong>{dados.localizador.fechamento.balanceteLocalizado ? "Sim" : "Não"}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Conciliação</span>
                        <strong>
                          {dados.localizador.fechamento.conciliacao === "CONFIRMADA_POR_EVIDENCIA"
                            ? "Evidência localizada"
                            : "Não comprovada"}
                        </strong>
                      </div>
                      {dados.localizador.fechamento.balancetes.length ? (
                        <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                          {dados.localizador.fechamento.balancetes.join(" · ")}
                        </div>
                      ) : null}
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to="/gestao/solicitacoes/$externalId"
                          params={{ externalId: dados.localizador.fechamento.solicitacaoExternalId }}
                        >
                          Abrir fechamento contábil
                        </Link>
                      </Button>
                    </div>
                  ) : arquivosLidos.length ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Os anexos acima foram usados como evidência para a leitura desta solicitação. O sistema não trata fechamento contábil como evidência principal quando o assunto pertence a outra área.
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {contextoDocumental?.mensagemVazia ?? "Nenhuma evidência conclusiva foi localizada automaticamente."}
                    </p>
                  )}
                </Card>
              </div>

              <Card className="border-primary/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Próxima ação recomendada
                    </p>
                    <span
                      className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${classeAcao(dados.recomendacao.acao)}`}
                    >
                      {rotuloAcao(dados.recomendacao.acao)}
                    </span>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {dados.recomendacao.motivo}
                    </p>
                  </div>
                  {dados.recomendacao.acao === "RESPONDER_FINALIZAR" ||
                  dados.recomendacao.acao === "FINALIZAR_SEM_RESPONDER" ? (
                    <CheckCircle2 className="h-6 w-6 text-success-strong" />
                  ) : dados.recomendacao.acao === "ENCAMINHAR" ? (
                    <RouteIcon className="h-6 w-6 text-warning-strong" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
              </Card>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="resposta-caixa">Resposta sugerida — editável</Label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={privada}
                      onChange={(e) => setPrivada(e.target.checked)}
                    />
                    postagem privada no PIER
                  </label>
                </div>
                <Textarea
                  id="resposta-caixa"
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={6}
                  placeholder={
                    dados.recomendacao.acao === "FINALIZAR_SEM_RESPONDER"
                      ? "A análise indica que uma resposta pode não ser necessária."
                      : "Revise a resposta antes de publicar."
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Por padrão a resposta é visível ao solicitante. “Finalizar sem responder” não cria postagem.
                </p>
              </div>

              {acaoFinalizacao ? (
                <Card className="border-warning/40 bg-warning-soft p-4">
                  <p className="font-medium text-warning-strong">
                    {acaoFinalizacao === "FINALIZAR_SEM_RESPONDER"
                      ? "Confirmar finalização sem responder?"
                      : "Confirmar resposta e finalização?"}
                  </p>
                  <p className="mt-1 text-sm text-warning-strong">
                    {acaoFinalizacao === "FINALIZAR_SEM_RESPONDER"
                      ? "Nenhuma postagem será criada. A solicitação só sairá da Caixa depois que o PIER confirmar a finalização."
                      : "A resposta será publicada primeiro. A finalização só será considerada concluída depois que o PIER confirmar o novo status."}
                  </p>
                  {finalizacaoDiverge ? (
                    <div className="mt-3 space-y-2">
                      <Label htmlFor="justificativa-finalizacao">
                        Justificativa da exceção
                      </Label>
                      <Textarea
                        id="justificativa-finalizacao"
                        value={justificativa}
                        onChange={(e) => setJustificativa(e.target.value)}
                        rows={3}
                        placeholder={`A recomendação atual é “${rotuloAcao(recomendada ?? "") }”. Explique por que deseja finalizar assim.`}
                      />
                      <p className="text-xs text-warning-strong">
                        Como a ação diverge da recomendação, a justificativa será registrada na auditoria.
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setAcaoFinalizacao(null);
                        setJustificativa("");
                      }}
                      disabled={executar.isPending}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => executar.mutate(acaoFinalizacao)}
                      disabled={executar.isPending || !podeConfirmar}
                    >
                      {executar.isPending
                        ? "Executando…"
                        : acaoFinalizacao === "FINALIZAR_SEM_RESPONDER"
                          ? "Confirmar e finalizar sem resposta"
                          : "Confirmar e finalizar"}
                    </Button>
                  </div>
                </Card>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t bg-background pt-4 sm:flex-row sm:flex-wrap">
          <Button
            variant="outline"
            onClick={() => executar.mutate("RESPONDER_MANTER_ABERTA")}
            disabled={executar.isPending || mensagem.trim().length < 10 || !dados}
          >
            Responder e manter aberta
          </Button>
          <Button
            variant="outline"
            disabled
            title="Endpoint de encaminhamento do PIER ainda não foi validado."
          >
            Encaminhar responsável
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setJustificativa("");
              setAcaoFinalizacao("FINALIZAR_SEM_RESPONDER");
            }}
            disabled={executar.isPending || !dados}
          >
            <MailCheck className="mr-2 h-4 w-4" />
            Finalizar sem responder
          </Button>
          <Button
            onClick={() => {
              setJustificativa("");
              setAcaoFinalizacao("RESPONDER_FINALIZAR");
            }}
            disabled={executar.isPending || mensagem.trim().length < 10 || !dados}
          >
            Responder e finalizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
