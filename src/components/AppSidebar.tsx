import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, SlidersHorizontal, ListChecks, BarChart3 } from "lucide-react";
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

const items = [
  { title: "Carteira PIER", url: "/", icon: Building2 },
  { title: "Nova gestão", url: "/gestao/nova", icon: SlidersHorizontal },
  { title: "Acompanhamento", url: "/gestao/acompanhamento", icon: ListChecks },
  { title: "Índice de entrega", url: "/indice-entrega", icon: BarChart3 },
] as const;

export function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-4">
        <p className="text-sm font-semibold leading-tight">Gestão de Fechamentos</p>
        <p className="text-xs text-sidebar-foreground/70">Contabilidade & BPO</p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={currentPath === item.url} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
