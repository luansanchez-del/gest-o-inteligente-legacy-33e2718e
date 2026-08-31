import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  History,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { CarregandoTabela, ErroConsulta } from "@/components/common/EstadoConsulta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  apurarIndiceEntrega,
  listarEquipe,
  montarPreview,
  sincronizarEquipe,
} from "@/lib/api/gestao.functions";
import { competenciaAtual, formatarCompetencia, formatarData } from "@/lib/formato";
import { mensagemDeErro } from "@/lib/erros";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Visão Geral | Gestão Inteligente" },
      {
        name: "description",
        content:
          "Indicadores, riscos, atrasos e ações prioritárias da operação de fechamentos contábeis.",
      },
    ],
  }),
  component: VisaoGeral,
});

const TODOS_DEPARTAMENTOS = "__TODOS__";
const TODOS_RESPONSAVEIS = "__TODOS__";

type Risco = "ALTO" | "MEDIO" | "BAIXO";

const RISCO_ROTULO: Record<Risco, string> = { ALTO: "Alto", MEDIO: "Médio", BAIXO: "Baixo" };
const RISCO_CLASSE: Record<Risco, string> = {
  ALTO: "text-red-600",
  MEDIO: "text-amber-600",
  BAIXO: "text-emerald-600",
};
const RISCO_PONTO: Record<Risco, string> = {
  ALTO: "bg-red-500",
  MEDIO: "bg-amber-500",
  BAIXO: "bg-emerald-500",
};

const SITUACAO_ROTULO: Record<string, string> = {
  AGUARDANDO_DOCUMENTO: "Aguardando documento",
  PRONTO_PARA_ANALISE: "Pronto para análise",
  ANALISANDO: "Em processamento",
  ANALISE_CONCLUIDA: "Aprovada",
  REVISAO_NECESSARIA: "Com ressalva",
  BLOQUEADA: "Bloqueada",
  ERRO: "Falha técnica",
  HISTORICO: "Finalizada",
};

const SITUACAO_CLASSE: Record<string, string> = {
  AGUARDANDO_DOCUMENTO: "border-amber-200 bg-amber-50 text-amber-700",
  PRONTO_PARA_ANALISE: "border-blue-200 bg-blue-50 text-blue-700",
  ANALISANDO: "border-violet-200 bg-violet-50 text-violet-700",
  ANALISE_CONCLUIDA: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REVISAO_NECESSARIA: "border-orange-200 bg-orange-50 text-orange-700",
  BLOQUEADA: "border-red-200 bg-red-50 text-red-700",
  ERRO: "border-red-200 bg-red-50 text-red-700",
  HISTORICO: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function diasAtePrazo(prazo: string | null): number | null {
  if (!prazo) return null;
  const alvo = new Date(prazo);
  if (Number.isNaN(alvo.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

function classificarRisco(statusFila: string, prazo: string | null): Risco {
  if (statusFila === "HISTORICO") return "BAIXO";
  if (statusFila === "BLOQUEADA" || statusFila === "ERRO") return "ALTO";
  const dias = diasAtePrazo(prazo);
  if (dias !== null && dias < 0) return "ALTO";
  if (dias !== null && dias <= 3) return "MEDIO";
  return "BAIXO";
}

function VisaoGeral() {
  const queryClient = useQueryClient();
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [departamento, setDepartamento] = useState(TODOS_DEPARTAMENTOS);
  const [responsavel, setResponsavel] = useState(TODOS_RESPONSAVEIS);

  const equipe = useQuery({
    queryKey: ["equipe-pier", "visao-geral"],
    queryFn: () => listarEquipe({ data: { somenteContabeis: true } }),
  });

  const filtro = {
    competencia,
    departamentoId: departamento === TODOS_DEPARTAMENTOS ? null : departamento,
    responsavelId: responsavel === TODOS_RESPONSAVEIS ? null : responsavel,
  };

  const preview = useQuery({
    queryKey: [
      "preview-gestao",
      "visao-geral",
      filtro.competencia,
      filtro.departamentoId,
      filtro.responsavelId,
    ],
    queryFn: () => montarPreview({ data: filtro }),
    enabled: /^\d{4}-\d{2}$/.test(competencia),
  });

  const indice = useQuery({
    queryKey: [
      "indice-entrega",
      "visao-geral",
      filtro.competencia,
      filtro.departamentoId,
      filtro.responsavelId,
    ],
    queryFn: () => apurarIndiceEntrega({ data: filtro }),
    enabled: /^\d{4}-\d{2}$/.test(competencia),
  });

  const sincEquipe = useMutation({
    mutationFn: () => sincronizarEquipe(),
    onSuccess: (r) => {
      toast.success(`${r.processados} usuários e ${r.departamentos} departamentos atualizados.`);
      void queryClient.invalidateQueries({ queryKey: ["equipe-pier"] });
      void queryClient.invalidateQueries({ queryKey: ["preview-gestao"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const empresas = useMemo(() => preview.data?.empresas ?? [], [preview.data]);

  const totais = useMemo(() => {
    const contagem: Record<string, number> = {};
    let emRisco = 0;
    for (const linha of empresas) {
      contagem[linha.statusFila] = (contagem[linha.statusFila] ?? 0) + 1;
      if (classificarRisco(linha.statusFila, linha.prazo) === "ALTO") emRisco += 1;
    }
    return {
      abertas: empresas.length,
      aguardandoDocumento: contagem.AGUARDANDO_DOCUMENTO ?? 0,
      emRisco,
      emProcessamento: contagem.ANALISANDO ?? 0,
      finalizadas: contagem.HISTORICO ?? 0,
    };
  }, [empresas]);

  const atencaoNecessaria = useMemo(() => {
    return empresas
      .map((linha) => ({ linha, risco: classificarRisco(linha.statusFila, linha.prazo) }))
      .filter(({ risco, linha }) => risco === "ALTO" && linha.statusFila !== "HISTORICO")
      .sort((a, b) => (diasAtePrazo(a.linha.prazo) ?? 999) - (diasAtePrazo(b.linha.prazo) ?? 999))
      .slice(0, 6);
  }, [empresas]);

  const carteiraPorResponsavel = useMemo(() => {
    const mapa = new Map<
      string,
      { nome: string; departamento: string | null; pendencias: number; total: number }
    >();
    for (const linha of empresas) {
      const chave = linha.responsavelId ?? "sem-responsavel";
      const atual = mapa.get(chave) ?? {
        nome: linha.responsavelNome ?? "Sem responsável",
        departamento: linha.departamentoNome,
        pendencias: 0,
        total: 0,
      };
      atual.total += 1;
      if (linha.statusFila !== "HISTORICO") atual.pendencias += 1;
      mapa.set(chave, atual);
    }
    return [...mapa.values()].sort((a, b) => b.pendencias - a.pendencias).slice(0, 5);
  }, [empresas]);

  const maiorCarteira = carteiraPorResponsavel[0]?.pendencias || 1;

  const recentes = useMemo(() => {
    return [...empresas]
      .sort((a, b) => {
        const diasA = diasAtePrazo(a.prazo) ?? 999;
        const diasB = diasAtePrazo(b.prazo) ?? 999;
        return diasA - diasB;
      })
      .slice(0, 8);
  }, [empresas]);

  function limparFiltros() {
    setCompetencia(competenciaAtual());
    setDepartamento(TODOS_DEPARTAMENTOS);
    setResponsavel(TODOS_RESPONSAVEIS);
  }

  const departamentos = equipe.data?.departamentos ?? [];
  const usuarios = equipe.data?.usuarios ?? [];

  return (
    <div className="space-y-5">
      <div>
        <PageHeader
          titulo="Visão Geral"
          descricao="Acompanhe os principais indicadores e as ações prioritárias do escritório."
        />
        <div className="mt-2 h-1 w-24 rounded-full bg-gradient-to-r from-[#d4bc6a] to-[#bfa04e]" />
      </div>

      <Card className="border-indigo-100 bg-gradient-to-r from-white via-indigo-50/55 to-violet-50/60 p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="visao-competencia" className="text-xs font-semibold text-slate-600">
                Competência
              </Label>
              <Input
                id="visao-competencia"
                type="month"
                className="w-full border-slate-200 bg-white sm:w-[165px]"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Departamento</Label>
              <Select value={departamento} onValueChange={setDepartamento}>
                <SelectTrigger className="w-full border-slate-200 bg-white sm:w-[230px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS_DEPARTAMENTOS}>Todos os departamentos</SelectItem>
                  {departamentos.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Responsável</Label>
              <Select value={responsavel} onValueChange={setResponsavel}>
                <SelectTrigger className="w-full border-slate-200 bg-white sm:w-[230px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS_RESPONSAVEIS}>Todos os responsáveis</SelectItem>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={limparFiltros}
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Limpar filtros
            </Button>
            <Button
              onClick={() => void preview.refetch()}
              disabled={preview.isFetching}
              className="border-0 bg-gradient-to-r from-[#d4bc6a] to-[#bfa04e] text-[#171512] shadow-md shadow-black/10 hover:from-[#cbb15a] hover:to-[#b3953f]"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${preview.isFetching ? "animate-spin" : ""}`} />
              Atualizar dados
            </Button>
          </div>
        </div>
      </Card>

      {preview.isError ? (
        <ErroConsulta error={preview.error} onRetry={() => void preview.refetch()} />
      ) : preview.isLoading ? (
        <CarregandoTabela linhas={4} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              {
                rotulo: "Abertas",
                valor: totais.abertas,
                detalhe: "Solicitações no escopo",
                icone: FileText,
                card: "border-blue-100 bg-gradient-to-br from-blue-50 to-white",
                bolha: "bg-blue-600 text-white shadow-blue-500/20",
                valorClasse: "text-blue-950",
                detalheClasse: "text-blue-700/65",
              },
              {
                rotulo: "Aguardando documento",
                valor: totais.aguardandoDocumento,
                detalhe: "Atenção da carteira",
                icone: Clock,
                card: "border-amber-100 bg-gradient-to-br from-amber-50 to-white",
                bolha: "bg-amber-500 text-white shadow-amber-500/20",
                valorClasse: "text-amber-950",
                detalheClasse: "text-amber-700/70",
              },
              {
                rotulo: "Em risco",
                valor: totais.emRisco,
                detalhe: "Prazo vencido ou bloqueio",
                icone: AlertTriangle,
                card: "border-red-100 bg-gradient-to-br from-red-50 to-white",
                bolha: "bg-red-500 text-white shadow-red-500/20",
                valorClasse: "text-red-950",
                detalheClasse: "text-red-700/70",
              },
              {
                rotulo: "Em processamento",
                valor: totais.emProcessamento,
                detalhe: "Aguardando análise",
                icone: Eye,
                card: "border-violet-100 bg-gradient-to-br from-violet-50 to-white",
                bolha: "bg-violet-600 text-white shadow-violet-500/20",
                valorClasse: "text-violet-950",
                detalheClasse: "text-violet-700/70",
              },
              {
                rotulo: "Finalizadas",
                valor: totais.finalizadas,
                detalhe: "Competência atual",
                icone: CheckCircle2,
                card: "border-emerald-100 bg-gradient-to-br from-emerald-50 to-white",
                bolha: "bg-emerald-500 text-white shadow-emerald-500/20",
                valorClasse: "text-emerald-950",
                detalheClasse: "text-emerald-700/70",
              },
            ].map((item) => (
              <Card
                key={item.rotulo}
                className={`group relative overflow-hidden p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${item.card}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-lg ${item.bolha}`}
                  >
                    <item.icone className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-600">{item.rotulo}</p>
                    <p className={`mt-0.5 text-2xl font-bold tabular-nums ${item.valorClasse}`}>
                      {item.valor}
                    </p>
                    <p className={`mt-1 text-[11px] ${item.detalheClasse}`}>{item.detalhe}</p>
                  </div>
                </div>
                <div className="pointer-events-none absolute -bottom-7 -right-6 h-20 w-20 rounded-full bg-white/55 blur-xl" />
              </Card>
            ))}
          </div>

          {indice.data ? (
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-[#1c1f24] via-[#171a1e] to-[#0e1013] p-0 text-white shadow-lg shadow-black/20">
              <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[#cbb15a]/15 blur-2xl" />
              <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
              <div className="relative grid gap-3 p-5 md:grid-cols-3">
                <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-2 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Cobertura e entrega</p>
                      <p className="text-xs text-white/65">Leitura da competência com base nos dados reais do PIER.</p>
                    </div>
                  </div>
                  <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/15">
                    {formatarCompetencia(competencia)}
                  </Badge>
                </div>

                {[
                  indice.data.indicadores.find((i) => i.codigo === "INDICE"),
                  indice.data.indicadores.find((i) => i.codigo === "INDICE_PRAZO"),
                  indice.data.indicadores.find((i) => i.codigo === "ATRASO_MEDIO"),
                ]
                  .filter((i): i is NonNullable<typeof i> => Boolean(i))
                  .map((i) => (
                    <div
                      key={i.codigo}
                      className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm"
                    >
                      <p className="text-xs font-medium text-white/70">{i.titulo}</p>
                      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                        {i.formato === "PERCENTUAL"
                          ? `${i.valor.toFixed(1).replace(".", ",")}%`
                          : i.formato === "DIAS"
                            ? `${i.valor.toFixed(1).replace(".", ",")} d`
                            : i.valor}
                      </p>
                      <p className="mt-2 text-[11px] leading-relaxed text-white/60">
                        {i.formato === "PERCENTUAL"
                          ? `${i.numerador} de ${i.denominador} · `
                          : ""}
                        {i.regra}
                      </p>
                    </div>
                  ))}
              </div>
            </Card>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="overflow-hidden border-red-100 shadow-sm">
              <div className="flex items-center justify-between border-b border-red-100 bg-gradient-to-r from-red-50 via-orange-50/60 to-white px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Atenção necessária</p>
                  <p className="text-xs text-slate-500">Prioridades que exigem ação do gestor.</p>
                </div>
                <Badge className="bg-red-500 text-white hover:bg-red-500">{atencaoNecessaria.length}</Badge>
              </div>

              <div className="space-y-2 p-3">
                {atencaoNecessaria.length ? (
                  atencaoNecessaria.map(({ linha, risco }) => {
                    const dias = diasAtePrazo(linha.prazo);
                    const atrasoCritico = dias !== null && dias < -30;
                    return (
                      <Link
                        key={linha.solicitacaoId}
                        to="/gestao/solicitacoes/$externalId"
                        params={{ externalId: linha.solicitacaoId }}
                        className={`group flex items-center gap-3 rounded-xl border border-l-4 p-3 text-sm transition-all hover:translate-x-0.5 hover:shadow-sm ${
                          atrasoCritico
                            ? "border-red-100 border-l-red-500 bg-red-50/75"
                            : "border-orange-100 border-l-orange-400 bg-orange-50/65"
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            atrasoCritico ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"
                          }`}
                        >
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-900">{linha.clienteNome}</p>
                          <p className="truncate text-xs text-slate-500">
                            {linha.departamentoNome ?? "—"} · {SITUACAO_ROTULO[linha.statusFila] ?? linha.statusFila}
                          </p>
                        </div>
                        <span className={`shrink-0 text-xs font-semibold ${RISCO_CLASSE[risco]}`}>
                          {dias === null
                            ? "sem prazo"
                            : dias < 0
                              ? `${Math.abs(dias)}d atrasado`
                              : "bloqueio"}
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                    <p className="text-sm font-medium text-slate-700">Nenhum item crítico agora.</p>
                    <p className="text-xs text-slate-500">O escopo selecionado está sem riscos altos.</p>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 px-4 py-2.5">
                <Button asChild variant="link" size="sm" className="px-0 text-indigo-600">
                  <Link to="/gestao">Ver todas as pendências →</Link>
                </Button>
              </div>
            </Card>

            <Card className="overflow-hidden border-indigo-100 shadow-sm">
              <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-violet-50/50 to-white px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">Carteira por responsável</p>
                <p className="text-xs text-slate-500">Onde está concentrada a carga da equipe.</p>
              </div>
              <div className="space-y-4 p-4">
                {carteiraPorResponsavel.length ? (
                  carteiraPorResponsavel.map((item, index) => (
                    <div key={item.nome} className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            index % 3 === 0
                              ? "bg-blue-100 text-blue-700"
                              : index % 3 === 1
                                ? "bg-violet-100 text-violet-700"
                                : "bg-cyan-100 text-cyan-700"
                          }`}
                        >
                          {item.nome.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{item.nome}</p>
                              <p className="truncate text-[11px] uppercase tracking-wide text-slate-400">
                                {item.departamento ?? "Sem departamento"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold tabular-nums text-slate-900">{item.pendencias}</p>
                              <p className="text-[10px] text-slate-400">pendências</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500"
                          style={{ width: `${Math.round((item.pendencias / maiorCarteira) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-slate-500">
                    Sem responsáveis com solicitações neste escopo.
                  </p>
                )}
              </div>
              <div className="border-t border-slate-100 px-4 py-2.5">
                <Button asChild variant="link" size="sm" className="px-0 text-indigo-600">
                  <Link to="/equipe">Ver toda a equipe →</Link>
                </Button>
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden border-blue-100 bg-gradient-to-r from-blue-50/80 via-indigo-50/70 to-violet-50/80 shadow-sm">
            <div className="flex flex-col gap-4 p-4 xl:flex-row xl:items-center">
              <div className="min-w-[190px]">
                <p className="text-sm font-semibold text-slate-900">Ações rápidas</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Atalhos para as principais ações do dia a dia.
                </p>
              </div>
              <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Button
                  asChild
                  variant="ghost"
                  className="h-auto justify-start rounded-xl border border-blue-100 bg-white/85 p-3 text-left shadow-sm hover:bg-blue-50"
                >
                  <Link to="/gestao">
                    <span className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                      <MessageSquare className="h-4 w-4" />
                    </span>
                    <span className="whitespace-normal text-xs font-semibold text-slate-800">Responder solicitações</span>
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="h-auto justify-start rounded-xl border border-violet-100 bg-white/85 p-3 text-left shadow-sm hover:bg-violet-50"
                  onClick={() => sincEquipe.mutate()}
                  disabled={sincEquipe.isPending}
                >
                  <span className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                    <RefreshCw className={`h-4 w-4 ${sincEquipe.isPending ? "animate-spin" : ""}`} />
                  </span>
                  <span className="whitespace-normal text-xs font-semibold text-slate-800">Sincronizar equipe</span>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  className="h-auto justify-start rounded-xl border border-amber-100 bg-white/85 p-3 text-left shadow-sm hover:bg-amber-50"
                >
                  <Link to="/gestao">
                    <span className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                      <History className="h-4 w-4" />
                    </span>
                    <span className="whitespace-normal text-xs font-semibold text-slate-800">Ir para Solicitações</span>
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  className="h-auto justify-start rounded-xl border border-emerald-100 bg-white/85 p-3 text-left shadow-sm hover:bg-emerald-50"
                >
                  <Link to="/equipe">
                    <span className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                      <Users className="h-4 w-4" />
                    </span>
                    <span className="whitespace-normal text-xs font-semibold text-slate-800">Equipe e departamentos</span>
                  </Link>
                </Button>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/50 px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">Solicitações recentes</p>
                  <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">{empresas.length}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">Prazos, situação e risco no mesmo lugar.</p>
              </div>
              <Button asChild variant="link" size="sm" className="px-0 text-indigo-600">
                <Link to="/gestao">Ver todas →</Link>
              </Button>
            </div>

            {recentes.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Assunto</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Competência</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Risco</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentes.map((linha) => {
                      const risco = classificarRisco(linha.statusFila, linha.prazo);
                      return (
                        <TableRow key={linha.solicitacaoId} className="hover:bg-indigo-50/30">
                          <TableCell className="font-semibold text-slate-900">{linha.clienteNome}</TableCell>
                          <TableCell className="max-w-[220px] truncate text-slate-500">
                            {linha.assunto ?? "—"}
                          </TableCell>
                          <TableCell className="text-slate-700">{linha.responsavelNome ?? "Sem responsável"}</TableCell>
                          <TableCell className="text-slate-600">{formatarCompetencia(linha.competencia)}</TableCell>
                          <TableCell className={risco === "ALTO" ? "font-semibold text-red-600" : "text-slate-600"}>
                            {formatarData(linha.prazo)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={SITUACAO_CLASSE[linha.statusFila] ?? "border-slate-200 bg-slate-50 text-slate-600"}
                            >
                              {SITUACAO_ROTULO[linha.statusFila] ?? linha.statusFila}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${RISCO_CLASSE[risco]}`}>
                              <span className={`h-2 w-2 rounded-full ${RISCO_PONTO[risco]}`} />
                              {RISCO_ROTULO[risco]}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm" className="text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700">
                              <Link
                                to="/gestao/solicitacoes/$externalId"
                                params={{ externalId: linha.solicitacaoId }}
                              >
                                Ver
                                <ArrowRight className="ml-1 h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">
                Nenhuma solicitação carregada para este escopo ainda.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
