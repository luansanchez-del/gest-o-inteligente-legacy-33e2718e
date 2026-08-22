import { createFileRoute } from "@tanstack/react-router";
import { Landmark } from "lucide-react";

import { ModuloEmDesenvolvimento } from "@/components/gestao/ModuloEmDesenvolvimento";

export const Route = createFileRoute("/_authenticated/gestao/financeiro")({
  head: () => ({ meta: [{ title: "Gestão BPO Financeiro | Gestão Inteligente" }] }),
  component: GestaoFinanceiraPage,
});

function GestaoFinanceiraPage() {
  return (
    <ModuloEmDesenvolvimento
      titulo="Gestão BPO Financeiro"
      descricao="Operação financeira organizada por competência, carteira e responsável."
      icon={Landmark}
      recursos={[
        "Conciliação e movimentações financeiras",
        "Pendências e documentos",
        "Carteira e responsáveis",
        "Indicadores da operação",
      ]}
    />
  );
}
