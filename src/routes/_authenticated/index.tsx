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
  ALTO: "text-destructive",
  MEDIO: "text-warning-strong",
  BAIXO: "text-success-strong",
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

const SITUACAO_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  AGUARDANDO_DOCUMENTO: "outline",
  PRONTO_PARA_ANALISE: "secondary",
  ANALISANDO: "secondary",
  ANALISE_CONCLUIDA: "default",
  REVISAO_NECESSARIA: "outline",
  BLOQUEADA: "destructive",
  ERRO: "destructive",
  HISTORICO: "secondary",
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
    <div className="space-y-6">
      <PageHeader
        titulo="Visão Geral"
        descricao="Acompanhe os principais indicadores e as ações prioritárias do escritório."
      />

      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-3 lg:flex lg:flex-wrap">
          <div className="space-y-1.5">
            <Label htmlFor="visao-competencia" className="text-xs">
              Competência
            </Label>
            <Input
              id="visao-competencia"
              type="month"
              className="w-[150px]"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Departamento</Label>
            <Select value={departamento} onValueChange={setDepartamento}>
              <SelectTrigger className="w-[220px]">
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
            <Label className="text-xs">Responsável</Label>
            <Select value={responsavel} onValueChange={setResponsavel}>
              <SelectTrigger className="w-[220px]">
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
        <div className="flex gap-2">
          <Button variant="ghost" onClick={limparFiltros}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Limpar filtros
          </Button>
          <Button onClick={() => void preview.refetch()} disabled={preview.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${preview.isFetching ? "animate-spin" : ""}`} />
            Carregar dados
          </Button>
        </div>
      </Card>

      {preview.isError ? (
        <ErroConsulta error={preview.error} onRetry={() => void preview.refetch()} />
      ) : preview.isLoading ? (
        <CarregandoTabela linhas={4} />
      ) : (
        <>
          {indice.data ? (
            <Card className="grid gap-4 p-4 sm:grid-cols-3">
              {[
                indice.data.indicadores.find((i) => i.codigo === "INDICE"),
                indice.data.indicadores.find((i) => i.codigo === "INDICE_PRAZO"),
                indice.data.indicadores.find((i) => i.codigo === "ATRASO_MEDIO"),
              ]
                .filter((i): i is NonNullable<typeof i> => Boolean(i))
                .map((i) => (
                  <div key={i.codigo} className="space-y-1">
                    <p className="text-sm font-medium">{i.titulo}</p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {i.formato === "PERCENTUAL"
                        ? `${i.valor.toFixed(1).replace(".", ",")}%`
                        : i.formato === "DIAS"
                          ? `${i.valor.toFixed(1).replace(".", ",")} d`
                          : i.valor}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {i.formato === "PERCENTUAL"
                        ? `${i.numerador} de ${i.denominador} · `
                        : ""}
                      {i.regra}
                    </p>
                  </div>
                ))}
            </Card>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                rotulo: "Abertas",
                valor: totais.abertas,
                detalhe: "Solicitações no escopo",
                icone: FileText,
              },
              {
                rotulo: "Aguardando documento",
                valor: totais.aguardandoDocumento,
                detalhe: "Atenção da carteira",
                icone: Clock,
              },
              {
                rotulo: "Em risco",
                valor: totais.emRisco,
                detalhe: "Prazo vencido ou bloqueio",
                icone: AlertTriangle,
              },
              {
                rotulo: "Em processamento",
                valor: totais.emProcessamento,
                detalhe: "Aguardando análise",
                icone: Eye,
              },
              {
                rotulo: "Finalizadas",
                valor: totais.finalizadas,
                detalhe: "Competência atual",
                icone: CheckCircle2,
              },
            ].map((item) => (
              <Card key={item.rotulo} className="space-y-2 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <item.icone className="h-4 w-4" />
                  {item.rotulo}
                </div>
                <p className="text-2xl font-semibold tabular-nums">{item.valor}</p>
                <p className="text-xs text-muted-foreground">{item.detalhe}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Atenção necessária</p>
                <Badge variant="destructive">{atencaoNecessaria.length}</Badge>
              </div>
              {atencaoNecessaria.length ? (
                <div className="space-y-2">
                  {atencaoNecessaria.map(({ linha, risco }) => {
                    const dias = diasAtePrazo(linha.prazo);
                    return (
                      <Link
                        key={linha.solicitacaoId}
                        to="/gestao/solicitacoes/$externalId"
                        params={{ externalId: linha.solicitacaoId }}
                        className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{linha.clienteNome}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {linha.departamentoNome ?? "—"} ·{" "}
                            {SITUACAO_ROTULO[linha.statusFila] ?? linha.statusFila}
                          </p>
                        </div>
                        <span className={`shrink-0 text-xs font-medium ${RISCO_CLASSE[risco]}`}>
                          {dias === null
                            ? "sem prazo"
                            : dias < 0
                              ? `${Math.abs(dias)}d atrasado`
                              : "bloqueio"}
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nada em risco neste escopo agora.
                </p>
              )}
              <Button asChild variant="link" size="sm" className="px-0">
                <Link to="/gestao">Ver todas as pendências →</Link>
              </Button>
            </Card>

            <Card className="space-y-3 p-4">
              <p className="text-sm font-medium">Carteira por responsável</p>
              {carteiraPorResponsavel.length ? (
                <div className="space-y-3">
                  {carteiraPorResponsavel.map((item) => (
                    <div key={item.nome} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.nome}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.departamento ?? "Sem departamento"}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {item.pendencias}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.round((item.pendencias / maiorCarteira) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sem responsáveis com solicitações neste escopo.
                </p>
              )}
              <Button asChild variant="link" size="sm" className="px-0">
                <Link to="/equipe">Ver toda a equipe →</Link>
              </Button>
            </Card>
          </div>

          <Card className="space-y-3 p-4">
            <p className="text-sm font-medium">Ações rápidas</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Button asChild variant="outline" className="justify-start">
                <Link to="/gestao">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Responder solicitações
                </Link>
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => sincEquipe.mutate()}
                disabled={sincEquipe.isPending}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${sincEquipe.isPending ? "animate-spin" : ""}`}
                />
                Sincronizar equipe
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link to="/gestao">
                  <History className="mr-2 h-4 w-4" />
                  Ir para Solicitações
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link to="/equipe">
                  <Users className="mr-2 h-4 w-4" />
                  Equipe e departamentos
                </Link>
              </Button>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Solicitações recentes</p>
              <Badge variant="secondary">{empresas.length}</Badge>
            </div>
            {recentes.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
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
                        <TableRow key={linha.solicitacaoId}>
                          <TableCell className="font-medium">{linha.clienteNome}</TableCell>
                          <TableCell className="max-w-[220px] truncate text-muted-foreground">
                            {linha.assunto ?? "—"}
                          </TableCell>
                          <TableCell>{linha.responsavelNome ?? "Sem responsável"}</TableCell>
                          <TableCell>{formatarCompetencia(linha.competencia)}</TableCell>
                          <TableCell>{formatarData(linha.prazo)}</TableCell>
                          <TableCell>
                            <Badge variant={SITUACAO_VARIANT[linha.statusFila] ?? "outline"}>
                              {SITUACAO_ROTULO[linha.statusFila] ?? linha.statusFila}
                            </Badge>
                          </TableCell>
                          <TableCell className={`font-medium ${RISCO_CLASSE[risco]}`}>
                            {RISCO_ROTULO[risco]}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm">
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
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma solicitação carregada para este escopo ainda.
              </p>
            )}
            <Button asChild variant="link" size="sm" className="px-0">
              <Link to="/gestao">Ver todas →</Link>
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
