import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { backendGet, buildQuery, jsonResult } from "../backend";

export default defineTool({
  name: "listar_tipos_solicitacao",
  title: "Listar tipos de solicitação",
  description:
    "Lista os tipos de solicitação do PIER disponíveis para filtrar a gestão de fechamentos.",
  inputSchema: {
    status: z.string().optional().describe('Status do tipo, ex.: "Ativo".'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text" as const, text: "Não autenticado." }], isError: true };
    const query = buildQuery({ status: status ?? "Ativo" });
    return jsonResult(await backendGet(`/gestao-fechamentos/pier/tipos-solicitacao${query}`));
  },
});
