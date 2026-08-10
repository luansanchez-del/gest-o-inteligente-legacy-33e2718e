import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, ListChecks, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { CarregandoTabela, ErroConsulta } from "@/components/common/EstadoConsulta";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apurarIndice } from "@/lib/api/indice.functions";
import { listarCarteira } from "@/lib/api/carteira.functions";
import { listarFilaRevisao } from "@/lib/api/revisao.functions";
import { competenciaAtual, competenciaDeslocada, formatarCompetencia } from "@/lib/formato";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Painel | Gestão Inteligente de Fechamentos" },
      {
        name: "description",
        content:
          "Visão geral da carteira PIER, índice de entrega da competência e fila de revisão humana.",
      },
      { property: "og:title", content: "Painel | Gestão Inteligente de Fechamentos" },
      {
        property: "og:description",
        content: "Acompanhe carteira, índice de entrega e revisões pendentes em um só painel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Painel,
});

function Painel() {
  const competencia = competenciaAtual();

  const indice = useQuery({
    queryKey: ["indice", "painel", competencia],
    queryFn: () =>
      apurarIndice({
        data: {
          competenciaInicio: competenciaDeslocada(-5),
          competenciaFim: competencia,
          recorte: "GERAL",
        },
      }),
  });
  const carteira = useQuery({
    queryKey: ["carteira", "resumo"],
    queryFn: () => listarCarteira({ data: {} }),
  });
  const revisao = useQuery({ queryKey: ["revisao"], queryFn: () => listarFilaRevisao() });

  const destaques = (indice.data?.indicadores ?? []).filter((i) =>
    ["PREVISTO", "ENTREGUE", "INDICE", "ATRASADA", "AGUARDANDO", "REVISAO"].includes(i.codigo),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Painel"
        descricao={`Situação consolidada até a competência ${formatarCompetencia(competencia)}.`}
        acoes={
          <Button asChild>
            <Link to="/gestao/nova">
              Iniciar gestão
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        }
      />

      {indice.isError ? (
        <ErroConsulta error={indice.error} onRetry={() => void indice.refetch()} />
      ) : indice.isLoading ? (
        <CarregandoTabela linhas={3} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {destaques.map((indicador) => (
            <StatCard
              key={indicador.codigo}
              indicador={indicador}
              destaque={indicador.codigo === "INDICE"}
            />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-primary" />
            Carteira PIER
          </div>
          <p className="text-3xl font-semibold tabular-nums">
            {carteira.data?.resumo.total ?? "—"}
          </p>
          <p className="text-sm text-muted-foreground">
            {carteira.data?.resumo.vinculados ?? 0} vinculados ·{" "}
            {carteira.data?.resumo.naoVinculados ?? 0} sem vínculo
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/carteira">Abrir carteira</Link>
          </Button>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Revisão humana
          </div>
          <p className="text-3xl font-semibold tabular-nums">{revisao.data?.length ?? "—"}</p>
          <p className="text-sm text-muted-foreground">Itens aguardando decisão de um gestor.</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/revisao">Abrir fila</Link>
          </Button>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="h-4 w-4 text-primary" />
            Acompanhamento
          </div>
          <p className="text-sm text-muted-foreground">
            Consulte o andamento das gestões abertas por competência, responsável e situação.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/gestao/acompanhamento">Ver execuções</Link>
          </Button>
        </Card>
      </div>
    </div>
  );
}
