import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileUp,
  Info,
  PlayCircle,
  RotateCcw,
  ShieldAlert,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { CarregandoTabela, ErroConsulta, EstadoVazio } from "@/components/common/EstadoConsulta";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  detalharSolicitacao,
  enviarAnexo,
  executarValidacao,
  obterResultadoValidacao,
  registrarDecisao,
} from "@/lib/api/validacao.functions";
import { formatarCnpj } from "@/lib/formato";
import { mensagemDeErro } from "@/lib/erros";

export const Route = createFileRoute("/_authenticated/gestao/solicitacoes/$externalId")({
  head: () => ({
    meta: [
      { title: "Análise da solicitação | Gestão Inteligente" },
      {
        name: "description",
        content:
          "Instrução efetiva, documentos recebidos, validação do balancete e decisão registrada da solicitação de fechamento contábil.",
      },
      { property: "og:title", content: "Análise da solicitação | Gestão Inteligente" },
      {
        property: "og:description",
        content: "Motor de validação de balancete com evidências e trilha de auditoria.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SolicitacaoPage,
});

const TODAS = "__TODAS__";

const SEVERIDADES: Record<string, { rotulo: string; classe: string }> = {
  BLOCKER: { rotulo: "Impedimento", classe: "bg-destructive/10 text-destructive" },
  ERROR: { rotulo: "Erro", classe: "bg-destructive/10 text-destructive" },
  WARNING: { rotulo: "Alerta", classe: "bg-warning-soft text-warning-strong" },
  INFO: { rotulo: "Informação", classe: "bg-muted text-muted-foreground" },
};

const RESULTADOS: Record<string, { rotulo: string; classe: string }> = {
  APROVADO: { rotulo: "Aprovado", classe: "bg-success-soft text-success-strong" },
  COM_ALERTAS: { rotulo: "Com alertas", classe: "bg-warning-soft text-warning-strong" },
  REVISAO_HUMANA: { rotulo: "Revisão humana", classe: "bg-warning-soft text-warning-strong" },
  REPROVADO: { rotulo: "Reprovado", classe: "bg-destructive/10 text-destructive" },
};

function moeda(valor: unknown) {
  return typeof valor === "number"
    ? valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";
}

function dataHora(valor?: string | null) {
  return valor ? new Date(valor).toLocaleString("pt-BR") : "—";
}

async function arquivoParaBase64(arquivo: File) {
  const buffer = new Uint8Array(await arquivo.arrayBuffer());
  let binario = "";
  for (let i = 0; i < buffer.length; i += 8192)
    binario += String.fromCharCode(...buffer.subarray(i, i + 8192));
  return btoa(binario);
}

function SolicitacaoPage() {
  const { externalId: id } = Route.useParams();
  const queryClient = useQueryClient();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [severidade, setSeveridade] = useState(TODAS);
  const [busca, setBusca] = useState("");
  const [notas, setNotas] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  const detalhe = useQuery({
    queryKey: ["solicitacao", id],
    queryFn: () => detalharSolicitacao({ data: { solicitacaoExternalId: id } }),
  });

  const dados = detalhe.data;
  const ultimaExecucao = dados?.execucoes?.[0] ?? null;

  const resultado = useQuery({
    queryKey: ["validacao", ultimaExecucao?.id],
    queryFn: () => obterResultadoValidacao({ data: { execucaoId: ultimaExecucao!.id } }),
    enabled: Boolean(ultimaExecucao?.id),
  });

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ["solicitacao", id] });
    void queryClient.invalidateQueries({ queryKey: ["validacao"] });
  }

  const upload = useMutation({
    mutationFn: async (arquivo: File) => {
      const conteudoBase64 = await arquivoParaBase64(arquivo);
      const anexo = await enviarAnexo({
        data: {
          solicitacaoExternalId: id,
          filename: arquivo.name,
          mimeType: arquivo.type || "application/pdf",
          conteudoBase64,
        },
      });
      return executarValidacao({
        data: { solicitacaoExternalId: id, anexoId: anexo.anexoId },
      });
    },
    onSuccess: (r) => {
      toast.success(
        r.reaproveitada
          ? "Documento já analisado — resultado reaproveitado."
          : "Documento analisado.",
      );
      invalidar();
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const reprocessar = useMutation({
    mutationFn: (anexoId: string) =>
      executarValidacao({
        data: { solicitacaoExternalId: id, anexoId, reprocessar: true },
      }),
    onSuccess: () => {
      toast.success("Análise reprocessada.");
      invalidar();
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const decidir = useMutation({
    mutationFn: (decisao: "APPROVED" | "RETURNED" | "NEEDS_REVIEW") =>
      registrarDecisao({
        data: {
          solicitacaoExternalId: id,
          execucaoId: ultimaExecucao?.id ?? null,
          decisao,
          notas: notas.trim() || null,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Decisão registrada. ${r.avisoPier}`);
      setNotas("");
      invalidar();
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const achados = useMemo(() => {
    const lista = resultado.data?.achados ?? [];
    const termo = busca.trim().toLowerCase();
    return lista.filter((a) => {
      if (severidade !== TODAS && a.severidade !== severidade) return false;
      if (!termo) return true;
      return [a.titulo, a.detalhe, a.contaNome, a.contaCodigo, a.codigo]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo));
    });
  }, [resultado.data, severidade, busca]);

  const totais = (resultado.data?.totais ?? {}) as Record<string, unknown>;
  const documento = (totais["documento"] ?? {}) as Record<string, unknown>;
  const instrucao = dados?.instrucaoEfetiva ?? null;

  const estadoAnalise = !ultimaExecucao
    ? { rotulo: "Documento não carregado", classe: "bg-muted text-muted-foreground" }
    : ultimaExecucao.status === "COMPLETED"
      ? { rotulo: "Análise concluída", classe: "bg-success-soft text-success-strong" }
      : ultimaExecucao.status === "FAILED"
        ? { rotulo: "Falha na análise", classe: "bg-destructive/10 text-destructive" }
        : { rotulo: "Analisando", classe: "bg-warning-soft text-warning-strong" };

  if (detalhe.isLoading) return <CarregandoTabela linhas={8} />;
  if (detalhe.isError)
    return <ErroConsulta error={detalhe.error} onRetry={() => void detalhe.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={dados?.solicitacao.clienteNome ?? "Solicitação"}
        descricao={`${dados?.solicitacao.tipoNome ?? "Fechamento"} · Solicitação ${dados?.solicitacao.numero ?? dados?.solicitacao.externalId} · ${formatarCnpj(dados?.solicitacao.documento ?? null)}`}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/gestao">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar à gestão
              </Link>
            </Button>
            <input
              ref={inputArquivo}
              type="file"
              accept="application/pdf"
              className="hidden"
              aria-label="Selecionar balancete em PDF"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) upload.mutate(arquivo);
                e.target.value = "";
              }}
            />
            <Button onClick={() => inputArquivo.current?.click()} disabled={upload.isPending}>
              <FileUp className={`mr-2 h-4 w-4 ${upload.isPending ? "animate-pulse" : ""}`} />
              {upload.isPending ? "Analisando…" : "Enviar balancete (PDF)"}
            </Button>
          </div>
        }
      />

      <Card className="border-warning/40 bg-warning-soft p-3 text-sm text-warning-strong">
        <ShieldAlert className="mr-2 inline h-4 w-4" />
        {dados?.avisoPier ?? "PIER não alterado — decisão interna."}
      </Card>

      <Card className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={estadoAnalise.classe}>{estadoAnalise.rotulo}</Badge>
          <span className="text-sm text-muted-foreground">
            Status PIER: {dados?.solicitacao.status ?? "—"} · Responsável:{" "}
            {dados?.solicitacao.responsavelNome ?? "—"}
          </span>
        </div>
        {!dados?.anexos.length && dados?.solicitacao.possuiAnexo ? (
          <p className="text-sm text-warning-strong">
            Anexo identificado no PIER, mas conteúdo ainda não importado. Envie o PDF do balancete
            manualmente para analisar no piloto.
          </p>
        ) : null}
        {!dados?.anexos.length && !dados?.solicitacao.possuiAnexo ? (
          <p className="text-sm text-muted-foreground">
            Nenhum documento vinculado a esta solicitação. Envie o PDF do balancete para iniciar a
            análise.
          </p>
        ) : null}
      </Card>


      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Instrução da solicitação</p>
            {instrucao ? (
              <Badge variant="secondary">
                {instrucao.origem === "POST" ? "Postagem mais recente" : "Título"}
              </Badge>
            ) : null}
          </div>
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">Título: {dados?.solicitacao.descricao ?? "—"}</p>
            <p>
              Instrução efetiva:{" "}
              <span className="font-medium">{instrucao?.texto ?? "sem instrução registrada"}</span>
            </p>
            <p className="text-muted-foreground">
              Período interpretado:{" "}
              {instrucao?.interpretado.inicio
                ? `${instrucao.interpretado.inicio} a ${instrucao.interpretado.fim}`
                : "indefinido"}{" "}
              · Competência da solicitação: {dados?.solicitacao.competencia ?? "—"}
            </p>
          </div>
          {dados?.instrucoes.length ? (
            <>
              <Separator />
              <ul className="space-y-2 text-xs text-muted-foreground">
                {dados.instrucoes.slice(0, 5).map((i, indice) => (
                  <li key={`${i.origem}-${i.origemExternalId ?? indice}`}>
                    <span className="font-medium text-foreground">
                      {i.origem === "TITLE" ? "Título" : "Postagem"}
                    </span>{" "}
                    · {dataHora(i.ocorridoEm)} — {i.texto.slice(0, 220)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>

        <Card className="space-y-2 p-4">
          <p className="text-sm font-medium">Resultado da análise</p>
          {ultimaExecucao ? (
            <>
              <Badge
                className={RESULTADOS[String(resultado.data?.resultado ?? "")]?.classe ?? "bg-muted"}
              >
                {RESULTADOS[String(resultado.data?.resultado ?? "")]?.rotulo ??
                  (ultimaExecucao.status === "FAILED" ? "Falha na análise" : "Em processamento")}
              </Badge>
              <p className="text-sm text-muted-foreground">
                {resultado.data?.resumo ?? ultimaExecucao.erro ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Versão {ultimaExecucao.versao} · {dataHora(ultimaExecucao.finalizadaEm)}
              </p>
              {ultimaExecucao.anexoId ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reprocessar.mutate(ultimaExecucao.anexoId!)}
                  disabled={reprocessar.isPending}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reprocessar
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum documento analisado ainda. Envie o balancete em PDF.
            </p>
          )}
        </Card>
      </div>

      {resultado.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { rotulo: "Ativo", valor: totais["ativo"] },
            { rotulo: "Passivo + PL", valor: totais["passivoPl"] },
            { rotulo: "Receitas", valor: totais["receitas"] },
            { rotulo: "Despesas", valor: totais["despesas"] },
            { rotulo: "Resultado", valor: totais["resultado"] },
          ].map((item) => (
            <Card key={item.rotulo} className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.rotulo}</p>
              <p className="text-lg font-semibold tabular-nums">{moeda(item.valor)}</p>
            </Card>
          ))}
          <Card className="p-4 sm:col-span-2 xl:col-span-5">
            <p className="text-xs text-muted-foreground">
              Débitos {moeda(totais["totalDebitos"])} · Créditos {moeda(totais["totalCreditos"])} ·
              Diferença da equação {moeda(totais["diferencaEquacao"])} ·{" "}
              {String(documento["contas"] ?? 0)} contas em {String(documento["paginas"] ?? 0)}{" "}
              página(s). {String(totais["metodoTotais"] ?? "")}
            </p>
          </Card>
        </div>
      ) : null}

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 sm:w-56">
            <Label>Severidade</Label>
            <Select value={severidade} onValueChange={setSeveridade}>
              <SelectTrigger aria-label="Filtrar por severidade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas as severidades</SelectItem>
                {Object.entries(SEVERIDADES).map(([chave, v]) => (
                  <SelectItem key={chave} value={chave}>
                    {v.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label htmlFor="busca-achado">Buscar conta ou achado</Label>
            <Input
              id="busca-achado"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex.: caixa, investimento, 1.1.1"
            />
          </div>
        </div>

        {!ultimaExecucao ? (
          <EstadoVazio
            titulo="Sem análise nesta solicitação."
            descricao="Envie o balancete em PDF para gerar os achados com evidência."
          />
        ) : achados.length === 0 ? (
          <EstadoVazio titulo="Nenhum achado com os filtros atuais." />
        ) : (
          <ul className="space-y-2">
            {achados.map((a) => {
              const estilo = SEVERIDADES[a.severidade] ?? SEVERIDADES["INFO"]!;
              const aberto = expandido === a.id;
              return (
                <li key={a.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={estilo.classe}>{estilo.rotulo}</Badge>
                        <span className="text-sm font-medium">{a.titulo}</span>
                        {a.exigeHumano ? (
                          <span className="text-xs text-muted-foreground">
                            julgamento contábil — exige revisão
                          </span>
                        ) : null}
                      </div>
                      {a.detalhe ? (
                        <p className="text-sm text-muted-foreground">{a.detalhe}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {a.contaCodigo ? `Conta ${a.contaCodigo} · ` : ""}
                        {a.pagina ? `Página ${a.pagina} · ` : ""}
                        {a.codigo}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandido(aberto ? null : a.id)}
                    >
                      {aberto ? "Ocultar evidência" : "Ver evidência"}
                    </Button>
                  </div>
                  {aberto ? (
                    <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(a.evidencia, null, 2)}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <p className="text-sm font-medium">Decisão</p>
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas da decisão (opcional)"
            aria-label="Notas da decisão"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => decidir.mutate("APPROVED")}
              disabled={decidir.isPending || resultado.data?.resultado === "REPROVADO"}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Aprovar
            </Button>
            <Button
              variant="outline"
              onClick={() => decidir.mutate("RETURNED")}
              disabled={decidir.isPending}
            >
              <Undo2 className="mr-2 h-4 w-4" />
              Devolver ao cliente
            </Button>
            <Button
              variant="outline"
              onClick={() => decidir.mutate("NEEDS_REVIEW")}
              disabled={decidir.isPending}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Enviar para revisão
            </Button>
          </div>
          {resultado.data?.resultado === "REPROVADO" ? (
            <p className="text-xs text-destructive">
              Há impedimentos objetivos: aprovação bloqueada até o documento ser corrigido.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            <Info className="mr-1 inline h-3 w-3" />
            {dados?.avisoPier}
          </p>
        </Card>

        <Card className="space-y-3 p-4">
          <p className="text-sm font-medium">Documentos e histórico</p>
          <ul className="space-y-2 text-sm">
            {dados?.anexos.length ? (
              dados.anexos.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {a.nome}{" "}
                    <span className="text-xs text-muted-foreground">
                      · {dataHora(a.enviadoEm)} · {a.status}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => reprocessar.mutate(a.id)}
                    disabled={reprocessar.isPending}
                  >
                    <PlayCircle className="mr-2 h-4 w-4" />
                    Analisar
                  </Button>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">Nenhum documento enviado.</li>
            )}
          </ul>
          <Separator />
          <ul className="space-y-1 text-xs text-muted-foreground">
            {dados?.auditoria.length ? (
              dados.auditoria.slice(0, 12).map((a) => (
                <li key={a.id}>
                  {dataHora(a.em)} — {a.acao} ({a.entidade})
                </li>
              ))
            ) : (
              <li>Sem eventos registrados.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
