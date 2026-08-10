import { useMemo, useState } from "react";
import { SituacaoBadge } from "@/components/SituacaoBadge";
import { DetalheFechamento } from "@/components/DetalheFechamento";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ClosingPeriod, Company, ExternalRequest, Pendency } from "@/lib/api-client";
import {
  classify,
  companyMap,
  formatCompetencia,
  formatDate,
  responsavelDe,
  tipoLabel,
} from "@/lib/metrics";

interface Props {
  periods: ClosingPeriod[];
  companies: Company[];
  requests: ExternalRequest[];
  pendencies: Pendency[];
  emptyMessage?: string;
}

export function ListaFechamentos({
  periods,
  companies,
  requests,
  pendencies,
  emptyMessage = "Nenhum item para o recorte selecionado.",
}: Props) {
  const [selected, setSelected] = useState<ClosingPeriod | null>(null);
  const byId = useMemo(() => companyMap(companies), [companies]);

  if (periods.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer"
                onClick={() => setSelected(p)}
              >
                <TableCell className="font-medium">{byId.get(p.companyId)?.name ?? "—"}</TableCell>
                <TableCell>{formatCompetencia(p.referenceMonth)}</TableCell>
                <TableCell className="text-muted-foreground">{tipoLabel(p.type)}</TableCell>
                <TableCell className="text-muted-foreground">{responsavelDe(p)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(p.deadlineAt)}</TableCell>
                <TableCell>
                  <SituacaoBadge situacao={classify(p)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DetalheFechamento
        period={selected}
        company={selected ? byId.get(selected.companyId) : undefined}
        requests={selected ? requests.filter((r) => r.closingPeriodId === selected.id) : []}
        pendencies={selected ? pendencies.filter((r) => r.closingPeriodId === selected.id) : []}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  );
}
