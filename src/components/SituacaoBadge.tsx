import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SITUACAO_LABEL, type Situacao } from "@/lib/metrics";

const STYLES: Record<Situacao, string> = {
  CONCLUIDA_NO_PRAZO: "bg-st-ok-soft text-st-ok border-st-ok/30",
  CONCLUIDA_FORA_PRAZO: "bg-st-warn-soft text-st-warn border-st-warn/30",
  EM_ANDAMENTO_NO_PRAZO: "bg-st-wait-soft text-st-wait border-st-wait/30",
  ATRASADA: "bg-st-late-soft text-st-late border-st-late/30",
  AGUARDANDO_CLIENTE: "bg-st-neutral-soft text-st-neutral border-st-neutral/30",
  SEM_EVIDENCIA: "bg-st-neutral-soft text-st-neutral border-st-neutral/30",
  PRECISA_REVISAO: "bg-st-warn-soft text-st-warn border-st-warn/30",
};

export function SituacaoBadge({ situacao, className }: { situacao: Situacao; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium whitespace-nowrap", STYLES[situacao], className)}>
      {SITUACAO_LABEL[situacao]}
    </Badge>
  );
}
