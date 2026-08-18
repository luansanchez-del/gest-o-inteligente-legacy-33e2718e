import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, ListChecks, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EvolucaoEquipeContabil } from "@/components/dashboard/EvolucaoEquipeContabil";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listarCarteira } from "@/lib/api/carteira.functions";
import { listarFilaRevisao } from "@/lib/api/revisao.functions";
import { competenciaAtual, formatarCompetencia } from "@/lib/formato";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Painel | Gestão Inteligente de Fechamentos" },
      {
        name: "description",
        content:
          "Visão gerencial da equipe contábil, carteira PIER, índice de entrega, vencimentos e revisão humana.",
      },
      {
        property: "og:title",
        content: "Painel | Gestão Inteligente de Fechamentos",
      },
      {
        property: "og:description",
        content:
          "Acompanhe evolução da equipe, índice de entrega, vencimentos e backlog em um só painel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Painel,
});

function Painel() {
  const competencia = competenciaAtual();

  const carteira = useQuery({
    queryKey: ["carteira", "resumo"],
    queryFn: () => listarCarteira({ data: {} }),
  });
  const revisao = useQuery({
    queryKey: ["revisao"],
    queryFn: () => listarFilaRevisao(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Painel"
        descricao={`Gestão operacional consolidada até a competência ${formatarCompetencia(competencia)}.`}
        acoes={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/gestao">
                Abrir Gestão
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/carteira">Abrir carteira</Link>
            </Button>
          </div>
        }
      />

      <EvolucaoEquipeContabil />

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
            {carteira.data?.resumo.ativos ?? 0} ativos ·{" "}
            {carteira.data?.resumo.inativos ?? 0} inativos
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
          <p className="text-3xl font-semibold tabular-nums">
            {revisao.data?.length ?? "—"}
          </p>
          <p className="text-sm text-muted-foreground">
            Itens aguardando decisão profissional ou justificativa.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/gestao">Revisar solicitações</Link>
          </Button>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="h-4 w-4 text-primary" />
            Central operacional
          </div>
          <p className="text-sm text-muted-foreground">
            Use os filtros e indicadores acima para localizar responsáveis, backlog e vencimentos antes de atuar no PIER.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/gestao">
              Abrir solicitações
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </Card>
      </div>
    </div>
  );
}
