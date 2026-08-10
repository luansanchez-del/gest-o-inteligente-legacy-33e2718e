import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, RefreshCw, DownloadCloud, AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CarteiraTable } from "@/components/carteira/CarteiraTable";
import {
  montarLinhas,
  useAcoesCarteira,
  useClientesCache,
  useEmpresasLocais,
  useUltimaSincronizacao,
} from "@/hooks/use-pier-carteira";
import type { PierClienteCache } from "@/legacy/api/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Carteira PIER | Gestão Inteligente de Fechamentos" },
      {
        name: "description",
        content:
          "Consulte a carteira de clientes do PIER, identifique quais já possuem empresa local correspondente e importe novos clientes para a gestão de fechamentos.",
      },
      { property: "og:title", content: "Carteira PIER | Gestão Inteligente de Fechamentos" },
      {
        property: "og:description",
        content: "Clientes do PIER, situação de vínculo e importação para o sistema contábil.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CarteiraPage,
});

const STATUS = ["", "Ativo", "Inativo"];
const TRIBUTACOES = [
  "",
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
  "MEI",
  "Pessoa Física",
];

function formatarData(valor: string | null | undefined) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function CarteiraPage() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [tributacao, setTributacao] = useState("");
  const [filtros, setFiltros] = useState<{
    search?: string;
    status?: string;
    tributacao?: string;
  }>({});

  const clientes = useClientesCache(filtros);
  const empresas = useEmpresasLocais();
  const ultimaSync = useUltimaSincronizacao();
  const { sincronizar, importar, importarTodos, vincular } = useAcoesCarteira();

  const linhas = useMemo(
    () => montarLinhas(clientes.data ?? [], empresas.data ?? []),
    [clientes.data, empresas.data],
  );

  const carregando = clientes.isLoading || empresas.isLoading;
  const erro = (clientes.error ?? empresas.error) as Error | null;
  const syncedAt = formatarData(ultimaSync.data?.lastSyncedAt);

  function aplicarFiltros() {
    setFiltros({
      search: busca.trim() || undefined,
      status: status || undefined,
      tributacao: tributacao || undefined,
    });
  }

  function handleSincronizar() {
    sincronizar.mutate(undefined, {
      onSuccess: (r) => {
        ultimaSync.refetch();
        toast.success(
          `Carteira sincronizada: ${r.found} encontrados, ${r.created} novos, ${r.updated} atualizados.`,
        );
      },
      onError: (e) => toast.error((e as Error).message),
    });
  }

  function handleImportar(cliente: PierClienteCache) {
    importar.mutate(cliente, {
      onSuccess: (r) =>
        toast.success(
          r.created
            ? `Empresa ${r.company.name} criada e vinculada.`
            : `Empresa ${r.company.name} vinculada.`,
        ),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  function handleImportarTodos() {
    importarTodos.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          `${r.found} clientes analisados: ${r.created} criados, ${r.linked} vinculados, ${r.existing} já existentes, ${r.skipped} ignorados.`,
        ),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  function handleVincular(companyId: string) {
    vincular.mutate(companyId, {
      onSuccess: (r) =>
        r.linked ? toast.success("Empresa vinculada ao PIER.") : toast.error("Vínculo não encontrado no PIER."),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Carteira PIER</h1>
          <p className="text-sm text-muted-foreground">
            {syncedAt
              ? `Última sincronização em ${syncedAt}.`
              : "Carteira nunca sincronizada neste ambiente."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleSincronizar} disabled={sincronizar.isPending}>
            {sincronizar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar carteira
          </Button>
          <Button onClick={handleImportarTodos} disabled={importarTodos.isPending}>
            {importarTodos.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <DownloadCloud className="h-4 w-4" />
            )}
            Importar todos
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
            placeholder="Buscar por nome ou documento"
            className="pl-8"
            aria-label="Buscar cliente na carteira"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status"
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {STATUS.map((s) => (
            <option key={s} value={s}>
              {s || "Todos os status"}
            </option>
          ))}
        </select>
        <select
          value={tributacao}
          onChange={(e) => setTributacao(e.target.value)}
          aria-label="Tributação"
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {TRIBUTACOES.map((t) => (
            <option key={t} value={t}>
              {t || "Todas as tributações"}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={aplicarFiltros}>
          Filtrar
        </Button>
      </div>

      {erro ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar a carteira</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{erro.message}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                clientes.refetch();
                empresas.refetch();
              }}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : carregando ? (
        <div className="space-y-2 rounded-lg border bg-card p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : linhas.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center">
          <p className="text-sm font-medium">Nenhum cliente na carteira</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {ultimaSync.data?.lastSyncedAt
              ? "Nenhum cliente encontrado com esses filtros."
              : 'Clique em "Sincronizar carteira" para trazer os clientes do PIER.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {linhas.length} cliente(s) na carteira ·{" "}
            {linhas.filter((l) => l.situacao === "VINCULADO").length} com empresa local ·{" "}
            {linhas.filter((l) => l.situacao === "NAO_IDENTIFICADO").length} não identificados
          </p>
          <CarteiraTable
            linhas={linhas}
            onImportar={handleImportar}
            onVincular={handleVincular}
            importandoId={importar.isPending ? (importar.variables?.id ?? null) : null}
            vinculandoId={vincular.isPending ? (vincular.variables ?? null) : null}
          />
        </>
      )}
    </div>
  );
}
