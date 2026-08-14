import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link2, Link2Off, RefreshCw, Stethoscope, X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import {
  CarregandoTabela,
  ErroConsulta,
  EstadoVazio,
} from "@/components/common/EstadoConsulta";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  desvincularCliente,
  diagnosticarConexaoPier,
  listarCarteira,
  sincronizarCarteira,
  vincularCliente,
  vincularClientesEmLote,
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
          "Clientes sincronizados do PIER, com tributação, status e situação do vínculo com as empresas internas.",
      },
      { property: "og:title", content: "Carteira PIER | Gestão Inteligente" },
      {
        property: "og:description",
        content: "Consulte e vincule os clientes do PIER às empresas da sua carteira.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CarteiraPage,
});

type StatusFiltro = "Todos" | "Ativo" | "Inativo";
type SituacaoFiltro = "TODOS" | "VINCULADO" | "NAO_VINCULADO" | "REVISAO";
const MOTIVO_REVISAO: Record<string, string> = {
  SEM_DOCUMENTO: "Sem CNPJ/CPF",
  DOCUMENTO_INVALIDO: "Documento inválido",
  DOCUMENTO_DUPLICADO: "CNPJ duplicado",
};

const TODOS_REGIMES = "__TODOS__";

function CarteiraPage() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusFiltro>("Todos");
  const [regime, setRegime] = useState<string>(TODOS_REGIMES);
  const [situacao, setSituacao] = useState<SituacaoFiltro>("TODOS");
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const consulta = useQuery({
    queryKey: ["carteira", busca, status, regime, situacao],
    queryFn: () =>
      listarCarteira({
        data: {
          busca,
          ...(status === "Todos" ? {} : { status }),
          ...(regime === TODOS_REGIMES ? {} : { regime }),
          ...(situacao === "TODOS" ? {} : { situacao }),
        },
      }),
    placeholderData: (anterior) => anterior,
  });

  const sincronizar = useMutation({
    mutationFn: () => sincronizarCarteira(),
    onSuccess: (r) => {
      toast.success(`Sincronização concluída: ${r.processados} clientes atualizados.`);
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

  const vincular = useMutation({
    mutationFn: (pierClientId: string) => vincularCliente({ data: { pierClientId } }),
    onSuccess: () => {
      toast.success("Cliente vinculado a uma empresa interna.");
      void queryClient.invalidateQueries({ queryKey: ["carteira"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const desvincular = useMutation({
    mutationFn: (pierClientId: string) => desvincularCliente({ data: { pierClientId } }),
    onSuccess: () => {
      toast.success("Vínculo removido.");
      void queryClient.invalidateQueries({ queryKey: ["carteira"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const vincularLote = useMutation({
    mutationFn: (pierClientIds: string[]) => vincularClientesEmLote({ data: { pierClientIds } }),
    onSuccess: (r) => {
      if (r.falhas.length) {
        toast.warning(`${r.vinculados} vinculados, ${r.falhas.length} com falha.`, {
          description: r.falhas[0]?.motivo,
        });
      } else {
        toast.success(`${r.vinculados} clientes vinculados.`);
      }
      setSelecionados([]);
      void queryClient.invalidateQueries({ queryKey: ["carteira"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const resumo = consulta.data?.resumo;
  const linhas = consulta.data?.linhas ?? [];
  const ultimaSincronizacao = resumo?.ultimaSincronizacao;
  const regimes = resumo?.filtrosDisponiveis?.regimes ?? [];
  const selecionaveis = linhas.filter((l) => !l.vinculado);
  const selecionadosValidos = selecionados.filter((id) =>
    selecionaveis.some((l) => l.pierClientId === id),
  );
  const todosSelecionados =
    selecionaveis.length > 0 && selecionadosValidos.length === selecionaveis.length;
  const alternarTodos = (marcar: boolean) =>
    setSelecionados(marcar ? selecionaveis.map((l) => l.pierClientId) : []);
  const alternarLinha = (id: string, marcar: boolean) =>
    setSelecionados((atual) => (marcar ? [...atual, id] : atual.filter((i) => i !== id)));
  const temFiltroAtivo =
    busca.trim() !== "" || status !== "Todos" || regime !== TODOS_REGIMES || situacao !== "TODOS";
  const limparFiltros = () => {
    setBusca("");
    setStatus("Todos");
    setRegime(TODOS_REGIMES);
    setSituacao("TODOS");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Carteira PIER"
        descricao="Clientes sincronizados do PIER e o vínculo com as empresas internas."
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Clientes</p>
          <p className="text-2xl font-semibold tabular-nums">{resumo?.total ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Vinculados</p>
          <p className="text-2xl font-semibold tabular-nums">{resumo?.vinculados ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Sem vínculo</p>
          <p className="text-2xl font-semibold tabular-nums">{resumo?.naoVinculados ?? "—"}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Última sincronização:{" "}
            {ultimaSincronizacao
              ? formatarDataHora(ultimaSincronizacao.finishedAt ?? ultimaSincronizacao.startedAt)
              : "nunca sincronizada"}
          </p>
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
            <SelectTrigger className="md:w-56" aria-label="Regime tributário">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_REGIMES}>Todos os regimes</SelectItem>
              {regimes.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={situacao} onValueChange={(v) => setSituacao(v as SituacaoFiltro)}>
            <SelectTrigger className="md:w-48" aria-label="Situação do vínculo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos os vínculos</SelectItem>
              <SelectItem value="VINCULADO">Vinculados</SelectItem>
              <SelectItem value="NAO_VINCULADO">Sem vínculo</SelectItem>
            </SelectContent>
          </Select>
          {temFiltroAtivo ? (
            <Button variant="ghost" size="sm" onClick={limparFiltros}>
              <X className="mr-2 h-4 w-4" />
              Limpar filtros
            </Button>
          ) : null}
        </div>

        {selecionaveis.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 text-sm">
            <span className="text-muted-foreground">
              {selecionadosValidos.length} de {selecionaveis.length} sem vínculo selecionados
            </span>
            <Button
              size="sm"
              onClick={() => vincularLote.mutate(selecionadosValidos)}
              disabled={selecionadosValidos.length === 0 || vincularLote.isPending}
            >
              <Link2 className="mr-2 h-4 w-4" />
              {vincularLote.isPending
                ? "Vinculando…"
                : `Vincular selecionados${
                    selecionadosValidos.length ? ` (${selecionadosValidos.length})` : ""
                  }`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => alternarTodos(!todosSelecionados)}
              disabled={vincularLote.isPending}
            >
              {todosSelecionados ? "Limpar seleção" : "Selecionar todos sem vínculo"}
            </Button>
          </div>
        ) : null}

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
                <TableHead className="w-10">
                  <Checkbox
                    checked={todosSelecionados}
                    onCheckedChange={(v) => alternarTodos(v === true)}
                    disabled={selecionaveis.length === 0}
                    aria-label="Selecionar todos sem vínculo"
                  />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Tributação</TableHead>
                <TableHead>Status PIER</TableHead>
                <TableHead>Situação do vínculo</TableHead>
                <TableHead>Última sincronização</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((linha) => (
                <TableRow key={linha.pierClientId}>
                  <TableCell>
                    <Checkbox
                      checked={selecionadosValidos.includes(linha.pierClientId)}
                      onCheckedChange={(v) => alternarLinha(linha.pierClientId, v === true)}
                      disabled={linha.vinculado}
                      aria-label={`Selecionar ${linha.nome}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{linha.nome}</TableCell>
                  <TableCell className="tabular-nums">{formatarCnpj(linha.documento)}</TableCell>
                  <TableCell>{linha.regime ?? "—"}</TableCell>
                  <TableCell>{linha.status ?? "—"}</TableCell>
                  <TableCell>
                    {linha.vinculado ? (
                      <span className="text-success-strong">{linha.empresaNome}</span>
                    ) : (
                      <span className="text-muted-foreground">Não vinculado</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatarDataHora(linha.sincronizadoEm)}
                  </TableCell>
                  <TableCell className="text-right">
                    {linha.vinculado ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => desvincular.mutate(linha.pierClientId)}
                        disabled={desvincular.isPending}
                      >
                        <Link2Off className="mr-2 h-4 w-4" />
                        Desvincular
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => vincular.mutate(linha.pierClientId)}
                        disabled={vincular.isPending}
                      >
                        <Link2 className="mr-2 h-4 w-4" />
                        Vincular
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
