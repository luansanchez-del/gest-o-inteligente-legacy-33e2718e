import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookUser,
  BriefcaseBusiness,
  Calculator,
  ContactRound,
  Landmark,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/gestao/modulos")({
  component: ModulosGestaoPage,
  head: () => ({ meta: [{ title: "Módulos de Gestão | Gestão Inteligente" }] }),
});

function ModulosGestaoPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Minha Gestão"
        descricao="Cada área possui operação, carteira, BPOs, currículos e capacidade próprios. O acesso por usuário será controlado por módulo."
      />

      <Card className="border-primary/25 bg-primary/5 p-4 text-sm">
        <strong>Estrutura preparada para login por gestor:</strong> o sistema passa a tratar
        Contábil e Fiscal como módulos independentes. A tabela de escopo de acesso já existe, mas o
        bloqueio por usuário ainda não será ativado até definirmos quem pode acessar cada área.
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Modulo
          titulo="Gestão Contábil"
          descricao="Fechamentos contábeis, carteira contábil, BPO CB, currículos, capacidade e distribuição de clientes."
          itens={[
            { rotulo: "Operação Contábil", to: "/gestao", icon: Calculator },
            { rotulo: "Carteira Contábil", to: "/carteira-inteligente", icon: BriefcaseBusiness },
            { rotulo: "Currículos BPO Contábil", to: "/curriculos-bpo", icon: BookUser },
            { rotulo: "Equipe e departamentos", to: "/equipe", icon: Users },
          ]}
        />

        <Modulo
          titulo="Gestão BPO Financeiro"
          descricao="Conciliação, movimentações financeiras, pendências e acompanhamento da operação financeira."
          status="EM_DESENVOLVIMENTO"
          itens={[{ rotulo: "Visão geral", to: "/gestao/financeiro", icon: Landmark }]}
        />

        <Modulo
          titulo="Departamento Pessoal"
          descricao="Folha, admissões, desligamentos, férias e solicitações da rotina trabalhista."
          status="EM_DESENVOLVIMENTO"
          itens={[
            {
              rotulo: "Visão geral",
              to: "/gestao/departamento-pessoal",
              icon: ContactRound,
            },
          ]}
        />
      </div>
    </div>
  );
}

function Modulo({
  titulo,
  descricao,
  itens,
  status,
}: {
  titulo: string;
  descricao: string;
  itens: Array<{ rotulo: string; to: string; icon: typeof Calculator }>;
  status?: "EM_DESENVOLVIMENTO";
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {status === "EM_DESENVOLVIMENTO" ? (
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning-strong">
            Em desenvolvimento
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {itens.map((item) => (
          <Button key={item.to} asChild variant="outline" className="justify-start">
            <Link to={item.to}>
              <item.icon className="mr-2 h-4 w-4" />
              {item.rotulo}
            </Link>
          </Button>
        ))}
      </div>
    </Card>
  );
}
