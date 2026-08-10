import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDominio } from "@/hooks/use-dominio";
import { startManagement } from "@/lib/api-client";
import { salvarGestao } from "@/lib/gestao-store";
import { SEM_RESPONSAVEL, formatCompetencia, formatDate, responsavelDe } from "@/lib/metrics";

export const Route = createFileRoute("/gestao/nova")({
  head: () => ({
    meta: [
      { title: "Nova gestão | Gestão de Fechamentos Contábeis" },
      {
        name: "description",
        content:
          "Escolha clientes, responsáveis, tipos de solicitação e competência, veja a prévia do escopo e inicie a gestão dos fechamentos.",
      },
      { property: "og:title", content: "Nova gestão | Gestão de Fechamentos Contábeis" },
      {
        property: "og:description",
        content: "Defina o recorte da gestão e visualize a prévia antes de iniciar.",
      },
    ],
  }),
  component: NovaGestaoPage,
});

const TODOS = "__todos__";

function NovaGestaoPage() {
  const { companies, periods, requests, isLoading } = useDominio();
  const navigate = useNavigate();

  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [responsavel, setResponsavel] = useState(TODOS);
  const [tipoSolicitacao, setTipoSolicitacao] = useState(TODOS);
  const [competencia, setCompetencia] = useState(TODOS);

  const responsaveis = useMemo(
    () => Array.from(new Set(periods.map(responsavelDe))).sort(),
    [periods],
  );
  const tipos = useMemo(
    () => Array.from(new Set(requests.map((r) => r.typeName))).sort(),
    [requests],
  );
  const competencias = useMemo(
    () => Array.from(new Set(periods.map((p) => p.referenceMonth))).sort().reverse(),
    [periods],
  );

  const escopo = useMemo(() => {
    const tiposIds = new Set(
      requests.filter((r) => r.typeName === tipoSolicitacao).map((r) => r.closingPeriodId),
    );
    return periods.filter((p) => {
      if (companyIds.length > 0 && !companyIds.includes(p.companyId)) return false;
      if (responsavel !== TODOS && responsavelDe(p) !== responsavel) return false;
      if (competencia !== TODOS && p.referenceMonth !== competencia) return false;
      if (tipoSolicitacao !== TODOS && !tiposIds.has(p.id)) return false;
      return true;
    });
  }, [periods, requests, companyIds, responsavel, competencia, tipoSolicitacao]);

  const escopoIds = useMemo(() => new Set(escopo.map((p) => p.id)), [escopo]);
  const solicitacoesEscopo = requests.filter((r) => escopoIds.has(r.closingPeriodId));

  const previa = {
    clientes: new Set(escopo.map((p) => p.companyId)).size,
    solicitacoes: solicitacoesEscopo.length,
    responsaveis: new Set(escopo.map(responsavelDe)).size,
    tipos: new Set(solicitacoesEscopo.map((r) => r.typeName)).size,
    proximoPrazo: escopo
      .map((p) => p.deadlineAt)
      .sort()
      .at(0),
    semResponsavel: escopo.filter((p) => !p.externalResponsibleName).length,
    semVinculo: escopo.filter(
      (p) => !companies.find((c) => c.id === p.companyId)?.linkedToPier,
    ).length,
    semClassificacao: solicitacoesEscopo.filter((r) => r.purpose === "UNMAPPED").length,
  };

  async function iniciar() {
    const gestao = await startManagement({
      companyIds,
      responsibles: responsavel === TODOS ? [] : [responsavel],
      requestTypes: tipoSolicitacao === TODOS ? [] : [tipoSolicitacao],
      referenceMonth: competencia === TODOS ? null : competencia,
    });
    salvarGestao(gestao);
    toast.success("Gestão iniciada.");
    navigate({ to: "/gestao/acompanhamento" });
  }

  function toggleCompany(id: string) {
    setCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Nova gestão</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha o recorte, confira a prévia e inicie a gestão dos fechamentos.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>
              Combine os filtros como preferir. Sem seleção de clientes, entra a carteira toda.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select value={responsavel} onValueChange={setResponsavel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos</SelectItem>
                    {responsaveis.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo de solicitação</Label>
                <Select value={tipoSolicitacao} onValueChange={setTipoSolicitacao}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos</SelectItem>
                    {tipos.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
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
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Clientes ({companyIds.length || "todos"})</Label>
                {companyIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setCompanyIds([])}>
                    Limpar seleção
                  </Button>
                )}
              </div>
              <ScrollArea className="h-64 rounded-md border p-3">
                <div className="space-y-3">
                  {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
                  {companies.map((c) => (
                    <label key={c.id} className="flex items-center gap-3 text-sm">
                      <Checkbox
                        checked={companyIds.includes(c.id)}
                        onCheckedChange={() => toggleCompany(c.id)}
                      />
                      <span className="flex-1">{c.name}</span>
                      {!c.linkedToPier && (
                        <Badge
                          variant="outline"
                          className="border-st-warn/30 bg-st-warn-soft text-st-warn"
                        >
                          sem vínculo
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Prévia do escopo</CardTitle>
            <CardDescription>O que entra na gestão com os filtros atuais.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Clientes" value={previa.clientes} />
              <Metric label="Solicitações" value={previa.solicitacoes} />
              <Metric label="Responsáveis" value={previa.responsaveis} />
              <Metric label="Tipos" value={previa.tipos} />
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <Row label="Fechamentos no escopo" value={escopo.length} />
              <Row
                label="Próximo prazo"
                value={previa.proximoPrazo ? formatDate(previa.proximoPrazo) : "—"}
              />
              <Row label="Sem responsável" value={previa.semResponsavel} alerta />
              <Row label="Sem vínculo com o PIER" value={previa.semVinculo} alerta />
              <Row label="Sem classificação de tipo" value={previa.semClassificacao} alerta />
            </div>

            <Button className="w-full" size="lg" onClick={iniciar} disabled={escopo.length === 0}>
              <Play className="h-4 w-4" />
              Iniciar gestão
            </Button>
            <p className="text-xs text-muted-foreground">
              Itens {SEM_RESPONSAVEL.toLowerCase()} continuam no escopo e aparecem em categoria
              própria no acompanhamento.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Row({
  label,
  value,
  alerta,
}: {
  label: string;
  value: number | string;
  alerta?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          alerta && Number(value) > 0 ? "font-semibold text-st-warn" : "font-semibold tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}
