import { createFileRoute, Link } from "@tanstack/react-router";
import { BookUser, BriefcaseBusiness, Calculator, ReceiptText, Users } from "lucide-react";

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
        <strong>Estrutura preparada para login por gestor:</strong> o sistema passa a tratar Contábil e Fiscal como módulos independentes. A tabela de escopo de acesso já existe, mas o bloqueio por usuário ainda não será ativado até definirmos quem pode acessar cada área.
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
          titulo="Gestão Fiscal"
          descricao="Solicitações tributárias, carteira fiscal, equipe BPO Fiscal, currículos e capacidade da operação fiscal."
          itens={[
            { rotulo: "Operação Fiscal", to: "/gestao/fiscal", icon: ReceiptText },
            { rotulo: "Carteira Fiscal", to: "/gestao/fiscal/carteira", icon: BriefcaseBusiness },
            { rotulo: "Currículos BPO Fiscal", to: "/gestao/fiscal/curriculos", icon: BookUser },
            { rotulo: "Equipe Fiscal", to: "/gestao/fiscal/equipe", icon: Users },
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
}: {
  titulo: string;
  descricao: string;
  itens: Array<{ rotulo: string; to: string; icon: typeof Calculator }>;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">{titulo}</h2>
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
