import { useRouterState } from "@tanstack/react-router";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

const TITULOS: Record<string, string[]> = {
  "/": ["Gestão inteligente", "Carteira PIER"],
  "/auth": ["Acesso", "Entrar"],
  "/gestao-fechamentos": ["Gestão inteligente", "Gestão"],
  "/gestao-fechamentos/empresa": ["Gestão inteligente", "Empresa"],
  "/gestao-fechamentos/central": ["Gestão inteligente", "Processamentos"],
  "/pier/solicitacoes": ["Gestão inteligente", "Solicitações"],
  "/implantacoes": ["Contábil", "Implantações"],
};

export function AppTopbar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const trilha = TITULOS[pathname] ?? ["Gestão inteligente"];

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-card px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <nav aria-label="Navegação estrutural" className="flex items-center gap-2 text-sm">
        {trilha.map((parte, i) => (
          <span key={parte} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">/</span>}
            <span
              className={
                i === trilha.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"
              }
            >
              {parte}
            </span>
          </span>
        ))}
      </nav>
    </header>
  );
}
