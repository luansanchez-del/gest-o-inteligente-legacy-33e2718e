import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AppSidebar } from "@/components/app-shell/AppSidebar";
import { AppTopbar } from "@/components/app-shell/AppTopbar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { obterSessao } from "@/lib/api/sessao.functions";
import { ErroConsulta } from "@/components/common/EstadoConsulta";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
    return { user: data.user };
  },
  component: LayoutAutenticado,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErroConsulta error={error} titulo="Erro ao carregar a área autenticada" />
    </div>
  ),
});

function LayoutAutenticado() {
  const sessao = useQuery({ queryKey: ["sessao"], queryFn: () => obterSessao() });

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/40">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar organizacao={sessao.data?.organizacao.nome} />
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
