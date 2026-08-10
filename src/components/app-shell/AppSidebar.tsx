import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  ClipboardList,
  Cog,
  Gauge,
  Inbox,
  ListChecks,
  PlayCircle,
  Rocket,
  ShieldCheck,
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
    label: "Gestão",
    itens: [
      { title: "Painel", to: "/", icon: Gauge },
      { title: "Carteira", to: "/carteira", icon: Building2 },
      { title: "Nova gestão", to: "/gestao/nova", icon: PlayCircle },
      { title: "Acompanhamento", to: "/gestao/acompanhamento", icon: ListChecks },
      { title: "Índice de entrega", to: "/indice", icon: BarChart3 },
    ],
  },
  {
    label: "Operação",
    itens: [
      { title: "Solicitações", to: "/solicitacoes", icon: Inbox },
      { title: "Revisão humana", to: "/revisao", icon: ShieldCheck },
      { title: "Implantação", to: "/implantacao", icon: Rocket },
    ],
  },
  {
    label: "Administração",
    itens: [{ title: "Configurações", to: "/configuracoes", icon: Cog }],
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
            <p className="truncate text-xs text-sidebar-foreground/60">Fechamentos contábeis</p>
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
                    item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
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
