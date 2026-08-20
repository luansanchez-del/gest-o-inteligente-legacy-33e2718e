import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  FileCheck2,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { CarregandoTabela, ErroConsulta, EstadoVazio } from "@/components/common/EstadoConsulta";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  executarDecisaoFiscal,
  listarEquipeFiscal,
  listarGestaoFiscal,
  sincronizarSolicitacoesFiscais,
  validarLoteFiscal,
  validarSolicitacaoFiscal,
} from "@/lib/api/fiscal.functions";
import { sincronizarRespostasPier } from "@/lib/api/gestao.functions";
import { formatarCnpj } from "@/lib/formato";
import { mensagemDeErro } from "@/lib/erros";

export const Route = createFileRoute("/_authenticated/gestao/fiscal/")({
  head: () => ({
    meta: [
      { title: "Gestão Fiscal | Gestão Inteligente" },
      {
        name: "description",
        content:
          "Gestão das solicitações do departamento fiscal no PIER com checklist documental por obrigação e regime.",
      },
    ],
  }),
  component: GestaoFiscalPage,
});

const TODOS = "__TODOS__";

function competenciaAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

function situacaoFiscal(situacao: string) {
  const mapa: Record<string, { rotulo: string; classe: string }> = {
    A_VALIDAR: { rotulo: "A validar", classe: "text-muted-foreground" },
    ANALISADA: { rotulo: "Analisada", classe: "text-success-strong" },
    REVISAO_NECESSARIA: { rotulo: "Revisão necessária", classe: "text-warning-strong" },
    ERRO: { rotulo: "Falha", classe: "text-destructive" },
    FINALIZADA: { rotulo: "Finalizada", classe: "text-muted-foreground" },
  };
  return mapa[situacao] ?? mapa.A_VALIDAR;
}

function formatarData(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type AnaliseFiscal = Awaited<ReturnType<typeof validarSolicitacaoFiscal>>;

function GestaoFiscalPage() {
  const queryClient = useQueryClient();
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [responsavel, setResponsavel] = useState(TODOS);
  const [statusPier, setStatusPier] = useState<"PENDENTES" | "FINALIZADAS" | "TODOS">("PENDENTES");
  const [statusResposta, setStatusResposta] = useState<"TODAS" | "SEM_RESPOSTA" | "RESPONDIDAS" | "NAO_VERIFICADAS">("TODAS");
  const [anexo, setAnexo] = useState<"TODOS" | "COM_ANEXO" | "SEM_ANEXO">("TODOS");
  const [busca, setBusca] = useState("");
  const [analise, setAnalise] = useState<AnaliseFiscal | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [justificativa, setJustificativa] = useState("");

  const equipe = useQuery({
    queryKey: ["equipe-fiscal"],
    queryFn: () => listarEquipeFiscal(),
  });

  const filtro = {
    competencia,
    responsavelId: responsavel === TODOS ? null : responsavel,
    busca: busca.trim() || null,
    anexo: anexo === "TODOS" ? null : anexo,
    statusPier,
    statusResposta,
  } as const;

  const gestao = useQuery({
    queryKey: [
      "gestao-fiscal",
      competencia,
      responsavel,
      statusPier,
      statusResposta,
      anexo,
      busca,
    ],
    queryFn: () => listarGestaoFiscal({ data: filtro }),
    enabled: /^\d{4}-\d{2}$/.test(competencia),
    placeholderData: (anterior) => anterior,
  });

  const carregar = useMutation({
    mutationFn: () =>
      sincronizarSolicitacoesFiscais({
        data: {
          competencia,
          incluirFinalizadas: statusPier !== "PENDENTES",
        },
      }),
    onSuccess: (r) => {
      toast.success(
        `${r.total} solicitação(ões) do departamento fiscal carregadas para ${competencia}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["gestao-fiscal"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const atualizarRespostas = useMutation({
    mutationFn: async () => {
      const ids = gestao.data?.linhas.map((l) => l.solicitacaoId) ?? [];
      const total = { total: 0, respondidas: 0, semResposta: 0, erros: 0 };
      for (let inicio = 0; inicio < ids.length; inicio += 100) {
        const r = await sincronizarRespostasPier({
          data: { solicitacoes: ids.slice(inicio, inicio + 100) },
        });
        total.total += r.resumo.total;
        total.respondidas += r.resumo.respondidas;
        total.semResposta += r.resumo.semResposta;
        total.erros += r.resumo.erros;
      }
      return total;
    },
    onSuccess: (r) => {
      toast.success(
        `${r.total} verificadas: ${r.respondidas} já respondidas e ${r.semResposta} sem resposta${r.erros ? `; ${r.erros} falharam` : ""}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["gestao-fiscal"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const validarUma = useMutation({
    mutationFn: (solicitacaoExternalId: string) =>
      validarSolicitacaoFiscal({ data: { solicitacaoExternalId } }),
    onSuccess: (r) => {
      setAnalise(r);
      setMensagem(r.respostaSugerida);
      setJustificativa("");
      setDialogAberto(true);
      void queryClient.invalidateQueries({ queryKey: ["gestao-fiscal"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const validarLote = useMutation({
    mutationFn: () => {
      const ids = (gestao.data?.linhas ?? [])
        .filter((l) => l.situacao !== "FINALIZADA")
        .map((l) => l.solicitacaoId)
        .slice(0, 100);
      if (!ids.length) throw new Error("Nenhuma solicitação aberta neste filtro.");
      return validarLoteFiscal({ data: { solicitacoes: ids } });
    },
    onSuccess: (r) => {
      toast.success(
        `${r.total} validadas: ${r.aprovadas} aprovadas, ${r.ressalvas} com ressalvas, ${r.bloqueadas} bloqueadas, ${r.naoMapeadas} não mapeadas e ${r.erros} falhas.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["gestao-fiscal"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const decidir = useMutation({
    mutationFn: (finalizar: boolean) => {
      if (!analise) throw new Error("Análise fiscal não carregada.");
      return executarDecisaoFiscal({
        data: {
          solicitacaoExternalId: analise.solicitacaoExternalId,
          mensagem,
          finalizar,
          justificativa: justificativa.trim() || null,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(r.mensagem);
      setDialogAberto(false);
      void queryClient.invalidateQueries({ queryKey: ["gestao-fiscal"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const dados = gestao.data;
  const processaveis = useMemo(
    () => (dados?.linhas ?? []).filter((l) => l.situacao !== "FINALIZADA").length,
    [dados],
  );
  const podeFinalizar =
    Boolean(analise) &&
    !["BLOQUEADA", "NAO_MAPEADA", "FINALIZADA"].includes(analise?.situacao ?? "");
  const exigeJustificativa = analise?.situacao === "COM_RESSALVAS";

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Gestão Fiscal"
        descricao="Solicitações do departamento fiscal do PIER, com checklist por obrigação e regime conforme o procedimento de fechamento fiscal."
        acoes={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => carregar.mutate()}
              disabled={carregar.isPending}
            >
              {carregar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Carregar Fiscal do PIER
            </Button>
            <Button
              variant="outline"
              onClick={() => atualizarRespostas.mutate()}
              disabled={atualizarRespostas.isPending || !dados?.linhas.length}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${atualizarRespostas.isPending ? "animate-spin" : ""}`}
              />
              Atualizar respostas PIER
            </Button>
            <Button
              onClick={() => validarLote.mutate()}
              disabled={validarLote.isPending || processaveis === 0}
            >
              {validarLote.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileCheck2 className="mr-2 h-4 w-4" />
              )}
              Validar Fiscal em lote
            </Button>
          </div>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="space-y-1.5 lg:w-[160px]">
            <Label>Competência</Label>
            <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <div className="min-w-[250px] flex-1 space-y-1.5">
            <Label>Responsável fiscal</Label>
            <Select value={responsavel} onValueChange={setResponsavel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value={TODOS}>Todos do Fiscal</SelectItem>
                {(equipe.data?.usuarios ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[170px] space-y-1.5">
            <Label>Status PIER</Label>
            <Select value={statusPier} onValueChange={(v) => setStatusPier(v as typeof statusPier)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDENTES">Em aberto</SelectItem>
                <SelectItem value="FINALIZADAS">Finalizadas</SelectItem>
                <SelectItem value="TODOS">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[190px] space-y-1.5">
            <Label>Resposta</Label>
            <Select value={statusResposta} onValueChange={(v) => setStatusResposta(v as typeof statusResposta)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas</SelectItem>
                <SelectItem value="SEM_RESPOSTA">Sem resposta</SelectItem>
                <SelectItem value="RESPONDIDAS">Já respondidas</SelectItem>
                <SelectItem value="NAO_VERIFICADAS">Não verificadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[170px] space-y-1.5">
            <Label>Anexos</Label>
            <Select value={anexo} onValueChange={(v) => setAnexo(v as typeof anexo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="COM_ANEXO">Somente com anexo</SelectItem>
                <SelectItem value="SEM_ANEXO">Somente sem anexo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[260px] flex-1 space-y-1.5">
            <Label>Cliente / CNPJ / assunto</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" />
            </div>
          </div>
        </div>
      </Card>

      {equipe.data && !equipe.data.integracao.available ? (
        <Card className="border-warning/40 bg-warning-soft p-4 text-sm text-warning-strong">
          Integração PIER indisponível: {equipe.data.integracao.reason ?? "não configurada"}.
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[
          ["No escopo", dados?.total ?? 0],
          ["Abertas", dados?.abertas ?? 0],
          ["Com anexo", dados?.comAnexo ?? 0],
          ["Sem anexo", dados?.semAnexo ?? 0],
          ["Analisadas", dados?.analisadas ?? 0],
          ["Em revisão", dados?.revisao ?? 0],
          ["Respondidas", dados?.respondidas ?? 0],
          ["Resposta não verificada", dados?.naoVerificadas ?? 0],
        ].map(([rotulo, valor]) => (
          <Card key={String(rotulo)} className="p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</p>
            <p className="text-2xl font-semibold tabular-nums">{valor}</p>
          </Card>
        ))}
      </div>

      {gestao.isError ? <ErroConsulta error={gestao.error} onRetry={() => void gestao.refetch()} /> : null}

      <Card className="overflow-hidden">
        {gestao.isLoading ? (
          <CarregandoTabela />
        ) : !dados?.linhas.length ? (
          <EstadoVazio
            titulo="Nenhuma solicitação fiscal carregada neste filtro."
            descricao="Clique em “Carregar Fiscal do PIER” para sincronizar as solicitações da competência atribuídas ao departamento fiscal."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Assunto fiscal</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status PIER</TableHead>
                <TableHead>Anexo</TableHead>
                <TableHead>Resposta</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.linhas.map((linha) => {
                const s = situacaoFiscal(linha.situacao);
                return (
                  <TableRow key={linha.solicitacaoId}>
                    <TableCell className="tabular-nums">{linha.numero ?? "—"}</TableCell>
                    <TableCell className="font-medium">
                      {linha.clienteNome}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {formatarCnpj(linha.documento)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <span className="line-clamp-2">{linha.assunto}</span>
                    </TableCell>
                    <TableCell>{linha.responsavelNome ?? "Sem responsável"}</TableCell>
                    <TableCell>{linha.statusPier ?? "—"}</TableCell>
                    <TableCell>
                      <span className={linha.temAnexo ? "text-success-strong" : "text-destructive"}>
                        {linha.temAnexo ? "Sim" : "Não"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {linha.statusResposta === "RESPONDIDA" ? (
                        <div>
                          <span className="font-medium text-success-strong">Já respondida</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {linha.respostaAutor ?? "PIER"} · {formatarData(linha.respostaEm)}
                          </span>
                        </div>
                      ) : linha.statusResposta === "NAO_RESPONDIDA" ? (
                        <span>Sem resposta</span>
                      ) : (
                        <span className="text-muted-foreground">Não verificada</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium ${s.classe}`}>
                        {s.rotulo}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={validarUma.isPending || linha.situacao === "FINALIZADA"}
                        onClick={() => validarUma.mutate(linha.solicitacaoId)}
                      >
                        {validarUma.isPending ? "Validando…" : linha.situacao === "REVISAO_NECESSARIA" ? "Revisar" : "Validar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {analise?.grupoRotulo ?? "Análise fiscal"} · {analise?.clienteNome ?? "—"}
            </DialogTitle>
            <DialogDescription>
              Checklist documental baseado no procedimento de fechamento fiscal. A decisão final permanece humana.
            </DialogDescription>
          </DialogHeader>

          {analise ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Situação</p>
                  <p className="font-semibold">{analise.situacao}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Regime</p>
                  <p className="font-semibold">{analise.regime ?? "Não identificado"}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Impedimentos</p>
                  <p className="font-semibold text-destructive">{analise.totalImpedimentos}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Alertas</p>
                  <p className="font-semibold text-warning-strong">{analise.totalAlertas}</p>
                </Card>
              </div>

              <div className="rounded-lg border p-4">
                <p className="mb-2 font-medium">Evidências localizadas no PIER</p>
                {analise.evidenciasEncontradas.length ? (
                  <div className="space-y-1 text-sm">
                    {analise.evidenciasEncontradas.map((nome) => (
                      <p key={nome}>• {nome}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma evidência localizada.</p>
                )}
              </div>

              {analise.achados.length ? (
                <div className="space-y-2">
                  <p className="font-medium">Pontos identificados</p>
                  {analise.achados.map((a) => (
                    <div
                      key={`${a.codigo}-${a.titulo}`}
                      className={`rounded-lg border p-3 text-sm ${a.severidade === "IMPEDIMENTO" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning-soft/30"}`}
                    >
                      <div className="flex items-center gap-2">
                        {a.severidade === "IMPEDIMENTO" ? (
                          <ShieldAlert className="h-4 w-4 text-destructive" />
                        ) : (
                          <ShieldAlert className="h-4 w-4 text-warning-strong" />
                        )}
                        <span className="font-medium">{a.titulo}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{a.detalhe}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-success/30 bg-success-soft p-3 text-sm text-success-strong">
                  <CheckCircle2 className="mr-2 inline h-4 w-4" />
                  Checklist documental atendido.
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Resposta técnica — editável</Label>
                <Textarea rows={7} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
              </div>

              {exigeJustificativa ? (
                <div className="space-y-1.5">
                  <Label>Justificativa para aprovação com ressalvas</Label>
                  <Textarea
                    rows={3}
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                    placeholder="Obrigatória para finalizar com ressalvas."
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="sticky bottom-0 border-t bg-background pt-4">
            <Button variant="ghost" onClick={() => setDialogAberto(false)}>Fechar</Button>
            <Button
              variant="outline"
              disabled={decidir.isPending || !analise || analise.situacao === "FINALIZADA"}
              onClick={() => decidir.mutate(false)}
            >
              Responder e manter aberta
            </Button>
            <Button
              disabled={
                decidir.isPending ||
                !podeFinalizar ||
                (exigeJustificativa && justificativa.trim().length < 10)
              }
              onClick={() => decidir.mutate(true)}
            >
              {decidir.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              {exigeJustificativa ? "Aprovar com ressalva e finalizar" : "Responder e finalizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
