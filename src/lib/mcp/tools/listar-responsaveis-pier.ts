import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { backendGet, buildQuery, jsonResult } from "../backend";

export default defineTool({
  name: "listar_responsaveis_pier",
  title: "Listar responsáveis/BPOs do PIER",
  description:
    "Lista os usuários (responsáveis e BPOs) do PIER lidos pelo backend da Gestão Inteligente.",
  inputSchema: {
    status: z
      .string()
      .optional()
      .describe('Filtro de status do usuário no PIER, ex.: "Ativo" ou "Todos".'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text" as const, text: "Não autenticado." }], isError: true };
    const query = buildQuery({
      status: status ?? "Todos",
      pagina: 1,
      quantidadePorPagina: 500,
    });
    return jsonResult(await backendGet(`/gestao-fechamentos/pier/usuarios${query}`));
  },
});
