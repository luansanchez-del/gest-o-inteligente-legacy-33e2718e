import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListaFechamentos } from "@/components/ListaFechamentos";
import { useDominio } from "@/hooks/use-dominio";
import { carregarGestao, type GestaoAtual } from "@/lib/gestao-store";
import type { ClosingPeriod } from "@/lib/api-client";
import {
  SITUACAO_LABEL,
  classify,
  companyMap,
  formatCompetencia,
  responsavelDe,
  tipoLabel,
  type Situacao,
} from "@/lib/metrics";

export const Route = createFileRoute("/gestao/acompanhamento")({
  head: () => ({
    meta: [
      { title: "Acompanhamento da gestão | Fechamentos Contábeis" },
      {
        name: "description",
        content:
          "Acompanhe os fechamentos por situação, responsável, tipo de solicitação, prazo e empresa depois de iniciar a gestão.",
      },
      { property: "og:title", content: "Acompanhamento da gestão | Fechamentos Contábeis" },
      {
        property: "og:description",
        content: "Visão por situação, responsável, tipo, prazo e empresa.",
      },
    ],
  }),
  component: AcompanhamentoPage,
});

type Agrupamento = "situacao" | "responsavel" | "tipo" | "prazo" | "empresa";

function AcompanhamentoPage() {
  const { companies, periods, requests, pendencies } = useDominio();
  const [gestao, setGestao] = useState<GestaoAtual | null>(null);
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("situacao");

  useEffect(() => {
    setGestao(carregarGestao());
  }, []);

  const escopo = useMemo(() => {
    if (!gestao) return periods;
    const f = gestao.filters;
    const tiposIds = new Set(
      requests.filter((r) => f.requestTypes.includes(r.typeName)).map((r) => r.closingPeriodId),
    );
    return periods.filter((p) => {
      if (f.companyIds.length > 0 && !f.companyIds.includes(p.companyId)) return false;
      if (f.responsibles.length > 0 && !f.responsibles.includes(responsavelDe(p))) return false;
      if (f.referenceMonth && p.referenceMonth !== f.referenceMonth) return false;
      if (f.requestTypes.length > 0 && !tiposIds.has(p.id)) return false;
      return true;
    });
  }, [gestao, periods, requests]);

  const byId = useMemo(() => companyMap(companies), [companies]);

  const grupos = useMemo(() => {
    const map = new Map<string, ClosingPeriod[]>();
    escopo.forEach((p) => {
      let chave: string;
      if (agrupamento === "situacao") chave = SITUACAO_LABEL[classify(p)];
      else if (agrupamento === "responsavel") chave = responsavelDe(p);
      else if (agrupamento === "tipo") chave = tipoLabel(p.type);
      else if (agrupamento === "empresa") chave = byId.get(p.companyId)?.name ?? "—";
      else chave = formatCompetencia(p.referenceMonth);
      const atual = map.get(chave) ?? [];
      atual.push(p);
      map.set(chave, atual);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [escopo, agrupamento, byId]);

  const concluidos = escopo.filter((p) => {
    const s: Situacao = classify(p);
    return s === "CONCLUIDA_NO_PRAZO" || s === "CONCLUIDA_FORA_PRAZO";
  }).length;
  const progresso = escopo.length === 0 ? 0 : Math.round((concluidos / escopo.length) * 100);

  if (escopo.length === 0) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <CardTitle>Nenhuma gestão em andamento</CardTitle>
          <CardDescription>Defina o recorte e inicie uma nova gestão.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/gestao/nova">Iniciar nova gestão</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Acompanhamento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {escopo.length} fechamentos no escopo
            {gestao?.filters.referenceMonth
              ? ` · competência ${formatCompetencia(gestao.filters.referenceMonth)}`
              : ""}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/gestao/nova">Alterar escopo</Link>
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Andamento geral</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-4">
            <Progress value={progresso} className="h-2.5" />
            <span className="text-sm font-semibold tabular-nums">{progresso}%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {concluidos} de {escopo.length} fechamentos concluídos.
          </p>
        </CardContent>
      </Card>

      <Tabs value={agrupamento} onValueChange={(v) => setAgrupamento(v as Agrupamento)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="situacao">Por situação</TabsTrigger>
          <TabsTrigger value="responsavel">Por responsável</TabsTrigger>
          <TabsTrigger value="tipo">Por tipo</TabsTrigger>
          <TabsTrigger value="prazo">Por competência</TabsTrigger>
          <TabsTrigger value="empresa">Por empresa</TabsTrigger>
        </TabsList>

        <TabsContent value={agrupamento} className="mt-4 space-y-4">
          {grupos.map(([chave, itens]) => (
            <Card key={chave}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">{chave}</CardTitle>
                <Badge variant="secondary">{itens.length}</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <ListaFechamentos
                  periods={itens}
                  companies={companies}
                  requests={requests}
                  pendencies={pendencies}
                />
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
