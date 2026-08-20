import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { ErroConsulta, EstadoVazio } from "@/components/common/EstadoConsulta";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listarEquipe } from "@/lib/api/gestao.functions";

export const Route = createFileRoute("/_authenticated/gestao/fiscal/equipe")({
  component: EquipeFiscalPage,
  head: () => ({ meta: [{ title: "Equipe Fiscal | Gestão Inteligente" }] }),
});

const DEPARTAMENTO_FISCAL = "16103";

function EquipeFiscalPage() {
  const equipe = useQuery({
    queryKey: ["equipe-fiscal", DEPARTAMENTO_FISCAL],
    queryFn: () => listarEquipe({ data: { incluirInativos: false, somenteContabeis: false } }),
  });

  const usuarios = (equipe.data?.usuarios ?? []).filter(
    (u) => u.departamentoId === DEPARTAMENTO_FISCAL && /^BPO FISCAL/i.test(u.nome),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Equipe Fiscal"
        descricao="Equipe BPO FISCAL do departamento TRIBUTÁRIO BPO. Este conjunto é independente dos BPO CB da Gestão Contábil."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="p-4"><p className="text-xs uppercase text-muted-foreground">BPO Fiscal ativos</p><p className="mt-2 text-3xl font-semibold">{usuarios.length}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase text-muted-foreground">Departamento PIER</p><p className="mt-2 font-semibold">TRIBUTÁRIO BPO</p><p className="text-xs text-muted-foreground">ID {DEPARTAMENTO_FISCAL}</p></Card>
        <Card className="p-4"><div className="flex items-center gap-2"><Users className="h-4 w-4" /><p className="font-medium">Escopo separado</p></div><p className="mt-2 text-sm text-muted-foreground">Carteira, currículos e capacidade Fiscal não utilizam os perfis BPO CB contábeis.</p></Card>
      </div>

      {equipe.isError ? <ErroConsulta error={equipe.error} onRetry={() => void equipe.refetch()} /> : null}
      <Card className="overflow-hidden">
        {!equipe.isLoading && !usuarios.length ? (
          <EstadoVazio titulo="Nenhum BPO Fiscal encontrado." descricao="Sincronize a equipe do PIER e confira o departamento 16103." />
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Profissional</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead>Departamento</TableHead></TableRow></TableHeader>
            <TableBody>{usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}</TableCell>
                <TableCell>{u.tipo ?? "—"}</TableCell>
                <TableCell><Badge variant="secondary">{u.status ?? "—"}</Badge></TableCell>
                <TableCell>TRIBUTÁRIO BPO</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
