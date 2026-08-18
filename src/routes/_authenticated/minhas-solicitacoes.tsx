import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  FileSearch,
  RefreshCw,
  Search,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

import { AnaliseCaixaDialog } from "@/components/caixa-inteligente/AnaliseCaixaDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { ErroConsulta, EstadoVazio } from "@/components/common/EstadoConsulta";
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

function normalizarBuscaUsuario(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

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

function MinhasSolicitacoesPage() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<CategoriaFiltro>("TODAS");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [usuarioEscolhido, setUsuarioEscolhido] = useState("");
  const [buscaUsuario, setBuscaUsuario] = useState("");

  const vinculo = useQuery({
    queryKey: ["vinculo-usuario-pier"],
    queryFn: () => obterVinculoPier(),
  });

  useEffect(() => {
    if (vinculo.data?.usuario?.id) setUsuarioEscolhido(vinculo.data.usuario.id);
  }, [vinculo.data?.usuario?.id]);

  const vincular = useMutation({
    mutationFn: () =>
      vincularMeuUsuarioPier({ data: { externalId: usuarioEscolhido } }),
    onSuccess: (usuario) => {
      toast.success(`Usuário PIER vinculado: ${usuario.nome}.`);
      setBuscaUsuario("");
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
        `${r.processadas} solicitações atualizadas para ${r.usuario.nome}.${
          r.possivelmenteParcial ? " A sincronização pode estar parcial." : ""
        }`,
      );
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

  const usuariosFiltrados = useMemo(() => {
    const termo = normalizarBuscaUsuario(buscaUsuario);
    if (termo.length < 2) return [];
    return (vinculo.data?.opcoes ?? [])
      .filter((u) =>
        normalizarBuscaUsuario(
          `${u.nome ?? ""} ${u.email ?? ""} ${u.login ?? ""}`,
        ).includes(termo),
      )
      .slice(0, 15);
  }, [buscaUsuario, vinculo.data?.opcoes]);

  const usuarioSelecionado =
    (vinculo.data?.opcoes ?? []).find((u) => u.id === usuarioEscolhido) ?? null;

  const selecionarUsuario = (usuario: (typeof usuariosFiltrados)[number]) => {
    setUsuarioEscolhido(usuario.id);
    setBuscaUsuario(usuario.nome);
  };

  const seletorUsuario = (
    <div className="space-y-2">
      <Label htmlFor="busca-usuario-pier">Localizar usuário no PIER</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="busca-usuario-pier"
          value={buscaUsuario}
          onChange={(e) => {
            setBuscaUsuario(e.target.value);
            if (
              usuarioSelecionado &&
              normalizarBuscaUsuario(e.target.value) !==
                normalizarBuscaUsuario(usuarioSelecionado.nome)
            )
              setUsuarioEscolhido("");
          }}
          placeholder="Digite nome, sobrenome, e-mail ou login"
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {normalizarBuscaUsuario(buscaUsuario).length < 2 ? (
        <p className="text-xs text-muted-foreground">
          Digite pelo menos 2 caracteres para localizar o usuário.
        </p>
      ) : usuariosFiltrados.length ? (
        <div className="max-h-72 overflow-y-auto rounded-md border bg-background shadow-sm">
          {usuariosFiltrados.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => selecionarUsuario(u)}
              className={`flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/60 ${
                usuarioEscolhido === u.id
                  ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                  : ""
              }`}
            >
              <span className="text-sm font-medium">{u.nome}</span>
              <span className="text-xs text-muted-foreground">
                {u.email ?? u.login ?? "Sem e-mail/login informado"}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Nenhum usuário encontrado para “{buscaUsuario}”. Tente outro nome,
          sobrenome ou e-mail.
        </p>
      )}

      {usuarioSelecionado ? (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Usuário selecionado
          </p>
          <p className="font-medium">{usuarioSelecionado.nome}</p>
          <p className="text-xs text-muted-foreground">
            {usuarioSelecionado.email ?? usuarioSelecionado.login ?? "—"}
          </p>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Minha Caixa de Entrada Inteligente"
        descricao="Solicitações abertas atribuídas a você no PIER, com leitura do assunto, postagens, anexos e recomendação de próxima ação."
        acoes={
          <Button
            onClick={() => sincronizar.mutate()}
            disabled={sincronizar.isPending || !vinculo.data?.vinculado}
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
        <ErroConsulta error={vinculo.error} onRetry={() => void vinculo.refetch()} />
      ) : !vinculo.data?.vinculado ? (
        <Card className="border-primary/20 p-5">
          <div className="flex items-start gap-3">
            <UserRoundCheck className="mt-0.5 h-6 w-6 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Qual usuário do PIER é você?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Esse vínculo é feito uma vez para que a Caixa traga somente as solicitações atribuídas ao seu usuário.
              </p>
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,560px)_auto] lg:items-start">
                {seletorUsuario}
                <Button
                  className="lg:mt-6"
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
        <Card className="p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,560px)] lg:items-start">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Usuário PIER vinculado
              </p>
              <p className="font-medium">{vinculo.data.usuario?.nome}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {vinculo.data.usuario?.email ?? vinculo.data.usuario?.login ?? "—"}
              </p>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">Trocar vínculo</p>
              {seletorUsuario}
              <Button
                variant="outline"
                onClick={() => vincular.mutate()}
                disabled={
                  vincular.isPending ||
                  !usuarioEscolhido ||
                  usuarioEscolhido === vinculo.data.usuario?.id
                }
              >
                {vincular.isPending ? "Alterando…" : "Trocar vínculo"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {vinculo.data?.vinculado ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Em aberto</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{dados?.total ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                atribuídas a {dados?.usuario.nome ?? vinculo.data.usuario?.nome}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Vencidas</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-destructive">
                {dados?.vencidas ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">prioridade operacional</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Vencem hoje</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{dados?.vencemHoje ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">prazo não decide tecnicamente</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Com anexos</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{dados?.comAnexo ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">conteúdo lido ao analisar</p>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="busca-caixa">Buscar solicitação, cliente ou CNPJ</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="busca-caixa"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Ex.: balancete, nota fiscal, e-mail, cliente, número..."
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="w-full space-y-1.5 lg:w-[240px]">
                <Label>Assunto identificado</Label>
                <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaFiltro)}>
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
            <ErroConsulta error={caixa.error} onRetry={() => void caixa.refetch()} />
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
                      <TableCell className="font-mono text-xs">{linha.numero ?? "—"}</TableCell>
                      <TableCell>
                        <p className="max-w-[260px] truncate font-medium">
                          {linha.clienteNome ?? "Cliente não identificado"}
                        </p>
                        <p className="text-xs text-muted-foreground">{linha.documento ?? "—"}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{ROTULOS[linha.categoria] ?? linha.categoria}</Badge>
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
                        <span className={linha.vencida ? "font-medium text-destructive" : ""}>
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
                        <Button variant="ghost" size="sm" onClick={() => setSelecionada(linha.externalId)}>
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

      <AnaliseCaixaDialog
        externalId={selecionada}
        onClose={() => setSelecionada(null)}
        onConcluido={() =>
          void queryClient.invalidateQueries({ queryKey: ["minha-caixa-inteligente"] })
        }
      />
    </div>
  );
}
