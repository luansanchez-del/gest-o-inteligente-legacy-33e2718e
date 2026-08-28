// Config de testes separado do vite.config.ts (dev/build): o plugin do
// @lovable.dev/mcp-js quebra ao resolver rotas fora do fluxo normal do
// TanStack Start, então os testes usam apenas o essencial (aliases de path).
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
  },
});
