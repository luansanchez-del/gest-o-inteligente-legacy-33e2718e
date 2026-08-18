import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  BrainCircuit,
  BriefcaseBusiness,
  FileSpreadsheet,
  RefreshCw,
  Scale,
  Sparkles,
  UserPlus,
  Users,
  WalletCards,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  atribuirClienteCarteira,
  importarCarteiraInteligente,
  listarCarteiraInteligente,
  salvarPerfilBpo,
  sugerirDistribuicaoCarteira,
  sincronizarPerfisBpoPier,
} from "@/lib/api/carteira-inteligente.functions";
import { mensagemDeErro } from "@/lib/erros";

export const Route = createFileRoute("/_authenticated/carteira-inteligente")({
  component: CarteiraInteligentePage,
  head: () => ({
    meta: [
      { title: "Carteira Inteligente | Gestão Inteligente" },
      {
        name: "description",
        content:
          "Distribuição gerencial de clientes, capacidade dos BPOs, honorários e sugestões profissionais integradas ao PIER.",
      },
    ],
  }),
});

type Filtro = "TODOS" | "SEM_CARTEIRA" | "DIVERGENCIA";

function moeda(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

function normalizarCabecalho(v: unknown) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function valorPorAlias(row: Record<string, unknown>, aliases: string[]) {
  for (const [key, value] of Object.entries(row)) {
    const k = normalizarCabecalho(key);
    if (aliases.some((a) => k === a || k.includes(a))) return value;
  }
  return undefined;
}

function temCabecalho(row: Record<string, unknown>, aliases: string[]) {
  return Object.keys(row).some((key) => {
    const k = normalizarCabecalho(key);
    return aliases.some((a) => k === a || k.includes(a));
  });
}

function canonizarLinha(row: Record<string, unknown>) {
  const responsavel = valorPorAlias(row, [
    "responsavel",
    "bpo responsavel",
    "carteira",
    "contador",
    "bpo",
  ]);
  const honorarioGenerico = valorPorAlias(row, [
    "honorario",
    "honorarios",
    "fee",
    "mensalidade",
  ]);
  const valorBpoExplicito = valorPorAlias(row, [
    "valor bpo",
    "repasse bpo",
    "custo bpo",
    "pagamento bpo",
    "repasse",
  ]);
  const layoutCarteiraBpo = temCabecalho(row, ["bpo"]);

  return {
    cliente: valorPorAlias(row, [
      "cliente",
      "razao social",
      "razao",
      "empresa",
      "nome cliente",
    ]),
    cnpj: valorPorAlias(row, ["cnpj", "cpf", "documento"]),
    responsavel,
    regime: valorPorAlias(row, ["regime", "tributacao", "regime tributario"]),
    segmento: valorPorAlias(row, ["segmento", "atividade", "ramo"]),
    honorario:
      layoutCarteiraBpo && valorBpoExplicito === undefined
        ? undefined
        : honorarioGenerico,
    valorBpo:
      valorBpoExplicito ?? (layoutCarteiraBpo ? honorarioGenerico : undefined),
    peso: valorPorAlias(row, ["peso", "complexidade", "pontos", "carga"]),
    observacao: valorPorAlias(row, ["observacao", "obs", "comentario", "nota"]),
  };
}

function linhasPlanilha(ws: XLSX.WorkSheet) {
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    raw: true,
  });
  if (!matriz.length) return [] as Array<Record<string, unknown>>;

  let headerIndex = matriz.findIndex((linha) => {
    const normalizados = (linha ?? []).map(normalizarCabecalho);
    return normalizados.includes("empresa") || normalizados.includes("cliente");
  });
  if (headerIndex < 0) headerIndex = 0;

  const headerOriginal = (matriz[headerIndex] ?? []).map((v) => String(v ?? "").trim());
  const maxCols = Math.max(...matriz.map((r) => r.length), headerOriginal.length);
  const headers = Array.from({ length: maxCols }, (_, col) => headerOriginal[col] ?? "");

  for (let col = 0; col < maxCols; col++) {
    if (headers[col]) continue;
    for (let row = 0; row < headerIndex; row++) {
      if (normalizarCabecalho(matriz[row]?.[col]) === "bpo") {
        headers[col] = "BPO";
        break;
      }
    }
  }

  return matriz
    .slice(headerIndex + 1)
    .map((values) => {
      const row: Record<string, unknown> = {};
      headers.forEach((header, col) => {
        if (!header) return;
        row[header] = values?.[col] ?? "";
      });
      return row;
    })
    .filter((row) => Object.values(row).some((v) => String(v ?? "").trim() !== ""));
}

function separar(v: string) {
  return v
    .split(/[;,|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function CarteiraInteligentePage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [busca, setBusca] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [linhasImportacao, setLinhasImportacao] = useState<Array<Record<string, unknown>>>([]);
  const [arquivoNome, setArquivoNome] = useState("");
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [clienteSugestao, setClienteSugestao] = useState<string | null>(null);
  const [perfil, setPerfil] = useState({
    nome: "",
    email: "",
    senioridade: "",
    capacidade: "60",
    regimes: "",
    segmentos: "",
    sistemas: "",
    competencias: "",
    curriculo: "",
  });

  const consulta = useQuery({
    queryKey: ["carteira-inteligente"],
    queryFn: () => listarCarteiraInteligente(),
  });

  const importar = useMutation({
    mutationFn: () =>
      importarCarteiraInteligente({ data: { rows: linhasImportacao } }),
    onSuccess: (r) => {
      toast.success(`${r.importadas} clientes importados para a Carteira Inteligente.`);
      if (r.falhas.length)
        toast.warning(`${r.falhas.length} linha(s) não foram importadas.`);
      setImportOpen(false);
      setLinhasImportacao([]);
      setArquivoNome("");
      void qc.invalidateQueries({ queryKey: ["carteira-inteligente"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const perfisPier = useMutation({
    mutationFn: () => sincronizarPerfisBpoPier(),
    onSuccess: (r) => {
      toast.success(
        `${r.total} profissionais ativos do PIER disponíveis para perfil de carteira.`,
      );
      void qc.invalidateQueries({ queryKey: ["carteira-inteligente"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const salvarPerfil = useMutation({
    mutationFn: () =>
      salvarPerfilBpo({
        data: {
          nome: perfil.nome,
          email: perfil.email || null,
          senioridade: perfil.senioridade || null,
          capacidade: Number(perfil.capacidade || 60),
          regimes: separar(perfil.regimes),
          segmentos: separar(perfil.segmentos),
          sistemas: separar(perfil.sistemas),
          competencias: separar(perfil.competencias),
          curriculoTexto: perfil.curriculo || null,
        },
      }),
    onSuccess: () => {
      toast.success("Perfil profissional salvo.");
      setPerfilOpen(false);
      setPerfil({
        nome: "",
        email: "",
        senioridade: "",
        capacidade: "60",
        regimes: "",
        segmentos: "",
        sistemas: "",
        competencias: "",
        curriculo: "",
      });
      void qc.invalidateQueries({ queryKey: ["carteira-inteligente"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const sugestao = useQuery({
    queryKey: ["sugestao-carteira", clienteSugestao],
    queryFn: () =>
      sugerirDistribuicaoCarteira({ data: { clientKey: clienteSugestao! } }),
    enabled: Boolean(clienteSugestao),
    staleTime: 0,
  });

  const atribuir = useMutation({
    mutationFn: (profileId: string) =>
      atribuirClienteCarteira({
        data: { clientKey: clienteSugestao!, profileId },
      }),
    onSuccess: () => {
      toast.success("Responsável definido na Carteira Inteligente. O PIER não foi alterado.");
      setClienteSugestao(null);
      void qc.invalidateQueries({ queryKey: ["carteira-inteligente"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const dados = consulta.data;
  const linhas = useMemo(() => {
    let xs = dados?.linhas ?? [];
    if (filtro === "SEM_CARTEIRA") xs = xs.filter((x) => x.semCarteira);
    if (filtro === "DIVERGENCIA") xs = xs.filter((x) => x.divergencia);
    const q = busca.trim().toLowerCase();
    if (q) {
      xs = xs.filter((x) =>
        `${x.nome} ${x.documento ?? ""} ${x.responsavelPier ?? ""} ${
          x.responsavelCarteira ?? ""
        }`
          .toLowerCase()
          .includes(q),
      );
    }
    return xs;
  }, [dados?.linhas, filtro, busca]);

  async function carregarArquivo(file: File) {
    try {
      const bytes = await file.arrayBuffer();
      const wb = XLSX.read(bytes, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("Planilha sem aba legível.");
      const raw = linhasPlanilha(ws);
      const canonicas = raw.map(canonizarLinha).filter((r) => r.cliente || r.cnpj);
      setLinhasImportacao(canonicas);
      setArquivoNome(file.name);
      if (!canonicas.length)
        toast.error("Não encontrei colunas de cliente/CNPJ na primeira aba.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler a planilha.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Carteira Inteligente"
        descricao="Cruza carteira oficial, PIER, capacidade profissional, honorários e perfil técnico para apoiar a distribuição dos clientes."
        acoes={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => perfisPier.mutate()}
              disabled={perfisPier.isPending}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${perfisPier.isPending ? "animate-spin" : ""}`}
              />
              Trazer equipe PIER
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Importar carteira/honorários
            </Button>
          </div>
        }
      />

      <Card className="border-primary/25 bg-primary/5 p-4 text-sm">
        <strong>PIER + Carteira oficial:</strong> a Carteira Inteligente já compara,
        sugere e permite aprovar o responsável gerencial. A escrita do responsável
        diretamente no PIER permanece bloqueada até validarmos o endpoint oficial de
        alteração da carteira do cliente.
      </Card>

      {consulta.isError ? (
        <ErroConsulta error={consulta.error} onRetry={() => void consulta.refetch()} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Resumo titulo="Clientes" valor={dados?.resumo.clientes ?? 0} icon={BriefcaseBusiness} />
        <Resumo
          titulo="Sem carteira"
          valor={dados?.resumo.semCarteira ?? 0}
          icon={AlertTriangle}
          destaque
        />
        <Resumo
          titulo="Divergências PIER"
          valor={dados?.resumo.divergenciasPier ?? 0}
          icon={Scale}
        />
        <Resumo titulo="Honorários" texto={moeda(dados?.resumo.honorarios)} icon={WalletCards} />
        <Resumo titulo="Valor BPO" texto={moeda(dados?.resumo.valorBpo)} icon={Users} />
        <Resumo
          titulo="Margem carteira"
          texto={moeda(dados?.resumo.margemBrutaCarteira)}
          icon={Sparkles}
        />
      </div>

      <Tabs defaultValue="distribuicao" className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="distribuicao">Distribuição de clientes</TabsTrigger>
          <TabsTrigger value="bpo">Perfis BPO / Currículos</TabsTrigger>
          <TabsTrigger value="capacidade">Capacidade e rentabilidade</TabsTrigger>
        </TabsList>

        <TabsContent value="distribuicao" className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cliente, CNPJ ou responsável"
                className="md:max-w-md"
              />
              <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
                <SelectTrigger className="md:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos os clientes</SelectItem>
                  <SelectItem value="SEM_CARTEIRA">Somente sem carteira</SelectItem>
                  <SelectItem value="DIVERGENCIA">PIER x carteira divergente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          <Card className="overflow-hidden">
            {consulta.isLoading ? (
              <div className="p-8 text-sm text-muted-foreground">
                Carregando Carteira Inteligente…
              </div>
            ) : !linhas.length ? (
              <EstadoVazio
                titulo="Nenhum cliente neste filtro."
                descricao="Sincronize o PIER ou importe sua planilha de carteira."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Regime / segmento</TableHead>
                    <TableHead>Responsável PIER</TableHead>
                    <TableHead>Carteira oficial</TableHead>
                    <TableHead>Peso</TableHead>
                    <TableHead>Honorário</TableHead>
                    <TableHead>Valor BPO</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow key={l.clientKey}>
                      <TableCell>
                        <p className="font-medium">{l.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.documento ?? "Sem documento"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p>{l.regime ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.segmento ?? "Segmento não informado"}
                        </p>
                      </TableCell>
                      <TableCell>
                        {l.responsavelPier ?? (
                          <span className="text-muted-foreground">Sem responsável</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {l.responsavelCarteira ? (
                          <span>{l.responsavelCarteira}</span>
                        ) : (
                          <Badge variant="secondary">Sem carteira</Badge>
                        )}
                        {l.divergencia ? (
                          <p className="mt-1 text-xs text-warning-strong">Diverge do PIER</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">{l.peso}</TableCell>
                      <TableCell>{moeda(l.honorario)}</TableCell>
                      <TableCell>{moeda(l.valorBpo)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setClienteSugestao(l.clientKey)}
                        >
                          <BrainCircuit className="mr-2 h-4 w-4" />
                          Sugerir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="bpo" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setPerfilOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Novo perfil profissional
            </Button>
          </div>
          <Card className="overflow-hidden">
            {!dados?.perfis.length ? (
              <EstadoVazio
                titulo="Nenhum perfil BPO configurado."
                descricao="Use “Trazer equipe PIER” e depois complemente o currículo e as competências profissionais."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Senioridade</TableHead>
                    <TableHead>Clientes</TableHead>
                    <TableHead>Carga</TableHead>
                    <TableHead>Regimes</TableHead>
                    <TableHead>Segmentos</TableHead>
                    <TableHead>Valor BPO carteira</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.perfis.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium">{p.nome}</p>
                        <p className="text-xs text-muted-foreground">{p.email ?? "—"}</p>
                      </TableCell>
                      <TableCell>{p.senioridade ?? "A definir"}</TableCell>
                      <TableCell>{p.clientes}</TableCell>
                      <TableCell>
                        <strong
                          className={
                            p.utilizacao > 100
                              ? "text-destructive"
                              : p.utilizacao > 85
                                ? "text-warning-strong"
                                : ""
                          }
                        >
                          {p.utilizacao}%
                        </strong>
                        <p className="text-xs text-muted-foreground">
                          {p.pontosUsados}/{p.capacidade} pts
                        </p>
                      </TableCell>
                      <TableCell className="max-w-52 text-xs">
                        {p.regimes.length ? p.regimes.join(" · ") : "Não informado"}
                      </TableCell>
                      <TableCell className="max-w-52 text-xs">
                        {p.segmentos.length ? p.segmentos.join(" · ") : "Não informado"}
                      </TableCell>
                      <TableCell>{moeda(p.valorBpo)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="capacidade" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(dados?.perfis ?? []).map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{p.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.clientes} clientes · {p.pontosUsados}/{p.capacidade} pontos
                    </p>
                  </div>
                  <Badge variant={p.utilizacao > 100 ? "destructive" : "secondary"}>
                    {p.utilizacao}%
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Honorários sob gestão</p>
                    <p className="font-medium">{moeda(p.honorarios)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valor BPO</p>
                    <p className="font-medium">{moeda(p.valorBpo)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar carteira e honorários</DialogTitle>
            <DialogDescription>
              A primeira aba pode conter Cliente/Razão Social, CNPJ, Responsável, Regime,
              Segmento, Honorário, Valor BPO, Peso/Complexidade e Observação. Também reconhece
              relatórios com título acima da tabela e o layout Empresa + Regime + Honorarios +
              BPO; nesse caso “Honorarios” é tratado como valor pago ao BPO.
            </DialogDescription>
          </DialogHeader>
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
              {linhasImportacao.length
                ? `${linhasImportacao.length} cliente(s) reconhecido(s)`
                : "A importação cruza CNPJ/nome com o catálogo do PIER."}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              Escolher arquivo
            </Button>
          </Card>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => importar.mutate()}
              disabled={!linhasImportacao.length || importar.isPending}
            >
              {importar.isPending
                ? "Importando…"
                : `Importar ${linhasImportacao.length || ""} clientes`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={perfilOpen} onOpenChange={setPerfilOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Perfil profissional BPO</DialogTitle>
            <DialogDescription>
              Use somente informações profissionais relevantes para a distribuição. O sistema
              não pontua idade, gênero, raça, religião, saúde, estado civil ou outros atributos
              pessoais.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo
              label="Nome"
              value={perfil.nome}
              onChange={(v) => setPerfil((p) => ({ ...p, nome: v }))}
            />
            <Campo
              label="E-mail"
              value={perfil.email}
              onChange={(v) => setPerfil((p) => ({ ...p, email: v }))}
            />
            <Campo
              label="Senioridade"
              placeholder="Ex.: Pleno, Sênior, Especialista"
              value={perfil.senioridade}
              onChange={(v) => setPerfil((p) => ({ ...p, senioridade: v }))}
            />
            <Campo
              label="Capacidade em pontos"
              value={perfil.capacidade}
              onChange={(v) => setPerfil((p) => ({ ...p, capacidade: v }))}
            />
            <Campo
              label="Regimes tributários"
              placeholder="Lucro Real; Presumido; Simples"
              value={perfil.regimes}
              onChange={(v) => setPerfil((p) => ({ ...p, regimes: v }))}
            />
            <Campo
              label="Segmentos"
              placeholder="Indústria; Serviços; Comércio"
              value={perfil.segmentos}
              onChange={(v) => setPerfil((p) => ({ ...p, segmentos: v }))}
            />
            <Campo
              label="Sistemas"
              placeholder="Questor; Domínio; SAP"
              value={perfil.sistemas}
              onChange={(v) => setPerfil((p) => ({ ...p, sistemas: v }))}
            />
            <Campo
              label="Competências"
              placeholder="Fechamento; ECD; ECF; Conciliação"
              value={perfil.competencias}
              onChange={(v) => setPerfil((p) => ({ ...p, competencias: v }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Currículo / histórico profissional</Label>
            <Textarea
              rows={8}
              value={perfil.curriculo}
              onChange={(e) => setPerfil((p) => ({ ...p, curriculo: e.target.value }))}
              placeholder="Cole o conteúdo profissional do currículo."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPerfilOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => salvarPerfil.mutate()}
              disabled={!perfil.nome.trim() || salvarPerfil.isPending}
            >
              {salvarPerfil.isPending ? "Salvando…" : "Salvar perfil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(clienteSugestao)}
        onOpenChange={(o) => !o && setClienteSugestao(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Sugestão de distribuição</DialogTitle>
            <DialogDescription>
              {sugestao.data?.cliente.nome ?? "Analisando cliente…"}
            </DialogDescription>
          </DialogHeader>
          {sugestao.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Calculando aderência profissional e capacidade…
            </div>
          ) : sugestao.isError ? (
            <ErroConsulta error={sugestao.error} onRetry={() => void sugestao.refetch()} />
          ) : sugestao.data ? (
            <div className="space-y-3">
              <Card className="bg-muted/40 p-3 text-xs text-muted-foreground">
                {sugestao.data.criterio}
              </Card>
              {!sugestao.data.candidatos.length ? (
                <EstadoVazio
                  titulo="Sem perfis profissionais para comparar."
                  descricao="Traga a equipe do PIER e complete os perfis BPO."
                />
              ) : (
                sugestao.data.candidatos.map((c, idx) => (
                  <Card key={c.profileId} className="p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-muted-foreground">#{idx + 1}</span>
                          <p className="font-semibold">{c.nome}</p>
                          <Badge variant="secondary">Aderência {c.aderencia}%</Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {c.motivos.join(" · ")}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Carga atual {c.utilizacaoAtual}% · {c.clientesAtuais} clientes ·{" "}
                          {c.pontosAtuais}/{c.capacidade} pontos
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                        <Button
                          size="sm"
                          onClick={() => atribuir.mutate(c.profileId)}
                          disabled={atribuir.isPending}
                        >
                          Definir carteira
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled
                          title="Aguardando endpoint PIER validado para alterar o responsável da carteira do cliente."
                        >
                          Atribuir carteira no PIER
                        </Button>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      A atribuição no PIER será habilitada somente após validar o endpoint oficial;
                      nenhuma chamada de escrita é simulada ou inventada.
                    </p>
                  </Card>
                ))
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Resumo({
  titulo,
  valor,
  texto,
  icon: Icon,
  destaque,
}: {
  titulo: string;
  valor?: number;
  texto?: string;
  icon: typeof Users;
  destaque?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p
        className={`mt-2 text-2xl font-semibold ${
          destaque && valor ? "text-warning-strong" : ""
        }`}
      >
        {texto ?? valor ?? "—"}
      </p>
    </Card>
  );
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
