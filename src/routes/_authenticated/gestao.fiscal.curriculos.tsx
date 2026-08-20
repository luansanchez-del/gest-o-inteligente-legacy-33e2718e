import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookUser, ShieldCheck, Users } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { ErroConsulta, EstadoVazio } from "@/components/common/EstadoConsulta";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listarEquipe } from "@/lib/api/gestao.functions";

export const Route = createFileRoute("/_authenticated/gestao/fiscal/curriculos")({
  component: CurriculosFiscalPage,
  head: () => ({ meta: [{ title: "Currículos BPO Fiscal | Gestão Inteligente" }] }),
});

const DEPARTAMENTO_FISCAL = "16103";

function CurriculosFiscalPage() {
  const equipe = useQuery({
    queryKey: ["curriculos-fiscal-equipe", DEPARTAMENTO_FISCAL],
    queryFn: () => listarEquipe({ data: { incluirInativos: false, somenteContabeis: false } }),
  });
  const bpos = (equipe.data?.usuarios ?? []).filter(
    (u) => u.departamentoId === DEPARTAMENTO_FISCAL && /^BPO FISCAL/i.test(u.nome),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Currículos BPO — Gestão Fiscal"
        descricao="Perfis profissionais do Fiscal serão analisados e utilizados somente na distribuição da Carteira Fiscal."
        acoes={<Button asChild variant="outline"><Link to="/gestao/fiscal/equipe"><Users className="mr-2 h-4 w-4" />Equipe Fiscal</Link></Button>}
      />

      <Card className="flex items-start gap-3 border-primary/25 bg-primary/5 p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div><p className="font-medium">Perfil fiscal independente</p><p className="mt-1 text-muted-foreground">A experiência relevante aqui será fiscal/tributária: ICMS, ISS, PIS/COFINS, SPED Fiscal, SPED Contribuições, Simples Nacional, IRPJ/CSLL, sistemas e segmentos. O perfil contábil não será reutilizado automaticamente.</p></div>
      </Card>

      {equipe.isError ? <ErroConsulta error={equipe.error} onRetry={() => void equipe.refetch()} /> : null}
      <Card className="overflow-hidden">
        <div className="border-b p-4"><div className="flex items-center gap-2"><BookUser className="h-4 w-4" /><p className="font-semibold">Profissionais do módulo Fiscal</p></div><p className="mt-1 text-sm text-muted-foreground">A próxima evolução desta tela será o upload/análise de currículo já gravando no escopo Fiscal.</p></div>
        {!equipe.isLoading && !bpos.length ? <EstadoVazio titulo="Nenhum BPO Fiscal encontrado." descricao="Confira a equipe do departamento TRIBUTÁRIO BPO." /> : (
          <Table><TableHeader><TableRow><TableHead>Profissional</TableHead><TableHead>Tipo</TableHead><TableHead>Perfil fiscal</TableHead></TableRow></TableHeader><TableBody>
            {bpos.map((u) => <TableRow key={u.id}><TableCell className="font-medium">{u.nome}</TableCell><TableCell>{u.tipo ?? "—"}</TableCell><TableCell className="text-muted-foreground">Currículo ainda não vinculado ao módulo Fiscal</TableCell></TableRow>)}
          </TableBody></Table>
        )}
      </Card>
    </div>
  );
}
