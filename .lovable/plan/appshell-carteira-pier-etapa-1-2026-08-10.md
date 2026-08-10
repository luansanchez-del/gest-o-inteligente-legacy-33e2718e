# AppShell + Carteira PIER (etapa 1)

Escopo restrito: shell de navegação e a tela Carteira PIER ligada ao backend real. Nada de Dashboard, Nova Gestão, Acompanhamento ou Índice nesta etapa.

## Arquivos a criar
- `src/components/app-shell/AppSidebar.tsx` — sidebar marinho/grafite com os itens: Gestão, Carteira, Nova Gestão, Acompanhamento, Índice, Solicitações, Implantação, Configurações. Itens ainda não implementados ficam visíveis e desabilitados (sem link quebrado).
- `src/components/app-shell/AppTopbar.tsx` — cabeçalho com breadcrumb, busca e trigger da sidebar.
- `src/components/carteira/CarteiraTable.tsx` — tabela densa da carteira.
- `src/hooks/use-pier-carteira.ts` — queries TanStack Query sobre `src/legacy/api/client.ts` (`pier.clientesCache.list`, `lastSyncedAt`, `companies.list`) e mutations (`sync`, `importCliente`, `importAllClientes`, `pier.link`).

## Arquivos a alterar
- `src/routes/__root.tsx` — passa a montar AppShell (sidebar + topbar) ao redor do `<Outlet />`.
- `src/routes/index.tsx` — reescrita: Carteira PIER real, sem mock. Remove import de `src/lib/api-client.ts` e `src/lib/mock-data.ts`.
- `src/styles.css` — apenas tokens necessários (marinho/grafite, azul primário, cores de status) se faltarem.

## Arquivos preservados, sem alteração
- Todo `src/legacy/**` (inclusive Implantação Contábil e `GestaoFechamentosPage.tsx`).
- `src/routes/$.tsx` (catch-all legado continua servindo as telas existentes).
- `src/lib/api-client.ts` e `src/lib/mock-data.ts` permanecem no repo, apenas deixam de ser importados pelas telas novas.
- `src/routes/gestao.*.tsx` e `indice-entrega.tsx` ficam como estão nesta etapa (serão tratados depois).

## Carteira PIER — dados e comportamento
Colunas (somente o que o contrato entrega): nome, documento/CNPJ, código externo, status, tributação, situação do vínculo, empresa local correspondente, data da última sincronização.

Vínculo: reaproveita a lógica já usada em `GestaoFechamentosPage.tsx` — cruzamento por documento normalizado (só dígitos) entre `PierClienteCache` e `companies.list()`.
- documento presente e casando com empresa local → "Vinculado" + nome da empresa local;
- documento presente sem correspondência → "Não vinculado" (ação Importar);
- documento ausente → "Não identificado", sem ação de importar.

Nenhuma coluna de BPO, equipe ou responsável.

Ações: "Sincronizar carteira" (`clientesCache.sync()`, só no clique), "Importar" por linha (`importCliente`), "Importar todos" (`importAllClientes`), e vincular empresa local (`pier.link`) quando aplicável. Toasts via sonner; invalidação das queries após sucesso.

Estados: skeleton de tabela no carregamento; erro com mensagem do client e botão "Tentar novamente"; vazio com orientação para sincronizar a carteira; "Nunca sincronizada" quando `lastSyncedAt` for null.

## Técnico
- Único cliente HTTP: `src/legacy/api/client.ts` (base `VITE_API_URL`). Sem Supabase, sem chamadas diretas ao PIER, sem novos endpoints.
- Filtros de busca/status/tributação passados como parâmetros de `clientesCache.list`, com debounce.
- Ao final: build/typecheck e correção de erros.
