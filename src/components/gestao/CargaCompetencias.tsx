import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarPlus, CheckCircle2, History, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  abrirCarga as abrirCargaContabil,
  carregarCompetencia as carregarCompetenciaContabil,
  encerrarCarga as encerrarCargaContabil,
  estadoCarga as estadoCargaContabil,
  previsualizarCarga as previsualizarCargaContabil,
} from "@/lib/api/gestao.functions";
import { mensagemDeErro } from "@/lib/erros";

type Modo = "HISTORICA" | "MENSAL";

interface Passo {
  competencia: string;
  status: "PENDENTE" | "PROCESSANDO" | "CONCLUIDA" | "ERRO";
  mensagem?: string;
}

interface EstadoCargaLike {
  possuiCarga: boolean;
  primeiraCompetencia: string | null;
  ultimaCompetencia: string | null;
  ultimaSincronizacao: string | null;
  proximaSugerida: string;
  emRevisaoCompetencia: number;
}

interface ResumoMesLike {
  competencia: string;
  encontradas: number;
  novas: number;
  existentes: number;
  semCompetencia: number;
  erro: string | null;
}

interface PreviewCargaLike {
  totalMeses: number;
  totalNovas: number;
  totalExistentes: number;
  totalComAnexo: number;
  totalSemAnexo: number;
  totalSemCompetencia: number;
  totalIgnoradasNaoContabeis: number;
  totalErros: number;
  meses: ResumoMesLike[];
}

interface CargaCompetenciasApi {
  estadoCarga: () => Promise<EstadoCargaLike>;
  previsualizarCarga: (opts: {
    data: { inicio: string; fim: string };
  }) => Promise<PreviewCargaLike>;
  abrirCarga: (opts: {
    data: { inicio: string; fim: string; tipoCarga: Modo };
  }) => Promise<{ runId: string }>;
  carregarCompetencia: (opts: {
    data: { competencia: string; runId: string | null };
  }) => Promise<ResumoMesLike>;
  encerrarCarga: (opts: {
    data: { runId: string; status: "COMPLETED" | "FAILED"; mensagem?: string };
  }) => Promise<unknown>;
}

const API_CONTABIL: CargaCompetenciasApi = {
  estadoCarga: estadoCargaContabil,
  previsualizarCarga: previsualizarCargaContabil,
  abrirCarga: abrirCargaContabil,
  carregarCompetencia: carregarCompetenciaContabil,
  encerrarCarga: encerrarCargaContabil,
};

interface CargaCompetenciasProps {
  api?: CargaCompetenciasApi;
  queryKeyEstado?: unknown[];
  invalidateQueryKeys?: unknown[][];
  assunto?: string;
}

function competenciaAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

function rotuloCompetencia(valor: string | null) {
  if (!valor) return "—";
  const [ano, mes] = valor.split("-");
  return `${mes}/${ano}`;
}

export function CargaCompetencias({
  api = API_CONTABIL,
  queryKeyEstado = ["estado-carga"],
  invalidateQueryKeys = [["preview-gestao"]],
  assunto = "Fechamento Contábil",
}: CargaCompetenciasProps = {}) {
  const queryClient = useQueryClient();
  const [modo, setModo] = useState<Modo | null>(null);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [passos, setPassos] = useState<Passo[]>([]);
  const [executando, setExecutando] = useState(false);

  const estado = useQuery({ queryKey: queryKeyEstado, queryFn: () => api.estadoCarga() });

  const preview = useMutation({
    mutationFn: (dados: { inicio: string; fim: string }) => api.previsualizarCarga({ data: dados }),
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const pendentes = passos.filter((p) => p.status !== "CONCLUIDA");
  const concluidos = passos.filter((p) => p.status === "CONCLUIDA").length;

  function abrirModo(novo: Modo) {
    setModo(novo);
    setPassos([]);
    preview.reset();
    if (novo === "MENSAL") {
      const sugerida = estado.data?.proximaSugerida ?? competenciaAtual();
      setInicio(sugerida);
      setFim(sugerida);
    } else {
      setInicio(estado.data?.primeiraCompetencia ?? "");
      setFim(estado.data?.ultimaCompetencia ?? competenciaAtual());
    }
  }

  function fechar() {
    if (executando) return;
    setModo(null);
    preview.reset();
    setPassos([]);
  }

  /** Executa mês a mês: uma falha não invalida os meses já carregados e permite retomar. */
  async function executar(somentePendentes: boolean) {
    const meses = (preview.data?.meses ?? []).map((m) => m.competencia);
    const lista: Passo[] = somentePendentes
      ? passos.filter((p) => p.status !== "CONCLUIDA")
      : meses.map((competencia) => ({ competencia, status: "PENDENTE" as const }));

    if (!lista.length) return;
    setExecutando(true);
    if (!somentePendentes) setPassos(lista);

    let runId: string | null = null;
    try {
      const aberta = await api.abrirCarga({
        data: { inicio, fim, tipoCarga: modo === "MENSAL" ? "MENSAL" : "HISTORICA" },
      });
      runId = aberta.runId;
    } catch (e) {
      toast.error(mensagemDeErro(e));
    }

    let falhas = 0;
    for (const passo of lista) {
      setPassos((atual) =>
        atual.map((p) =>
          p.competencia === passo.competencia ? { ...p, status: "PROCESSANDO" } : p,
        ),
      );
      try {
        const resumo = await api.carregarCompetencia({
          data: { competencia: passo.competencia, runId },
        });
        setPassos((atual) =>
          atual.map((p) =>
            p.competencia === passo.competencia
              ? {
                  ...p,
                  status: "CONCLUIDA",
                  mensagem: `${resumo.novas} novas · ${resumo.existentes} atualizadas · ${resumo.semCompetencia} em revisão`,
                }
              : p,
          ),
        );
      } catch (e) {
        falhas += 1;
        setPassos((atual) =>
          atual.map((p) =>
            p.competencia === passo.competencia
              ? { ...p, status: "ERRO", mensagem: mensagemDeErro(e) }
              : p,
          ),
        );
      }
    }

    if (runId) {
      try {
        await api.encerrarCarga({
          data: {
            runId,
            status: falhas ? "FAILED" : "COMPLETED",
            mensagem: falhas ? `${falhas} competência(s) com falha.` : undefined,
          },
        });
      } catch {
        // O encerramento é apenas registro: não desfaz o que já foi carregado.
      }
    }

    setExecutando(false);
    void queryClient.invalidateQueries({ queryKey: queryKeyEstado });
    for (const key of invalidateQueryKeys) void queryClient.invalidateQueries({ queryKey: key });
    if (falhas)
      toast.warning(`${falhas} competência(s) falharam. Você pode retomar apenas as pendentes.`);
    else toast.success("Carga concluída.");
  }

  const dados = estado.data;
  const semCarga = dados ? !dados.possuiCarga : false;

  const resumoPreview = useMemo(() => {
    const p = preview.data;
    if (!p) return [];
    return [
      { rotulo: "Meses", valor: p.totalMeses },
      { rotulo: "Novas", valor: p.totalNovas },
      { rotulo: "Já existentes", valor: p.totalExistentes },
      { rotulo: "Com anexo", valor: p.totalComAnexo },
      { rotulo: "Sem anexo", valor: p.totalSemAnexo },
      { rotulo: "Sem competência", valor: p.totalSemCompetencia },
      { rotulo: "Fora do departamento", valor: p.totalIgnoradasNaoContabeis },
      { rotulo: "Erros", valor: p.totalErros },
    ];
  }, [preview.data]);

  return (
    <>
      {semCarga ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/40 bg-primary/5 p-4">
          <div>
            <p className="font-medium">Realizar carga inicial</p>
            <p className="text-sm text-muted-foreground">
              Nenhuma competência foi carregada ainda. Informe o intervalo (AAAA-MM) para
              trazer o histórico das solicitações de {assunto}.
            </p>
          </div>
          <Button onClick={() => abrirModo("HISTORICA")}>
            <History className="mr-2 h-4 w-4" />
            Carga inicial histórica
          </Button>
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Última competência carregada
              </p>
              <p className="font-semibold tabular-nums">
                {rotuloCompetencia(dados?.ultimaCompetencia ?? null)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Última sincronização
              </p>
              <p className="font-semibold">
                {dados?.ultimaSincronizacao
                  ? new Date(dados.ultimaSincronizacao).toLocaleString("pt-BR")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Revisão de competência
              </p>
              <p className="font-semibold tabular-nums">{dados?.emRevisaoCompetencia ?? 0}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => abrirModo("HISTORICA")}>
              <History className="mr-2 h-4 w-4" />
              Carga histórica
            </Button>
            <Button onClick={() => abrirModo("MENSAL")}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Carregar nova competência
            </Button>
          </div>
        </Card>
      )}

      <Dialog open={modo !== null} onOpenChange={(aberto) => (aberto ? null : fechar())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {modo === "MENSAL" ? "Carregar nova competência" : "Carga inicial histórica"}
            </DialogTitle>
            <DialogDescription>
              Somente leitura no PIER: nada é finalizado ou escrito lá. Solicitações já carregadas
              são atualizadas, nunca duplicadas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="carga-inicio">
                {modo === "MENSAL" ? "Competência" : "Competência inicial"}
              </Label>
              <Input
                id="carga-inicio"
                type="month"
                value={inicio}
                onChange={(e) => {
                  setInicio(e.target.value);
                  if (modo === "MENSAL") setFim(e.target.value);
                  preview.reset();
                  setPassos([]);
                }}
              />
            </div>
            {modo === "HISTORICA" ? (
              <div className="space-y-1.5">
                <Label htmlFor="carga-fim">Competência final</Label>
                <Input
                  id="carga-fim"
                  type="month"
                  value={fim}
                  onChange={(e) => {
                    setFim(e.target.value);
                    preview.reset();
                    setPassos([]);
                  }}
                />
              </div>
            ) : null}
          </div>

          {preview.data ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {resumoPreview.map((item) => (
                  <div key={item.rotulo} className="rounded-md border p-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {item.rotulo}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">{item.valor}</p>
                  </div>
                ))}
              </div>
              <div className="max-h-52 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <tbody>
                    {preview.data.meses.map((m) => {
                      const passo = passos.find((p) => p.competencia === m.competencia);
                      return (
                        <tr key={m.competencia} className="border-b last:border-0">
                          <td className="px-3 py-1.5 font-medium tabular-nums">
                            {rotuloCompetencia(m.competencia)}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {m.erro
                              ? m.erro
                              : `${m.encontradas} encontradas · ${m.novas} novas · ${m.existentes} existentes`}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {passo?.status === "PROCESSANDO" ? (
                              <Loader2 className="ml-auto h-4 w-4 animate-spin text-primary" />
                            ) : passo?.status === "CONCLUIDA" ? (
                              <span
                                className="flex items-center justify-end gap-1 text-success-strong"
                                title={passo.mensagem}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </span>
                            ) : passo?.status === "ERRO" ? (
                              <span
                                className="flex items-center justify-end gap-1 text-destructive"
                                title={passo.mensagem}
                              >
                                <AlertTriangle className="h-4 w-4" />
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {passos.length ? (
                <div className="space-y-1">
                  <Progress value={(concluidos / passos.length) * 100} />
                  <p className="text-xs text-muted-foreground">
                    {concluidos} de {passos.length} competências concluídas.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={fechar} disabled={executando}>
              Fechar
            </Button>
            <Button
              variant="outline"
              onClick={() => preview.mutate({ inicio, fim })}
              disabled={!inicio || !fim || preview.isPending || executando}
            >
              {preview.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Pré-visualizar
            </Button>
            {passos.some((p) => p.status === "ERRO") && !executando ? (
              <Button onClick={() => void executar(true)}>Retomar pendentes ({pendentes.length})</Button>
            ) : (
              <Button
                onClick={() => void executar(false)}
                disabled={!preview.data || executando || preview.data.totalMeses === 0}
              >
                {executando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirmar e carregar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
