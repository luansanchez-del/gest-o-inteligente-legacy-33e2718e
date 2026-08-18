import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Inbox,
  RefreshCw,
  Route as RouteIcon,
  Search,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { ErroConsulta, EstadoVazio } from "@/components/common/EstadoConsulta";
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
  analisarSolicitacaoInteligente,
  executarAcaoSolicitacaoInteligente,
  listarMinhaCaixa,
  obterVinculoPier,
  sincronizarMinhaCaixa,
  vincularMeuUsuarioPier,
} from "@/lib/api/caixa-inteligente.functions";
import { mensagemDeErro } from "@/lib/erros";

export const Route = createFileRoute("/_authenticated/minhas-solicitacoes")({
  component: MinhasSolicitacoesPage,
  head: () => ({
    meta: [
      { title: "Minha Caixa Inteligente | Gestão Inteligente" },
      {
        name: "description",
        content:
          "Leia, classifique, localize evidências e decida o próximo passo das solicitações atribuídas a você no PIER.",
      },
    ],
  }),
});

const CATEGORIAS = [
  "TODAS",
  "BALANCETE",
  "CONTABIL",
  "FISCAL",
  "FOLHA",
  "FINANCEIRO",
  "DOCUMENTO",
  "ADMINISTRATIVO",
  "OUTRO",
] as const;

type CategoriaFiltro = (typeof CATEGORIAS)[number];

const ROTULOS: Record<string, string> = {
  TODAS: "Todos os assuntos",
  BALANCETE: "Balancete / demonstrações",
  CONTABIL: "Contábil",
  FISCAL: "Fiscal / tributário",
  FOLHA: "Folha / DP",
  FINANCEIRO: "Financeiro",
  DOCUMENTO: "Documento",
  ADMINISTRATIVO: "Administrativo",
  OUTRO: "Outros",
};

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
  if (acao === "RESPONDER_MANTER_ABERTA") return "Responder e manter aberta";
  if (acao === "ENCAMINHAR") return "Encaminhar";
  return "Revisão humana";
}

function classeAcao(acao: string) {
  if (acao === "RESPONDER_FINALIZAR")
    return "bg-success-soft text-success-strong";
  if (acao === "ENCAMINHAR")
    return "bg-warning-soft text-warning-strong";
  return "bg-muted text-muted-foreground";
}

function MinhasSolicitacoesPage() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<CategoriaFiltro>("TODAS");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [privada, setPrivada] = useState(false);
  const [confirmarFinalizacao, setConfirmarFinalizacao] = useState(false);
  const [usuarioEscolhido, setUsuarioEscolhido] = useState("");

  const vinculo = useQuery({
    queryKey: ["vinculo-usuario-pier"],
    queryFn: () => obterVinculoPier(),
  });

  useEffect(() => {
    if (vinculo.data?.usuario?.id) setUsuarioEscolhido(vinculo.data.usuario.id);
  }, [vinculo.data?.usuario?.id]);

  const vincular = useMutation({
    mutationFn: () => vincularMeuUsuarioPier({ data: { externalId: usuarioEscolhido } }),
    onSuccess: (usuario) => {
      toast.success(`Usuário PIER vinculado: ${usuario.nome}.`);
      void queryClient.invalidateQueries({ queryKey: ["vinculo-usuario-pier"] });
      void queryClient.invalidateQueries({ queryKey: ["minha-caixa-inteligente"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const caixa = useQuery({
    queryKey: ["minha-caixa-inteligente", busca, categoria],
    queryFn: () =>
      listarMinhaCaixa({
        data: {
          busca: busca.trim() || null,
          categoria: categoria === "TODAS" ? null : categoria,
        },
      }),
    enabled: Boolean(vinculo.data?.vinculado),
    placeholderData: (anterior) => anterior,
  });

  const sincronizar = useMutation({
    mutationFn: () => sincronizarMinhaCaixa(),
    onSuccess: (r) => {
      toast.success(
        `${r.processadas} solicitações atualizadas para ${r.usuario.nome}.${r.possivelmenteParcial ? " A consulta atingiu o limite de páginas do PIER." : ""}`,
      );
      void queryClient.invalidateQueries({ queryKey: ["minha-caixa-inteligente"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const analise = useQuery({
    queryKey: ["analise-caixa-inteligente", selecionada],
    queryFn: () =>
      analisarSolicitacaoInteligente({
        data: { solicitacaoExternalId: selecionada! },
      }),
    enabled: Boolean(selecionada),
    staleTime: 0,
  });

  useEffect(() => {
    if (analise.data?.respostaSugerida)
      setMensagem(analise.data.respostaSugerida);
  }, [analise.data?.respostaSugerida]);

  const executar = useMutation({
    mutationFn: (
      acao: "RESPONDER_MANTER_ABERTA" | "RESPONDER_FINALIZAR",
    ) =>
      executarAcaoSolicitacaoInteligente({
        data: {
          solicitacaoExternalId: selecionada!,
          acao,
          mensagem,
          privada,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        r.finalizada
          ? "Resposta publicada e finalização confirmada no PIER."
          : "Resposta publicada no PIER. A solicitação permanece aberta.",
      );
      setConfirmarFinalizacao(false);
      setSelecionada(null);
      void queryClient.invalidateQueries({ queryKey: ["minha-caixa-inteligente"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const dados = caixa.data;
  const distribuicao = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const linha of dados?.linhas ?? [])
      mapa.set(linha.categoria, (mapa.get(linha.categoria) ?? 0) + 1);
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [dados?.linhas]);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Minha Caixa de Entrada Inteligente"
        descricao="Solicitações abertas atribuídas a você no PIER, com leitura do assunto, localizador de responsável/evidências e recomendação de próxima ação."
        acoes={
          <Button
            onClick={() => sincronizar.mutate()}
            disabled={
              sincronizar.isPending || !vinculo.data?.vinculado
            }
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${sincronizar.isPending ? "animate-spin" : ""}`}
            />
            {sincronizar.isPending
              ? "Sincronizando…"
              : "Sincronizar minhas solicitações"}
          </Button>
        }
      />

      {vinculo.isError ? (
        <ErroConsulta
          error={vinculo.error}
          onRetry={() => void vinculo.refetch()}
        />
      ) : !vinculo.data?.vinculado ? (
        <Card className="border-primary/20 p-5">
          <div className="flex items-start gap-3">
            <UserRoundCheck className="mt-0.5 h-6 w-6 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Qual usuário do PIER é você?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Esse vínculo é feito uma vez para que a Caixa traga somente as solicitações atribuídas ao seu usuário. Se o e-mail do login já coincidir com o PIER, o sistema vincula automaticamente.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Select value={usuarioEscolhido} onValueChange={setUsuarioEscolhido}>
                  <SelectTrigger className="sm:max-w-md">
                    <SelectValue placeholder="Selecione seu usuário no PIER" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {(vinculo.data?.opcoes ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}{u.email ? ` · ${u.email}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => vincular.mutate()}
                  disabled={!usuarioEscolhido || vincular.isPending}
                >
                  {vincular.isPending ? "Vinculando…" : "Vincular meu usuário"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Usuário PIER vinculado
            </p>
            <p className="font-medium">{vinculo.data.usuario?.nome}</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={usuarioEscolhido} onValueChange={setUsuarioEscolhido}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {vinculo.data.opcoes.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => vincular.mutate()}
              disabled={
                vincular.isPending ||
                !usuarioEscolhido ||
                usuarioEscolhido === vinculo.data.usuario?.id
              }
            >
              Trocar vínculo
            </Button>
          </div>
        </Card>
      )}

      {vinculo.data?.vinculado ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Em aberto
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {dados?.total ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                atribuídas a {dados?.usuario.nome ?? vinculo.data.usuario?.nome}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Vencidas
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-destructive">
                {dados?.vencidas ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                prioridade operacional
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Vencem hoje
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {dados?.vencemHoje ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                prazo não decide tecnicamente
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Com anexos
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {dados?.comAnexo ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                evidências para análise
              </p>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="busca-caixa">
                  Buscar solicitação, cliente ou CNPJ
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="busca-caixa"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Ex.: balancete, cliente, número..."
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="w-full space-y-1.5 lg:w-[240px]">
                <Label>Assunto identificado</Label>
                <Select
                  value={categoria}
                  onValueChange={(v) => setCategoria(v as CategoriaFiltro)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {ROTULOS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {distribuicao.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {distribuicao.map(([nome, total]) => (
                  <Badge key={nome} variant="secondary">
                    {ROTULOS[nome] ?? nome}: {total}
                  </Badge>
                ))}
              </div>
            ) : null}
          </Card>

          {caixa.isError ? (
            <ErroConsulta
              error={caixa.error}
              onRetry={() => void caixa.refetch()}
            />
          ) : null}

          <Card className="overflow-hidden">
            {caixa.isLoading ? (
              <div className="p-8 text-sm text-muted-foreground">
                Carregando sua Caixa de Entrada…
              </div>
            ) : !dados?.linhas.length ? (
              <EstadoVazio
                titulo="Nenhuma solicitação aberta neste filtro."
                descricao="Use “Sincronizar minhas solicitações” para atualizar a Caixa diretamente do PIER."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead>Solicitação</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Status PIER</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.linhas.map((linha) => (
                    <TableRow key={linha.externalId}>
                      <TableCell className="font-mono text-xs">
                        {linha.numero ?? "—"}
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[260px] truncate font-medium">
                          {linha.clienteNome ?? "Cliente não identificado"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {linha.documento ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {ROTULOS[linha.categoria] ?? linha.categoria}
                        </Badge>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Confiança {linha.confianca.toLowerCase()}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="max-w-[380px] line-clamp-2 text-sm">
                          {linha.descricao ?? linha.tipo ?? "Sem descrição"}
                        </p>
                        {linha.possuiAnexo ? (
                          <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <FileSearch className="h-3.5 w-3.5" /> possui anexo
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            linha.vencida ? "font-medium text-destructive" : ""
                          }
                        >
                          {dataPt(linha.prazoEm)}
                        </span>
                        {linha.venceHoje ? (
                          <p className="text-xs text-warning-strong">vence hoje</p>
                        ) : null}
                        {linha.vencida ? (
                          <p className="text-xs text-destructive">vencida</p>
                        ) : null}
                      </TableCell>
                      <TableCell>{linha.status ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setMensagem("");
                            setPrivada(false);
                            setSelecionada(linha.externalId);
                          }}
                        >
                          Analisar e resolver
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      ) : null}

      <Dialog
        open={Boolean(selecionada)}
        onOpenChange={(aberto) => {
          if (!aberto && !executar.isPending) {
            setSelecionada(null);
            setConfirmarFinalizacao(false);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Leitura e Localizador Inteligente</DialogTitle>
            <DialogDescription>
              O sistema cruza a solicitação com histórico, fechamento e evidências.
              Nenhuma ação ocorre sem seu comando.
            </DialogDescription>
          </DialogHeader>

          {analise.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Lendo PIER, histórico e evidências…
            </div>
          ) : analise.isError ? (
            <ErroConsulta
              error={analise.error}
              onRetry={() => void analise.refetch()}
            />
          ) : analise.data ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Assunto</p>
                  <p className="mt-1 font-medium">
                    {ROTULOS[analise.data.leitura.categoria] ??
                      analise.data.leitura.categoria}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Confiança {analise.data.leitura.confianca.toLowerCase()}
                  </p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Competência</p>
                  <p className="mt-1 font-medium">
                    {analise.data.solicitacao.competencia ?? "Não identificada"}
                  </p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Responsável atual</p>
                  <p className="mt-1 font-medium">
                    {analise.data.solicitacao.responsavelNome ?? "—"}
                  </p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">Prazo</p>
                  <p className="mt-1 font-medium">
                    {dataPt(analise.data.solicitacao.prazoEm)}
                  </p>
                </Card>
              </div>

              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <Inbox className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">O que a solicitação pede</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {analise.data.solicitacao.descricao ??
                        analise.data.solicitacao.tipo ??
                        "Sem descrição disponível."}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {analise.data.leitura.postagens} postagem(ns) ·{" "}
                      {analise.data.leitura.arquivos.length} arquivo(s) no contexto
                    </p>
                  </div>
                </div>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <RouteIcon className="h-5 w-5" />
                    <p className="font-medium">Responsável provável</p>
                  </div>
                  {analise.data.localizador.responsavelSugerido ? (
                    <div className="mt-3">
                      <p className="font-medium">
                        {analise.data.localizador.responsavelSugerido.nome ??
                          "Usuário identificado"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {analise.data.localizador.responsavelSugerido.departamento ??
                          "Departamento não identificado"}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Nenhum responsável alternativo foi identificado com segurança no
                      histórico.
                    </p>
                  )}
                  {!analise.data.localizador.encaminhamentoDisponivel ? (
                    <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
                      Encaminhamento automático indisponível: {" "}
                      {analise.data.localizador.motivoEncaminhamentoIndisponivel}
                    </p>
                  ) : null}
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <FileSearch className="h-5 w-5" />
                    <p className="font-medium">Fechamento e documentos</p>
                  </div>
                  {analise.data.localizador.fechamento ? (
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span>Fechamento</span>
                        <Badge variant="secondary">
                          {analise.data.localizador.fechamento.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Balancete localizado</span>
                        <strong>
                          {analise.data.localizador.fechamento.balanceteLocalizado
                            ? "Sim"
                            : "Não"}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Conciliação</span>
                        <strong>
                          {analise.data.localizador.fechamento.conciliacao ===
                          "CONFIRMADA_POR_EVIDENCIA"
                            ? "Evidência localizada"
                            : "Não comprovada"}
                        </strong>
                      </div>
                      {analise.data.localizador.fechamento.balancetes.length ? (
                        <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                          {analise.data.localizador.fechamento.balancetes.join(" · ")}
                        </div>
                      ) : null}
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to="/gestao/solicitacoes/$externalId"
                          params={{
                            externalId:
                              analise.data.localizador.fechamento
                                .solicitacaoExternalId,
                          }}
                        >
                          Abrir fechamento contábil
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Não foi localizado um fechamento contábil correspondente ao cliente
                      e à competência identificada.
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
                      className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${classeAcao(
                        analise.data.recomendacao.acao,
                      )}`}
                    >
                      {rotuloAcao(analise.data.recomendacao.acao)}
                    </span>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {analise.data.recomendacao.motivo}
                    </p>
                  </div>
                  {analise.data.recomendacao.acao === "RESPONDER_FINALIZAR" ? (
                    <CheckCircle2 className="h-6 w-6 text-success-strong" />
                  ) : analise.data.recomendacao.acao === "ENCAMINHAR" ? (
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
                  rows={7}
                />
                <p className="text-xs text-muted-foreground">
                  Por padrão a resposta é visível ao solicitante. Marque como privada
                  somente quando a mensagem for interna.
                </p>
              </div>

              {confirmarFinalizacao ? (
                <Card className="border-warning/40 bg-warning-soft p-4">
                  <p className="font-medium text-warning-strong">
                    Confirmar resposta e finalização?
                  </p>
                  <p className="mt-1 text-sm text-warning-strong">
                    A resposta será publicada primeiro. A finalização só será considerada
                    concluída depois que o PIER confirmar o novo status.
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmarFinalizacao(false)}
                      disabled={executar.isPending}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => executar.mutate("RESPONDER_FINALIZAR")}
                      disabled={executar.isPending || mensagem.trim().length < 10}
                    >
                      {executar.isPending ? "Executando…" : "Confirmar e finalizar"}
                    </Button>
                  </div>
                </Card>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => executar.mutate("RESPONDER_MANTER_ABERTA")}
              disabled={
                executar.isPending ||
                mensagem.trim().length < 10 ||
                !analise.data
              }
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
              onClick={() => setConfirmarFinalizacao(true)}
              disabled={
                executar.isPending ||
                mensagem.trim().length < 10 ||
                !analise.data
              }
            >
              Responder e finalizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
