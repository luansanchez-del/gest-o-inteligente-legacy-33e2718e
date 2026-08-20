import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/gestao/fiscal")({
  component: GestaoFiscalLayout,
});

/**
 * Rota-pai (layout) do módulo Fiscal.
 *
 * Renderiza <Outlet /> para que as rotas-filhas
 * (/gestao/fiscal/carteira, /gestao/fiscal/curriculos, /gestao/fiscal/equipe)
 * exibam suas próprias páginas. A "Operação Fiscal" (gestão de solicitações)
 * vive na rota-filha /gestao/fiscal (index), em gestao.fiscal.index.tsx.
 */
function GestaoFiscalLayout() {
  return <Outlet />;
}
