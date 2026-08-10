import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listarCarteiraPier from "./tools/listar-carteira-pier";
import ultimaSincronizacaoCarteira from "./tools/ultima-sincronizacao-carteira";
import listarResponsaveisPier from "./tools/listar-responsaveis-pier";
import listarTiposSolicitacao from "./tools/listar-tipos-solicitacao";
import dashboardGestao from "./tools/dashboard-gestao";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "gestao-inteligente-legacy",
  title: "GESTÃO INTELIGENTE - LEGACY",
  version: "0.1.0",
  instructions:
    "Ferramentas de leitura da Gestão Inteligente de fechamentos contábeis. Todas as consultas passam pelo backend da Gestão Inteligente, que fala com o PIER; o PIER nunca é acessado diretamente.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listarCarteiraPier,
    ultimaSincronizacaoCarteira,
    listarResponsaveisPier,
    listarTiposSolicitacao,
    dashboardGestao,
  ],
});
