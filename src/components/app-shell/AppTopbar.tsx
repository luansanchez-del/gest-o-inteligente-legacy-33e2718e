import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, User } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

const ROTULOS: Record<string, string> = {
  carteira: "Carteira PIER",
  gestao: "Gestão",
  nova: "Nova gestão",
  acompanhamento: "Acompanhamento",
  execucoes: "Execução",
  indice: "Índice de entrega",
  solicitacoes: "Solicitações",
  competencias: "Competência",
  revisao: "Revisão humana",
  implantacao: "Implantação",
  configuracoes: "Configurações",
};

export function AppTopbar({ organizacao }: { organizacao?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const partes = pathname.split("/").filter(Boolean);

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {partes.length === 0 ? (
              <BreadcrumbPage>Painel</BreadcrumbPage>
            ) : (
              <BreadcrumbLink asChild>
                <Link to="/">Painel</Link>
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {partes.map((parte, indice) => (
            <BreadcrumbItem key={`${parte}-${indice}`}>
              <BreadcrumbSeparator />
              <BreadcrumbPage>{ROTULOS[parte] ?? parte}</BreadcrumbPage>
            </BreadcrumbItem>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        {organizacao ? (
          <span className="hidden text-xs text-muted-foreground md:inline">{organizacao}</span>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Conta">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{organizacao ?? "Minha conta"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void sair()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
