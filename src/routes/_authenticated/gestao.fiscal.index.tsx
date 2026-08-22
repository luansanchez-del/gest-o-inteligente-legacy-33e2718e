import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  FilterX,
  Loader2,
  RefreshCw,
  Users,
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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
  sincronizarEquipeFiscal,
  sincronizarSolicitacoesFiscais,
  validarLoteFiscal,
  validarSolicitacaoFiscal,
} from "@/lib/api/fiscal.functions";
import { sincronizarRespostasPier } from "@/lib/api/gestao.functions";
import { mensagemDeErro } from "@/lib/erros";
import { formatarCnpj } from "@/lib/formato";

export const Route = createFileRoute("/_authenticated/gestao/fiscal/")({
  head: () => ({ meta: [{ title: "Gestão Fiscal | Gestão Inteligente" }] }),
  component: GestaoFiscalPage,
});

const TODOS = "__TODOS__";
const TODOS_REGIMES = "__TODOS_REGIMES__";
const TODAS_SITUACOES = "__TODAS_SITUACOES__";

type StatusPier = "PENDENTES" | "FINALIZADAS" | "TODOS";
type StatusResposta = "TODAS" | "SEM_RESPOSTA" | "RESPONDIDAS" | "NAO_VERIFICADAS";
type Situacao = "A_VALIDAR" | "ANALISADA" | "REVISAO_NECESSARIA" | "ERRO" | "FINALIZADA";

const SITUACOES: Record<Situacao, { rotulo: string; classe: string }> = {
  A_VALIDAR: { rotulo: "A validar", classe: "text-primary" },
  ANALISADA: { rotulo: "Aprovada", classe: "text-success-strong" },
  REVISAO_NECESSARIA: { rotulo: "Com ressalva", classe: "text-warning-strong" },
  ERRO: { rotulo: "Falha", classe: "text-destructive" },
  FINALIZADA: { rotulo: "Finalizada no PIER", classe: "text-muted-foreground" },
};

function competenciaAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

function normalizar(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function responsavelHumano(nome: string) {
  const n = normalizar(nome);
  return !n.includes("automacao") && !n.includes("fechamento contabil");
}

function formatarData(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type AnaliseFiscal = Awaited<ReturnType<typeof validarSolicitacaoFiscal>>;

function GestaoFiscalPage() {
  const queryClient = useQueryClient();
  const [competenciaInicio, setCompetenciaInicio] = useState(competenciaAtual());
  const [competenciaFim, setCompetenciaFim] = useState(competenciaAtual());
  const [departamento, setDepartamento] = useState(TODOS);
  const [responsavel, setResponsavel] = useState(TODOS);
  const [statusPier, setStatusPier] = useState<StatusPier>("PENDENTES");
  const [statusResposta, setStatusResposta] = useState<StatusResposta>("TODAS");
  const [situacao, setSituacao] = useState(TODAS_SITUACOES);
  const [anexo, setAnexo] = useState<"TODOS" | "COM_ANEXO" | "SEM_ANEXO">("TODOS");
  const [regime, setRegime] = useState(TODOS_REGIMES);
  const [busca, setBusca] = useState("");
  const [analise, setAnalise] = useState<AnaliseFiscal | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [justificativa, setJustificativa] = useState("");

  const intervaloValido =
    /^\d{4}-\d{2}$/.test(competenciaInicio) &&
    /^\d{4}-\d{2}$/.test(competenciaFim) &&
    competenciaInicio <= competenciaFim;

  const equipe = useQuery({
    queryKey: ["equipe-fiscal"],
    queryFn: () => listarEquipeFiscal(),
  });

  const departamentos = equipe.data?.departamentos ?? [];
  const usuariosHumanos = useMemo(
    () => (equipe.data?.usuarios ?? []).filter((u) => responsavelHumano(u.nome)),
    [equipe.data?.usuarios],
  );

  const usuariosPorDepartamento = useMemo(() => {
    const mapa = new Map<string, typeof usuariosHumanos>();
    for (const d of departamentos) mapa.set(d.id, []);
    for (const u of usuariosHumanos) {
      if (!u.departamentoId) continue;
      const atual = mapa.get(u.departamentoId) ?? [];
      atual.push(u);
      mapa.set(u.departamentoId, atual);
    }
    for (const [, lista] of mapa) lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return mapa;
  }, [departamentos, usuariosHumanos]);

  const usuariosDoDepartamento = useMemo(() => {
    if (departamento === TODOS) return usuariosHumanos;
    return usuariosHumanos.filter((u) => u.departamentoId === departamento);
  }, [departamento, usuariosHumanos]);

  const filtro = {
    competenciaInicio,
    competenciaFim,
    responsavelId: responsavel === TODOS ? null : responsavel,
    busca: busca.trim() || null,
    anexo: anexo === "TODOS" ? null : anexo,
    statusPier,
    statusResposta,
    regime: regime === TODOS_REGIMES ? null : regime,
  } as const;

  const gestao = useQuery({
    queryKey: [
      "gestao-fiscal",
      competenciaInicio,
      competenciaFim,
      responsavel,
      statusPier,
      statusResposta,
      anexo,
      regime,
      busca,
    ],
    queryFn: () => listarGestaoFiscal({ data: filtro }),
    enabled: intervaloValido,
    placeholderData: (anterior) => anterior,
  });

  const sincEquipe = useMutation({
    mutationFn: () => sincronizarEquipeFiscal(),
    onSuccess: (r) => {
      toast.success(`${r.processados} usuários fiscais atualizados em ${r.departamentos} departamentos.`);
      void queryClient.invalidateQueries({ queryKey: ["equipe-fiscal"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const carregar = useMutation({
    mutationFn: () => {
      if (!intervaloValido) throw new Error("A competência inicial deve ser anterior ou igual à final.");
      return sincronizarSolicitacoesFiscais({
        data: {
          competenciaInicio,
          competenciaFim,
          incluirFinalizadas: statusPier !== "PENDENTES",
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`${r.totalGravado} solicitações fiscais atualizadas do PIER.`, {
        description: `Recebidas: ${r.recebidasDaBusca} · Fiscal: ${r.doDepartamentoFiscal} · Competência identificada: ${r.competenciaInterpretada} · Assumida: ${r.competenciaAssumida}`,
      });
      void queryClient.invalidateQueries({ queryKey: ["gestao-fiscal"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const linhasBase = gestao.data?.linhas ?? [];

  const linhasFiltradas = useMemo(() => {
    let linhas = linhasBase;
    if (departamento !== TODOS) {
      const ids = new Set((usuariosPorDepartamento.get(departamento) ?? []).map((u) => u.id));
      linhas = linhas.filter((l) => Boolean(l.responsavelId && ids.has(l.responsavelId)));
    }
    if (situacao !== TODAS_SITUACOES) linhas = linhas.filter((l) => l.situacao === situacao);
    return linhas;
  }, [departamento, linhasBase, situacao, usuariosPorDepartamento]);

  const atualizarRespostas = useMutation({
    mutationFn: async () => {
      const ids = linhasFiltradas.map((l) => l.solicitacaoId);
      const total = { total: 0, respondidas: 0, semResposta: 0, erros: 0 };
      for (let inicio = 0; inicio < ids.length; inicio += 100) {
        const r = await sincronizarRespostasPier({ data: { solicitacoes: ids.slice(inicio, inicio + 100) } });
        total.total += r.resumo.total;
        total.respondidas += r.resumo.respondidas;
        total.semResposta += r.resumo.semResposta;
        total.erros += r.resumo.erros;
      }
      return total;
    },
    onSuccess: (r) => {
      toast.success(`${r.total} verificadas no PIER: ${r.respondidas} respondidas e ${r.semResposta} sem resposta${r.erros ? `; ${r.erros} falharam` : ""}.`);
      void queryClient.invalidateQueries({ queryKey: ["gestao-fiscal"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const validarUma = useMutation({
    mutationFn: (solicitacaoExternalId: string) => validarSolicitacaoFiscal({ data: { solicitacaoExternalId } }),
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
      const ids = linhasFiltradas
        .filter((l) => l.situacao !== "FINALIZADA")
        .map((l) => l.solicitacaoId)
        .slice(0, 100);
      if (!ids.length) throw new Error("Nenhuma solicitação aberta neste filtro.");
      return validarLoteFiscal({ data: { solicitacoes: ids } });
    },
    onSuccess: (r) => {
      toast.success(`${r.total} validadas: ${r.aprovadas} aprovadas, ${r.ressalvas} com ressalvas, ${r.bloqueadas} bloqueadas, ${r.naoMapeadas} não mapeadas e ${r.erros} falhas.`);
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

  const totais = useMemo(() => {
    const total = linhasFiltradas.length;
    const aguardando = linhasFiltradas.filter((l) => l.situacao === "A_VALIDAR" && !l.temAnexo).length;
    const prontas = linhasFiltradas.filter((l) => l.situacao === "A_VALIDAR" && l.temAnexo).length;
    const aprovadas = linhasFiltradas.filter((l) => l.situacao === "ANALISADA").length;
    const ressalvas = linhasFiltradas.filter((l) => l.situacao === "REVISAO_NECESSARIA").length;
    const falhas = linhasFiltradas.filter((l) => l.situacao === "ERRO").length;
    const finalizadas = linhasFiltradas.filter((l) => l.situacao === "FINALIZADA").length;
    const analisadas = aprovadas + ressalvas + falhas + finalizadas;
    return {
      total,
      aguardando,
      prontas,
      aprovadas,
      ressalvas,
      falhas,
      finalizadas,
      percentual: total ? Math.round((analisadas / total) * 100) : 0,
    };
  }, [linhasFiltradas]);

  const responsaveisResumo = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const l of linhasFiltradas) {
      const nome = l.responsavelNome ?? "Sem responsável";
      mapa.set(nome, (mapa.get(nome) ?? 0) + 1);
    }
    return [...mapa.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [linhasFiltradas]);

  const departamentoNome =
    departamento === TODOS
      ? "Todos os departamentos"
      : departamentos.find((d) => d.id === departamento)?.nome ?? "Departamento fiscal";
  const responsavelNome =
    responsavel === TODOS
      ? departamento === TODOS ? "Todos os responsáveis" : "Todos do departamento"
      : usuariosHumanos.find((u) => u.id === responsavel)?.nome ?? "Responsável fiscal";

  const filtrosAtivos =
    competenciaInicio !== competenciaAtual() ||
    competenciaFim !== competenciaAtual() ||
    departamento !== TODOS ||
    responsavel !== TODOS ||
    statusPier !== "PENDENTES" ||
    statusResposta !== "TODAS" ||
    situacao !== TODAS_SITUACOES ||
    anexo !== "TODOS" ||
    regime !== TODOS_REGIMES ||
    busca !== "";

  function limparFiltros() {
    setCompetenciaInicio(competenciaAtual());
    setCompetenciaFim(competenciaAtual());
    setDepartamento(TODOS);
    setResponsavel(TODOS);
    setStatusPier("PENDENTES");
    setStatusResposta("TODAS");
    setSituacao(TODAS_SITUACOES);
    setAnexo("TODOS");
    setRegime(TODOS_REGIMES);
    setBusca("");
  }

  const processaveis = linhasFiltradas.filter((l) => l.situacao !== "FINALIZADA").length;
  const podeFinalizar = Boolean(analise) && !["BLOQUEADA", "NAO_MAPEADA", "FINALIZADA"].includes(analise?.situacao ?? "");
  const exigeJustificativa = analise?.situacao === "COM_RESSALVAS";

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Gestão de solicitações fiscais"
        descricao="Escolha a competência, o departamento e o responsável do PIER antes de iniciar a validação fiscal."
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => sincEquipe.mutate()} disabled={sincEquipe.isPending}>
              <Users className="mr-2 h-4 w-4" />
              Sincronizar equipe
            </Button>
            <Button variant="outline" onClick={() => carregar.mutate()} disabled={carregar.isPending || !intervaloValido}>
              <Download className="mr-2 h-4 w-4" />
              Carregar solicitações da competência
            </Button>
            <Button variant="outline" onClick={() => atualizarRespostas.mutate()} disabled={atualizarRespostas.isPending || !linhasFiltradas.length}>
              <RefreshCw className={`mr-2 h-4 w-4 ${atualizarRespostas.isPending ? "animate-spin" : ""}`} />
              {atualizarRespostas.isPending ? "Verificando respostas…" : "Atualizar respostas PIER"}
            </Button>
          </div>
        }
      />

      {equipe.data && !equipe.data.integracao.available ? (
        <Card className="border-warning/40 bg-warning-soft p-4 text-sm text-warning-strong">
          Integração com o PIER indisponível: {equipe.data.integracao.reason ?? "não configurada"}.
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="space-y-1.5 lg:w-[150px]">
            <Label>Competência inicial</Label>
            <Input type="month" value={competenciaInicio} onChange={(e) => setCompetenciaInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5 lg:w-[150px]">
            <Label>Competência final</Label>
            <Input type="month" value={competenciaFim} onChange={(e) => setCompetenciaFim(e.target.value)} />
          </div>

          <div className="space-y-1.5 lg:w-[238px]">
            <Label>Tipo de solicitação</Label>
            <Select value="FISCAL" disabled>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FISCAL">Fechamento Fiscal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="hidden basis-full lg:block" aria-hidden="true" />

          <div className="space-y-1.5 lg:min-w-[280px] lg:flex-1">
            <Label>Departamento responsável</Label>
            <Select
              value={departamento}
              onValueChange={(v) => {
                setDepartamento(v);
                setResponsavel(TODOS);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value={TODOS}>Todos os departamentos</SelectItem>
                {departamentos.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.nome} · {d.totalUsuarios}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 lg:min-w-[280px] lg:flex-1">
            <Label>Responsável</Label>
            <Select value={responsavel} onValueChange={setResponsavel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value={TODOS}>
                  {departamento === TODOS ? "Todos os responsáveis" : "Todos do departamento"}
                </SelectItem>
                <SelectSeparator />
                {departamento === TODOS ? (
                  departamentos.map((d) => {
                    const lista = usuariosPorDepartamento.get(d.id) ?? [];
                    if (!lista.length) return null;
                    return (
                      <SelectGroup key={d.id}>
                        <SelectLabel>{d.nome}</SelectLabel>
                        {lista.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                      </SelectGroup>
                    );
                  })
                ) : (
                  usuariosDoDepartamento.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="hidden basis-full lg:block" aria-hidden="true" />

          <div className="min-w-[170px] space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Status PIER</Label>
            <Select value={statusPier} onValueChange={(v) => setStatusPier(v as StatusPier)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDENTES">Em aberto</SelectItem>
                <SelectItem value="FINALIZADAS">Finalizadas</SelectItem>
                <SelectItem value="TODOS">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[190px] space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Resposta</Label>
            <Select value={statusResposta} onValueChange={(v) => setStatusResposta(v as StatusResposta)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas</SelectItem>
                <SelectItem value="SEM_RESPOSTA">Sem resposta</SelectItem>
                <SelectItem value="RESPONDIDAS">Já respondidas</SelectItem>
                <SelectItem value="NAO_VERIFICADAS">Não verificadas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[190px] space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Situação</Label>
            <Select value={situacao} onValueChange={setSituacao}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS_SITUACOES}>Todas as situações</SelectItem>
                {Object.entries(SITUACOES).map(([valor, info]) => (
                  <SelectItem key={valor} value={valor}>{info.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[190px] space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Regime tributário</Label>
            <Select value={regime} onValueChange={setRegime}>
              <SelectTrigger aria-label="Filtrar por regime tributário"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS_REGIMES}>Todos os regimes</SelectItem>
                {(gestao.data?.regimesDisponiveis ?? []).map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[190px] space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Anexos</Label>
            <Select value={anexo} onValueChange={(v) => setAnexo(v as typeof anexo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="COM_ANEXO">Somente com anexo</SelectItem>
                <SelectItem value="SEM_ANEXO">Somente sem anexo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="hidden basis-full lg:block" aria-hidden="true" />

          <div className="space-y-1.5 lg:w-[240px]">
            <Label>Cliente / CNPJ / assunto</Label>
            <Input value={busca} placeholder="Buscar" onChange={(e) => setBusca(e.target.value)} />
          </div>

          <Button variant="outline" onClick={limparFiltros} disabled={!filtrosAtivos} className="lg:self-end">
            <FilterX className="mr-2 h-4 w-4" />
            Limpar filtros
          </Button>
        </div>
      </Card>

      {gestao.isError ? <ErroConsulta error={gestao.error} onRetry={() => void gestao.refetch()} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[
          { rotulo: "No escopo", valor: totais.total, detalhe: `${totais.percentual}% analisadas` },
          { rotulo: "Aguardando documento", valor: totais.aguardando },
          { rotulo: "Prontas para validar", valor: totais.prontas },
          { rotulo: "Em processamento", valor: 0 },
          { rotulo: "Aprovadas", valor: totais.aprovadas },
          { rotulo: "Com ressalvas", valor: totais.ressalvas },
          { rotulo: "Bloqueadas / falhas", valor: totais.falhas, detalhe: `${totais.falhas} fiscais/técnicas` },
          { rotulo: "Finalizadas", valor: totais.finalizadas },
        ].map((item) => (
          <Card key={item.rotulo} className="p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.rotulo}</p>
            <p className="text-2xl font-semibold tabular-nums">{item.valor}</p>
            {item.detalhe ? <p className="text-xs text-muted-foreground">{item.detalhe}</p> : null}
          </Card>
        ))}
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium">{departamentoNome} · {responsavelNome}</p>
            <p className="text-muted-foreground">
              Exibindo {linhasFiltradas.length} solicitações fiscais de {competenciaInicio} a {competenciaFim}. Sem responsável: {linhasFiltradas.filter((l) => !l.responsavelId).length}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Já respondidas: {linhasFiltradas.filter((l) => l.statusResposta === "RESPONDIDA").length} · Sem resposta verificada: {linhasFiltradas.filter((l) => l.statusResposta === "NAO_RESPONDIDA").length} · Não verificadas: {linhasFiltradas.filter((l) => l.statusResposta === "NAO_VERIFICADA").length}.
            </p>
          </div>
          <Button onClick={() => validarLote.mutate()} disabled={validarLote.isPending || processaveis === 0 || statusPier === "FINALIZADAS"}>
            <FileCheck2 className="mr-2 h-4 w-4" />
            {validarLote.isPending ? "Validando lote…" : "Validar em lote"}
          </Button>
        </div>

        {responsaveisResumo.length ? (
          <div className="flex flex-wrap gap-2">
            {responsaveisResumo.map((r) => (
              <span key={r.nome} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                {r.nome}: <span className="tabular-nums font-medium">{r.total}</span>
              </span>
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        {gestao.isLoading ? (
          <CarregandoTabela />
        ) : !linhasFiltradas.length ? (
          <EstadoVazio
            titulo="Nenhuma solicitação fiscal neste escopo."
            descricao="Carregue as solicitações da competência e ajuste os filtros. Para preencher o status de resposta, use “Atualizar respostas PIER”."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Regime</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead>Assunto fiscal</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status PIER</TableHead>
                <TableHead>Resposta</TableHead>
                <TableHead>Anexo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhasFiltradas.map((linha) => {
                const info = SITUACOES[linha.situacao as Situacao] ?? SITUACOES.A_VALIDAR;
                const respostaEm = formatarData(linha.respostaEm);
                return (
                  <TableRow key={linha.solicitacaoId}>
                    <TableCell className="tabular-nums">{linha.numero ?? "—"}</TableCell>
                    <TableCell className="font-medium">{linha.clienteNome}</TableCell>
                    <TableCell className="tabular-nums">{formatarCnpj(linha.documento)}</TableCell>
                    <TableCell>{linha.regime ?? "Não informado"}</TableCell>
                    <TableCell className="tabular-nums">{linha.competencia ?? "—"}</TableCell>
                    <TableCell className="max-w-[260px]"><span className="line-clamp-2">{linha.assunto}</span></TableCell>
                    <TableCell>{linha.responsavelNome ?? "Sem responsável"}</TableCell>
                    <TableCell>{linha.statusPier ?? "—"}</TableCell>
                    <TableCell>
                      {linha.statusResposta === "RESPONDIDA" ? (
                        <div>
                          <span className="inline-flex rounded-full bg-success-soft px-2 py-1 text-xs font-medium text-success-strong">Já respondida</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">{linha.respostaAutor ?? "PIER"}{respostaEm ? ` · ${respostaEm}` : ""}</span>
                        </div>
                      ) : linha.statusResposta === "NAO_RESPONDIDA" ? (
                        <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium">Sem resposta</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-warning-soft px-2 py-1 text-xs font-medium text-warning-strong">Não verificada</span>
                      )}
                    </TableCell>
                    <TableCell>{linha.temAnexo ? "Sim" : "Não"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium ${info.classe}`}>{info.rotulo}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" disabled={validarUma.isPending || linha.situacao === "FINALIZADA"} onClick={() => validarUma.mutate(linha.solicitacaoId)}>
                        {linha.situacao === "REVISAO_NECESSARIA" ? "Revisar" : "Validar"}
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
            <DialogTitle>{analise?.grupoRotulo ?? "Análise fiscal"} · {analise?.clienteNome ?? "—"}</DialogTitle>
            <DialogDescription>Checklist fiscal com evidências do PIER. A decisão final permanece humana.</DialogDescription>
          </DialogHeader>

          {analise ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <Card className="p-3"><p className="text-xs text-muted-foreground">Situação</p><p className="font-semibold">{analise.situacao}</p></Card>
                <Card className="p-3"><p className="text-xs text-muted-foreground">Regime</p><p className="font-semibold">{analise.regime ?? "Não identificado"}</p></Card>
                <Card className="p-3"><p className="text-xs text-muted-foreground">Impedimentos</p><p className="font-semibold text-destructive">{analise.totalImpedimentos}</p></Card>
                <Card className="p-3"><p className="text-xs text-muted-foreground">Alertas</p><p className="font-semibold text-warning-strong">{analise.totalAlertas}</p></Card>
              </div>

              <div className="rounded-lg border p-4">
                <p className="mb-2 font-medium">Evidências localizadas no PIER</p>
                {analise.evidenciasEncontradas.length ? (
                  <div className="space-y-1 text-sm">{analise.evidenciasEncontradas.map((nome) => <p key={nome}>• {nome}</p>)}</div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma evidência localizada.</p>
                )}
              </div>

              {analise.achados.length ? (
                <div className="space-y-2">
                  <p className="font-medium">Pontos identificados</p>
                  {analise.achados.map((a) => (
                    <div key={`${a.codigo}-${a.titulo}`} className={`rounded-lg border p-3 text-sm ${a.severidade === "IMPEDIMENTO" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning-soft/30"}`}>
                      <p className="font-medium">{a.titulo}</p>
                      <p className="mt-1 text-muted-foreground">{a.detalhe}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-success/30 bg-success-soft p-3 text-sm text-success-strong">
                  <CheckCircle2 className="mr-2 inline h-4 w-4" /> Checklist documental atendido.
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Resposta técnica — editável</Label>
                <Textarea rows={7} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
              </div>

              {exigeJustificativa ? (
                <div className="space-y-1.5">
                  <Label>Justificativa para aprovação com ressalvas</Label>
                  <Textarea rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Obrigatória para finalizar com ressalvas." />
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="sticky bottom-0 border-t bg-background pt-4">
            <Button variant="ghost" onClick={() => setDialogAberto(false)}>Fechar</Button>
            <Button variant="outline" disabled={decidir.isPending || !analise || analise.situacao === "FINALIZADA"} onClick={() => decidir.mutate(false)}>Responder e manter aberta</Button>
            <Button disabled={decidir.isPending || !podeFinalizar || (exigeJustificativa && justificativa.trim().length < 10)} onClick={() => decidir.mutate(true)}>
              {decidir.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              {exigeJustificativa ? "Aprovar com ressalva e finalizar" : "Responder e finalizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
