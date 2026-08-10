import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  SlidersHorizontal,
  ListChecks,
  BarChart3,
  Inbox,
  LayoutDashboard,
  Boxes,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

type Item = {
  title: string;
  icon: LucideIcon;
  /** Rota tipada do app novo. */
  to?: "/" | "/gestao/nova" | "/gestao/acompanhamento" | "/indice-entrega";
  /** Caminho servido pelo catch-all legado. */
  legacy?: string;
  disabled?: boolean;
};

const grupos: Array<{ label: string; items: Item[] }> = [
  {
    label: "Gestão inteligente",
    items: [
      { title: "Gestão", icon: LayoutDashboard, legacy: "gestao-fechamentos" },
      { title: "Carteira PIER", icon: Building2, to: "/" },
      { title: "Nova gestão", icon: SlidersHorizontal, to: "/gestao/nova" },
      { title: "Acompanhamento", icon: ListChecks, to: "/gestao/acompanhamento" },
      { title: "Índice de entrega", icon: BarChart3, to: "/indice-entrega" },
      { title: "Solicitações", icon: Inbox, legacy: "pier/solicitacoes" },
    ],
  },
  {
    label: "Contábil",
    items: [
      { title: "Implantação", icon: Boxes, legacy: "implantacoes" },
      { title: "Configurações", icon: Settings, disabled: true },
    ],
  },
];

export function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  const isActive = (item: Item) =>
    item.to ? currentPath === item.to : item.legacy ? currentPath === `/${item.legacy}` : false;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-4">
        <p className="text-sm font-semibold leading-tight">Gestão Inteligente</p>
        <p className="text-xs text-sidebar-foreground/70">Fechamentos contábeis</p>
      </SidebarHeader>
      <SidebarContent>
        {grupos.map((grupo) => (
          <SidebarGroup key={grupo.label}>
            <SidebarGroupLabel>{grupo.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {grupo.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild={!item.disabled}
                      isActive={isActive(item)}
                      tooltip={item.disabled ? `${item.title} (em breve)` : item.title}
                      aria-disabled={item.disabled}
                      className={item.disabled ? "cursor-not-allowed opacity-50" : undefined}
                    >
                      {item.disabled ? (
                        <span className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </span>
                      ) : item.to ? (
                        <Link to={item.to} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      ) : (
                        <Link
                          to="/$"
                          params={{ _splat: item.legacy! }}
                          className="flex items-center gap-2"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
