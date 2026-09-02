import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  executarDeclaracaoSemMovimento,
  prepararDeclaracaoSemMovimento,
} from "@/lib/api/declaracao-sem-movimento.functions";
import { mensagemDeErro } from "@/lib/erros";

type Etapa = "UPLOAD" | "REVISAR" | "RESULTADO";

interface LinhaCandidata {
  cliente: string;
  documento: string | null;
}

function normalizar(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function valorPorAlias(row: Record<string, unknown>, aliases: string[]) {
  for (const [key, value] of Object.entries(row)) {
    const k = normalizar(key);
    if (aliases.some((a) => k === a || k.includes(a))) return value;
  }
  return undefined;
}

function linhasPlanilha(ws: XLSX.WorkSheet) {
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
  if (!matriz.length) return [] as Array<Record<string, unknown>>;
  let headerIndex = matriz.findIndex((linha) => {
    const n = (linha ?? []).map(normalizar);
    return n.includes("empresa") || n.includes("cliente");
  });
  if (headerIndex < 0) headerIndex = 0;
  const headerOriginal = (matriz[headerIndex] ?? []).map((v) => String(v ?? "").trim());
  const maxCols = Math.max(...matriz.map((r) => r.length), headerOriginal.length);
  const headers = Array.from({ length: maxCols }, (_, col) => headerOriginal[col] ?? "");
  return matriz
    .slice(headerIndex + 1)
    .map((values) => {
      const row: Record<string, unknown> = {};
      headers.forEach((header, col) => {
        if (header) row[header] = values?.[col] ?? "";
      });
      return row;
    })
    .filter((row) => Object.values(row).some((v) => String(v ?? "").trim() !== ""));
}

function extrairSemMovimento(ws: XLSX.WorkSheet): LinhaCandidata[] {
  return linhasPlanilha(ws)
    .map((row) => ({
      cliente: String(
        valorPorAlias(row, ["cliente", "razao social", "razao", "empresa"]) ?? "",
      ).trim(),
      documento: String(valorPorAlias(row, ["cnpj", "cpf", "documento"]) ?? "").trim() || null,
      responsavel: String(
        valorPorAlias(row, ["responsavel", "bpo responsavel", "carteira", "bpo"]) ?? "",
      ).trim(),
    }))
    .filter(
      (row) =>
        (row.cliente || row.documento) && normalizar(row.responsavel).includes("sem movimento"),
    )
    .map((row) => ({ cliente: row.cliente || row.documento!, documento: row.documento }));
}

function competenciaAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

export function DeclararSemMovimentoLote({ competenciaInicial }: { competenciaInicial?: string }) {
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("UPLOAD");
  const fileRef = useRef<HTMLInputElement>(null);
  const [arquivoNome, setArquivoNome] = useState("");
  const [candidatas, setCandidatas] = useState<LinhaCandidata[]>([]);
  const [competencia, setCompetencia] = useState(
    competenciaInicial && /^\d{4}-\d{2}$/.test(competenciaInicial)
      ? competenciaInicial
      : competenciaAtual(),
  );
  const [preparo, setPreparo] = useState<Awaited<
    ReturnType<typeof prepararDeclaracaoSemMovimento>
  > | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confirmarExecucao, setConfirmarExecucao] = useState(false);
  const [resultado, setResultado] = useState<Awaited<
    ReturnType<typeof executarDeclaracaoSemMovimento>
  > | null>(null);

  function reiniciar() {
    setEtapa("UPLOAD");
    setArquivoNome("");
    setCandidatas([]);
    setPreparo(null);
    setSelecionadas(new Set());
    setConfirmarExecucao(false);
    setResultado(null);
  }

  async function carregarArquivo(file: File) {
    try {
      const bytes = await file.arrayBuffer();
      const wb = XLSX.read(bytes, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("Planilha sem aba legível.");
      const linhas = extrairSemMovimento(ws);
      setCandidatas(linhas);
      setArquivoNome(file.name);
      if (!linhas.length)
        toast.error('Nenhuma linha com responsável "SEM MOVIMENTO" foi encontrada nesta planilha.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler a planilha.");
    }
  }

  const preparar = useMutation({
    mutationFn: () => prepararDeclaracaoSemMovimento({ data: { linhas: candidatas, competencia } }),
    onSuccess: (dados) => {
      setPreparo(dados);
      setSelecionadas(
        new Set(
          dados.itens.filter((item) => item.encontrado).map((item) => item.solicitacaoExternalId!),
        ),
      );
      setEtapa("REVISAR");
    },
    onError: (error) => toast.error(mensagemDeErro(error)),
  });

  const executar = useMutation({
    mutationFn: () =>
      executarDeclaracaoSemMovimento({
        data: { solicitacoes: [...selecionadas], competencia },
      }),
    onSuccess: (dados) => {
      setConfirmarExecucao(false);
      setResultado(dados);
      setEtapa("RESULTADO");
    },
    onError: (error) => toast.error(mensagemDeErro(error)),
  });

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Declarar sem movimento (planilha)
      </Button>

      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          if (!v) reiniciar();
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>Declarar sem movimento a partir da planilha</DialogTitle>
            <DialogDescription>
              Sobe a planilha de carteira, encontra automaticamente as empresas marcadas "SEM
              MOVIMENTO" e posta a declaração na solicitação de Movimento Financeiro correspondente
              no PIER. Isso não finaliza nada — depois use "Validar em lote" para finalizar.
            </DialogDescription>
          </DialogHeader>

          {etapa === "UPLOAD" ? (
            <div className="space-y-4 p-6">
              <div className="space-y-1.5">
                <Label htmlFor="competencia-sem-movimento">Competência das solicitações</Label>
                <Input
                  id="competencia-sem-movimento"
                  type="month"
                  className="max-w-[180px]"
                  value={competencia}
                  onChange={(e) => setCompetencia(e.target.value)}
                />
              </div>

              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void carregarArquivo(f);
                }}
              />
              <Card className="border-dashed p-5 text-center">
                <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 font-medium">{arquivoNome || "Selecione Excel ou CSV"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {candidatas.length
                    ? `${candidatas.length} empresa(s) marcada(s) "SEM MOVIMENTO" reconhecida(s)`
                    : 'A tela procura sozinha as linhas cujo responsável está marcado "SEM MOVIMENTO".'}
                </p>
                <Button className="mt-4" variant="outline" onClick={() => fileRef.current?.click()}>
                  Escolher arquivo
                </Button>
              </Card>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setAberto(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => preparar.mutate()}
                  disabled={
                    !candidatas.length || !/^\d{4}-\d{2}$/.test(competencia) || preparar.isPending
                  }
                >
                  {preparar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Buscar {candidatas.length || ""} solicitação(ões) no PIER
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {etapa === "REVISAR" && preparo ? (
            <>
              <div className="grid gap-3 border-b px-6 py-4 sm:grid-cols-3">
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Encontradas no PIER</p>
                  <p className="text-2xl font-semibold">{preparo.encontradas}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Não encontradas</p>
                  <p className="text-2xl font-semibold">{preparo.naoEncontradas}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Selecionadas para declarar</p>
                  <p className="text-2xl font-semibold">{selecionadas.size}</p>
                </div>
              </div>

              <ScrollArea className="h-[50vh] px-6">
                <div className="space-y-2 py-4">
                  {preparo.itens.map((item, indice) => {
                    const marcada = item.solicitacaoExternalId
                      ? selecionadas.has(item.solicitacaoExternalId)
                      : false;
                    return (
                      <label
                        key={`${item.documento ?? item.cliente}-${indice}`}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${
                          item.encontrado ? "cursor-pointer hover:bg-muted/30" : "opacity-60"
                        }`}
                      >
                        <Checkbox
                          checked={marcada}
                          disabled={!item.encontrado}
                          onCheckedChange={(checked) => {
                            if (!item.solicitacaoExternalId) return;
                            setSelecionadas((atuais) => {
                              const proximo = new Set(atuais);
                              if (checked) proximo.add(item.solicitacaoExternalId!);
                              else proximo.delete(item.solicitacaoExternalId!);
                              return proximo;
                            });
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{item.cliente}</span>
                            {item.numero ? <Badge variant="outline">{item.numero}</Badge> : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.encontrado
                              ? `Solicitação ${item.solicitacaoExternalId}`
                              : item.motivo}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>

              <DialogFooter className="border-t px-6 py-4">
                <Button variant="ghost" onClick={() => setEtapa("UPLOAD")}>
                  Voltar
                </Button>
                <Button
                  onClick={() => setConfirmarExecucao(true)}
                  disabled={!selecionadas.size || executar.isPending}
                >
                  {executar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Declarar sem movimento — {selecionadas.size}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {etapa === "RESULTADO" && resultado ? (
            <>
              <div className="grid gap-3 px-6 py-4 sm:grid-cols-4">
                <div className="rounded-md bg-success-soft p-3">
                  <p className="text-xs text-success-strong">Declaradas agora</p>
                  <p className="text-2xl font-semibold text-success-strong">
                    {resultado.resumo.declaradas}
                  </p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Já tinham declaração</p>
                  <p className="text-2xl font-semibold">{resultado.resumo.jaDeclaradas}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Já finalizadas</p>
                  <p className="text-2xl font-semibold">{resultado.resumo.jaFinalizadas}</p>
                </div>
                <div className="rounded-md bg-destructive/10 p-3">
                  <p className="text-xs text-destructive">Erros</p>
                  <p className="text-2xl font-semibold text-destructive">
                    {resultado.resumo.erros}
                  </p>
                </div>
              </div>

              <p className="mx-6 mb-2 rounded-md bg-primary/5 p-3 text-sm">
                Agora use <strong>"Validar em lote"</strong> (filtrando por Movimento Financeiro
                Mensal e esta competência) para finalizar essas solicitações — a evidência já foi
                registrada no PIER.
              </p>

              <ScrollArea className="h-[42vh] px-6">
                <div className="space-y-2 py-3">
                  {resultado.resultados.map((item) => (
                    <div
                      key={item.solicitacaoExternalId}
                      className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{item.solicitacaoExternalId}</p>
                        <p className="text-xs text-muted-foreground">{item.erro ?? ""}</p>
                      </div>
                      <Badge
                        className={
                          item.status === "ERRO"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-success-soft text-success-strong"
                        }
                      >
                        {item.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <DialogFooter className="border-t px-6 py-4">
                <span className="mr-auto text-xs text-muted-foreground">
                  Lote {resultado.loteId}
                </span>
                <Button onClick={() => setAberto(false)}>Concluir</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmarExecucao} onOpenChange={setConfirmarExecucao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Postar declaração no PIER?</DialogTitle>
            <DialogDescription>
              {selecionadas.size} solicitação(ões) receberão uma postagem privada informando que a
              empresa está sem movimento na competência {competencia}, com base na planilha
              importada. Isso publica de verdade no PIER; a finalização continua sendo feita
              separadamente em "Validar em lote".
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmarExecucao(false)}
              disabled={executar.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={() => executar.mutate()} disabled={executar.isPending}>
              {executar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Confirmar e postar {selecionadas.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
