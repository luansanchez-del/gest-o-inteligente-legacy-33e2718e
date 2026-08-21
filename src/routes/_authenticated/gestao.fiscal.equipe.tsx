import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { ErroConsulta, EstadoVazio } from "@/components/common/EstadoConsulta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listarEquipeFiscal, sincronizarEquipeFiscal } from "@/lib/api/fiscal.functions";
import { mensagemDeErro } from "@/lib/erros";

export const Route = createFileRoute("/_authenticated/gestao/fiscal/equipe")({
  component: EquipeFiscalPage,
  head: () => ({ meta: [{ title: "Equipe Fiscal | Gestão Inteligente" }] }),
});

function EquipeFiscalPage() {
  const queryClient = useQueryClient();
  const equipe = useQuery({
    queryKey: ["equipe-fiscal"],
    queryFn: () => listarEquipeFiscal(),
  });

  const sincronizar = useMutation({
    mutationFn: () => sincronizarEquipeFiscal(),
    onSuccess: (r) => {
      const detalhe = r.departamentos
        .map((d) => `${d.nome}: ${d.totalUsuarios}`)
        .join(" · ");
      toast.success(`${r.processados} usuário(s) fiscais sincronizados.`, {
        description: detalhe || "TRIBUTARIO BPO + TRIBUTARIO LEGACY",
      });
      void queryClient.invalidateQueries({ queryKey: ["equipe-fiscal"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const usuarios = equipe.data?.usuarios ?? [];
  const nomeDepartamento = new Map(
    (equipe.data?.departamentos ?? []).map((d) => [d.id, d.nome]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Equipe Fiscal"
        descricao="Equipe dos dois departamentos fiscais do PIER: TRIBUTARIO BPO e TRIBUTARIO LEGACY. O escopo é definido pelo departamento, não pelo nome do usuário."
        acoes={
          <Button
            variant="outline"
            onClick={() => sincronizar.mutate()}
            disabled={sincronizar.isPending}
          >
            {sincronizar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar equipe fiscal
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Equipe fiscal ativa</p>
          <p className="mt-2 text-3xl font-semibold">{usuarios.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Somando os dois departamentos</p>
        </Card>

        {(equipe.data?.departamentos ?? []).map((d) => (
          <Card key={d.id} className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Departamento PIER</p>
            <p className="mt-2 font-semibold">{d.nome}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              ID {d.id} · {d.totalUsuarios} usuário(s) ativo(s)
            </p>
          </Card>
        ))}

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <p className="font-medium">Escopo Fiscal</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Operação, carteira, currículos e capacidade Fiscal usam TRIBUTARIO BPO + TRIBUTARIO LEGACY.
          </p>
        </Card>
      </div>

      {equipe.isError ? <ErroConsulta error={equipe.error} onRetry={() => void equipe.refetch()} /> : null}

      <Card className="overflow-hidden">
        {!equipe.isLoading && !usuarios.length ? (
          <EstadoVazio
            titulo="Nenhum usuário fiscal encontrado."
            descricao="Clique em “Sincronizar equipe fiscal” para atualizar TRIBUTARIO BPO e TRIBUTARIO LEGACY a partir do PIER."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profissional</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Departamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nome}</TableCell>
                  <TableCell><Badge variant="secondary">{u.status ?? "—"}</Badge></TableCell>
                  <TableCell>{nomeDepartamento.get(u.departamentoId ?? "") ?? "Departamento fiscal"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
