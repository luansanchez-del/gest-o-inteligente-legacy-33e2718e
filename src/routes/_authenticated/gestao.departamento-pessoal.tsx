import { createFileRoute } from "@tanstack/react-router";
import { ContactRound } from "lucide-react";

import { ModuloEmDesenvolvimento } from "@/components/gestao/ModuloEmDesenvolvimento";

export const Route = createFileRoute("/_authenticated/gestao/departamento-pessoal")({
  head: () => ({ meta: [{ title: "Departamento Pessoal | Gestão Inteligente" }] }),
  component: DepartamentoPessoalPage,
});

function DepartamentoPessoalPage() {
  return (
    <ModuloEmDesenvolvimento
      titulo="Departamento Pessoal"
      descricao="Operação trabalhista organizada por competência, carteira e responsável."
      icon={ContactRound}
      recursos={[
        "Folha e encargos",
        "Admissões e desligamentos",
        "Férias e afastamentos",
        "Pendências e indicadores",
      ]}
    />
  );
}
