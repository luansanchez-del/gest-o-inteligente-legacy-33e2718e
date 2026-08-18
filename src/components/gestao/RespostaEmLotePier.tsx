import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  MessagesSquare,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  executarDecisaoLote,
  prepararDecisaoLote,
} from "@/lib/api/decisao-lote.functions";
import { montarPreview } from "@/lib/api/gestao.functions";
import { mensagemDeErro } from "@/lib/erros";

const CHAVE_FILTROS_GESTAO = "gestao-inteligente:filtros-gestao";
const TODOS_DEPARTAMENTOS = "__TODOS__";
const TODOS_USUARIOS = "__TODOS_USUARIOS__";
const TODAS_FILAS = "__TODAS_FILAS__";
const TODOS_ANEXOS = "__TODOS_ANEXOS__";

type Etapa = "SELECIONAR" | "REVISAR" | "RESULTADO";
type AcaoEdicao =
  | "PULAR"
  | "RESPONDER_MANTER_ABERTA"
  | "RESPONDER_FINALIZAR";

interface FiltrosSalvos {
  competencia?: string;
  competenciaFim?: string;
  tipo?: "CONTABIL" | "MOVIMENTO_FINANCEIRO";
  busca?: string;
  revisaoCompetencia?: boolean;
  departamento?: string;
  responsavel?: string;
  fila?: string;
  anexo?: string;
}

interface EdicaoItem {
  solicitacaoExternalId: string;
  clienteNome: string;
  numero: string | null;
  execucaoId: string | null;
  tipo: string;
  titulo: string;
  confianca: string;
  podeFinalizar: boolean;
  exigeJustificativa: boolean;
  totalImpedimentos: number;
  totalAlertas: number;
  acao: AcaoEdicao;
  mensagem: string;
  justificativa: string;
  erroPreparacao?: string;
}

function lerFiltros() {
  let salvo: FiltrosSalvos = {};
  try {
    salvo = JSON.parse(
      window.sessionStorage.getItem(CHAVE_FILTROS_GESTAO) ?? "{}",
    ) as FiltrosSalvos;
  } catch {
    salvo = {};
  }

  const competencia = /^\d{4}-\d{2}$/.test(salvo.competencia ?? "")
    ? salvo.competencia!
    : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  return {
    competencia,
    competenciaFim:
      salvo.competenciaFim && /^\d{4}-\d{2}$/.test(salvo.competenciaFim)
        ? salvo.competenciaFim
        : null,
    tipo: salvo.tipo === "MOVIMENTO_FINANCEIRO" ? ("MOVIMENTO_FINANCEIRO" as const) : ("CONTABIL" as const),
    busca: salvo.busca?.trim() || null,
    revisaoCompetencia: Boolean(salvo.revisaoCompetencia),
    departamentoId:
      salvo.departamento && salvo.departamento !== TODOS_DEPARTAMENTOS
        ? salvo.departamento
        : null,
    responsavelId:
      salvo.responsavel && salvo.responsavel !== TODOS_USUARIOS
        ? salvo.responsavel
        : null,
    statusFila:
      salvo.fila && salvo.fila !== TODAS_FILAS ? (salvo.fila as never) : null,
    anexo:
      salvo.anexo && salvo.anexo !== TODOS_ANEXOS
        ? (salvo.anexo as "COM_ANEXO" | "SEM_ANEXO")
        : null,
  };
}

function acaoPadrao(tipo: string): AcaoEdicao {
  if (tipo === "APROVAR_FINALIZAR" || tipo === "APROVAR_COM_JUSTIFICATIVA")
    return "RESPONDER_FINALIZAR";
  if (tipo === "SOLICITAR_CORRECAO") return "RESPONDER_MANTER_ABERTA";
  return "PULAR";
}

function rotuloTipo(tipo: string) {
  if (tipo === "APROVAR_FINALIZAR") return "Apta para finalizar";
  if (tipo === "APROVAR_COM_JUSTIFICATIVA") return "Aprovar com justificativa";
  if (tipo === "SOLICITAR_CORRECAO") return "Solicitar correção";
  return "Revisão humana";
}

function classeTipo(tipo: string) {
  if (tipo === "APROVAR_FINALIZAR") return "bg-success-soft text-success-strong";
  if (tipo === "APROVAR_COM_JUSTIFICATIVA") return "bg-warning-soft text-warning-strong";
  if (tipo === "SOLICITAR_CORRECAO") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

export function RespostaEmLotePier() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("SELECIONAR");
  const [escopo, setEscopo] = useState<Awaited<ReturnType<typeof montarPreview>> | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [edicoes, setEdicoes] = useState<EdicaoItem[]>([]);
  const [justificativaComum, setJustificativaComum] = useState("");
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof executarDecisaoLote>> | null>(null);

  const carregarEscopo = useMutation({
    mutationFn: () => montarPreview({ data: lerFiltros() }),
    onSuccess: (dados) => {
      setEscopo(dados);
      const candidatos = dados.empresas
        .filter((linha) => linha.statusFila !== "HISTORICO")
        .map((linha) => linha.solicitacaoId)
        .slice(0, 100);
      setSelecionadas(new Set(candidatos));
      setEdicoes([]);
      setResultado(null);
      setEtapa("SELECIONAR");
      setAberto(true);
    },
    onError: (error) => toast.error(mensagemDeErro(error)),
  });

  const preparar = useMutation({
    mutationFn: () =>
      prepararDecisaoLote({
        data: { solicitacoes: [...selecionadas] },
      }),
    onSuccess: (retorno) => {
      const proximas: EdicaoItem[] = retorno.itens.map((item) => {
        if (item.status === "ERRO") {
          return {
            solicitacaoExternalId: item.solicitacaoExternalId,
            clienteNome: item.solicitacaoExternalId,
            numero: null,
            execucaoId: null,
            tipo: "ERRO_PREPARACAO",
            titulo: "Não foi possível preparar",
            confianca: "BAIXA",
            podeFinalizar: false,
            exigeJustificativa: false,
            totalImpedimentos: 0,
            totalAlertas: 0,
            acao: "PULAR",
            mensagem: "",
            justificativa: "",
            erroPreparacao: item.erro,
          };
        }
        const d = item.decisao;
        return {
          solicitacaoExternalId: d.solicitacaoExternalId,
          clienteNome: d.clienteNome,
          numero: d.numero,
          execucaoId: d.execucaoId,
          tipo: d.recomendacao.tipo,
          titulo: d.recomendacao.titulo,
          confianca: d.recomendacao.confianca,
          podeFinalizar: d.recomendacao.podeFinalizar,
          exigeJustificativa: d.recomendacao.exigeJustificativa,
          totalImpedimentos: d.recomendacao.totalImpedimentos,
          totalAlertas: d.recomendacao.totalAlertas,
          acao: acaoPadrao(d.recomendacao.tipo),
          mensagem: d.recomendacao.respostaSugerida,
          justificativa: "",
        };
      });
      setEdicoes(proximas);
      setEtapa("REVISAR");
    },
    onError: (error) => toast.error(mensagemDeErro(error)),
  });

  const executar = useMutation({
    mutationFn: () => {
      const itens = edicoes
        .filter((item) => item.acao !== "PULAR")
        .map((item) => ({
          solicitacaoExternalId: item.solicitacaoExternalId,
          execucaoId: item.execucaoId,
          acao: item.acao as "RESPONDER_MANTER_ABERTA" | "RESPONDER_FINALIZAR",
          mensagem: item.mensagem,
          justificativa: item.justificativa.trim() || null,
        }));
      return executarDecisaoLote({ data: { itens } });
    },
    onSuccess: (retorno) => {
      setResultado(retorno);
      setEtapa("RESULTADO");
      void queryClient.invalidateQueries({ queryKey: ["preview-gestao"] });
      void queryClient.invalidateQueries({ queryKey: ["decisao-inteligente-pier"] });
    },
    onError: (error) => toast.error(mensagemDeErro(error)),
  });

  const totalExecutar = edicoes.filter((item) => item.acao !== "PULAR").length;
  const pendenciasJustificativa = edicoes.filter(
    (item) =>
      item.acao === "RESPONDER_FINALIZAR" &&
      item.exigeJustificativa &&
      item.justificativa.trim().length < 10,
  ).length;
  const respostasInvalidas = edicoes.filter(
    (item) => item.acao !== "PULAR" && item.mensagem.trim().length < 10,
  ).length;

  const resumoRevisao = useMemo(() => {
    return {
      finalizar: edicoes.filter((i) => i.acao === "RESPONDER_FINALIZAR").length,
      manter: edicoes.filter((i) => i.acao === "RESPONDER_MANTER_ABERTA").length,
      pular: edicoes.filter((i) => i.acao === "PULAR").length,
    };
  }, [edicoes]);

  if (!/^\/gestao\/?$/.test(pathname)) return null;

  function atualizarEdicao(id: string, patch: Partial<EdicaoItem>) {
    setEdicoes((atuais) =>
      atuais.map((item) =>
        item.solicitacaoExternalId === id ? { ...item, ...patch } : item,
      ),
    );
  }

  function aplicarJustificativaComum() {
    const texto = justificativaComum.trim();
    if (texto.length < 10) {
      toast.error("Escreva uma justificativa com pelo menos 10 caracteres.");
      return;
    }
    setEdicoes((atuais) =>
      atuais.map((item) =>
        item.exigeJustificativa && item.acao === "RESPONDER_FINALIZAR"
          ? { ...item, justificativa: texto }
          : item,
      ),
    );
    toast.success("Justificativa aplicada às aprovações com ressalva.");
  }

  function confirmarExecucao() {
    if (!totalExecutar) {
      toast.error("Nenhuma ação está selecionada para execução.");
      return;
    }
    if (respostasInvalidas) {
      toast.error(`${respostasInvalidas} resposta(s) precisam ser revisadas.`);
      return;
    }
    if (pendenciasJustificativa) {
      toast.error(
        `${pendenciasJustificativa} aprovação(ões) ainda precisam de justificativa.`,
      );
      return;
    }
    executar.mutate();
  }

  return (
    <>
      <Button
        className="fixed bottom-4 right-4 z-[65] shadow-lg"
        onClick={() => carregarEscopo.mutate()}
        disabled={carregarEscopo.isPending}
      >
        {carregarEscopo.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <MessagesSquare className="mr-2 h-4 w-4" />
        )}
        Responder em lote
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>Resposta inteligente em lote</DialogTitle>
            <DialogDescription>
              Cada solicitação recebe uma decisão e uma resposta próprias. Nada é publicado ou finalizado antes da sua confirmação.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 border-b px-6 py-3 text-xs">
            <Badge variant={etapa === "SELECIONAR" ? "default" : "secondary"}>1. Selecionar</Badge>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
            <Badge variant={etapa === "REVISAR" ? "default" : "secondary"}>2. Revisar respostas</Badge>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
            <Badge variant={etapa === "RESULTADO" ? "default" : "secondary"}>3. Resultado</Badge>
          </div>

          {etapa === "SELECIONAR" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4">
                <div>
                  <p className="font-medium">Escopo atual da Gestão</p>
                  <p className="text-sm text-muted-foreground">
                    {escopo?.empresas.length ?? 0} solicitação(ões) exibidas · {selecionadas.size} selecionada(s).
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelecionadas(
                        new Set(
                          (escopo?.empresas ?? [])
                            .filter((linha) => linha.statusFila !== "HISTORICO")
                            .map((linha) => linha.solicitacaoId)
                            .slice(0, 100),
                        ),
                      )
                    }
                  >
                    Selecionar abertas
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelecionadas(new Set())}>
                    Limpar
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[54vh] px-6">
                <div className="space-y-2 py-4">
                  {(escopo?.empresas ?? []).map((linha) => {
                    const marcada = selecionadas.has(linha.solicitacaoId);
                    const historico = linha.statusFila === "HISTORICO";
                    return (
                      <label
                        key={linha.solicitacaoId}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/30"
                      >
                        <Checkbox
                          checked={marcada}
                          disabled={historico}
                          onCheckedChange={(checked) => {
                            setSelecionadas((atuais) => {
                              const proximo = new Set(atuais);
                              if (checked) {
                                if (proximo.size >= 100) {
                                  toast.error("O lote aceita no máximo 100 solicitações.");
                                  return atuais;
                                }
                                proximo.add(linha.solicitacaoId);
                              } else proximo.delete(linha.solicitacaoId);
                              return proximo;
                            });
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{linha.clienteNome}</span>
                            <Badge variant="outline">{linha.numero ?? linha.solicitacaoId}</Badge>
                            <Badge variant="secondary">{linha.statusFila}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Competência {linha.competencia ?? "—"} · {linha.responsavelNome ?? "Sem responsável"}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>

              <DialogFooter className="border-t px-6 py-4">
                <Button variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
                <Button
                  onClick={() => preparar.mutate()}
                  disabled={!selecionadas.size || preparar.isPending}
                >
                  {preparar.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="mr-2 h-4 w-4" />
                  )}
                  Gerar respostas para {selecionadas.size}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {etapa === "REVISAR" ? (
            <>
              <div className="grid gap-3 border-b px-6 py-4 sm:grid-cols-4">
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Responder + finalizar</p>
                  <p className="text-2xl font-semibold">{resumoRevisao.finalizar}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Responder e manter aberta</p>
                  <p className="text-2xl font-semibold">{resumoRevisao.manter}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Puladas</p>
                  <p className="text-2xl font-semibold">{resumoRevisao.pular}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Faltam justificativas</p>
                  <p className="text-2xl font-semibold">{pendenciasJustificativa}</p>
                </div>
              </div>

              {edicoes.some((item) => item.exigeJustificativa) ? (
                <div className="flex flex-col gap-2 border-b bg-warning-soft/40 px-6 py-4 lg:flex-row lg:items-end">
                  <div className="flex-1 space-y-1">
                    <Label>Justificativa comum para aprovações com ressalva</Label>
                    <Textarea
                      rows={2}
                      value={justificativaComum}
                      onChange={(event) => setJustificativaComum(event.target.value)}
                      placeholder="Ex.: saldos revisados e suportados por documentação apresentada; manter acompanhamento no próximo fechamento."
                    />
                  </div>
                  <Button variant="outline" onClick={aplicarJustificativaComum}>
                    Aplicar às ressalvas
                  </Button>
                </div>
              ) : null}

              <ScrollArea className="h-[52vh] px-6">
                <div className="space-y-4 py-4">
                  {edicoes.map((item, indice) => (
                    <div key={item.solicitacaoExternalId} className="space-y-3 rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{indice + 1}. {item.clienteNome}</p>
                          <p className="text-xs text-muted-foreground">
                            Solicitação {item.numero ?? item.solicitacaoExternalId}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge className={classeTipo(item.tipo)}>{rotuloTipo(item.tipo)}</Badge>
                          <Badge variant="outline">Confiança {item.confianca.toLowerCase()}</Badge>
                          {item.totalAlertas ? <Badge variant="secondary">{item.totalAlertas} alerta(s)</Badge> : null}
                          {item.totalImpedimentos ? <Badge className="bg-destructive/10 text-destructive">{item.totalImpedimentos} impedimento(s)</Badge> : null}
                        </div>
                      </div>

                      {item.erroPreparacao ? (
                        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                          {item.erroPreparacao}
                        </p>
                      ) : (
                        <>
                          <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
                            <div className="space-y-1.5">
                              <Label>Ação</Label>
                              <Select
                                value={item.acao}
                                onValueChange={(value) =>
                                  atualizarEdicao(item.solicitacaoExternalId, {
                                    acao: value as AcaoEdicao,
                                  })
                                }
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="PULAR">Pular / decidir depois</SelectItem>
                                  <SelectItem value="RESPONDER_MANTER_ABERTA">Responder e manter aberta</SelectItem>
                                  {item.podeFinalizar ? (
                                    <SelectItem value="RESPONDER_FINALIZAR">
                                      {item.exigeJustificativa
                                        ? "Aprovar com justificativa e finalizar"
                                        : "Responder e finalizar"}
                                    </SelectItem>
                                  ) : null}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Resposta sugerida — editável</Label>
                              <Textarea
                                rows={5}
                                value={item.mensagem}
                                disabled={item.acao === "PULAR"}
                                onChange={(event) =>
                                  atualizarEdicao(item.solicitacaoExternalId, {
                                    mensagem: event.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>

                          {item.exigeJustificativa && item.acao === "RESPONDER_FINALIZAR" ? (
                            <div className="space-y-1.5">
                              <Label>Justificativa da aprovação</Label>
                              <Textarea
                                rows={2}
                                value={item.justificativa}
                                onChange={(event) =>
                                  atualizarEdicao(item.solicitacaoExternalId, {
                                    justificativa: event.target.value,
                                  })
                                }
                                placeholder="Obrigatória. A justificativa será acrescentada à resposta publicada no PIER."
                              />
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <DialogFooter className="border-t px-6 py-4">
                <Button variant="ghost" onClick={() => setEtapa("SELECIONAR")}>Voltar</Button>
                <Button
                  onClick={confirmarExecucao}
                  disabled={executar.isPending || !totalExecutar}
                >
                  {executar.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Executar {totalExecutar} ação(ões)
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {etapa === "RESULTADO" && resultado ? (
            <>
              <div className="grid gap-3 px-6 py-4 sm:grid-cols-4">
                <div className="rounded-md bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Processadas</p><p className="text-2xl font-semibold">{resultado.resumo.total}</p></div>
                <div className="rounded-md bg-success-soft p-3"><p className="text-xs text-success-strong">Sucesso</p><p className="text-2xl font-semibold text-success-strong">{resultado.resumo.sucesso}</p></div>
                <div className="rounded-md bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Finalizadas</p><p className="text-2xl font-semibold">{resultado.resumo.finalizadas}</p></div>
                <div className="rounded-md bg-destructive/10 p-3"><p className="text-xs text-destructive">Erros</p><p className="text-2xl font-semibold text-destructive">{resultado.resumo.erros}</p></div>
              </div>

              <ScrollArea className="h-[52vh] px-6">
                <div className="space-y-2 py-3">
                  {resultado.resultados.map((item) => {
                    const nome = edicoes.find((e) => e.solicitacaoExternalId === item.solicitacaoExternalId)?.clienteNome ?? item.solicitacaoExternalId;
                    return (
                      <div key={item.solicitacaoExternalId} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">{nome}</p>
                          <p className="text-xs text-muted-foreground">{item.mensagem ?? item.erro ?? "Sem detalhe adicional."}</p>
                        </div>
                        <Badge className={item.status === "SUCESSO" ? "bg-success-soft text-success-strong" : "bg-destructive/10 text-destructive"}>
                          {item.status === "SUCESSO" ? item.situacao ?? "Sucesso" : "Erro"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <DialogFooter className="border-t px-6 py-4">
                <span className="mr-auto text-xs text-muted-foreground">Lote {resultado.loteId}</span>
                <Button
                  variant="outline"
                  onClick={() => carregarEscopo.mutate()}
                  disabled={carregarEscopo.isPending}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Novo lote
                </Button>
                <Button onClick={() => setAberto(false)}>Concluir</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
