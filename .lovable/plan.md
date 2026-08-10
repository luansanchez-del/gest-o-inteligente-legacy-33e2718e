# GESTÃO INTELIGENTE — plano técnico (reconstrução do zero)

Produto novo. O código atual (inclusive `src/legacy`) passa a ser apenas referência histórica: nada dele é reaproveitado como base.

## 1. Arquitetura

```text
Frontend (React + TanStack Start)
      ↓  chamadas tipadas (server functions) — mesmo domínio, sem CORS
API interna da Gestão Inteligente  (camada de aplicação, server-side)
      ↓
Serviços de domínio (regras: carteira, competência, análise, índice)
      ↓
Banco de dados (Lovable Cloud / Postgres, RLS)
      ↓
Adapters de integração (PierAdapter, futuros adapters)
      ↓
PIER e outros sistemas externos
```

Regras invioláveis:
- O frontend nunca fala com o PIER. Só existe uma origem para o browser: a própria aplicação.
- Credenciais do PIER só existem no servidor (secrets), nunca em `VITE_*`, nunca em resposta de API.
- O frontend não calcula indicadores; recebe números já apurados.
- Toda escrita relevante gera registro de auditoria.

Runtime: TanStack Start (SSR + server functions) sobre Lovable Cloud (Postgres, Auth, Storage, jobs agendados). A "API interna" é implementada como server functions tipadas (`*.functions.ts`) + rotas HTTP em `src/routes/api/public/*` apenas para webhooks/cron.

## 2. Estrutura de pastas

```text
src/
  routes/                     # rotas (URLs) — só composição de UI
  features/                   # UI por módulo (carteira, gestao, indice, solicitacoes, implantacao, config)
  components/                 # design system e componentes compartilhados
  server/
    api/                      # camada de aplicação: casos de uso expostos ao front
    domain/
      carteira/  competencia/  solicitacoes/  analise/  entrega/  implantacao/
        <dominio>.service.ts   # regras de negócio
        <dominio>.repo.ts      # acesso a dados
        <dominio>.types.ts
    integrations/
      pier/
        pier.adapter.ts        # única porta de saída para o PIER
        pier.http.ts           # transporte: auth, retry, timeout, rate limit
        pier.mapper.ts         # PIER -> modelo interno
        pier.types.ts
    jobs/                      # sincronização, execução em lote, recálculo de índice
    lib/                       # erros, logger, auditoria, cache, resultado
  lib/                         # utilidades de browser (formatadores, hooks genéricos)
supabase/migrations/           # esquema versionado
```

Barreira: nada em `src/features` ou `src/routes` importa `src/server/**` diretamente; o contato é sempre por server function.

## 3. Módulos de domínio

| Módulo | Responsabilidade |
| --- | --- |
| Carteira | espelho interno dos clientes PIER, vínculo cliente↔empresa |
| Competência | abertura e ciclo de vida do fechamento por empresa+mês |
| Solicitações | solicitações, postagens e arquivos vindos do PIER |
| Análise | classificação automática, evidências, nível de confiança, pendências |
| Revisão | fila de revisão humana e decisões (aprovar, devolver, ignorar) |
| Entrega | consolidação, índice de entrega, prazos |
| Implantação | onboarding contábil do cliente |
| Configurações | parâmetros, prazos, regras, integrações |

## 4. Entidades e relacionamentos

```text
organization 1─n user_role
organization 1─n company 1─n company_pier_link n─1 pier_client
company 1─n closing_period (por competência)
closing_period 1─n request 1─n post 1─n file_ref
closing_period 1─n analysis_result 1─n evidence
closing_period 1─n pendency
closing_period 1─n review_task
batch_execution 1─n batch_item n─1 closing_period
delivery_metric n─1 closing_period
sync_run 1─n sync_event
audit_log, app_setting, integration_credential_ref
```

Campos-chave:
- `pier_client`: identificador externo, nome, documento, situação, dados brutos, `synced_at`.
- `company_pier_link`: vínculo explícito e reversível, com autor e data.
- `closing_period`: empresa, competência (`AAAA-MM`), tipo, situação, responsável, prazo, última análise.
- `analysis_result`: situação apurada, confiança (0–1), regra aplicada, exige revisão humana.
- `evidence`: origem (postagem, arquivo, status, data), referência e trecho que fundamentou a conclusão.
- `delivery_metric`: numerador, denominador, recorte e período — nunca só o percentual.
- `audit_log`: ator, ação, entidade, antes/depois, origem (usuário, job, adapter).

Todas as tabelas em `public` com GRANT explícito + RLS por organização; tabelas operacionais (sync, batch, credenciais) acessíveis só pelo servidor.

## 5. API interna

Contrato uniforme: entrada validada com Zod, saída `{ data }` ou erro tipado, paginação por cursor, idempotência por chave nas operações de escrita.

| Área | Operações |
| --- | --- |
| Carteira | listar, detalhar, vincular, desvincular, sincronizar (manual), status da última sincronização |
| Gestão | montar preview do escopo, confirmar execução, listar execuções, detalhar execução |
| Acompanhamento | listar competências por situação/responsável/tipo/prazo/empresa |
| Índice | consolidado, séries mensais, drill-down (lista que compõe cada número) |
| Solicitações | listar, detalhar, dossiê da competência com evidências |
| Revisão | fila, decidir, reabrir |
| Implantação | etapas e progresso |
| Configurações | prazos, regras, parâmetros de integração |

Todo indicador retorna numerador, denominador e a descrição da regra de cálculo. Itens sem responsável vêm em categoria própria, nunca omitidos.

## 6. PierAdapter

- Interface única (`listClients`, `listRequests`, `listPosts`, `getFile`, ...) e implementação HTTP isolada.
- Autenticação com credencial lida do ambiente do servidor no momento da chamada; token em memória com renovação.
- Timeout, retry com backoff exponencial e jitter, limite de concorrência, circuit breaker por tipo de falha.
- Normalização: nada do formato do PIER vaza para o domínio; mapper converte para o modelo interno.
- Todo request registra correlação, duração e resultado — sem gravar credencial nem conteúdo sensível.
- Sem endpoints fictícios: enquanto uma rota real não estiver definida, o adapter expõe a operação como indisponível e a UI mostra estado explícito.

## 7. Autenticação e autorização

- Autenticação de usuários pelo Lovable Cloud (e-mail/senha + Google).
- Papéis em tabela dedicada (`user_role`) — nunca no perfil — com função `has_role` (security definer) usada nas políticas.
- Perfis: administrador, gestor, colaborador, leitura.
- Autorização em duas camadas: RLS no banco e verificação de papel nos casos de uso.
- Rotas protegidas sob layout autenticado; guarda de rota é UI — todo caso de uso valida sessão no servidor.
- Acesso MCP continua por OAuth, reaproveitando os mesmos casos de uso somente-leitura.

## 8. Secrets

- Credenciais do PIER e chaves de integração ficam como secrets do projeto, lidas apenas dentro dos handlers.
- Proibido: `VITE_*` para segredo, valor em código, valor em log, valor em resposta de API.
- O banco guarda apenas referência/metadados da credencial (`integration_credential_ref`), nunca o valor.
- Rotação sem deploy: troca do secret basta.

## 9. Sincronização

- Sempre sob comando explícito ("Sincronizar"); abrir a página apenas lê o dado interno.
- Execução assíncrona registrada em `sync_run` (escopo, iniciado por, progresso, contadores, erros por item).
- Estratégia incremental por marca temporal, com opção de recarga completa; upsert idempotente por identificador externo.
- Falha parcial não invalida o restante: item com erro é registrado e reprocessável.
- Tela mostra sempre "atualizado em <data/hora>" e o resultado da última execução.

## 10. Cache

- Camada 1: o próprio banco é o cache do PIER (fonte de leitura do produto).
- Camada 2: cache de curta duração no servidor para consultas caras (agregações), invalidado por evento de escrita.
- Camada 3: TanStack Query no cliente com `staleTime` por natureza do dado e invalidação após ações.
- Índice de entrega: materializado por competência e recalculado por evento/job, não a cada request.

## 11. Processamento em lote

- `batch_execution` + `batch_item` com status por item (pendente, processando, concluído, alerta, erro, ignorado).
- Fila processada em janelas curtas (limite de tempo por execução), com retomada e limite de tentativas.
- Idempotência por (execução, competência); reexecução seletiva apenas dos itens com erro.
- Nova Gestão em duas etapas: preview calcula o escopo sem efeito colateral; confirmação cria a execução.
- Itens de baixa confiança nunca são entregues automaticamente: viram tarefa de revisão humana.

## 12. Erros

- Hierarquia: erro de configuração, de integração, de validação, de autorização, de regra de negócio, inesperado.
- Cada erro carrega código estável, mensagem para o usuário em português e detalhe técnico só no log.
- A UI distingue carregando / vazio / erro / sem permissão — nunca mostra "0" quando a origem falhou.
- Falha de integração não derruba a tela: mostra o dado interno disponível e sinaliza a defasagem.

## 13. Auditoria

- Registro de toda ação relevante: vínculo, sincronização, execução em lote, decisão de revisão, mudança de configuração.
- Guarda ator, momento, entidade, antes/depois, origem e correlação.
- Somente leitura para a aplicação, inserção apenas server-side, retenção configurável.
- Detalhe de qualquer classificação exibe a evidência e a confiança que a originaram.

## 14. Rotas do frontend

```text
/                         painel inicial (visão executiva)
/carteira                 Carteira PIER (+ /carteira/:clienteId)
/gestao/nova              Nova Gestão — etapa 1 preview, etapa 2 confirmação
/gestao/acompanhamento    execuções e competências em andamento
/gestao/execucoes/:id     detalhe da execução em lote
/indice                   Índice de Entrega (+ drill-down por indicador)
/solicitacoes             solicitações (+ /solicitacoes/:id)
/competencias/:id         dossiê da competência (evidências, pendências, revisão)
/revisao                  fila de revisão humana
/implantacao              implantação contábil (+ /implantacao/:id)
/configuracoes            parâmetros, prazos, regras, integrações, usuários
/auth                     acesso
```

## 15. Ordem de execução sugerida

1. Fundações: esquema inicial, papéis/RLS, auditoria, erros, shell de layout.
2. PierAdapter + sincronização manual + Carteira e vínculo.
3. Competências, solicitações e dossiê com evidências.
4. Nova Gestão (preview/confirmação) e execução em lote.
5. Análise, revisão humana e índice de entrega materializado.
6. Implantação contábil e configurações.

Nada é implementado antes da aprovação deste plano; a remoção do código legado acontece na etapa 1, quando o novo shell entra no lugar.
