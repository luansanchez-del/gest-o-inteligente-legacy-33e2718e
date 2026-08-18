import { Link, useRouterState } from "@tanstack/react-router";
import {
  BrainCircuit,
  Building2,
  ClipboardList,
  Gauge,
  Inbox,
  PlayCircle,
  UserRoundSearch,
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
    label: "Gestão",
    itens: [
      { title: "Painel", to: "/", icon: Gauge },
      { title: "Minha Caixa", to: "/minhas-solicitacoes", icon: Inbox },
      { title: "Gestão", to: "/gestao", icon: PlayCircle },
      { title: "Carteira Inteligente", to: "/carteira-inteligente", icon: BrainCircuit },
      { title: "Currículos BPO", to: "/curriculos-bpo", icon: UserRoundSearch },
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
            <p className="truncate text-xs text-sidebar-foreground/60">Operação contábil e solicitações</p>
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
