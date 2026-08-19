import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Download,
  FilterX,
  Pencil,
  PlayCircle,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { CargaCompetencias } from "@/components/gestao/CargaCompetencias";
import {
  CarregandoTabela,
  ErroConsulta,
  EstadoVazio,
} from "@/components/common/EstadoConsulta";
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
import {
  iniciarGestao,
  listarEquipe,
  montarPreview,
  renomearDepartamento,
  sincronizarEquipe,
  sincronizarRespostasPier,
  sincronizarSolicitacoes,
} from "@/lib/api/gestao.functions";
import { processarEscopo } from "@/lib/api/processamento.functions";
import { formatarCnpj } from "@/lib/formato";
import { mensagemDeErro } from "@/lib/erros";

export const Route = createFileRoute("/_authenticated/gestao/")({
  head: () => ({
    meta: [
      { title: "Gestão de fechamentos | Gestão Inteligente" },
      {
        name: "description",
        content:
          "Defina o escopo do fechamento contábil por competência, departamento e responsável do PIER antes de iniciar a gestão.",
      },
    ],
  }),
  component: GestaoPage,
});

const TODOS_DEPARTAMENTOS = "__TODOS__";
const TODOS_USUARIOS = "__TODOS_USUARIOS__";
const TODAS_FILAS = "__TODAS_FILAS__";
const TODOS_ANEXOS = "__TODOS_ANEXOS__";
const CHAVE_FILTROS_GESTAO = "gestao-inteligente:filtros-gestao";

type StatusPierFiltro = "PENDENTES" | "FINALIZADAS" | "TODOS";
type StatusRespostaFiltro =
  | "TODAS"
  | "SEM_RESPOSTA"
  | "RESPONDIDAS"
  | "NAO_VERIFICADAS";

interface FiltrosGestaoSalvos {
  competencia: string;
  tipo: "CONTABIL" | "MOVIMENTO_FINANCEIRO";
  competenciaFim: string;
  busca: string;
  revisaoCompetencia: boolean;
  departamento: string;
  responsavel: string;
  fila: string;
  statusPier: StatusPierFiltro;
  statusResposta: StatusRespostaFiltro;
  anexo: string;
  incluirInativos: boolean;
}

const FILA: Record<string, { rotulo: string; classe: string }> = {
  AGUARDANDO_DOCUMENTO: {
    rotulo: "Aguardando documento",
    classe: "text-muted-foreground",
  },
  PRONTO_PARA_ANALISE: {
    rotulo: "Pronto para análise",
    classe: "text-primary",
  },
  ANALISANDO: { rotulo: "Analisando", classe: "text-warning-strong" },
  ANALISE_CONCLUIDA: {
    rotulo: "Aprovada — pendente no PIER",
    classe: "text-success-strong",
  },
  REVISAO_NECESSARIA: {
    rotulo: "Aprovar com ressalva",
    classe: "text-warning-strong",
  },
  BLOQUEADA: {
    rotulo: "Bloqueada por erro contábil",
    classe: "text-destructive",
  },
  ERRO: { rotulo: "Falha no processamento", classe: "text-destructive" },
  HISTORICO: {
    rotulo: "Finalizada no PIER",
    classe: "text-muted-foreground",
  },
};

function competenciaAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

function formatarDataHora(value: string | null | undefined) {
  if (!value) return null;
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function filtrosPadrao(): FiltrosGestaoSalvos {
  return {
    competencia: competenciaAtual(),
    tipo: "CONTABIL",
    competenciaFim: "",
    busca: "",
    revisaoCompetencia: false,
    departamento: TODOS_DEPARTAMENTOS,
    responsavel: TODOS_USUARIOS,
    fila: TODAS_FILAS,
    statusPier: "PENDENTES",
    statusResposta: "TODAS",
    anexo: TODOS_ANEXOS,
    incluirInativos: false,
  };
}

function carregarFiltrosGestao(): FiltrosGestaoSalvos {
  const padrao = filtrosPadrao();
  if (typeof window === "undefined") return padrao;
  try {
    const salvo = JSON.parse(
      window.sessionStorage.getItem(CHAVE_FILTROS_GESTAO) ?? "null",
    ) as Partial<FiltrosGestaoSalvos> | null;
    if (!salvo) return padrao;
    return {
      ...padrao,
      ...salvo,
      competencia: /^\d{4}-\d{2}$/.test(salvo.competencia ?? "")
        ? salvo.competencia!
        : padrao.competencia,
      tipo:
        salvo.tipo === "MOVIMENTO_FINANCEIRO"
          ? "MOVIMENTO_FINANCEIRO"
          : "CONTABIL",
      statusPier: ["PENDENTES", "FINALIZADAS", "TODOS"].includes(
        salvo.statusPier ?? "",
      )
        ? (salvo.statusPier as StatusPierFiltro)
        : "PENDENTES",
      statusResposta: [
        "TODAS",
        "SEM_RESPOSTA",
        "RESPONDIDAS",
        "NAO_VERIFICADAS",
      ].includes(salvo.statusResposta ?? "")
        ? (salvo.statusResposta as StatusRespostaFiltro)
        : "TODAS",
    };
  } catch {
    return padrao;
  }
}

function GestaoPage() {
  const queryClient = useQueryClient();
  const [filtrosIniciais] = useState(carregarFiltrosGestao);
  const [competencia, setCompetencia] = useState(filtrosIniciais.competencia);
  const [tipo, setTipo] = useState<"CONTABIL" | "MOVIMENTO_FINANCEIRO">(
    filtrosIniciais.tipo,
  );
  const [competenciaFim, setCompetenciaFim] = useState(
    filtrosIniciais.competenciaFim,
  );
  const [busca, setBusca] = useState(filtrosIniciais.busca);
  const [revisaoCompetencia, setRevisaoCompetencia] = useState(
    filtrosIniciais.revisaoCompetencia,
  );
  const [departamento, setDepartamento] = useState(
    filtrosIniciais.departamento,
  );
  const [responsavel, setResponsavel] = useState(filtrosIniciais.responsavel);
  const [fila, setFila] = useState(filtrosIniciais.fila);
  const [statusPier, setStatusPier] = useState<StatusPierFiltro>(
    filtrosIniciais.statusPier,
  );
  const [statusResposta, setStatusResposta] = useState<StatusRespostaFiltro>(
    filtrosIniciais.statusResposta,
  );
  const [anexo, setAnexo] = useState(filtrosIniciais.anexo);
  const [incluirInativos, setIncluirInativos] = useState(
    filtrosIniciais.incluirInativos,
  );
  const [renomeando, setRenomeando] = useState(false);
  const [confirmarProcessamento, setConfirmarProcessamento] = useState(false);
  const [novoNomeDepartamento, setNovoNomeDepartamento] = useState("");

  useEffect(() => {
    window.sessionStorage.setItem(
      CHAVE_FILTROS_GESTAO,
      JSON.stringify({
        competencia,
        tipo,
        competenciaFim,
        busca,
        revisaoCompetencia,
        departamento,
        responsavel,
        fila,
        statusPier,
        statusResposta,
        anexo,
        incluirInativos,
      } satisfies FiltrosGestaoSalvos),
    );
  }, [
    anexo,
    busca,
    competencia,
    competenciaFim,
    departamento,
    fila,
    incluirInativos,
    responsavel,
    revisaoCompetencia,
    statusPier,
    statusResposta,
    tipo,
  ]);

  const equipe = useQuery({
    queryKey: ["equipe-pier", incluirInativos, "contabeis"],
    queryFn: () =>
      listarEquipe({ data: { incluirInativos, somenteContabeis: true } }),
  });

  const filtro = {
    competencia,
    competenciaFim: competenciaFim || null,
    revisaoCompetencia,
    busca: busca.trim() || null,
    tipo,
    departamentoId: departamento === TODOS_DEPARTAMENTOS ? null : departamento,
    responsavelId: responsavel === TODOS_USUARIOS ? null : responsavel,
    statusFila: fila === TODAS_FILAS ? null : (fila as never),
    statusPier,
    statusResposta,
    anexo:
      anexo === TODOS_ANEXOS
        ? null
        : (anexo as "COM_ANEXO" | "SEM_ANEXO"),
  };

  const preview = useQuery({
    queryKey: [
      "preview-gestao",
      filtro.competencia,
      filtro.tipo,
      filtro.competenciaFim,
      filtro.revisaoCompetencia,
      filtro.busca,
      filtro.departamentoId,
      filtro.responsavelId,
      fila,
      statusPier,
      statusResposta,
      anexo,
    ],
    queryFn: () => montarPreview({ data: filtro }),
    enabled: /^\d{4}-\d{2}$/.test(competencia),
    placeholderData: (anterior) => anterior,
  });

  const sincEquipe = useMutation({
    mutationFn: () => sincronizarEquipe(),
    onSuccess: (r) => {
      toast.success(
        `${r.processados} usuários e ${r.departamentos} departamentos atualizados.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["equipe-pier"] });
      void queryClient.invalidateQueries({ queryKey: ["equipe-completa"] });
      void queryClient.invalidateQueries({ queryKey: ["preview-gestao"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const prepararSolicitacoes = useMutation({
    mutationFn: () =>
      sincronizarSolicitacoes({ data: { competencia, tipo, statusPier } }),
    onSuccess: (r) => {
      const ignoradas =
        "finalizadasIgnoradas" in r && typeof r.finalizadasIgnoradas === "number"
          ? r.finalizadasIgnoradas
          : 0;
      toast.success(
        `${r.processados} solicitações atualizadas da competência.${ignoradas ? ` ${ignoradas} finalizada(s) nova(s) ignorada(s).` : ""}`,
      );
      void queryClient.invalidateQueries({ queryKey: ["preview-gestao"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const atualizarRespostas = useMutation({
    mutationFn: async () => {
      const escopoCompleto = await montarPreview({
        data: { ...filtro, statusResposta: "TODAS" },
      });
      const ids = escopoCompleto.empresas.map((e) => e.solicitacaoId);
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
        `${r.total} verificadas no PIER: ${r.respondidas} já respondidas, ${r.semResposta} sem resposta${r.erros ? `, ${r.erros} não verificadas por falha` : ""}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["preview-gestao"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const iniciar = useMutation({
    mutationFn: () =>
      iniciarGestao({
        data: {
          ...filtro,
          idempotencyKey: `${competencia}|${tipo}|${filtro.departamentoId ?? "todos"}|${filtro.responsavelId ?? "todos"}|${statusPier}|${anexo}`,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        r.reaproveitada
          ? "Este escopo já havia sido iniciado — execução reaproveitada."
          : "Gestão iniciada para o escopo selecionado.",
      );
      void queryClient.invalidateQueries({ queryKey: ["preview-gestao"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const processarLote = useMutation({
    mutationFn: async () => {
      await iniciar.mutateAsync();
      const solicitacoes = (preview.data?.empresas ?? [])
        .filter((e) => e.statusFila !== "HISTORICO")
        .map((e) => e.solicitacaoId);
      const total = {
        total: 0,
        finalizadas: 0,
        emRevisao: 0,
        pendentes: 0,
        jaFinalizadas: 0,
        erros: 0,
      };
      for (let inicio = 0; inicio < solicitacoes.length; inicio += 100) {
        const resultado = await processarEscopo({
          data: { solicitacoes: solicitacoes.slice(inicio, inicio + 100) },
        });
        total.total += resultado.total;
        total.finalizadas += resultado.finalizadas;
        total.emRevisao += resultado.emRevisao;
        total.pendentes += resultado.pendentes;
        total.jaFinalizadas += resultado.jaFinalizadas;
        total.erros += resultado.erros;
      }
      return total;
    },
    onSuccess: (r) => {
      setConfirmarProcessamento(false);
      toast.success(
        `${r.total} processadas: ${r.finalizadas} finalizadas, ${r.emRevisao} em revisão, ${r.pendentes} pendentes, ${r.jaFinalizadas} já finalizadas, ${r.erros} com erro.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["preview-gestao"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const renomear = useMutation({
    mutationFn: () =>
      renomearDepartamento({
        data: {
          departamentoId: departamento,
          nome: novoNomeDepartamento.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Nome do departamento atualizado.");
      setRenomeando(false);
      void queryClient.invalidateQueries({ queryKey: ["equipe-pier"] });
      void queryClient.invalidateQueries({ queryKey: ["equipe-completa"] });
      void queryClient.invalidateQueries({ queryKey: ["preview-gestao"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const departamentos = equipe.data?.departamentos ?? [];
  const usuarios = equipe.data?.usuarios ?? [];
  const departamentoSelecionado = departamentos.find(
    (d) => d.id === departamento,
  );
  const usuariosDoDepartamento = useMemo(() => {
    if (departamento === TODOS_DEPARTAMENTOS) return usuarios;
    return usuarios.filter((u) => u.departamentoId === departamento);
  }, [usuarios, departamento]);

  const filtrosAtivos =
    tipo !== "CONTABIL" ||
    departamento !== TODOS_DEPARTAMENTOS ||
    responsavel !== TODOS_USUARIOS ||
    fila !== TODAS_FILAS ||
    statusPier !== "PENDENTES" ||
    statusResposta !== "TODAS" ||
    anexo !== TODOS_ANEXOS ||
    competenciaFim !== "" ||
    busca !== "" ||
    revisaoCompetencia ||
    incluirInativos ||
    competencia !== competenciaAtual();

  function limparFiltros() {
    setCompetencia(competenciaAtual());
    setTipo("CONTABIL");
    setDepartamento(TODOS_DEPARTAMENTOS);
    setResponsavel(TODOS_USUARIOS);
    setFila(TODAS_FILAS);
    setStatusPier("PENDENTES");
    setStatusResposta("TODAS");
    setAnexo(TODOS_ANEXOS);
    setCompetenciaFim("");
    setBusca("");
    setRevisaoCompetencia(false);
    setIncluirInativos(false);
  }

  const dados = preview.data;
  const totaisFila = useMemo<
    Record<string, number> & { analisadas: number; percentual: number }
  >(() => {
    const totais: Record<string, number> = {};
    for (const empresa of dados?.empresas ?? []) {
      totais[empresa.statusFila] = (totais[empresa.statusFila] ?? 0) + 1;
    }
    const analisadas =
      (totais.ANALISE_CONCLUIDA ?? 0) +
      (totais.REVISAO_NECESSARIA ?? 0) +
      (totais.BLOQUEADA ?? 0) +
      (totais.HISTORICO ?? 0);
    const total = dados?.totalEmpresas ?? 0;
    return {
      ...totais,
      analisadas,
      percentual: total ? Math.round((analisadas / total) * 100) : 0,
    };
  }, [dados]);

  const totalProcessaveis = (dados?.empresas ?? []).filter(
    (empresa) => empresa.statusFila !== "HISTORICO",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Gestão de solicitações contábeis"
        descricao="Escolha o tipo, a competência e o responsável do PIER antes de iniciar a gestão."
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => sincEquipe.mutate()}
              disabled={sincEquipe.isPending}
            >
              <Users className="mr-2 h-4 w-4" />
              Sincronizar equipe
            </Button>
            <Button
              variant="outline"
              onClick={() => prepararSolicitacoes.mutate()}
              disabled={prepararSolicitacoes.isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              Carregar solicitações da competência
            </Button>
            <Button
              variant="outline"
              onClick={() => atualizarRespostas.mutate()}
              disabled={atualizarRespostas.isPending || !preview.data?.empresas.length}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${atualizarRespostas.isPending ? "animate-spin" : ""}`}
              />
              {atualizarRespostas.isPending
                ? "Verificando respostas…"
                : "Atualizar respostas PIER"}
            </Button>
          </div>
        }
      />

      {equipe.data && !equipe.data.integracao.available ? (
        <Card className="border-warning/40 bg-warning-soft p-4 text-sm text-warning-strong">
          Integração com o PIER indisponível:{" "}
          {equipe.data.integracao.reason ?? "não configurada"}.
        </Card>
      ) : null}

      {tipo === "CONTABIL" ? <CargaCompetencias /> : null}

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="space-y-1.5 lg:w-[150px]">
            <Label htmlFor="competencia">Competência inicial</Label>
            <Input
              id="competencia"
              type="month"
              value={competencia}
              disabled={revisaoCompetencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 lg:w-[150px]">
            <Label htmlFor="competencia-fim">Competência final</Label>
            <Input
              id="competencia-fim"
              type="month"
              value={competenciaFim}
              disabled={revisaoCompetencia}
              placeholder="opcional"
              onChange={(e) => setCompetenciaFim(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 lg:w-[190px]">
            <Label>Tipo de solicitação</Label>
            <Select
              value={tipo}
              onValueChange={(value) =>
                setTipo(value as "CONTABIL" | "MOVIMENTO_FINANCEIRO")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CONTABIL">Fechamento Contábil</SelectItem>
                <SelectItem value="MOVIMENTO_FINANCEIRO">
                  Movimento Financeiro Mensal
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 lg:min-w-[280px] lg:flex-1">
            <Label>Departamento responsável</Label>
            <div className="flex items-center gap-1.5">
              <Select
                value={departamento}
                onValueChange={(v) => {
                  setDepartamento(v);
                  setResponsavel(TODOS_USUARIOS);
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Todos os departamentos" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value={TODOS_DEPARTAMENTOS}>
                    Todos os departamentos
                  </SelectItem>
                  {departamentos.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome} · {d.totalUsuarios}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {departamento !== TODOS_DEPARTAMENTOS ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setNovoNomeDepartamento(
                      departamentoSelecionado?.nome ?? "",
                    );
                    setRenomeando(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
          <div className="space-y-1.5 lg:min-w-[280px] lg:flex-1">
            <div className="flex items-center justify-between gap-2">
              <Label>Responsável</Label>
              <button
                type="button"
                onClick={() => setIncluirInativos((v) => !v)}
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              >
                {incluirInativos ? "ativos + inativos" : "somente ativos"}
              </button>
            </div>
            <Select value={responsavel} onValueChange={setResponsavel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value={TODOS_USUARIOS}>
                  {departamento === TODOS_DEPARTAMENTOS
                    ? "Todos os responsáveis"
                    : "Todos do departamento"}
                </SelectItem>
                {usuariosDoDepartamento.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[170px] space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Status PIER
            </Label>
            <Select
              value={statusPier}
              onValueChange={(value) => {
                const proximo = value as StatusPierFiltro;
                setStatusPier(proximo);
                if (proximo === "FINALIZADAS") setFila(TODAS_FILAS);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDENTES">Em aberto</SelectItem>
                <SelectItem value="FINALIZADAS">Finalizadas</SelectItem>
                <SelectItem value="TODOS">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[190px] space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Resposta
            </Label>
            <Select
              value={statusResposta}
              onValueChange={(value) =>
                setStatusResposta(value as StatusRespostaFiltro)
              }
            >
              <SelectTrigger aria-label="Filtrar por resposta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas</SelectItem>
                <SelectItem value="SEM_RESPOSTA">Sem resposta</SelectItem>
                <SelectItem value="RESPONDIDAS">Já respondidas</SelectItem>
                <SelectItem value="NAO_VERIFICADAS">Não verificadas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[190px] space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Situação
            </Label>
            <Select value={fila} onValueChange={setFila}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value={TODAS_FILAS}>Todas as situações</SelectItem>
                {Object.entries(FILA).map(([valor, info]) => (
                  <SelectItem key={valor} value={valor}>
                    {info.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[190px] space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Anexos
            </Label>
            <Select value={anexo} onValueChange={setAnexo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS_ANEXOS}>Todos</SelectItem>
                <SelectItem value="COM_ANEXO">Somente com anexo</SelectItem>
                <SelectItem value="SEM_ANEXO">Somente sem anexo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 lg:w-[220px]">
            <Label htmlFor="busca-cliente">Cliente (nome ou CNPJ)</Label>
            <Input
              id="busca-cliente"
              value={busca}
              placeholder="Buscar cliente"
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <Button
            type="button"
            variant={revisaoCompetencia ? "default" : "outline"}
            aria-pressed={revisaoCompetencia}
            onClick={() => setRevisaoCompetencia((v) => !v)}
            className="lg:self-end"
          >
            Revisão de competência
          </Button>

          <Button
            variant="outline"
            onClick={limparFiltros}
            disabled={!filtrosAtivos}
            className="lg:self-end"
          >
            <FilterX className="mr-2 h-4 w-4" />
            Limpar filtros
          </Button>
        </div>
      </Card>

      <Dialog open={renomeando} onOpenChange={setRenomeando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nome do departamento</DialogTitle>
            <DialogDescription>
              Defina o nome legível exibido nos filtros.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={novoNomeDepartamento}
            onChange={(e) => setNovoNomeDepartamento(e.target.value)}
            placeholder="Ex.: Contábil - Equipe 1"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenomeando(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => renomear.mutate()}
              disabled={renomear.isPending || !novoNomeDepartamento.trim()}
            >
              Salvar nome
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {preview.isError ? (
        <ErroConsulta
          error={preview.error}
          onRetry={() => void preview.refetch()}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[
          {
            rotulo: "No escopo",
            valor: dados?.totalEmpresas,
            detalhe: `${totaisFila.percentual}% analisadas`,
          },
          {
            rotulo: "Aguardando documento",
            valor: totaisFila.AGUARDANDO_DOCUMENTO,
          },
          {
            rotulo: "Prontas para validar",
            valor: totaisFila.PRONTO_PARA_ANALISE,
          },
          { rotulo: "Em processamento", valor: totaisFila.ANALISANDO },
          { rotulo: "Aprovadas", valor: totaisFila.ANALISE_CONCLUIDA },
          { rotulo: "Com ressalvas", valor: totaisFila.REVISAO_NECESSARIA },
          {
            rotulo: "Bloqueadas / falhas",
            valor: (totaisFila.BLOQUEADA ?? 0) + (totaisFila.ERRO ?? 0),
            detalhe: `${totaisFila.BLOQUEADA ?? 0} contábeis · ${totaisFila.ERRO ?? 0} técnicas`,
          },
          { rotulo: "Finalizadas", valor: totaisFila.HISTORICO },
        ].map((item) => (
          <Card key={item.rotulo} className="p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {item.rotulo}
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {item.valor ?? 0}
            </p>
            {"detalhe" in item && item.detalhe ? (
              <p className="text-xs text-muted-foreground">{item.detalhe}</p>
            ) : null}
          </Card>
        ))}
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium">
              {dados?.departamento.nome ?? "—"} · {dados?.responsavel.nome ?? "—"}
            </p>
            <p className="text-muted-foreground">
              Exibindo {dados?.totalEmpresas ?? 0} de {dados?.solicitacoesEmCache ?? 0} solicitações carregadas para {competencia}. Sem responsável: {dados?.totalSemResponsavel ?? 0}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Já respondidas: {dados?.totalJaRespondidas ?? 0} · Sem resposta verificada: {dados?.totalSemRespostaVerificada ?? 0} · Não verificadas: {dados?.totalRespostaNaoVerificada ?? 0}.
            </p>
          </div>
          <Button
            onClick={() => setConfirmarProcessamento(true)}
            disabled={
              statusPier === "FINALIZADAS" ||
              iniciar.isPending ||
              processarLote.isPending ||
              !dados ||
              totalProcessaveis === 0
            }
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            {processarLote.isPending ? "Processando lote…" : "Validar em lote"}
          </Button>
        </div>

        <Dialog
          open={confirmarProcessamento}
          onOpenChange={setConfirmarProcessamento}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Processar o escopo filtrado?</DialogTitle>
              <DialogDescription>
                {totalProcessaveis} solicitação(ões) abertas do escopo atual serão processadas em lote. Esta etapa valida documentos; o controle de resposta evita nova postagem no PIER quando já existe resposta interna.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setConfirmarProcessamento(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => processarLote.mutate()}
                disabled={processarLote.isPending || !totalProcessaveis}
              >
                Processar {totalProcessaveis} solicitação(ões)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {dados?.responsaveis.length ? (
          <div className="flex flex-wrap gap-2">
            {dados.responsaveis.map((r) => (
              <span
                key={r.id ?? r.nome}
                className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
              >
                {r.nome}: <span className="tabular-nums font-medium">{r.total}</span>
              </span>
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        {preview.isLoading ? (
          <CarregandoTabela />
        ) : !dados || dados.empresas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma empresa neste escopo."
            descricao="Carregue as solicitações e ajuste os filtros. Para preencher o status de resposta, use “Atualizar respostas PIER”."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status PIER</TableHead>
                <TableHead>Resposta</TableHead>
                <TableHead>Anexo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.empresas.map((linha) => {
                const analise =
                  FILA[linha.statusFila] ?? FILA.AGUARDANDO_DOCUMENTO;
                const respostaEm = formatarDataHora(linha.respostaEm);
                return (
                  <TableRow key={linha.solicitacaoId}>
                    <TableCell className="tabular-nums">
                      {linha.numero ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {linha.clienteNome}
                      {linha.avisoCadastral ? (
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {linha.avisoCadastral}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatarCnpj(linha.documento)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {linha.competencia ?? "—"}
                    </TableCell>
                    <TableCell>
                      {linha.responsavelNome ?? "Sem responsável"}
                    </TableCell>
                    <TableCell>{linha.statusSolicitacao ?? "—"}</TableCell>
                    <TableCell>
                      {linha.statusResposta === "RESPONDIDA" ? (
                        <div>
                          <span className="inline-flex rounded-full bg-success-soft px-2 py-1 text-xs font-medium text-success-strong">
                            Já respondida
                          </span>
                          <span className="mt-1 block max-w-[190px] text-[11px] text-muted-foreground">
                            {linha.respostaAutor ?? "Usuário interno"}
                            {respostaEm ? ` · ${respostaEm}` : ""}
                          </span>
                        </div>
                      ) : linha.statusResposta === "NAO_RESPONDIDA" ? (
                        <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                          Sem resposta
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-warning-soft px-2 py-1 text-xs font-medium text-warning-strong">
                          Não verificada
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {linha.temAnexo ? (
                        <span className="text-success-strong">Sim</span>
                      ) : (
                        <span className="text-muted-foreground">Não</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium ${analise.classe}`}
                      >
                        {analise.rotulo}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          to="/gestao/solicitacoes/$externalId"
                          params={{ externalId: linha.solicitacaoId }}
                        >
                          {linha.statusFila === "AGUARDANDO_DOCUMENTO"
                            ? "Ver pendência"
                            : linha.statusFila === "PRONTO_PARA_ANALISE"
                              ? "Analisar"
                              : linha.statusFila === "REVISAO_NECESSARIA"
                                ? "Decidir"
                                : linha.statusFila === "BLOQUEADA"
                                  ? "Ver impedimento"
                                  : "Ver resultado"}
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
