import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  BookUser,
  BrainCircuit,
  Building2,
  ClipboardList,
  Gauge,
  Inbox,
  LayoutGrid,
  ListChecks,
  Users,
  Wallet,
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
    label: "Gestão Inteligente",
    itens: [
      { title: "Visão Geral", to: "/", icon: Gauge, exact: true },
      { title: "Operação", to: "/gestao/modulos", icon: LayoutGrid },
      { title: "Solicitações", to: "/gestao", icon: ListChecks, exact: true },
      { title: "Carteira", to: "/carteira-inteligente", icon: Wallet },
      { title: "Equipe", to: "/equipe", icon: Users },
      { title: "PIER", to: "/carteira", icon: Building2, exact: true },
      { title: "Inteligência", to: "/gestao/inteligencia", icon: BrainCircuit },
      { title: "Relatórios", to: "/gestao/relatorios", icon: BarChart3 },
    ],
  },
  {
    label: "Outros",
    itens: [
      { title: "Minha Caixa", to: "/minhas-solicitacoes", icon: Inbox },
      { title: "Currículos BPO Contábil", to: "/curriculos-bpo", icon: BookUser },
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
                      <SidebarMenuButton asChild isActive={ativo} tooltip={item.title}>
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
