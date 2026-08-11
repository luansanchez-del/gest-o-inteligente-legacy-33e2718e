import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Building2, FilterX, Pencil, RefreshCw, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { PageHeader } from "@/components/common/PageHeader";
import { CarregandoTabela, ErroConsulta, EstadoVazio } from "@/components/common/EstadoConsulta";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  aplicarImportacaoEquipe,
  listarEquipeCompleta,
  previsualizarImportacaoEquipe,
  type LinhaImportacaoEquipe,
} from "@/lib/api/equipe.functions";
import { renomearDepartamento, sincronizarEquipe } from "@/lib/api/gestao.functions";
import { mensagemDeErro } from "@/lib/erros";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe e departamentos | Gestão Inteligente" },
      {
        name: "description",
        content:
          "Cadastre e mantenha os departamentos e usuários do PIER, com importação da planilha de equipe.",
      },
      { property: "og:title", content: "Equipe e departamentos | Gestão Inteligente" },
      {
        property: "og:description",
        content: "Manutenção de departamentos e usuários do PIER em uma única tela.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EquipePage,
});

const TODOS = "__TODOS__";

const COLUNAS: Record<keyof LinhaImportacaoEquipe, string[]> = {
  nome: ["nome", "name", "usuario", "usuário"],
  tipo: ["tipo", "perfil"],
  email: ["email", "e-mail"],
  departamento: ["departamento", "setor", "equipe"],
  status: ["status", "situacao", "situação"],
};

function normalizar(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function converterPlanilha(buffer: ArrayBuffer): LinhaImportacaoEquipe[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const primeira = workbook.SheetNames[0];
  if (!primeira) throw new Error("A planilha está vazia.");
  const bruto = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[primeira]!, {
    defval: "",
  });
  if (!bruto.length) throw new Error("A planilha não tem linhas de dados.");

  const chaves = Object.keys(bruto[0]!);
  const mapa: Partial<Record<keyof LinhaImportacaoEquipe, string>> = {};
  for (const [campo, aliases] of Object.entries(COLUNAS) as [
    keyof LinhaImportacaoEquipe,
    string[],
  ][]) {
    const encontrada = chaves.find((k) => aliases.includes(normalizar(k)));
    if (encontrada) mapa[campo] = encontrada;
  }
  if (!mapa.nome || !mapa.departamento)
    throw new Error("A planilha precisa ter ao menos as colunas Nome e Departamento.");

  return bruto
    .map((linha) => ({
      nome: String(linha[mapa.nome!] ?? "").trim(),
      tipo: mapa.tipo ? String(linha[mapa.tipo] ?? "").trim() : null,
      email: mapa.email ? String(linha[mapa.email] ?? "").trim() : null,
      departamento: String(linha[mapa.departamento!] ?? "").trim(),
      status: mapa.status ? String(linha[mapa.status] ?? "").trim() : null,
    }))
    .filter((linha) => linha.nome || linha.email);
}

function EquipePage() {
  const queryClient = useQueryClient();
  const inputArquivo = useRef<HTMLInputElement>(null);

  const [aba, setAba] = useState("departamentos");
  const [buscaDepto, setBuscaDepto] = useState("");
  const [buscaUsuario, setBuscaUsuario] = useState("");
  const [filtroDepto, setFiltroDepto] = useState(TODOS);
  const [filtroTipo, setFiltroTipo] = useState(TODOS);
  const [filtroStatus, setFiltroStatus] = useState("ativo");

  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");
  const [linhas, setLinhas] = useState<LinhaImportacaoEquipe[] | null>(null);
  const [resumo, setResumo] = useState<Awaited<
    ReturnType<typeof previsualizarImportacaoEquipe>
  > | null>(null);

  const equipe = useQuery({
    queryKey: ["equipe-completa"],
    queryFn: () => listarEquipeCompleta(),
  });

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ["equipe-completa"] });
    void queryClient.invalidateQueries({ queryKey: ["equipe-pier"] });
    void queryClient.invalidateQueries({ queryKey: ["preview-gestao"] });
  }

  const sincronizar = useMutation({
    mutationFn: () => sincronizarEquipe(),
    onSuccess: (r) => {
      toast.success(`${r.processados} usuários e ${r.departamentos} departamentos atualizados.`);
      invalidar();
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const renomear = useMutation({
    mutationFn: (input: { departamentoId: string; nome: string }) =>
      renomearDepartamento({ data: input }),
    onSuccess: () => {
      toast.success("Nome do departamento atualizado.");
      setEditando(null);
      invalidar();
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const previsualizar = useMutation({
    mutationFn: (rows: LinhaImportacaoEquipe[]) => previsualizarImportacaoEquipe({ data: { rows } }),
    onSuccess: (r) => setResumo(r),
    onError: (e) => {
      setLinhas(null);
      toast.error(mensagemDeErro(e));
    },
  });

  const aplicar = useMutation({
    mutationFn: (rows: LinhaImportacaoEquipe[]) => aplicarImportacaoEquipe({ data: { rows } }),
    onSuccess: (r) => {
      toast.success(`${r.departamentosAtualizados} departamentos renomeados pela planilha.`);
      setLinhas(null);
      setResumo(null);
      invalidar();
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  async function aoEscolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      const rows = converterPlanilha(await arquivo.arrayBuffer());
      setLinhas(rows);
      setResumo(null);
      previsualizar.mutate(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
    } finally {
      if (inputArquivo.current) inputArquivo.current.value = "";
    }
  }

  const departamentos = equipe.data?.departamentos ?? [];
  const usuarios = equipe.data?.usuarios ?? [];

  const tipos = useMemo(
    () => [...new Set(usuarios.map((u) => u.tipo).filter(Boolean) as string[])].sort(),
    [usuarios],
  );

  const departamentosFiltrados = useMemo(() => {
    const termo = normalizar(buscaDepto);
    return departamentos.filter(
      (d) => !termo || normalizar(d.nome).includes(termo) || d.codigo.includes(termo),
    );
  }, [departamentos, buscaDepto]);

  const usuariosFiltrados = useMemo(() => {
    const termo = normalizar(buscaUsuario);
    return usuarios.filter((u) => {
      if (termo && !normalizar(`${u.nome} ${u.email ?? ""}`).includes(termo)) return false;
      if (filtroDepto !== TODOS && u.departamentoId !== filtroDepto) return false;
      if (filtroTipo !== TODOS && u.tipo !== filtroTipo) return false;
      if (filtroStatus !== TODOS && normalizar(u.status) !== filtroStatus) return false;
      return true;
    });
  }, [usuarios, buscaUsuario, filtroDepto, filtroTipo, filtroStatus]);

  const cards = [
    { titulo: "Departamentos", valor: equipe.data?.totais.departamentos ?? 0, icone: Building2 },
    { titulo: "Usuários ativos", valor: equipe.data?.totais.usuariosAtivos ?? 0, icone: Users },
    {
      titulo: "Sem departamento",
      valor: equipe.data?.totais.semDepartamento ?? 0,
      icone: FilterX,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Equipe e departamentos"
        descricao="Mantenha os nomes legíveis dos departamentos do PIER e consulte a equipe interna."
        acoes={
          <>
            <input
              ref={inputArquivo}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => void aoEscolherArquivo(e.target.files?.[0])}
            />
            <Button variant="outline" onClick={() => inputArquivo.current?.click()}>
              <Upload className="h-4 w-4" /> Importar planilha de usuários
            </Button>
            <Button onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}>
              <RefreshCw className={sincronizar.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Sincronizar equipe PIER
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.titulo} className="flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <card.icone className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.titulo}</p>
              <p className="text-xl font-semibold tabular-nums">{card.valor}</p>
            </div>
          </Card>
        ))}
        <Card className="flex items-center gap-3 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Última sincronização
            </p>
            <p className="text-sm font-medium">
              {equipe.data?.sincronizadoEm
                ? new Date(equipe.data.sincronizadoEm).toLocaleString("pt-BR")
                : "Nunca sincronizado"}
            </p>
          </div>
        </Card>
      </div>

      {equipe.isLoading ? (
        <CarregandoTabela />
      ) : equipe.isError ? (
        <ErroConsulta mensagem={mensagemDeErro(equipe.error)} onTentarNovamente={() => equipe.refetch()} />
      ) : (
        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="departamentos">Departamentos</TabsTrigger>
            <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          </TabsList>

          <TabsContent value="departamentos" className="space-y-3">
            <Input
              placeholder="Buscar departamento pelo nome"
              value={buscaDepto}
              onChange={(e) => setBuscaDepto(e.target.value)}
              className="max-w-sm"
            />
            {departamentosFiltrados.length === 0 ? (
              <EstadoVazio
                titulo="Nenhum departamento"
                descricao="Sincronize a equipe do PIER para carregar os departamentos."
              />
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Departamento</TableHead>
                      <TableHead className="w-32 text-right">Usuários ativos</TableHead>
                      <TableHead className="w-32">Código PIER</TableHead>
                      <TableHead className="w-56 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departamentosFiltrados.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">
                          {d.nome}
                          {!d.personalizado ? (
                            <Badge variant="outline" className="ml-2">
                              sem nome definido
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{d.usuariosAtivos}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.codigo}</TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditando({ id: d.id, nome: d.nome });
                              setNomeEditado(d.personalizado ? d.nome : "");
                            }}
                          >
                            <Pencil className="h-4 w-4" /> Editar nome
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setFiltroDepto(d.id);
                              setFiltroStatus("ativo");
                              setAba("usuarios");
                            }}
                          >
                            Ver usuários
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="usuarios" className="space-y-3">
            <Card className="flex flex-wrap items-end gap-3 p-4">
              <div className="min-w-[220px] flex-1 space-y-1">
                <Label>Buscar</Label>
                <Input
                  placeholder="Nome ou e-mail"
                  value={buscaUsuario}
                  onChange={(e) => setBuscaUsuario(e.target.value)}
                />
              </div>
              <div className="min-w-[220px] flex-1 space-y-1">
                <Label>Departamento</Label>
                <Select value={filtroDepto} onValueChange={setFiltroDepto}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos os departamentos</SelectItem>
                    {departamentos.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-44 space-y-1">
                <Label>Tipo</Label>
                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos os tipos</SelectItem>
                    {tipos.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-40 space-y-1">
                <Label>Status</Label>
                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativos</SelectItem>
                    <SelectItem value="inativo">Inativos</SelectItem>
                    <SelectItem value={TODOS}>Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setBuscaUsuario("");
                  setFiltroDepto(TODOS);
                  setFiltroTipo(TODOS);
                  setFiltroStatus("ativo");
                }}
              >
                <FilterX className="h-4 w-4" /> Limpar filtros
              </Button>
            </Card>

            {usuariosFiltrados.length === 0 ? (
              <EstadoVazio
                titulo="Nenhum usuário encontrado"
                descricao="Ajuste os filtros ou sincronize a equipe do PIER."
              />
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead className="w-36">Tipo</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Departamento</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usuariosFiltrados.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.nome}</TableCell>
                        <TableCell>{u.tipo ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                        <TableCell>{u.departamentoNome ?? "Sem departamento"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={normalizar(u.status) === "ativo" ? "default" : "secondary"}
                          >
                            {u.status ?? "—"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={Boolean(editando)} onOpenChange={(aberto) => !aberto && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nome do departamento</DialogTitle>
            <DialogDescription>
              O código PIER {editando?.id} continua sendo usado internamente para o vínculo.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nomeEditado}
            onChange={(e) => setNomeEditado(e.target.value)}
            placeholder="Ex.: CONTABILIDADE BPO"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!nomeEditado.trim() || renomear.isPending}
              onClick={() =>
                editando &&
                renomear.mutate({ departamentoId: editando.id, nome: nomeEditado.trim() })
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(linhas)}
        onOpenChange={(aberto) => {
          if (!aberto) {
            setLinhas(null);
            setResumo(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar planilha de usuários</DialogTitle>
            <DialogDescription>
              Somente os nomes dos departamentos são atualizados. Nenhum vínculo, status ou e-mail
              do PIER é alterado.
            </DialogDescription>
          </DialogHeader>

          {previsualizar.isPending || !resumo ? (
            <p className="text-sm text-muted-foreground">Analisando a planilha…</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Linhas", resumo.totalLinhas],
                  ["Departamentos", resumo.departamentosDetectados],
                  ["Encontrados", resumo.usuariosEncontrados],
                  ["Não encontrados", resumo.usuariosNaoEncontrados],
                ].map(([titulo, valor]) => (
                  <Card key={String(titulo)} className="p-3">
                    <p className="text-xs text-muted-foreground">{titulo}</p>
                    <p className="text-lg font-semibold tabular-nums">{valor}</p>
                  </Card>
                ))}
              </div>
              <p>
                <strong>{resumo.departamentosAtualizaveis}</strong> departamentos serão renomeados.
              </p>
              {resumo.conflitos.length ? (
                <div>
                  <p className="font-medium text-destructive">
                    Conflitos ({resumo.conflitos.length}) — não serão atualizados:
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {resumo.conflitos.slice(0, 5).map((c) => (
                      <li key={c.departamentoId}>
                        {c.departamentoId}: {c.nomes.join(" / ")}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {resumo.amostraNaoEncontrados.length ? (
                <div>
                  <p className="font-medium">Não encontrados (amostra):</p>
                  <p className="text-muted-foreground">
                    {resumo.amostraNaoEncontrados.join(", ")}
                  </p>
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLinhas(null);
                setResumo(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={!resumo || aplicar.isPending}
              onClick={() => linhas && aplicar.mutate(linhas)}
            >
              Aplicar importação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
