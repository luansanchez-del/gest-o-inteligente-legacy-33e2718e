import { Building2, Link2, Download, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LinhaCarteira } from "@/hooks/use-pier-carteira";
import type { PierClienteCache } from "@/legacy/api/types";

function formatarData(valor: string | null | undefined) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function SituacaoBadge({ linha }: { linha: LinhaCarteira }) {
  if (linha.situacao === "VINCULADO") {
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Empresa local</Badge>
    );
  }
  if (linha.situacao === "SEM_EMPRESA_LOCAL") {
    return <Badge variant="secondary">Sem empresa local</Badge>;
  }
  return <Badge variant="outline">Não identificado</Badge>;
}

export function CarteiraTable({
  linhas,
  onImportar,
  onVincular,
  importandoId,
  vinculandoId,
}: {
  linhas: LinhaCarteira[];
  onImportar: (cliente: PierClienteCache) => void;
  onVincular: (companyId: string) => void;
  importandoId: string | null;
  vinculandoId: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="min-w-[220px]">Cliente</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead>Código externo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Tributação</TableHead>
            <TableHead>Vínculo</TableHead>
            <TableHead>Empresa local</TableHead>
            <TableHead>Sincronizado em</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((linha) => {
            const { cliente, empresaLocal } = linha;
            return (
              <TableRow key={cliente.id} className="text-sm">
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {cliente.nome ?? `Cliente ${cliente.externalId}`}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">
                  {cliente.documento ?? "Não identificado"}
                </TableCell>
                <TableCell className="tabular-nums">{cliente.externalId}</TableCell>
                <TableCell>{cliente.status ?? "—"}</TableCell>
                <TableCell>{cliente.tributacao ?? "—"}</TableCell>
                <TableCell>
                  <SituacaoBadge linha={linha} />
                </TableCell>
                <TableCell>{empresaLocal?.name ?? "Não identificado"}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatarData(cliente.syncedAt)}
                </TableCell>
                <TableCell className="text-right">
                  {empresaLocal ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={vinculandoId !== null}
                      onClick={() => onVincular(empresaLocal.id)}
                    >
                      {vinculandoId === empresaLocal.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="h-4 w-4" />
                      )}
                      Revincular
                    </Button>
                  ) : linha.situacao === "SEM_EMPRESA_LOCAL" ? (
                    <Button
                      size="sm"
                      disabled={importandoId !== null}
                      onClick={() => onImportar(cliente)}
                    >
                      {importandoId === cliente.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Importar
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Sem documento para vincular
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
