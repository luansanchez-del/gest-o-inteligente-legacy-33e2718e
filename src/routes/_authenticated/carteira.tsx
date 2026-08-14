import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileSearch, Info, RefreshCw, Stethoscope, X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import {
  CarregandoTabela,
  ErroConsulta,
  EstadoVazio,
} from "@/components/common/EstadoConsulta";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  diagnosticarConexaoPier,
  listarCarteira,
  listarSolicitacoesDoCliente,
  sincronizarCarteira,
} from "@/lib/api/carteira.functions";
import { formatarCnpj, formatarDataHora } from "@/lib/formato";
import { mensagemDeErro } from "@/lib/erros";

export const Route = createFileRoute("/_authenticated/carteira")({
  head: () => ({
    meta: [
      { title: "Carteira PIER | Gestão Inteligente" },
      {
        name: "description",
        content:
          "Catálogo dos clientes sincronizados do PIER para localizar clientes e suas solicitações de fechamento contábil.",
      },
      { property: "og:title", content: "Carteira PIER | Gestão Inteligente" },
      {
        property: "og:description",
        content: "Consulte clientes do PIER e abra as solicitações de fechamento contábil.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CarteiraPage,
});

type StatusFiltro = "Todos" | "Ativo" | "Inativo";
const TODOS_REGIMES = "__TODOS__";

function CarteiraPage() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusFiltro>("Todos");
  const [regime, setRegime] = useState<string>(TODOS_REGIMES);
  const [cliente, setCliente] = useState<{
    externalId: string;
    nome: string;
    documento: string | null;
  } | null>(null);

  const consulta = useQuery({
    queryKey: ["carteira", busca, status, regime],
    queryFn: () =>
      listarCarteira({
        data: {
          busca,
          ...(status === "Todos" ? {} : { status }),
          ...(regime === TODOS_REGIMES ? {} : { regime }),
        },
      }),
    placeholderData: (anterior) => anterior,
  });

  const solicitacoes = useQuery({
    queryKey: ["carteira-solicitacoes", cliente?.externalId],
    enabled: cliente !== null,
    queryFn: () =>
      listarSolicitacoesDoCliente({
        data: { clientExternalId: cliente?.externalId, documento: cliente?.documento },
      }),
  });

  const sincronizar = useMutation({
    mutationFn: () => sincronizarCarteira(),
    onSuccess: (r) => {
      toast.success(
        `Carteira atualizada: ${r.total} clientes · ${r.processados} processados · ${r.falhas} falhas.`,
        { duration: 8000 },
      );
      void queryClient.invalidateQueries({ queryKey: ["carteira"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const diagnosticar = useMutation({
    mutationFn: () => diagnosticarConexaoPier(),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Conexão com o PIER OK — autenticação funcionando.");
      } else {
        toast.error(`Conexão com o PIER falhou: ${r.detalhe ?? "erro desconhecido"}`, {
          duration: 8000,
        });
      }
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const resumo = consulta.data?.resumo;
  const linhas = consulta.data?.linhas ?? [];
  const ultimaSincronizacao = resumo?.ultimaSincronizacao;
  const regimes = resumo?.filtrosDisponiveis?.regimes ?? [];
  const temFiltroAtivo = busca.trim() !== "" || status !== "Todos" || regime !== TODOS_REGIMES;
  const limparFiltros = () => {
    setBusca("");
    setStatus("Todos");
    setRegime(TODOS_REGIMES);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Carteira PIER"
        descricao="Catálogo de clientes do PIER usado para localizar clientes e suas solicitações."
        acoes={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => diagnosticar.mutate()}
              disabled={diagnosticar.isPending}
              title="Testar autenticação com o PIER"
            >
              <Stethoscope className="mr-2 h-4 w-4" />
              Testar conexão
            </Button>
            <Button onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}>
              <RefreshCw
                className={`mr-2 h-4 w-4 ${sincronizar.isPending ? "animate-spin" : ""}`}
              />
              Sincronizar PIER
            </Button>
          </div>
        }
      />

      <Card className="flex items-start gap-2 border-primary/30 bg-primary/5 p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>Carteira PIER — catálogo para localizar clientes e solicitações.</p>
      </Card>

      {resumo && !resumo.integracao.available ? (
        <Card className="border-warning/40 bg-warning-soft p-4 text-sm text-warning-strong">
          Integração com o PIER indisponível: {resumo.integracao.reason ?? "não configurada"}.
        </Card>
      ) : null}

      {sincronizar.isError ? (
        <ErroConsulta
          error={sincronizar.error}
          titulo="A sincronização com o PIER falhou"
          onRetry={() => sincronizar.mutate()}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Clientes</p>
          <p className="text-2xl font-semibold tabular-nums">{resumo?.total ?? "—"}</p>
          {resumo?.totalExibido != null ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Exibindo {resumo.totalExibido} com os filtros atuais
            </p>
          ) : null}
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Ativos</p>
          <p className="text-2xl font-semibold tabular-nums">{resumo?.ativos ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Inativos</p>
          <p className="text-2xl font-semibold tabular-nums">{resumo?.inativos ?? "—"}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Outros status: {resumo?.outrosStatus ?? 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Última sincronização
          </p>
          <p className="text-sm font-medium">
            {ultimaSincronizacao
              ? formatarDataHora(ultimaSincronizacao.finishedAt ?? ultimaSincronizacao.startedAt)
              : "nunca sincronizada"}
          </p>
          {ultimaSincronizacao ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {ultimaSincronizacao.processados} processados · {ultimaSincronizacao.falhas} falhas
            </p>
          ) : null}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:flex-wrap md:items-center">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou CPF"
            className="md:max-w-sm"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFiltro)}>
            <SelectTrigger className="md:w-44" aria-label="Status PIER">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os status</SelectItem>
              <SelectItem value="Ativo">Ativos</SelectItem>
              <SelectItem value="Inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={regime} onValueChange={setRegime}>
            <SelectTrigger className="md:w-56" aria-label="Tributação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_REGIMES}>Todas as tributações</SelectItem>
              {regimes.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {temFiltroAtivo ? (
            <Button variant="ghost" size="sm" onClick={limparFiltros}>
              <X className="mr-2 h-4 w-4" />
              Limpar filtros
            </Button>
          ) : null}
        </div>

        {consulta.isLoading ? (
          <CarregandoTabela />
        ) : consulta.isError ? (
          <div className="p-4">
            <ErroConsulta error={consulta.error} onRetry={() => void consulta.refetch()} />
          </div>
        ) : linhas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum cliente PIER sincronizado."
            descricao="Use “Sincronizar PIER” para trazer os clientes da carteira."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Tributação</TableHead>
                <TableHead>Status PIER</TableHead>
                <TableHead>Última sincronização</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((linha) => (
                <TableRow key={linha.pierClientId}>
                  <TableCell className="font-medium">{linha.nome}</TableCell>
                  <TableCell className="tabular-nums">{formatarCnpj(linha.documento)}</TableCell>
                  <TableCell>{linha.regime ?? "—"}</TableCell>
                  <TableCell>{linha.status ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatarDataHora(linha.sincronizadoEm)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setCliente({
                          externalId: linha.externalId,
                          nome: linha.nome,
                          documento: linha.documento,
                        })
                      }
                    >
                      <FileSearch className="mr-2 h-4 w-4" />
                      Ver solicitações
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={cliente !== null} onOpenChange={(aberto) => !aberto && setCliente(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{cliente?.nome ?? "Solicitações"}</DialogTitle>
            <DialogDescription>
              Fechamento Contábil · {formatarCnpj(cliente?.documento ?? null)}
            </DialogDescription>
          </DialogHeader>

          {solicitacoes.isLoading ? (
            <CarregandoTabela />
          ) : solicitacoes.isError ? (
            <ErroConsulta
              error={solicitacoes.error}
              onRetry={() => void solicitacoes.refetch()}
            />
          ) : (solicitacoes.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma solicitação de Fechamento Contábil em cache para este cliente. Sincronize a
              competência na tela Gestão.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competência</TableHead>
                    <TableHead>Nº</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead className="text-right">Documento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(solicitacoes.data ?? []).map((s) => (
                    <TableRow key={s.externalId}>
                      <TableCell className="tabular-nums">{s.competencia ?? "—"}</TableCell>
                      <TableCell>{s.numero ?? s.externalId}</TableCell>
                      <TableCell>{s.status ?? "—"}</TableCell>
                      <TableCell>{s.responsavelNome ?? "Sem responsável"}</TableCell>
                      <TableCell>{s.departamentoNome ?? "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {s.documentoDisponivel
                          ? "PDF interno"
                          : s.temAnexoPier
                            ? "Anexo no PIER"
                            : "Sem anexo"}
                        {s.postagens ? ` · ${s.postagens} postagens` : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
