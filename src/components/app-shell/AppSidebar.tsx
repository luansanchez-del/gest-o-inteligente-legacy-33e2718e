import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookUser,
  BrainCircuit,
  Building2,
  ClipboardList,
  Gauge,
  Inbox,
  LayoutGrid,
  PlayCircle,
  ReceiptText,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const GRUPOS = [
  {
    label: "Minha Gestão",
    itens: [
      { title: "Painel", to: "/", icon: Gauge },
      { title: "Módulos de gestão", to: "/gestao/modulos", icon: LayoutGrid },
      { title: "Minha Caixa", to: "/minhas-solicitacoes", icon: Inbox },
    ],
  },
  {
    label: "Gestão Contábil",
    itens: [
      { title: "Operação Contábil", to: "/gestao", icon: PlayCircle, exact: true },
      { title: "Carteira Contábil", to: "/carteira-inteligente", icon: BrainCircuit },
      { title: "Currículos BPO Contábil", to: "/curriculos-bpo", icon: BookUser },
    ],
  },
  {
    label: "Gestão Fiscal",
    itens: [
      { title: "Operação Fiscal", to: "/gestao/fiscal", icon: ReceiptText, exact: true },
      { title: "Carteira Fiscal", to: "/gestao/fiscal/carteira", icon: BrainCircuit },
      { title: "Currículos BPO Fiscal", to: "/gestao/fiscal/curriculos", icon: BookUser },
      { title: "Equipe Fiscal", to: "/gestao/fiscal/equipe", icon: Users },
    ],
  },
  {
    label: "Estrutura / PIER",
    itens: [
      { title: "Carteira PIER", to: "/carteira", icon: Building2 },
      { title: "Equipe e departamentos", to: "/equipe", icon: Users },
    ],
  },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold leading-tight">Gestão Inteligente</p>
            <p className="truncate text-xs text-sidebar-foreground/60">Gestão por módulo e área</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {GRUPOS.map((grupo) => (
          <SidebarGroup key={grupo.label}>
            <SidebarGroupLabel>{grupo.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {grupo.itens.map((item) => {
                  const ativo =
                    item.to === "/"
                      ? pathname === "/"
                      : "exact" in item && item.exact
                        ? pathname === item.to || pathname === `${item.to}/`
                        : pathname.startsWith(item.to);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={ativo}
                        tooltip={item.title}
                      >
                        <Link to={item.to}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
