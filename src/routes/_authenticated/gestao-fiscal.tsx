import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  FileCheck2,
  FilterX,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import {
  CarregandoTabela,
  ErroConsulta,
  EstadoVazio,
} from "@/components/common/EstadoConsulta";
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
import {
  listarEquipeFiscal,
  montarPainelFiscal,
  sincronizarSolicitacoesFiscais,
  validarSolicitacoesFiscais,
} from "@/lib/api/fiscal.functions";
import { sincronizarRespostasPier } from "@/lib/api/gestao.functions";
import { mensagemDeErro } from "@/lib/erros";
import { formatarCnpj } from "@/lib/formato";

export const Route = createFileRoute("/_authenticated/gestao-fiscal")({
  head: () => ({
    meta: [
      { title: "Gestão Fiscal | Gestão Inteligente" },
      {
        name: "description",
        content:
          "Gestão das solicitações do Tributário Legacy e Tributário BPO com checklist do Manual de Fechamento Fiscal.",
      },
    ],
  }),
  component: GestaoFiscalPage,
});

const TODOS_DEPARTAMENTOS = "__TODOS__";
const TODOS_USUARIOS = "__TODOS_USUARIOS__";
const CHAVE_FILTROS = "gestao-inteligente:filtros-fiscal";

type Categoria =
  | "TODAS"
  | "ICMS"
  | "SPED_ICMS_IPI"
  | "ISS"
  | "PIS_COFINS"
  | "SPED_CONTRIBUICOES"
  | "IRPJ_CSLL"
  | "SIMPLES_DAS"
  | "OUTRA";

type StatusPier = "PENDENTES" | "FINALIZADAS" | "TODOS";
type StatusResposta =
  | "TODAS"
  | "SEM_RESPOSTA"
  | "RESPONDIDAS"
  | "NAO_VERIFICADAS";
type StatusValidacao =
  | "TODOS"
  | "NAO_VALIDADA"
  | "DOCUMENTOS_OK_REVISAR"
  | "BLOQUEADA"
  | "REVISAO_HUMANA"
  | "ERRO";

type Filtros = {
  competencia: string;
  competenciaFim: string;
  revisaoCompetencia: boolean;
  departamento: string;
  responsavel: string;
  categoria: Categoria;
  statusPier: StatusPier;
  statusResposta: StatusResposta;
  statusValidacao: StatusValidacao;
  anexo: "TODOS" | "COM_ANEXO" | "SEM_ANEXO";
  busca: string;
};

function competenciaAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

function filtrosPadrao(): Filtros {
  return {
    competencia: competenciaAtual(),
    competenciaFim: "",
    revisaoCompetencia: false,
    departamento: TODOS_DEPARTAMENTOS,
    responsavel: TODOS_USUARIOS,
    categoria: "TODAS",
    statusPier: "PENDENTES",
    statusResposta: "TODAS",
    statusValidacao: "TODOS",
    anexo: "TODOS",
    busca: "",
  };
}

function carregarFiltros(): Filtros {
  const padrao = filtrosPadrao();
  if (typeof window === "undefined") return padrao;
  try {
    const salvo = JSON.parse(
      window.sessionStorage.getItem(CHAVE_FILTROS) ?? "null",
    ) as Partial<Filtros> | null;
    return salvo ? { ...padrao, ...salvo } : padrao;
  } catch {
    return padrao;
  }
}

function dataHora(value: string | null | undefined) {
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

const CATEGORIAS: Array<{ value: Categoria; label: string }> = [
  { value: "TODAS", label: "Todas as solicitações fiscais" },
  { value: "ICMS", label: "ICMS" },
  { value: "SPED_ICMS_IPI", label: "SPED ICMS/IPI" },
  { value: "ISS", label: "ISS" },
  { value: "PIS_COFINS", label: "PIS e COFINS" },
  { value: "SPED_CONTRIBUICOES", label: "SPED Contribuições" },
  { value: "IRPJ_CSLL", label: "IRPJ e CSLL" },
  { value: "SIMPLES_DAS", label: "Simples Nacional / DAS" },
  { value: "OUTRA", label: "Outras do Fiscal" },
];

function badgeValidacao(status: string) {
  if (status === "DOCUMENTOS_OK_REVISAR")
    return {
      label: "Documentos OK — revisar valores",
      className: "bg-success-soft text-success-strong",
    };
  if (status === "BLOQUEADA")
    return {
      label: "Bloqueada — documentos faltantes",
      className: "bg-destructive/10 text-destructive",
    };
  if (status === "REVISAO_HUMANA")
    return {
      label: "Revisão humana",
      className: "bg-warning-soft text-warning-strong",
    };
  if (status === "ERRO")
    return {
      label: "Falha na validação",
      className: "bg-destructive/10 text-destructive",
    };
  return { label: "Não validada", className: "bg-muted text-muted-foreground" };
}

function GestaoFiscalPage() {
  const queryClient = useQueryClient();
  const [inicial] = useState(carregarFiltros);
  const [competencia, setCompetencia] = useState(inicial.competencia);
  const [competenciaFim, setCompetenciaFim] = useState(inicial.competenciaFim);
  const [revisaoCompetencia, setRevisaoCompetencia] = useState(
    inicial.revisaoCompetencia,
  );
  const [departamento, setDepartamento] = useState(inicial.departamento);
  const [responsavel, setResponsavel] = useState(inicial.responsavel);
  const [categoria, setCategoria] = useState<Categoria>(inicial.categoria);
  const [statusPier, setStatusPier] = useState<StatusPier>(inicial.statusPier);
  const [statusResposta, setStatusResposta] = useState<StatusResposta>(
    inicial.statusResposta,
  );
  const [statusValidacao, setStatusValidacao] = useState<StatusValidacao>(
    inicial.statusValidacao,
  );
  const [anexo, setAnexo] = useState<Filtros["anexo"]>(inicial.anexo);
  const [busca, setBusca] = useState(inicial.busca);
  const [detalhe, setDetalhe] = useState<
    Awaited<ReturnType<typeof montarPainelFiscal>>["linhas"][number] | null
  >(null);

  useEffect(() => {
    window.sessionStorage.setItem(
      CHAVE_FILTROS,
      JSON.stringify({
        competencia,
        competenciaFim,
        revisaoCompetencia,
        departamento,
        responsavel,
        categoria,
        statusPier,
        statusResposta,
        statusValidacao,
        anexo,
        busca,
      } satisfies Filtros),
    );
  }, [
    anexo,
    busca,
    categoria,
    competencia,
    competenciaFim,
    departamento,
    responsavel,
    revisaoCompetencia,
    statusPier,
    statusResposta,
    statusValidacao,
  ]);

  const equipe = useQuery({
    queryKey: ["equipe-fiscal"],
    queryFn: () => listarEquipeFiscal(),
  });

  const filtro = {
    competencia,
    competenciaFim: competenciaFim || null,
    revisaoCompetencia,
    departamentoId: departamento === TODOS_DEPARTAMENTOS ? null : departamento,
    responsavelId: responsavel === TODOS_USUARIOS ? null : responsavel,
    categoria,
    statusPier,
    statusResposta,
    statusValidacao,
    anexo: anexo === "TODOS" ? null : anexo,
    busca: busca.trim() || null,
  };

  const painel = useQuery({
    queryKey: [
      "gestao-fiscal",
      competencia,
      competenciaFim,
      revisaoCompetencia,
      departamento,
      responsavel,
      categoria,
      statusPier,
      statusResposta,
      statusValidacao,
      anexo,
      busca,
    ],
    queryFn: () => montarPainelFiscal({ data: filtro }),
    enabled: revisaoCompetencia || /^\d{4}-\d{2}$/.test(competencia),
    placeholderData: (anterior) => anterior,
  });

  const sincronizar = useMutation({
    mutationFn: () => sincronizarSolicitacoesFiscais({ data: { statusPier } }),
    onSuccess: (r) => {
      toast.success(
        `${r.processados} solicitações fiscais atualizadas. ${r.varridasNoPier} solicitações varridas no PIER.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["gestao-fiscal"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const validar = useMutation({
    mutationFn: async () => {
      const ids = (painel.data?.linhas ?? [])
        .filter((l) => !l.finalizadaEm && !/finaliz|conclu|encerr/i.test(l.statusPier ?? ""))
        .map((l) => l.solicitacaoId);
      const total = {
        total: 0,
        documentosOkRevisar: 0,
        bloqueadas: 0,
        revisaoHumana: 0,
        erros: 0,
      };
      for (let inicio = 0; inicio < ids.length; inicio += 100) {
        const r = await validarSolicitacoesFiscais({
          data: { solicitacoes: ids.slice(inicio, inicio + 100) },
        });
        total.total += r.resumo.total;
        total.documentosOkRevisar += r.resumo.documentosOkRevisar;
        total.bloqueadas += r.resumo.bloqueadas;
        total.revisaoHumana += r.resumo.revisaoHumana;
        total.erros += r.resumo.erros;
      }
      return total;
    },
    onSuccess: (r) => {
      toast.success(
        `${r.total} validadas: ${r.documentosOkRevisar} com documentos completos para revisão, ${r.bloqueadas} bloqueadas, ${r.revisaoHumana} para revisão humana e ${r.erros} falhas.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["gestao-fiscal"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const atualizarRespostas = useMutation({
    mutationFn: async () => {
      const completo = await montarPainelFiscal({
        data: { ...filtro, statusResposta: "TODAS" },
      });
      const ids = completo.linhas.map((l) => l.solicitacaoId);
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
        `${r.total} verificadas no PIER: ${r.respondidas} já respondidas e ${r.semResposta} sem resposta${r.erros ? `; ${r.erros} falharam` : ""}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["gestao-fiscal"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const departamentos = equipe.data?.departamentos ?? [];
  const usuarios = equipe.data?.usuarios ?? [];
  const usuariosFiltrados = useMemo(
    () =>
      departamento === TODOS_DEPARTAMENTOS
        ? usuarios
        : usuarios.filter((u) => u.departamentoId === departamento),
    [departamento, usuarios],
  );

  const dados = painel.data;
  const processaveis = (dados?.linhas ?? []).filter(
    (l) => !l.finalizadaEm && !/finaliz|conclu|encerr/i.test(l.statusPier ?? ""),
  ).length;

  function limparFiltros() {
    const p = filtrosPadrao();
    setCompetencia(p.competencia);
    setCompetenciaFim("");
    setRevisaoCompetencia(false);
    setDepartamento(TODOS_DEPARTAMENTOS);
    setResponsavel(TODOS_USUARIOS);
    setCategoria("TODAS");
    setStatusPier("PENDENTES");
    setStatusResposta("TODAS");
    setStatusValidacao("TODOS");
    setAnexo("TODOS");
    setBusca("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Gestão Fiscal"
        descricao="Solicitações do Tributário Legacy e Tributário BPO, com validação documental conforme o Manual de Fechamento BPO."
        acoes={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => sincronizar.mutate()}
              disabled={sincronizar.isPending}
            >
              {sincronizar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sincronizar Fiscal do PIER
            </Button>
          </div>
        }
      />

      <Card className="border-primary/20 bg-primary/5 p-4 text-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Regra do fechamento fiscal</p>
            <p className="mt-1 text-muted-foreground">
              A validação automática confere a presença documental exigida pelo manual. Mesmo com o checklist completo, a conclusão permanece em revisão até confirmar escrituração, atualização dos relatórios, valores das guias e tratamento de divergências.
            </p>
          </div>
        </div>
      </Card>

      {equipe.data && !equipe.data.integracao.available ? (
        <Card className="border-warning/40 bg-warning-soft p-4 text-sm text-warning-strong">
          Integração com o PIER indisponível: {equipe.data.integracao.reason ?? "não configurada"}.
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[155px] space-y-1">
            <Label>Competência inicial</Label>
            <Input
              type="month"
              value={competencia}
              disabled={revisaoCompetencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
          <div className="w-[155px] space-y-1">
            <Label>Competência final</Label>
            <Input
              type="month"
              value={competenciaFim}
              disabled={revisaoCompetencia}
              onChange={(e) => setCompetenciaFim(e.target.value)}
            />
          </div>
          <div className="min-w-[220px] flex-1 space-y-1">
            <Label>Departamento fiscal</Label>
            <Select
              value={departamento}
              onValueChange={(v) => {
                setDepartamento(v);
                setResponsavel(TODOS_USUARIOS);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS_DEPARTAMENTOS}>Todos do Fiscal</SelectItem>
                {departamentos.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nome} · {d.totalUsuarios}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[230px] flex-1 space-y-1">
            <Label>Responsável</Label>
            <Select value={responsavel} onValueChange={setResponsavel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value={TODOS_USUARIOS}>Todos os responsáveis</SelectItem>
                {usuariosFiltrados.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[210px] space-y-1">
            <Label>Assunto fiscal</Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v as Categoria)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[170px] space-y-1">
            <Label>Status PIER</Label>
            <Select value={statusPier} onValueChange={(v) => setStatusPier(v as StatusPier)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDENTES">Em aberto</SelectItem>
                <SelectItem value="FINALIZADAS">Finalizadas</SelectItem>
                <SelectItem value="TODOS">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[210px] space-y-1">
            <Label>Validação fiscal</Label>
            <Select
              value={statusValidacao}
              onValueChange={(v) => setStatusValidacao(v as StatusValidacao)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todas</SelectItem>
                <SelectItem value="NAO_VALIDADA">Não validadas</SelectItem>
                <SelectItem value="DOCUMENTOS_OK_REVISAR">Documentos OK — revisar</SelectItem>
                <SelectItem value="BLOQUEADA">Bloqueadas</SelectItem>
                <SelectItem value="REVISAO_HUMANA">Revisão humana</SelectItem>
                <SelectItem value="ERRO">Falha</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px] space-y-1">
            <Label>Resposta PIER</Label>
            <Select
              value={statusResposta}
              onValueChange={(v) => setStatusResposta(v as StatusResposta)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas</SelectItem>
                <SelectItem value="SEM_RESPOSTA">Sem resposta</SelectItem>
                <SelectItem value="RESPONDIDAS">Já respondidas</SelectItem>
                <SelectItem value="NAO_VERIFICADAS">Não verificadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[155px] space-y-1">
            <Label>Anexos</Label>
            <Select value={anexo} onValueChange={(v) => setAnexo(v as Filtros["anexo"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="COM_ANEXO">Com anexo</SelectItem>
                <SelectItem value="SEM_ANEXO">Sem anexo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[220px] flex-1 space-y-1">
            <Label>Cliente, CNPJ ou solicitação</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={busca}
                placeholder="Buscar"
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            variant={revisaoCompetencia ? "default" : "outline"}
            onClick={() => setRevisaoCompetencia((v) => !v)}
          >
            Revisão de competência
          </Button>
          <Button variant="outline" onClick={limparFiltros}>
            <FilterX className="mr-2 h-4 w-4" />
            Limpar filtros
          </Button>
        </div>
      </Card>

      {painel.isError ? (
        <ErroConsulta error={painel.error} onRetry={() => void painel.refetch()} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[
          ["No escopo", dados?.total ?? 0],
          ["Não validadas", dados?.totais.naoValidadas ?? 0],
          ["Docs OK · revisar", dados?.totais.documentosOkRevisar ?? 0],
          ["Bloqueadas", dados?.totais.bloqueadas ?? 0],
          ["Revisão humana", dados?.totais.revisaoHumana ?? 0],
          ["Com anexo", dados?.totais.comAnexo ?? 0],
          ["Já respondidas", dados?.totais.respondidas ?? 0],
          ["Falhas", dados?.totais.erros ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)} className="p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Operação fiscal do escopo</p>
            <p className="text-sm text-muted-foreground">
              {dados?.total ?? 0} solicitação(ões) exibida(s) · {processaveis} aberta(s) elegível(is) para validação documental.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => atualizarRespostas.mutate()}
              disabled={atualizarRespostas.isPending || !dados?.linhas.length}
            >
              {atualizarRespostas.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Atualizar respostas PIER
            </Button>
            <Button
              onClick={() => validar.mutate()}
              disabled={validar.isPending || !processaveis}
            >
              {validar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileCheck2 className="mr-2 h-4 w-4" />
              )}
              Validar Fiscal em lote ({processaveis})
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {painel.isLoading ? (
          <CarregandoTabela />
        ) : !dados?.linhas.length ? (
          <EstadoVazio
            titulo="Nenhuma solicitação fiscal neste escopo."
            descricao="Clique em “Sincronizar Fiscal do PIER” e ajuste a competência ou os filtros."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead>Regime</TableHead>
                <TableHead>Assunto fiscal</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status PIER</TableHead>
                <TableHead>Anexo</TableHead>
                <TableHead>Validação</TableHead>
                <TableHead>Resposta</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.linhas.map((linha) => {
                const validacao = badgeValidacao(linha.statusValidacao);
                return (
                  <TableRow key={linha.solicitacaoId}>
                    <TableCell className="tabular-nums">{linha.numero ?? "—"}</TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="font-medium">{linha.clienteNome}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatarCnpj(linha.clienteDocumento)}
                      </p>
                      <p className="line-clamp-1 text-xs text-muted-foreground" title={linha.descricao ?? ""}>
                        {linha.descricao ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell className="tabular-nums">{linha.competencia ?? "Revisar"}</TableCell>
                    <TableCell>{linha.taxRegime ?? "Não informado"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{linha.categoriaRotulo}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[190px]">{linha.responsavelNome ?? "Sem responsável"}</TableCell>
                    <TableCell>{linha.statusPier ?? "—"}</TableCell>
                    <TableCell>{linha.temAnexo ? "Sim" : "Não"}</TableCell>
                    <TableCell>
                      <Badge className={validacao.className}>{validacao.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {linha.jaRespondida ? (
                        <div>
                          <Badge className="bg-success-soft text-success-strong">Já respondida</Badge>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {linha.respostaAutor ?? "Usuário interno"}
                            {linha.respostaEm ? ` · ${dataHora(linha.respostaEm)}` : ""}
                          </p>
                        </div>
                      ) : linha.statusResposta === "NAO_RESPONDIDA" ? (
                        <Badge variant="outline">Sem resposta</Badge>
                      ) : (
                        <Badge variant="secondary">Não verificada</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setDetalhe(linha)}>
                        Ver análise
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={Boolean(detalhe)} onOpenChange={(open) => !open && setDetalhe(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Validação Fiscal · {detalhe?.numero ?? "Solicitação"}</DialogTitle>
            <DialogDescription>
              {detalhe?.clienteNome} · {detalhe?.categoriaRotulo} · {detalhe?.taxRegime ?? "Regime não informado"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <p className="font-medium">Resultado</p>
              <p className="mt-1 text-muted-foreground">
                {detalhe?.resumoValidacao ?? "A solicitação ainda não foi validada pelo checklist fiscal."}
              </p>
            </div>

            {detalhe?.checklist?.length ? (
              <div className="space-y-2">
                <p className="font-medium">Checklist do Manual BPO</p>
                {detalhe.checklist.map((item: any) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-medium">{item.rotulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.arquivoEncontrado ?? (item.obrigatorio ? "Documento obrigatório não localizado" : "Opcional / quando aplicável")}
                      </p>
                    </div>
                    <Badge
                      className={
                        item.presente
                          ? "bg-success-soft text-success-strong"
                          : item.obrigatorio
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground"
                      }
                    >
                      {item.presente ? "Localizado" : item.obrigatorio ? "Faltante" : "Opcional"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              A presença do arquivo não confirma, por si só, a correção tributária. A conclusão fiscal exige conferência do conteúdo, apuração e guia antes da finalização.
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setDetalhe(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
