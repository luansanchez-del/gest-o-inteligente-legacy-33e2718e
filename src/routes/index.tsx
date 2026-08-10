import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Link2, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanies } from "@/hooks/use-dominio";
import { linkCompanyToPier } from "@/lib/api-client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Carteira PIER | Gestão de Fechamentos Contábeis" },
      {
        name: "description",
        content:
          "Veja os clientes disponíveis no PIER, identifique quem já está vinculado ao sistema e importe novas empresas para a gestão de fechamentos.",
      },
      { property: "og:title", content: "Carteira PIER | Gestão de Fechamentos Contábeis" },
      {
        property: "og:description",
        content: "Clientes do PIER vinculados e não vinculados ao escritório contábil.",
      },
    ],
  }),
  component: CarteiraPage,
});

function CarteiraPage() {
  const { data: companies = [], isLoading } = useCompanies();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const queryClient = useQueryClient();

  const vincular = useMutation({
    mutationFn: linkCompanyToPier,
    onSuccess: (company) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success(`${company.name} vinculada ao PIER.`);
    },
  });

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return companies.filter((c) => {
      const casaBusca =
        !termo || c.name.toLowerCase().includes(termo) || c.document.includes(termo);
      const casaFiltro =
        filtro === "todas" ||
        (filtro === "vinculadas" && c.linkedToPier) ||
        (filtro === "nao" && !c.linkedToPier);
      return casaBusca && casaFiltro;
    });
  }, [companies, busca, filtro]);

  const vinculadas = companies.filter((c) => c.linkedToPier).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Carteira PIER</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {vinculadas} de {companies.length} clientes já estão vinculados a uma empresa do sistema.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou CNPJ"
            className="pl-9"
          />
        </div>
        <Tabs value={filtro} onValueChange={setFiltro}>
          <TabsList>
            <TabsTrigger value="todas">Todas</TabsTrigger>
            <TabsTrigger value="vinculadas">Vinculadas</TabsTrigger>
            <TabsTrigger value="nao">Não vinculadas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando clientes…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((company) => (
            <Card key={company.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{company.name}</CardTitle>
                  {company.linkedToPier ? (
                    <Badge variant="outline" className="border-st-ok/30 bg-st-ok-soft text-st-ok">
                      Vinculada
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-st-warn/30 bg-st-warn-soft text-st-warn"
                    >
                      Não vinculada
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>CNPJ {company.document}</p>
                  <p>Carteira: {company.segment === "BPO" ? "BPO" : "Contábil"}</p>
                  <p>Time interno: {company.internalOwnerName ?? "Não definido"}</p>
                </div>
                {company.linkedToPier ? (
                  <div className="flex items-center gap-2 text-sm text-st-ok">
                    <CheckCircle2 className="h-4 w-4" />
                    Pronta para gestão
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => vincular.mutate(company.id)}
                    disabled={vincular.isPending}
                  >
                    <Link2 className="h-4 w-4" />
                    Vincular ao sistema
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
