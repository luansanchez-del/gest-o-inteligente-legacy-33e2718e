import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { backendGet, buildQuery, jsonResult } from "../backend";

export default defineTool({
  name: "dashboard_gestao_fechamentos",
  title: "Dashboard de gestão de fechamentos",
  description:
    "Retorna o painel da Gestão Inteligente por competência: índice de entrega, situações por empresa, departamento e responsável.",
  inputSchema: {
    competenciaInicio: z.string().describe('Competência inicial no formato "AAAA-MM".'),
    competenciaFim: z.string().describe('Competência final no formato "AAAA-MM".'),
    teamId: z.string().optional().describe("Departamento do responsável (id do PIER)."),
    responsibleExternalId: z.string().optional().describe("Id externo do responsável no PIER."),
    typeExternalId: z.string().optional().describe("Id externo do tipo de solicitação."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text" as const, text: "Não autenticado." }], isError: true };
    const query = buildQuery({ ...input });
    return jsonResult(await backendGet(`/gestao-fechamentos/management/dashboard${query}`));
  },
});
