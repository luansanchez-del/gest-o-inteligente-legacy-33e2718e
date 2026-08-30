import type { CSSProperties } from "react";
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

const SIDEBAR_STYLE = {
  "--sidebar": "oklch(0.19 0.055 267)",
  "--sidebar-foreground": "oklch(0.97 0.01 255)",
  "--sidebar-primary": "oklch(0.61 0.24 285)",
  "--sidebar-primary-foreground": "oklch(0.99 0.005 255)",
  "--sidebar-accent": "oklch(0.28 0.075 273)",
  "--sidebar-accent-foreground": "oklch(0.99 0.005 255)",
  "--sidebar-border": "oklch(1 0 0 / 10%)",
  "--sidebar-ring": "oklch(0.7 0.19 285)",
} as CSSProperties;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon" className="border-r-0" style={SIDEBAR_STYLE}>
      <SidebarHeader className="border-b border-white/10 px-3 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 text-white shadow-lg shadow-violet-950/25">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold leading-tight text-white">Gestão Inteligente</p>
            <p className="mt-0.5 truncate text-[11px] text-white/50">Central de gestão do escritório</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1 py-2">
        {GRUPOS.map((grupo) => (
          <SidebarGroup key={grupo.label} className="py-2">
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
              {grupo.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
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
                        className="h-10 rounded-xl px-3 text-white/72 hover:bg-white/10 hover:text-white data-[active=true]:bg-gradient-to-r data-[active=true]:from-blue-600 data-[active=true]:via-indigo-600 data-[active=true]:to-violet-600 data-[active=true]:text-white data-[active=true]:shadow-md data-[active=true]:shadow-violet-950/20"
                      >
                        <Link to={item.to}>
                          <item.icon className="opacity-90" />
                          <span className="flex-1">{item.title}</span>
                          {item.title === "PIER" ? (
                            <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/40" />
                          ) : null}
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
