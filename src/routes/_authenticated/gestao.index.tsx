import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, Download, FilterX, Pencil, PlayCircle, Users } from "lucide-react";
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
import {
  iniciarGestao,
  listarEquipe,
  montarPreview,
  renomearDepartamento,
  sincronizarEquipe,
  sincronizarSolicitacoes,
} from "@/lib/api/gestao.functions";
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
      { property: "og:title", content: "Gestão de fechamentos | Gestão Inteligente" },
      {
        property: "og:description",
        content: "Escopo por departamento e responsável, com pré-visualização antes de executar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GestaoPage,
});

const TODOS_DEPARTAMENTOS = "__TODOS__";
const TODOS_USUARIOS = "__TODOS_USUARIOS__";
const TODAS_FILAS = "__TODAS_FILAS__";

/** Fila operacional do fechamento contábil. */
const FILA: Record<string, { rotulo: string; classe: string }> = {
  AGUARDANDO_DOCUMENTO: { rotulo: "Aguardando documento", classe: "text-muted-foreground" },
  PRONTO_PARA_ANALISE: { rotulo: "Pronto para análise", classe: "text-primary" },
  ANALISANDO: { rotulo: "Analisando", classe: "text-warning-strong" },
  ANALISE_CONCLUIDA: { rotulo: "Análise concluída", classe: "text-success-strong" },
  REVISAO_NECESSARIA: { rotulo: "Revisão necessária", classe: "text-warning-strong" },
  ERRO: { rotulo: "Erro objetivo", classe: "text-destructive" },
  HISTORICO: { rotulo: "Histórico/finalizada", classe: "text-muted-foreground" },
};

function competenciaAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

function GestaoPage() {
  const queryClient = useQueryClient();
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [departamento, setDepartamento] = useState(TODOS_DEPARTAMENTOS);
  const [responsavel, setResponsavel] = useState(TODOS_USUARIOS);
  const [fila, setFila] = useState(TODAS_FILAS);
  const [incluirInativos, setIncluirInativos] = useState(false);
  const [renomeando, setRenomeando] = useState(false);
  const [novoNomeDepartamento, setNovoNomeDepartamento] = useState("");

  const equipe = useQuery({
    queryKey: ["equipe-pier", incluirInativos, "contabeis"],
    queryFn: () => listarEquipe({ data: { incluirInativos, somenteContabeis: true } }),
  });

  const filtro = {
    competencia,
    tipo: "CONTABIL" as const,
    departamentoId: departamento === TODOS_DEPARTAMENTOS ? null : departamento,
    responsavelId: responsavel === TODOS_USUARIOS ? null : responsavel,
    statusFila: fila === TODAS_FILAS ? null : (fila as never),
  };

  const preview = useQuery({
    queryKey: [
      "preview-gestao",
      filtro.competencia,
      filtro.departamentoId,
      filtro.responsavelId,
      fila,
    ],
    queryFn: () => montarPreview({ data: filtro }),
    enabled: /^\d{4}-\d{2}$/.test(competencia),
    placeholderData: (anterior) => anterior,
  });


  const sincEquipe = useMutation({
    mutationFn: () => sincronizarEquipe(),
    onSuccess: (r) => {
      toast.success(`${r.processados} usuários e ${r.departamentos} departamentos atualizados.`);
      void queryClient.invalidateQueries({ queryKey: ["equipe-pier"] });
      void queryClient.invalidateQueries({ queryKey: ["equipe-completa"] });
      void queryClient.invalidateQueries({ queryKey: ["preview-gestao"] });

    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const prepararSolicitacoes = useMutation({
    mutationFn: () =>
      sincronizarSolicitacoes({ data: { competencia, tipo: "CONTABIL" as const } }),
    onSuccess: (r) => {
      toast.success(`${r.processados} solicitações de fechamento carregadas da competência.`);
      void queryClient.invalidateQueries({ queryKey: ["preview-gestao"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const iniciar = useMutation({
    mutationFn: () =>
      iniciarGestao({
        data: {
          ...filtro,
          idempotencyKey: `${competencia}|CONTABIL|${filtro.departamentoId ?? "todos"}|${filtro.responsavelId ?? "todos"}`,
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

  const renomear = useMutation({
    mutationFn: () =>
      renomearDepartamento({
        data: { departamentoId: departamento, nome: novoNomeDepartamento.trim() },
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
  const departamentoSelecionado = departamentos.find((d) => d.id === departamento);
  const usuariosDoDepartamento = useMemo(() => {
    if (departamento === TODOS_DEPARTAMENTOS) return usuarios;
    return usuarios.filter((u) => u.departamentoId === departamento);
  }, [usuarios, departamento]);

  const filtrosAtivos =
    departamento !== TODOS_DEPARTAMENTOS ||
    responsavel !== TODOS_USUARIOS ||
    fila !== TODAS_FILAS ||
    incluirInativos ||
    competencia !== competenciaAtual();


  function limparFiltros() {
    setCompetencia(competenciaAtual());
    setDepartamento(TODOS_DEPARTAMENTOS);
    setResponsavel(TODOS_USUARIOS);
    setFila(TODAS_FILAS);
    setIncluirInativos(false);
  }



  const dados = preview.data;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Gestão de fechamentos"
        descricao="Escolha a competência, o departamento e o responsável do PIER antes de iniciar a gestão."
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => sincEquipe.mutate()}
              disabled={sincEquipe.isPending}
            >
              <Users className={`mr-2 h-4 w-4 ${sincEquipe.isPending ? "animate-pulse" : ""}`} />
              Sincronizar equipe
            </Button>
            <Button
              variant="outline"
              onClick={() => prepararSolicitacoes.mutate()}
              disabled={prepararSolicitacoes.isPending}
            >
              <Download
                className={`mr-2 h-4 w-4 ${prepararSolicitacoes.isPending ? "animate-pulse" : ""}`}
              />
              Carregar solicitações da competência
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
            <Label htmlFor="competencia">Competência</Label>
            <Input
              id="competencia"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 lg:w-[190px]">
            <Label>Tipo de fechamento</Label>
            <Select value="CONTABIL" disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CONTABIL">Fechamento Contábil</SelectItem>
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
                <SelectTrigger aria-label="Departamento responsável" className="flex-1">
                  <SelectValue placeholder="Todos os departamentos" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value={TODOS_DEPARTAMENTOS}>Todos os departamentos</SelectItem>
                  {departamentos.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome}
                      <span className="ml-1 text-muted-foreground">· {d.totalUsuarios}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {departamento !== TODOS_DEPARTAMENTOS ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Renomear departamento"
                  title="Definir nome legível do departamento"
                  onClick={() => {
                    setNovoNomeDepartamento(departamentoSelecionado?.nome ?? "");
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
                aria-pressed={incluirInativos}
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              >
                {incluirInativos ? "ativos + inativos" : "somente ativos"}
              </button>
            </div>
            <Select value={responsavel} onValueChange={setResponsavel}>
              <SelectTrigger aria-label="Usuário responsável">
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
          <div className="min-w-[190px] space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Situação
            </Label>
            <Select value={fila} onValueChange={setFila}>
              <SelectTrigger aria-label="Situação da fila">
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
              O PIER disponibiliza apenas o código do departamento ({departamentoSelecionado?.codigo}
              ). Defina aqui o nome que aparecerá nos filtros.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={novoNomeDepartamento}
            onChange={(e) => setNovoNomeDepartamento(e.target.value)}
            placeholder="Ex.: Contábil - Equipe 1"
            aria-label="Nome do departamento"
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
        <ErroConsulta error={preview.error} onRetry={() => void preview.refetch()} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { rotulo: "Empresas no escopo", valor: dados?.totalEmpresas },
          { rotulo: "Com vínculo interno", valor: dados?.totalComVinculo },
          { rotulo: "Sem vínculo", valor: dados?.totalSemVinculo },
          { rotulo: "Competência já aberta", valor: dados?.competenciasExistentes },
          { rotulo: "Competências novas", valor: dados?.competenciasNovas },
        ].map((item) => (
          <Card key={item.rotulo} className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.rotulo}</p>
            <p className="text-2xl font-semibold tabular-nums">{item.valor ?? "—"}</p>
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
              {dados?.solicitacoesEmCache ?? 0} solicitações de Fechamento Contábil em cache para{" "}
              {competencia}. Sem responsável: {dados?.totalSemResponsavel ?? 0}.
            </p>
          </div>
          <Button
            onClick={() => iniciar.mutate()}
            disabled={iniciar.isPending || !dados || dados.totalEmpresas === 0}
          >
            <PlayCircle className={`mr-2 h-4 w-4 ${iniciar.isPending ? "animate-pulse" : ""}`} />
            Iniciar gestão
          </Button>
        </div>

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
            descricao="Use “Carregar solicitações da competência” e depois ajuste departamento e responsável."
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
                <TableHead>Anexo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.empresas.map((linha) => {
                const analise = FILA[linha.statusFila] ?? FILA.AGUARDANDO_DOCUMENTO;
                return (
                  <TableRow key={linha.solicitacaoId}>
                    <TableCell className="tabular-nums">{linha.numero ?? "—"}</TableCell>
                    <TableCell className="font-medium">{linha.clienteNome}</TableCell>
                    <TableCell className="tabular-nums">{formatarCnpj(linha.documento)}</TableCell>
                    <TableCell className="tabular-nums">{linha.competencia ?? "—"}</TableCell>
                    <TableCell>{linha.responsavelNome ?? "Sem responsável"}</TableCell>
                    <TableCell>{linha.statusSolicitacao ?? "—"}</TableCell>
                    <TableCell>
                      {linha.temAnexo ? (
                        <span className="text-success-strong">Sim</span>
                      ) : (
                        <span className="text-muted-foreground">Não</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={analise.classe}>{analise.rotulo}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          to="/gestao/solicitacoes/$externalId"
                          params={{ externalId: linha.solicitacaoId }}
                          aria-label={`Abrir solicitação de ${linha.clienteNome}`}
                        >
                          {linha.statusAnalise === "NAO_ANALISADA" ? "Analisar" : "Ver análise"}
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
