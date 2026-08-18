import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Filter,
  Gauge,
  RotateCcw,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import { CarregandoTabela, ErroConsulta, EstadoVazio } from "@/components/common/EstadoConsulta";
import { StatCard } from "@/components/common/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { listarEquipeCompleta } from "@/lib/api/equipe.functions";
import { apurarIndice, detalharIndicador } from "@/lib/api/indice.functions";
import { competenciaAtual, competenciaDeslocada, formatarCompetencia } from "@/lib/formato";

const TODOS_DEPARTAMENTOS = "__TODOS__";
const TODOS_RESPONSAVEIS = "__TODOS_RESPONSAVEIS__";
const CHAVE_FILTROS_GESTAO = "gestao-inteligente:filtros-gestao";

const SITUACOES: Record<string, string> = {
  CONCLUIDA_NO_PRAZO: "Concluída no prazo",
  CONCLUIDA_FORA_PRAZO: "Concluída fora do prazo",
  EM_ANDAMENTO_NO_PRAZO: "Em andamento",
  ATRASADA: "Vencida",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  SEM_EVIDENCIA: "Sem evidência",
  PRECISA_REVISAO: "Revisão humana",
};

function percentual(valor: number) {
  return `${Math.round(valor * 10) / 10}%`.replace(".", ",");
}

function dataCurta(valor: string | null) {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString("pt-BR");
}

export function EvolucaoEquipeContabil() {
  const [competenciaInicio, setCompetenciaInicio] = useState(competenciaDeslocada(-5));
  const [competenciaFim, setCompetenciaFim] = useState(competenciaAtual());
  const [departamentoId, setDepartamentoId] = useState(TODOS_DEPARTAMENTOS);
  const [responsavelId, setResponsavelId] = useState(TODOS_RESPONSAVEIS);
  const [drillCodigo, setDrillCodigo] = useState<string | null>(null);

  const equipe = useQuery({
    queryKey: ["equipe-completa", "dashboard"],
    queryFn: () => listarEquipeCompleta(),
  });

  const usuarios = equipe.data?.usuarios ?? [];
  const departamentos = equipe.data?.departamentos ?? [];
  const usuariosDoDepartamento = useMemo(() => {
    if (departamentoId === TODOS_DEPARTAMENTOS) return usuarios;
    return usuarios.filter((u) => u.departamentoId === departamentoId);
  }, [departamentoId, usuarios]);

  const responsavelSelecionado = usuarios.find((u) => u.id === responsavelId) ?? null;
  const departamentoFiltro =
    departamentoId === TODOS_DEPARTAMENTOS ? undefined : departamentoId;
  const responsavelFiltro = responsavelSelecionado?.nome || undefined;

  const filtroBase = {
    competenciaInicio,
    competenciaFim,
    departamentoId: departamentoFiltro,
    responsavel: responsavelFiltro,
  };

  const painel = useQuery({
    queryKey: [
      "indice",
      "evolucao-equipe",
      competenciaInicio,
      competenciaFim,
      departamentoFiltro,
      responsavelFiltro,
    ],
    queryFn: () =>
      apurarIndice({
        data: {
          ...filtroBase,
          recorte: "GERAL",
        },
      }),
    enabled:
      /^\d{4}-\d{2}$/.test(competenciaInicio) &&
      /^\d{4}-\d{2}$/.test(competenciaFim) &&
      competenciaInicio <= competenciaFim,
  });

  const ranking = useQuery({
    queryKey: [
      "indice",
      "ranking-equipe",
      competenciaInicio,
      competenciaFim,
      departamentoFiltro,
    ],
    queryFn: () =>
      apurarIndice({
        data: {
          competenciaInicio,
          competenciaFim,
          departamentoId: departamentoFiltro,
          recorte: "RESPONSAVEL",
        },
      }),
    enabled:
      /^\d{4}-\d{2}$/.test(competenciaInicio) &&
      /^\d{4}-\d{2}$/.test(competenciaFim) &&
      competenciaInicio <= competenciaFim,
  });

  const drill = useQuery({
    queryKey: [
      "indice",
      "drill",
      drillCodigo,
      competenciaInicio,
      competenciaFim,
      departamentoFiltro,
      responsavelFiltro,
    ],
    queryFn: () =>
      detalharIndicador({
        data: {
          ...filtroBase,
          recorte: "GERAL",
          codigo: drillCodigo!,
        },
      }),
    enabled: Boolean(drillCodigo) && painel.isSuccess,
  });

  const indicadores = new Map(
    (painel.data?.indicadores ?? []).map((indicador) => [indicador.codigo, indicador]),
  );
  const destaques = [
    "INDICE_PRAZO",
    "ENTREGUE",
    "ATRASADA",
    "VENCE_HOJE",
    "PROXIMOS_3_DIAS",
    "BACKLOG",
  ]
    .map((codigo) => indicadores.get(codigo))
    .filter(Boolean);

  const cobertura = indicadores.get("INDICE")?.valor ?? 0;
  const noPrazo = indicadores.get("INDICE_PRAZO")?.valor ?? 0;
  const atrasoMedio = indicadores.get("ATRASO_MEDIO")?.valor ?? 0;

  function selecionarDepartamento(valor: string) {
    setDepartamentoId(valor);
    setResponsavelId(TODOS_RESPONSAVEIS);
    setDrillCodigo(null);
  }

  function selecionarResponsavelPorNome(nome: string) {
    const usuario = usuarios.find((u) => u.nome === nome);
    if (!usuario) return;
    setDepartamentoId(usuario.departamentoId ?? TODOS_DEPARTAMENTOS);
    setResponsavelId(usuario.id);
    setDrillCodigo(null);
  }

  function abrirGestao() {
    if (typeof window === "undefined") return;
    const atual = (() => {
      try {
        return JSON.parse(window.sessionStorage.getItem(CHAVE_FILTROS_GESTAO) ?? "{}") as Record<
          string,
          unknown
        >;
      } catch {
        return {};
      }
    })();
    window.sessionStorage.setItem(
      CHAVE_FILTROS_GESTAO,
      JSON.stringify({
        ...atual,
        competencia: competenciaInicio,
        competenciaFim: competenciaInicio === competenciaFim ? "" : competenciaFim,
        tipo: "CONTABIL",
        departamento: departamentoId,
        responsavel: responsavelId,
        revisaoCompetencia: false,
      }),
    );
    window.location.assign("/gestao");
  }

  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Evolução da Equipe Contábil</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Entregas, vencimentos e backlog por período, departamento e responsável.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="evolucao-inicio" className="text-xs">
              De
            </Label>
            <Input
              id="evolucao-inicio"
              type="month"
              value={competenciaInicio}
              max={competenciaFim}
              onChange={(e) => {
                setCompetenciaInicio(e.target.value);
                setDrillCodigo(null);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="evolucao-fim" className="text-xs">
              Até
            </Label>
            <Input
              id="evolucao-fim"
              type="month"
              value={competenciaFim}
              min={competenciaInicio}
              onChange={(e) => {
                setCompetenciaFim(e.target.value);
                setDrillCodigo(null);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Departamento</Label>
            <Select value={departamentoId} onValueChange={selecionarDepartamento}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS_DEPARTAMENTOS}>Todos</SelectItem>
                {departamentos.map((departamento) => (
                  <SelectItem key={departamento.id} value={departamento.id}>
                    {departamento.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Responsável</Label>
            <Select
              value={responsavelId}
              onValueChange={(valor) => {
                setResponsavelId(valor);
                setDrillCodigo(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS_RESPONSAVEIS}>Todos</SelectItem>
                {usuariosDoDepartamento.map((usuario) => (
                  <SelectItem key={usuario.id} value={usuario.id}>
                    {usuario.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span>
          Escopo: {formatarCompetencia(competenciaInicio)} a {formatarCompetencia(competenciaFim)}
          {responsavelSelecionado ? ` · ${responsavelSelecionado.nome}` : " · equipe inteira"}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCompetenciaInicio(competenciaDeslocada(-5));
              setCompetenciaFim(competenciaAtual());
              setDepartamentoId(TODOS_DEPARTAMENTOS);
              setResponsavelId(TODOS_RESPONSAVEIS);
              setDrillCodigo(null);
            }}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Limpar filtros
          </Button>
          <Button size="sm" variant="outline" onClick={abrirGestao}>
            <Filter className="mr-1 h-3.5 w-3.5" />
            Abrir Gestão neste escopo
          </Button>
        </div>
      </div>

      {painel.isError ? (
        <ErroConsulta error={painel.error} onRetry={() => void painel.refetch()} />
      ) : painel.isLoading ? (
        <CarregandoTabela linhas={4} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {destaques.map((indicador) => (
              <StatCard
                key={indicador!.codigo}
                indicador={indicador!}
                destaque={indicador!.codigo === "INDICE_PRAZO"}
                onDrill={(codigo) => setDrillCodigo(codigo)}
                icone={
                  indicador!.codigo === "INDICE_PRAZO" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : indicador!.codigo === "ATRASADA" ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : indicador!.codigo === "VENCE_HOJE" ||
                    indicador!.codigo === "PROXIMOS_3_DIAS" ? (
                    <CalendarClock className="h-4 w-4" />
                  ) : indicador!.codigo === "BACKLOG" ? (
                    <Clock3 className="h-4 w-4" />
                  ) : (
                    <Gauge className="h-4 w-4" />
                  )
                }
              />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Evolução por competência</p>
                  <p className="text-xs text-muted-foreground">
                    Mostra se o backlog e os vencimentos estão sendo reduzidos ao longo do tempo.
                  </p>
                </div>
                <Badge variant="secondary">{painel.data?.totalRegistros ?? 0} registros</Badge>
              </div>

              {(painel.data?.serie ?? []).length ? (
                <div className="space-y-3">
                  {painel.data!.serie.map((item) => (
                    <div key={item.competencia} className="grid gap-2 sm:grid-cols-[88px_1fr_190px] sm:items-center">
                      <span className="text-xs font-medium">
                        {formatarCompetencia(item.competencia)}
                      </span>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Índice no prazo</span>
                          <span>{percentual(item.indicePrazo)}</span>
                        </div>
                        <Progress value={Math.min(100, Math.max(0, item.indicePrazo))} />
                      </div>
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        <Badge variant="secondary">{item.entregues} entregues</Badge>
                        <Badge variant="outline">{item.backlog} backlog</Badge>
                        {item.atrasadas ? (
                          <Badge className="bg-destructive/10 text-destructive">
                            {item.atrasadas} vencidas
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EstadoVazio titulo="Sem competências no recorte selecionado." />
              )}
            </Card>

            <Card className="space-y-4 p-4">
              <div>
                <p className="text-sm font-medium">Saúde da operação</p>
                <p className="text-xs text-muted-foreground">
                  Indicadores para priorização gerencial. Clique para abrir o detalhamento.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["ATRASADA", "Vencidas", AlertTriangle],
                  ["VENCE_HOJE", "Vencem hoje", CalendarClock],
                  ["PROXIMOS_3_DIAS", "Próximos 3 dias", Clock3],
                  ["REVISAO", "Revisão humana", Users],
                  ["AGUARDANDO", "Aguardando cliente", Clock3],
                  ["SEM_RESPONSAVEL", "Sem responsável", Users],
                ].map(([codigo, rotulo, Icone]) => {
                  const indicador = indicadores.get(String(codigo));
                  return (
                    <button
                      key={String(codigo)}
                      type="button"
                      onClick={() => setDrillCodigo(String(codigo))}
                      className="rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{String(rotulo)}</span>
                        <Icone className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <p className="mt-1 text-xl font-semibold tabular-nums">{indicador?.valor ?? 0}</p>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Cobertura</p>
                  <p className="text-lg font-semibold">{percentual(cobertura)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">No prazo</p>
                  <p className="text-lg font-semibold">{percentual(noPrazo)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Atraso médio</p>
                  <p className="text-lg font-semibold">{atrasoMedio.toFixed(1).replace(".", ",")} d</p>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Performance operacional por responsável</p>
            <p className="text-xs text-muted-foreground">
              Selecione uma linha para filtrar todo o painel pelo responsável.
            </p>
          </div>
          {responsavelSelecionado ? (
            <Button size="sm" variant="ghost" onClick={() => setResponsavelId(TODOS_RESPONSAVEIS)}>
              Ver equipe inteira
            </Button>
          ) : null}
        </div>

        {ranking.isLoading ? (
          <CarregandoTabela linhas={5} />
        ) : ranking.isError ? (
          <ErroConsulta error={ranking.error} onRetry={() => void ranking.refetch()} />
        ) : (ranking.data?.porRecorte ?? []).length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Previstas</TableHead>
                  <TableHead className="text-right">Entregues</TableHead>
                  <TableHead className="text-right">No prazo</TableHead>
                  <TableHead className="text-right">Vencidas</TableHead>
                  <TableHead className="text-right">Backlog</TableHead>
                  <TableHead className="text-right">Índice no prazo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.data!.porRecorte.slice(0, 30).map((linha) => (
                  <TableRow
                    key={linha.chave}
                    className="cursor-pointer"
                    onClick={() => selecionarResponsavelPorNome(linha.chave)}
                  >
                    <TableCell className="font-medium">{linha.chave}</TableCell>
                    <TableCell className="text-right tabular-nums">{linha.previstos}</TableCell>
                    <TableCell className="text-right tabular-nums">{linha.entregues}</TableCell>
                    <TableCell className="text-right tabular-nums">{linha.noPrazo}</TableCell>
                    <TableCell className="text-right tabular-nums">{linha.atrasadas}</TableCell>
                    <TableCell className="text-right tabular-nums">{linha.backlog}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {percentual(linha.indicePrazo)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EstadoVazio titulo="Sem dados de responsáveis neste recorte." />
        )}
      </Card>

      {drillCodigo ? (
        <Card className="space-y-3 border-primary/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                Detalhamento · {indicadores.get(drillCodigo)?.titulo ?? drillCodigo}
              </p>
              <p className="text-xs text-muted-foreground">
                Empresas e competências que compõem o indicador selecionado.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={abrirGestao}>
                Ir para Gestão
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDrillCodigo(null)}>
                Fechar
              </Button>
            </div>
          </div>

          {drill.isLoading ? (
            <CarregandoTabela linhas={4} />
          ) : drill.isError ? (
            <ErroConsulta error={drill.error} onRetry={() => void drill.refetch()} />
          ) : (drill.data ?? []).length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Competência</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Prazo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(drill.data ?? []).slice(0, 40).map((registro) => (
                    <TableRow key={registro.id}>
                      <TableCell className="font-medium">{registro.empresaNome}</TableCell>
                      <TableCell>{formatarCompetencia(registro.competencia)}</TableCell>
                      <TableCell>{registro.responsavel ?? "Sem responsável"}</TableCell>
                      <TableCell>{SITUACOES[registro.situacao] ?? registro.situacao}</TableCell>
                      <TableCell>{dataCurta(registro.prazo)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(drill.data ?? []).length > 40 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Exibindo 40 de {drill.data!.length} registros. Abra a Gestão para trabalhar o escopo completo.
                </p>
              ) : null}
            </div>
          ) : (
            <EstadoVazio titulo="Nenhum registro compõe este indicador." />
          )}
        </Card>
      ) : null}
    </Card>
  );
}
