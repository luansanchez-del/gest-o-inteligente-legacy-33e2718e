import { createFileRoute } from "@tanstack/react-router";
import { FileBarChart } from "lucide-react";

import { ModuloEmDesenvolvimento } from "@/components/gestao/ModuloEmDesenvolvimento";

export const Route = createFileRoute("/_authenticated/gestao/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios | Gestão Inteligente" }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  return (
    <ModuloEmDesenvolvimento
      titulo="Relatórios"
      descricao="Produtividade, SLA, atrasos, carteira e performance por período."
      icon={FileBarChart}
      recursos={[
        "Relatório de produtividade da equipe",
        "SLA e atrasos por departamento",
        "Carteira e evolução por competência",
        "Exportação para planilha",
      ]}
    />
  );
}
