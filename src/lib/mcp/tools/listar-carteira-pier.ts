import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { backendGet, buildQuery, jsonResult } from "../backend";

export default defineTool({
  name: "listar_carteira_pier",
  title: "Listar carteira PIER",
  description:
    "Lista os clientes da carteira PIER (cache local mantido pelo backend da Gestão Inteligente), com filtros opcionais de busca, status e tributação.",
  inputSchema: {
    busca: z.string().optional().describe("Texto livre: nome ou documento do cliente."),
    status: z.string().optional().describe("Status do cliente no PIER, ex.: Ativo."),
    tributacao: z.string().optional().describe("Regime de tributação do cliente."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ busca, status, tributacao }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text" as const, text: "Não autenticado." }], isError: true };
    const query = buildQuery({ search: busca, status, tributacao });
    return jsonResult(await backendGet(`/gestao-fechamentos/pier/clientes-cache${query}`));
  },
});
