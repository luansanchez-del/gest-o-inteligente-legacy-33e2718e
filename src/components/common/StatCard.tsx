import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatarPercentual } from "@/lib/formato";

export interface IndicadorView {
  codigo: string;
  titulo: string;
  numerador: number;
  denominador: number;
  regra: string;
  formato: "CONTAGEM" | "PERCENTUAL" | "DIAS";
  valor: number;
}

function valorFormatado(indicador: IndicadorView) {
  if (indicador.formato === "PERCENTUAL") return formatarPercentual(indicador.valor);
  if (indicador.formato === "DIAS")
    return `${indicador.valor.toFixed(1).replace(".", ",")} dias`;
  return new Intl.NumberFormat("pt-BR").format(indicador.valor);
}

export function StatCard({
  indicador,
  onDrill,
  icone,
  destaque,
}: {
  indicador: IndicadorView;
  onDrill?: (codigo: string) => void;
  icone?: ReactNode;
  destaque?: boolean;
}) {
  return (
    <Card
      role={onDrill ? "button" : undefined}
      tabIndex={onDrill ? 0 : undefined}
      onClick={onDrill ? () => onDrill(indicador.codigo) : undefined}
      onKeyDown={
        onDrill
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onDrill(indicador.codigo);
              }
            }
          : undefined
      }
      className={cn(
        "flex flex-col gap-2 p-4 transition-colors",
        onDrill && "cursor-pointer hover:border-primary/40 hover:bg-primary/[0.03]",
        destaque && "border-primary/40 bg-primary/[0.04]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {indicador.titulo}
        </p>
        {icone ? <span className="text-muted-foreground">{icone}</span> : null}
      </div>
      <p className="text-2xl font-semibold tabular-nums text-foreground">
        {valorFormatado(indicador)}
      </p>
      <div className="space-y-0.5">
        <p className="text-xs tabular-nums text-muted-foreground">
          {new Intl.NumberFormat("pt-BR").format(indicador.numerador)}
          {indicador.denominador > 0
            ? ` de ${new Intl.NumberFormat("pt-BR").format(indicador.denominador)}`
            : ""}
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground/80">{indicador.regra}</p>
      </div>
    </Card>
  );
}
