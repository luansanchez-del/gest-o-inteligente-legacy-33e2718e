import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookUser, BriefcaseBusiness, Users } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { ErroConsulta, EstadoVazio } from "@/components/common/EstadoConsulta";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listarEquipe } from "@/lib/api/gestao.functions";

export const Route = createFileRoute("/_authenticated/gestao/fiscal/carteira")({
  component: CarteiraFiscalPage,
  head: () => ({ meta: [{ title: "Carteira Fiscal | Gestão Inteligente" }] }),
});

const DEPARTAMENTO_FISCAL = "16103";

function CarteiraFiscalPage() {
  const equipe = useQuery({
    queryKey: ["carteira-fiscal-equipe", DEPARTAMENTO_FISCAL],
    queryFn: () => listarEquipe({ data: { incluirInativos: false, somenteContabeis: false } }),
  });

  const bpos = (equipe.data?.usuarios ?? []).filter(
    (u) => u.departmentId === DEPARTAMENTO_FISCAL && /^BPO FISCAL/i.test(u.nome),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Carteira Inteligente Fiscal"
        descricao="Carteira gerencial exclusiva do Fiscal. Não reutiliza a carteira BPO contábil e não altera o PIER automaticamente."
        acoes={<div className="flex gap-2"><Button asChild variant="outline"><Link to="/gestao/fiscal/equipe"><Users className="mr-2 h-4 w-4" />Equipe Fiscal</Link></Button><Button asChild variant="outline"><Link to="/gestao/fiscal/curriculos"><BookUser className="mr-2 h-4 w-4" />Currículos Fiscal</Link></Button></div>}
      />

      <Card className="border-primary/25 bg-primary/5 p-4 text-sm">
        <strong>Separação por módulo:</strong> esta carteira será alimentada somente por clientes e BPOs do Fiscal. A carteira Contábil existente permanece intacta. O próximo passo será importar a lista de carteira Fiscal e as regras de repasse específicas da área.
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="p-4"><p className="text-xs uppercase text-muted-foreground">Clientes na carteira fiscal</p><p className="mt-2 text-3xl font-semibold">0</p><p className="text-xs text-muted-foreground">aguardando base oficial</p></Card>
        <Card className="p-4"><p className="text-xs uppercase text-muted-foreground">BPO Fiscal disponíveis</p><p className="mt-2 text-3xl font-semibold">{bpos.length}</p><p className="text-xs text-muted-foreground">departamento TRIBUTÁRIO BPO</p></Card>
        <Card className="p-4"><div className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4" /><p className="font-medium">Fonte da carteira</p></div><p className="mt-2 text-sm text-muted-foreground">Planilha/definição do gestor Fiscal. O responsável atual do PIER será apenas referência e divergência.</p></Card>
      </div>

      {equipe.isError ? <ErroConsulta error={equipe.error} onRetry={() => void equipe.refetch()} /> : null}

      <Card className="overflow-hidden">
        <div className="border-b p-4"><p className="font-semibold">BPOs disponíveis para futura distribuição Fiscal</p><p className="text-sm text-muted-foreground">A carteira Fiscal será cruzada somente com estes profissionais e seus currículos fiscais.</p></div>
        {!equipe.isLoading && !bpos.length ? (
          <EstadoVazio titulo="Nenhum BPO Fiscal encontrado." descricao="Confira a sincronização da equipe do PIER." />
        ) : (
          <Table><TableHeader><TableRow><TableHead>Profissional</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
            {bpos.map((u) => <TableRow key={u.id}><TableCell className="font-medium">{u.nome}</TableCell><TableCell>{u.tipo ?? "—"}</TableCell><TableCell>{u.status ?? "—"}</TableCell></TableRow>)}
          </TableBody></Table>
        )}
      </Card>
    </div>
  );
}
