import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { mensagemDeErro } from "@/lib/erros";

export function CarregandoTabela({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: linhas }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function ErroConsulta({
  error,
  onRetry,
  titulo = "Não foi possível carregar os dados",
}: {
  error: unknown;
  onRetry?: () => void;
  titulo?: string;
}) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{titulo}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{mensagemDeErro(error)}</p>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Tentar novamente
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function EstadoVazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{titulo}</p>
        {descricao ? (
          <p className="max-w-md text-sm text-muted-foreground">{descricao}</p>
        ) : null}
      </div>
      {acao}
    </div>
  );
}
