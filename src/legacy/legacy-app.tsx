import { useLocation } from "@tanstack/react-router";
import { HomePage } from "./pages/HomePage";
import { ImplantacoesListPage } from "./pages/implantacoes/ImplantacoesListPage";
import { ImplantacaoWorkflowPage } from "./pages/implantacao-contabil/ImplantacaoWorkflowPage";
import { GestaoFechamentosPage } from "./pages/gestao-fechamentos/GestaoFechamentosPage";
import { CentralFechamentosPage } from "./pages/gestao-fechamentos/CentralFechamentosPage";
import { BatchExecutionDetailPage } from "./pages/gestao-fechamentos/BatchExecutionDetailPage";
import { GestaoInteligentePage } from "./pages/gestao-fechamentos/GestaoInteligentePage";
import { PierSolicitacoesPage } from "./pages/gestao-fechamentos/PierSolicitacoesPage";
import "./legacy.css";

export function LegacyApp() {
  const { pathname } = useLocation();
  let page = <HomePage />;

  if (pathname === "/implantacoes") page = <ImplantacoesListPage />;
  else if (pathname.startsWith("/implantacao-contabil/")) page = <ImplantacaoWorkflowPage />;
  else if (pathname === "/gestao-fechamentos") page = <GestaoInteligentePage />;
  else if (pathname === "/gestao-fechamentos/empresa") page = <GestaoFechamentosPage />;
  else if (pathname === "/gestao-fechamentos/central") page = <CentralFechamentosPage />;
  else if (pathname.startsWith("/gestao-fechamentos/central/")) page = <BatchExecutionDetailPage />;
  else if (pathname === "/pier/solicitacoes") page = <PierSolicitacoesPage />;

  return page;
}
