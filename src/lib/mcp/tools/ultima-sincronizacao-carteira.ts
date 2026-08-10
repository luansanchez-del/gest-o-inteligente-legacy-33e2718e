import { defineTool } from "@lovable.dev/mcp-js";
import { backendGet, jsonResult } from "../backend";

export default defineTool({
  name: "ultima_sincronizacao_carteira",
  title: "Última sincronização da carteira",
  description:
    "Informa quando a carteira PIER foi sincronizada pela última vez pelo backend da Gestão Inteligente.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text" as const, text: "Não autenticado." }], isError: true };
    return jsonResult(
      await backendGet("/gestao-fechamentos/pier/clientes-cache/last-synced-at"),
    );
  },
});
