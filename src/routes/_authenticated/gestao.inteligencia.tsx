import { createFileRoute } from "@tanstack/react-router";
import { BrainCircuit } from "lucide-react";

import { ModuloEmDesenvolvimento } from "@/components/gestao/ModuloEmDesenvolvimento";

export const Route = createFileRoute("/_authenticated/gestao/inteligencia")({
  head: () => ({ meta: [{ title: "Inteligência | Gestão Inteligente" }] }),
  component: InteligenciaPage,
});

function InteligenciaPage() {
  return (
    <ModuloEmDesenvolvimento
      titulo="Inteligência"
      descricao="Exceções, reincidências e sugestões automáticas para priorizar o time."
      icon={BrainCircuit}
      recursos={[
        "Detecção de exceções e reincidências",
        "Análise de risco por empresa e responsável",
        "Sugestões automáticas de priorização",
        "Alertas de padrões fora do esperado",
      ]}
    />
  );
}
