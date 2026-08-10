# Dashboard de Gestão de Fechamentos Contábeis (frontend com dados mockados)

Interface completa em português do Brasil, sem backend, sem autenticação e sem banco de dados. Tudo alimentado por dados fictícios, organizados para que depois seja simples ligar na API real.

## Telas

### 1. Carteira PIER (`/carteira`)
Lista das empresas disponíveis no PIER em cards/tabela, com marcação clara de "Vinculada" ou "Não vinculada" e botão de vincular/importar (efeito só visual, em memória). Filtro por nome/CNPJ e por situação do vínculo.

### 2. Nova gestão (`/gestao/nova`)
Passo a passo em uma tela:
- **Filtros**: clientes (multi-seleção), responsável (campo genérico, alimentado por uma lista única de nomes, sem assumir origem PIER ou interna), tipo de solicitação, competência (mês/ano).
- **Prévia**: painel que atualiza conforme os filtros, mostrando quantidade de clientes, solicitações, responsáveis, tipos, prazos e quantos itens estão sem vínculo/sem responsável/sem classificação.
- **Botão "Iniciar gestão"**, que leva ao acompanhamento.

### 3. Acompanhamento (`/gestao/acompanhamento`)
Visão da gestão iniciada, agrupável por situação, responsável, tipo de solicitação, prazo e empresa. Barra de progresso geral e lista detalhável. Linguagem de negócio — nenhum termo de sincronização aparece na interface.

### 4. Índice de entrega (`/indice-entrega`)
Cards de indicadores: total previsto, total entregue, índice de entrega, entregues no prazo / fora do prazo, em andamento, atrasados, aguardando cliente, sem evidência suficiente, precisa de revisão humana, prazo médio de entrega e atraso médio. Gráfico de evolução mensal do índice.

Regras respeitadas na tela:
- Todo número abre um painel lateral com a lista de empresas/solicitações que o compõem.
- O índice sempre exibe numerador, denominador e a regra de cálculo ao lado do percentual.
- "Sem responsável" é uma categoria própria e visível.

Recortes disponíveis: carteira geral, BPO, colaborador interno, empresa, responsável do PIER, tipo de solicitação e competência/período.

### 5. Detalhe do item
Painel/modal com a situação classificada, a evidência que fundamentou a classificação (postagem, arquivo, status ou data), nível de confiança, solicitações relacionadas e pendências com orientação.

## Situações (badges coloridos)
Concluída no prazo, concluída fora do prazo, em andamento dentro do prazo, atrasada, aguardando cliente, sem evidência suficiente, precisa de revisão humana.

## Dados fictícios
De 15 a 20 empresas com cenários variados: no prazo, atrasadas, sem vínculo PIER, sem responsável, aguardando cliente, com pendências. Períodos de fechamento, solicitações, pendências e execuções em lote coerentes entre si, cobrindo alguns meses para o gráfico de evolução.

## Detalhes técnicos
- Rotas TanStack: `src/routes/index.tsx` (redireciona/abre a Carteira PIER), `carteira.tsx`, `gestao.nova.tsx`, `gestao.acompanhamento.tsx`, `indice-entrega.tsx`, cada uma com `head()` próprio.
- Layout com sidebar shadcn no `__root.tsx`.
- `src/lib/mock-data.ts` com os tipos `Company`, `ClosingPeriod`, `ExternalRequest`, `Pendency`, `BatchExecution` exatamente no formato descrito.
- `src/lib/api-client.ts`: **único ponto de troca** — funções assíncronas (`listCompanies`, `listClosingPeriods`, `listRequests`, `listPendencies`, `listBatchExecutions`, `startManagement`) que hoje retornam os mocks e depois passam a chamar a API NestJS. Nenhum componente importa `mock-data` diretamente.
- Agregações dos indicadores em `src/lib/metrics.ts` (funções puras sobre os dados retornados pelo client).
- Gráfico com Recharts; tokens semânticos de cor no `src/styles.css` para os estados (no prazo, atrasado, alerta, aguardando, neutro) — sem cores fixas nos componentes.
