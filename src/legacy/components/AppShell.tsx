import type { ReactNode } from "react";
import { NavLink } from "../router-compat";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <b>GC</b>
          <span>Gestão Contábil</span>
        </div>
        <nav>
          <NavLink to="/" end>
            ▦ Visão geral
          </NavLink>
          <div className="app-nav-label">PIER</div>
          <NavLink to="/pier/solicitacoes">▤ Solicitações</NavLink>
          <NavLink to="/gestao-fechamentos">◉ Gestão inteligente</NavLink>
          <NavLink to="/gestao-fechamentos/empresa">◇ Clientes</NavLink>
          <div className="app-nav-label">CONTÁBIL</div>
          <NavLink to="/implantacoes">▣ Implantações</NavLink>
          <NavLink to="/gestao-fechamentos/central">◷ Processamentos</NavLink>
        </nav>
        <footer>
          <span className="closing-live-dot" /> PIER conectado
        </footer>
      </aside>
      <div className="app-content">{children}</div>
    </div>
  );
}
