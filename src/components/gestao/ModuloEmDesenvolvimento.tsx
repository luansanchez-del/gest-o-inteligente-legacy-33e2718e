import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Card } from "@/components/ui/card";

export function ModuloEmDesenvolvimento({
  titulo,
  descricao,
  icon: Icon,
  recursos,
}: {
  titulo: string;
  descricao: string;
  icon: LucideIcon;
  recursos: string[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader titulo={titulo} descricao={descricao} />

      <Card className="flex flex-col items-center justify-center gap-5 px-6 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-8 w-8" />
        </span>
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning-strong">
            <Construction className="h-3.5 w-3.5" />
            Em desenvolvimento
          </span>
          <h2 className="text-xl font-semibold">Módulo em preparação</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            A área já está reservada na Gestão Inteligente, mas ainda não executa consultas,
            validações ou alterações no PIER.
          </p>
        </div>

        <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {recursos.map((recurso) => (
            <div key={recurso} className="rounded-lg border bg-muted/30 p-3 text-sm">
              {recurso}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
