import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListaFechamentos } from "@/components/ListaFechamentos";
import { useDominio } from "@/hooks/use-dominio";
import type { ClosingPeriod } from "@/lib/api-client";
import {
  SEM_RESPONSAVEL,
  calcularIndicadores,
  classify,
  evolucaoMensal,
  formatCompetencia,
  responsavelDe,
  tipoLabel,
} from "@/lib/metrics";

export const Route = createFileRoute("/indice-entrega")({
  head: () => ({
    meta: [
      { title: "Índice de entrega | Fechamentos Contábeis" },
      {
        name: "description",
        content:
          "Painel consolidado do índice de entrega dos fechamentos contábeis, com detalhamento por carteira, empresa, responsável, tipo e competência.",
      },
      { property: "og:title", content: "Índice de entrega | Fechamentos Contábeis" },
      {
        property: "og:description",
        content: "Indicadores de entrega com numerador, denominador e detalhamento clicável.",
      },
    ],
  }),
  component: IndicePage,
});

const TODOS = "__todos__";
type Recorte = "geral" | "bpo" | "interno" | "empresa" | "responsavel" | "tipo";

function IndicePage() {
  const { companies, periods, requests, pendencies } = useDominio();

  const [recorte, setRecorte] = useState<Recorte>("geral");
  const [valorRecorte, setValorRecorte] = useState(TODOS);
  const [competencia, setCompetencia] = useState(TODOS);
  const [grafico, setGrafico] = useState<"linha" | "barra">("linha");
  const [drill, setDrill] = useState<{ titulo: string; regra: string; itens: ClosingPeriod[] } | null>(
    null,
  );

  const competencias = useMemo(
    () => Array.from(new Set(periods.map((p) => p.referenceMonth))).sort().reverse(),
    [periods],
  );

  const opcoesRecorte = useMemo(() => {
    if (recorte === "empresa") return companies.map((c) => c.name);
    if (recorte === "responsavel")
      return Array.from(new Set(periods.map(responsavelDe))).sort();
    if (recorte === "tipo") return ["Fechamento contábil", "Fechamento fiscal"];
    if (recorte === "interno")
      return Array.from(
        new Set(companies.map((c) => c.internalOwnerName ?? "Sem time interno")),
      ).sort();
    return [];
  }, [recorte, companies, periods]);

  const base = useMemo(() => {
    return periods.filter((p) => {
      if (competencia !== TODOS && p.referenceMonth !== competencia) return false;
      const company = companies.find((c) => c.id === p.companyId);
      if (recorte === "bpo" && company?.segment !== "BPO") return false;
      if (valorRecorte !== TODOS) {
        if (recorte === "empresa" && company?.name !== valorRecorte) return false;
        if (recorte === "responsavel" && responsavelDe(p) !== valorRecorte) return false;
        if (recorte === "tipo" && tipoLabel(p.type) !== valorRecorte) return false;
        if (
          recorte === "interno" &&
          (company?.internalOwnerName ?? "Sem time interno") !== valorRecorte
        )
          return false;
      }
      return true;
    });
  }, [periods, companies, recorte, valorRecorte, competencia]);

  const ind = useMemo(() => calcularIndicadores(base), [base]);
  const evolucao = useMemo(() => evolucaoMensal(periods), [periods]);

  const abrir = (titulo: string, regra: string, filtro: (p: ClosingPeriod) => boolean) =>
    setDrill({ titulo, regra, itens: base.filter(filtro) });

  const concluida = (p: ClosingPeriod) =>
    classify(p) === "CONCLUIDA_NO_PRAZO" || classify(p) === "CONCLUIDA_FORA_PRAZO";

  const cards = [
    {
      titulo: "Total previsto",
      valor: ind.previstos,
      regra: "Todos os fechamentos do recorte selecionado.",
      filtro: () => true,
    },
    {
      titulo: "Total entregue",
      valor: ind.entregues,
      regra: "Fechamentos concluídos, dentro ou fora do prazo.",
      filtro: concluida,
    },
    {
      titulo: "Entregues no prazo",
      valor: ind.entreguesNoPrazo,
      regra: "Conclusão registrada até a data limite.",
      filtro: (p: ClosingPeriod) => classify(p) === "CONCLUIDA_NO_PRAZO",
    },
    {
      titulo: "Entregues fora do prazo",
      valor: ind.entreguesForaPrazo,
      regra: "Conclusão registrada após a data limite.",
      filtro: (p: ClosingPeriod) => classify(p) === "CONCLUIDA_FORA_PRAZO",
    },
    {
      titulo: "Em andamento",
      valor: ind.emAndamento,
      regra: "Ainda dentro do prazo, com trabalho em curso.",
      filtro: (p: ClosingPeriod) => classify(p) === "EM_ANDAMENTO_NO_PRAZO",
    },
    {
      titulo: "Atrasados",
      valor: ind.atrasados,
      regra: "Prazo vencido sem conclusão registrada.",
      filtro: (p: ClosingPeriod) => classify(p) === "ATRASADA",
    },
    {
      titulo: "Aguardando cliente",
      valor: ind.aguardandoCliente,
      regra: "Depende de documento ou resposta do cliente.",
      filtro: (p: ClosingPeriod) => classify(p) === "AGUARDANDO_CLIENTE",
    },
    {
      titulo: "Sem evidência suficiente",
      valor: ind.semEvidencia,
      regra: "Não há postagem, arquivo ou status que sustente uma conclusão.",
      filtro: (p: ClosingPeriod) => classify(p) === "SEM_EVIDENCIA",
    },
    {
      titulo: "Precisam de revisão humana",
      valor: ind.precisaRevisao,
      regra: "Divergências ou baixa confiança na classificação automática.",
      filtro: (p: ClosingPeriod) => classify(p) === "PRECISA_REVISAO",
    },
    {
      titulo: SEM_RESPONSAVEL,
      valor: ind.semResponsavel,
      regra: "Fechamentos sem responsável definido — nunca saem do indicador.",
      filtro: (p: ClosingPeriod) => !p.externalResponsibleName,
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Índice de entrega</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todos os números são clicáveis e abrem a lista de empresas que os compõem.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recorte</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Visão</Label>
            <Select
              value={recorte}
              onValueChange={(v) => {
                setRecorte(v as Recorte);
                setValorRecorte(TODOS);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="geral">Carteira geral</SelectItem>
                <SelectItem value="bpo">BPO</SelectItem>
                <SelectItem value="interno">Colaborador interno</SelectItem>
                <SelectItem value="empresa">Empresa</SelectItem>
                <SelectItem value="responsavel">Responsável do PIER</SelectItem>
                <SelectItem value="tipo">Tipo de solicitação</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Detalhe</Label>
            <Select
              value={valorRecorte}
              onValueChange={setValorRecorte}
              disabled={opcoesRecorte.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {opcoesRecorte.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Competência</Label>
            <Select value={competencia} onValueChange={setCompetencia}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {competencias.map((c) => (
                  <SelectItem key={c} value={c}>
                    {formatCompetencia(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-brand/30 bg-brand/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Índice de entrega</CardTitle>
          <CardDescription>
            Regra de cálculo: fechamentos entregues ÷ fechamentos previstos no recorte.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-6">
          <button
            className="text-left"
            onClick={() => abrir("Fechamentos entregues", "Entregues ÷ previstos", concluida)}
          >
            <span className="text-4xl font-semibold tabular-nums text-brand">
              {Math.round(ind.indice * 100)}%
            </span>
          </button>
          <div className="text-sm text-muted-foreground">
            <p className="tabular-nums">
              <span className="font-semibold text-foreground">{ind.entregues}</span> entregues ÷{" "}
              <span className="font-semibold text-foreground">{ind.previstos}</span> previstos
            </p>
            <p className="mt-1">
              Prazo médio de entrega: {formatDias(ind.prazoMedioEntrega)} · Atraso médio:{" "}
              {formatDias(ind.atrasoMedio)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.titulo}
            onClick={() => abrir(c.titulo, c.regra, c.filtro)}
            className="rounded-xl border bg-card p-4 text-left transition-colors hover:border-brand/50 hover:bg-accent/40"
          >
            <p className="text-sm font-medium">{c.titulo}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{c.valor}</p>
            <p className="mt-2 text-xs text-muted-foreground">{c.regra}</p>
            <Badge variant="secondary" className="mt-3">
              Ver empresas
            </Badge>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Evolução mensal do índice de entrega</CardTitle>
            <CardDescription>Percentual de entregas por competência.</CardDescription>
          </div>
          <Select value={grafico} onValueChange={(v) => setGrafico(v as "linha" | "barra")}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linha">Linha</SelectItem>
              <SelectItem value="barra">Barra</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            {grafico === "linha" ? (
              <LineChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis unit="%" stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  formatter={(v: number, _n, item) =>
                    [`${v}% (${item.payload.entregues}/${item.payload.previstos})`, "Índice"]
                  }
                />
                <Line type="monotone" dataKey="indice" stroke="var(--brand)" strokeWidth={2} />
              </LineChart>
            ) : (
              <BarChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis unit="%" stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  formatter={(v: number, _n, item) =>
                    [`${v}% (${item.payload.entregues}/${item.payload.previstos})`, "Índice"]
                  }
                />
                <Bar dataKey="indice" fill="var(--brand)" radius={[6, 6, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Dialog open={!!drill} onOpenChange={(open) => !open && setDrill(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{drill?.titulo}</DialogTitle>
            <DialogDescription>
              {drill?.regra} · {drill?.itens.length} itens
            </DialogDescription>
          </DialogHeader>
          <ListaFechamentos
            periods={drill?.itens ?? []}
            companies={companies}
            requests={requests}
            pendencies={pendencies}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatDias(valor: number) {
  const dias = Math.abs(Math.round(valor));
  if (valor === 0) return "sem dados";
  return valor < 0 ? `${dias} dias de antecedência` : `${dias} dias`;
}
