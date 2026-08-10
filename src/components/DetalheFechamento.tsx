import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SituacaoBadge } from "@/components/SituacaoBadge";
import type { ClosingPeriod, Company, ExternalRequest, Pendency } from "@/lib/api-client";
import {
  classify,
  formatCompetencia,
  formatDate,
  responsavelDe,
  tipoLabel,
} from "@/lib/metrics";
import { FileText, CalendarClock, Paperclip, AlertTriangle } from "lucide-react";

interface Props {
  period: ClosingPeriod | null;
  company: Company | undefined;
  requests: ExternalRequest[];
  pendencies: Pendency[];
  onOpenChange: (open: boolean) => void;
}

const EVID_ICON = {
  POSTAGEM: FileText,
  ARQUIVO: Paperclip,
  STATUS: AlertTriangle,
  DATA: CalendarClock,
} as const;

export function DetalheFechamento({ period, company, requests, pendencies, onOpenChange }: Props) {
  if (!period) return null;
  const situacao = classify(period);
  const confianca = Math.round(period.confidence * 100);

  return (
    <Sheet open={!!period} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{company?.name ?? "Empresa"}</SheetTitle>
          <SheetDescription>
            {tipoLabel(period.type)} · competência {formatCompetencia(period.referenceMonth)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-8">
          <div className="flex flex-wrap items-center gap-2">
            <SituacaoBadge situacao={situacao} />
            <Badge variant="secondary">{responsavelDe(period)}</Badge>
            <Badge variant="outline">Prazo: {formatDate(period.deadlineAt)}</Badge>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium">Nível de confiança da classificação</p>
            <div className="mt-2 flex items-center gap-3">
              <Progress value={confianca} className="h-2" />
              <span className="text-sm font-semibold tabular-nums">{confianca}%</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A situação acima foi definida a partir das evidências listadas abaixo. Quanto menor a
              confiança, mais recomendável é a revisão humana.
            </p>
          </div>

          <section>
            <h3 className="text-sm font-semibold">Evidências que fundamentaram a situação</h3>
            <Separator className="my-3" />
            {period.evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma evidência disponível — este item precisa de conferência manual.
              </p>
            ) : (
              <ul className="space-y-3">
                {period.evidence.map((e, i) => {
                  const Icon = EVID_ICON[e.kind];
                  return (
                    <li key={i} className="flex gap-3 rounded-md border p-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-sm">{e.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {e.kind.toLowerCase()} · {formatDate(e.occurredAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold">Solicitações relacionadas ({requests.length})</h3>
            <Separator className="my-3" />
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {r.number} · {r.typeName}
                    </span>
                    <Badge variant="outline">{r.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Responsável: {r.responsibleName ?? "Sem responsável"} · Prazo{" "}
                    {formatDate(r.deadlineAt)} · {r.hasAttachment ? "com anexo" : "sem anexo"}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {pendencies.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Pendências apontadas</h3>
              <Separator className="my-3" />
              <ul className="space-y-2">
                {pendencies.map((p) => (
                  <li key={p.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{p.category}</span>
                      <Badge variant="outline">{p.ruleCode}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Encontrado {p.foundValue} · esperado {p.expectedValue} · diferença{" "}
                      {p.difference}
                    </p>
                    <p className="mt-2 text-sm">{p.guidance}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
