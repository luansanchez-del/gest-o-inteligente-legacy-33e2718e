import { cn } from "@/lib/utils";

export const SITUACAO_LABEL: Record<string, string> = {
  CONCLUIDA_NO_PRAZO: "Concluída no prazo",
  CONCLUIDA_FORA_PRAZO: "Concluída fora do prazo",
  EM_ANDAMENTO_NO_PRAZO: "Em andamento",
  ATRASADA: "Atrasada",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  SEM_EVIDENCIA: "Sem evidência suficiente",
  PRECISA_REVISAO: "Precisa de revisão",
};

const ESTILO: Record<string, string> = {
  CONCLUIDA_NO_PRAZO: "bg-success-soft text-success-strong border-success/30",
  CONCLUIDA_FORA_PRAZO: "bg-warning-soft text-warning-strong border-warning/30",
  EM_ANDAMENTO_NO_PRAZO: "bg-info-soft text-info-strong border-info/30",
  ATRASADA: "bg-danger-soft text-danger-strong border-danger/30",
  AGUARDANDO_CLIENTE: "bg-muted text-muted-foreground border-border",
  SEM_EVIDENCIA: "bg-neutral-soft text-neutral-strong border-border",
  PRECISA_REVISAO: "bg-accent-soft text-accent-strong border-accent/30",
};

export function SituacaoBadge({ situacao, className }: { situacao: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        ESTILO[situacao] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {SITUACAO_LABEL[situacao] ?? situacao}
    </span>
  );
}
