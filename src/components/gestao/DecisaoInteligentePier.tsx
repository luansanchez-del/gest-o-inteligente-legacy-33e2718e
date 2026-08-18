import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  executarDecisaoInteligente,
  obterDecisaoInteligente,
} from "@/lib/api/decisao-inteligente.functions";
import { mensagemDeErro } from "@/lib/erros";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const ESTILOS: Record<string, string> = {
  APROVAR_FINALIZAR: "bg-success-soft text-success-strong",
  APROVAR_COM_JUSTIFICATIVA: "bg-warning-soft text-warning-strong",
  SOLICITAR_CORRECAO: "bg-destructive/10 text-destructive",
  REVISAO_HUMANA: "bg-muted text-muted-foreground",
};

function externalIdDaRota(pathname: string) {
  const match = pathname.match(/^\/gestao\/solicitacoes\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function DecisaoInteligentePier() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const externalId = externalIdDaRota(pathname);
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(true);
  const [resposta, setResposta] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [confirmarFinalizacao, setConfirmarFinalizacao] = useState(false);

  const decisao = useQuery({
    queryKey: ["decisao-inteligente-pier", externalId],
    queryFn: () =>
      obterDecisaoInteligente({
        data: { solicitacaoExternalId: externalId! },
      }),
    enabled: Boolean(externalId),
  });

  const dados = decisao.data;
  const recomendacao = dados?.recomendacao;

  useEffect(() => {
    if (!recomendacao) return;
    setResposta(recomendacao.respostaSugerida);
    setJustificativa("");
  }, [externalId, dados?.execucaoId, recomendacao?.tipo]);

  const executar = useMutation({
    mutationFn: (acao: "RESPONDER_MANTER_ABERTA" | "RESPONDER_FINALIZAR") =>
      executarDecisaoInteligente({
        data: {
          solicitacaoExternalId: externalId!,
          execucaoId: dados?.execucaoId ?? null,
          acao,
          mensagem: resposta,
          justificativa: justificativa.trim() || null,
          privada: true,
        },
      }),
    onSuccess: (retorno) => {
      setConfirmarFinalizacao(false);
      if (retorno.situacao === "FINALIZADA" || retorno.situacao === "JA_FINALIZADA")
        toast.success(retorno.mensagem);
      else toast.success(retorno.mensagem);
      void queryClient.invalidateQueries({ queryKey: ["solicitacao", externalId] });
      void queryClient.invalidateQueries({ queryKey: ["validacao"] });
      void queryClient.invalidateQueries({
        queryKey: ["decisao-inteligente-pier", externalId],
      });
    },
    onError: (error) => toast.error(mensagemDeErro(error)),
  });

  if (!externalId) return null;

  if (!aberto) {
    return (
      <Button
        className="fixed bottom-4 right-4 z-[70] shadow-lg"
        onClick={() => setAberto(true)}
      >
        <Sparkles className="mr-2 h-4 w-4" />
        Decisão inteligente
      </Button>
    );
  }

  return (
    <>
      <Card className="fixed bottom-4 right-4 z-[70] max-h-[82vh] w-[min(440px,calc(100vw-2rem))] space-y-4 overflow-y-auto border-border p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="font-semibold">Decisão Inteligente</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Leitura técnica + decisão humana + execução controlada no PIER.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Fechar painel de decisão inteligente"
            onClick={() => setAberto(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {decisao.isLoading ? (
          <p className="text-sm text-muted-foreground">Montando recomendação…</p>
        ) : decisao.isError ? (
          <div className="space-y-2 text-sm">
            <p className="text-destructive">Não foi possível montar a decisão.</p>
            <Button size="sm" variant="outline" onClick={() => void decisao.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : recomendacao ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={ESTILOS[recomendacao.tipo] ?? "bg-muted"}>
                {recomendacao.titulo}
              </Badge>
              <Badge variant="secondary">Confiança {recomendacao.confianca.toLowerCase()}</Badge>
              {dados?.vencida ? (
                <Badge className="bg-destructive/10 text-destructive">
                  <Clock3 className="mr-1 h-3 w-3" />
                  Vencida há {dados.diasVencida} dia(s)
                </Badge>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Por que o sistema recomenda isso
              </p>
              <ul className="space-y-1 text-sm">
                {recomendacao.motivos.map((motivo) => (
                  <li key={motivo} className="flex gap-2">
                    <span className="mt-1 text-muted-foreground">•</span>
                    <span>{motivo}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                O vencimento altera a prioridade visual, nunca a decisão técnica.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="resposta-inteligente">Resposta sugerida</Label>
              <Textarea
                id="resposta-inteligente"
                rows={8}
                value={resposta}
                onChange={(event) => setResposta(event.target.value)}
                placeholder="Revise a resposta antes de enviar ao PIER."
              />
              <p className="text-xs text-muted-foreground">
                A resposta é editável. Nada é publicado sem seu comando.
              </p>
            </div>

            {recomendacao.exigeJustificativa ? (
              <div className="space-y-1.5">
                <Label htmlFor="justificativa-inteligente">
                  Justificativa da aprovação
                </Label>
                <Textarea
                  id="justificativa-inteligente"
                  rows={4}
                  value={justificativa}
                  onChange={(event) => setJustificativa(event.target.value)}
                  placeholder="Ex.: composição apresentada e validada; saldo compatível com a natureza da conta…"
                />
                <p className="text-xs text-warning-strong">
                  Obrigatória para aprovar e finalizar quando houver alerta/julgamento contábil.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                variant={recomendacao.podeFinalizar ? "outline" : "default"}
                onClick={() => executar.mutate("RESPONDER_MANTER_ABERTA")}
                disabled={executar.isPending || resposta.trim().length < 10}
              >
                {recomendacao.podeFinalizar ? (
                  <Send className="mr-2 h-4 w-4" />
                ) : (
                  <AlertTriangle className="mr-2 h-4 w-4" />
                )}
                {recomendacao.podeFinalizar
                  ? "Responder e manter aberta"
                  : "Responder / solicitar correção"}
              </Button>

              {recomendacao.podeFinalizar ? (
                <Button
                  onClick={() => setConfirmarFinalizacao(true)}
                  disabled={
                    executar.isPending ||
                    resposta.trim().length < 10 ||
                    (recomendacao.exigeJustificativa && justificativa.trim().length < 10)
                  }
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {recomendacao.exigeJustificativa
                    ? "Aprovar com justificativa"
                    : "Responder e finalizar"}
                </Button>
              ) : null}

              <Button
                variant="ghost"
                disabled
                title={dados?.encaminhamento.motivo}
              >
                Encaminhar responsável
              </Button>
            </div>

            {!dados?.encaminhamento.disponivel ? (
              <p className="text-xs text-muted-foreground">
                Encaminhamento ainda não é executado: falta mapear e validar o endpoint de troca de responsável/departamento do PIER. O sistema não presume endpoints.
              </p>
            ) : null}
          </>
        ) : null}
      </Card>

      <AlertDialog open={confirmarFinalizacao} onOpenChange={setConfirmarFinalizacao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar resposta e finalização no PIER?</AlertDialogTitle>
            <AlertDialogDescription>
              Primeiro a resposta será publicada e confirmada. Somente depois o sistema solicitará a finalização e fará uma nova leitura do PIER para confirmar o status. Se a postagem falhar, a solicitação não será finalizada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => executar.mutate("RESPONDER_FINALIZAR")}
              disabled={executar.isPending}
            >
              {executar.isPending ? "Executando…" : "Confirmar e executar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
