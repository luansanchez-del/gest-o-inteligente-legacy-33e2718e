# Corrigir erro "Missing Supabase environment variable(s)" no deploy

## Diagnóstico (verificado)

- **Erro no PREVIEW:** `Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY`, disparado pelo Proxy do client Supabase no bundle do navegador (`index-Ch1tpHoO.js`), ao carregar `/`.
- **Causa raiz:** as variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID` não estão embarcadas no bundle do preview. O `@lovable.dev/vite-tanstack-config` injeta `VITE_*` a partir do `.env` em build time, mas o `.env` está ignorado no `.gitignore` (linhas 19-22: `.env`, `.env.*`, `!.env.example`). Confirmado: `git ls-files` rastreia apenas `.env.example`; histórico mostra `fix: remove arquivo .env versionado`.
- **Docs Lovable (autoritativas):** *"If you ignore `.env` from Git, these variables will not be available, and your preview and published builds will likely break."* Ou seja, `VITE_*` **não** é auto-injetado pelo Cloud em build — só o lado servidor (`SUPABASE_*`) é. Logo o `.env` precisa estar commitado.
- **Por que o publicado ainda funciona:** o bundle PUBLICADO (`index-BStlOiKL.js`) contém a URL e a publishable key (1 ocorrência cada) — é um build antigo de quando o `.env` ainda estava versionado. O preview atual (pós-remoção do `.env`) não tem os valores. **Um novo deploy sem commitar o `.env` quebraria também o site publicado.**
- **Lado servidor (sem ação):** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` são gerenciados/auto-injetados pelo Lovable Cloud em runtime (não são secrets do usuário — confirmado via `fetch_secrets`, que lista só `PIER_*` e `LOVABLE_API_KEY`). `requireSupabaseAuth`/`client.server` funcionam. O nome `SUPABASE_ANON_KEY` na visão de config é legado; o código auto-gerado lê `SUPABASE_PUBLISHABLE_KEY`, que o Cloud fornece.
- **Segurança:** o `.env` atual contém **somente valores publicáveis** (URL `https://jyaqzarvulejqdnhcdbz.supabase.co`, publishable key `sb_publishable_…`, project id). **Não contém** a service role key. Commitar o `.env` não expõe nenhum segredo no GitHub — a publishable key é pública/browser-safe por design; a `SUPABASE_SERVICE_ROLE_KEY` (única sensível) permanece só no Cloud, injetada em runtime.

## Plano de execução

1. **Editar `.gitignore`** (linhas 19-22): parar de ignorar `.env`, mantendo `.env.*` ignorado e `.env.example` rastreado:
   ```
   # Local environment
   .env
   .env.*
   !.env.example
   ```
   →
   ```
   # Local environment
   .env.*
   !.env.example
   ```
2. **Garantir que `.env` fique rastreado/commitado:** após o un-ignore, checar `git ls-files .env`. Se ainda não rastreado, reescrever `.env` com o **mesmo conteúdo publicável** (sem secrets, sem service role key) para forçar o commit da plataforma. Não alterar valores.
3. **Publicar (novo deploy):** aciona build novo que lê o `.env` commitado → `VITE_*` embarcados no bundle do preview e do publicado → erro some.
4. Restrições respeitadas: sem tocar regras de negócio, telas, banco de dados ou migrations; sem chaves secretas no código/GitHub.

## Verificação (após o deploy)

- `git ls-files .env` retorna rastreado; `.gitignore` sem a linha `.env`.
- `/tmp/observability/build-errors.log` → "build OK".
- Novo bundle publicado contém `jyaqzarvulejqdnhcdbz.supabase.co` e `sb_publishable` (grep no `assets/index-*.js`).
- Preview carrega `/` sem o erro "Missing Supabase" (runtime-errors.log limpo).

## Nota de segurança

Apenas valores publicáveis entram no GitHub. A `SUPABASE_SERVICE_ROLE_KEY` (única chave sensível) não está no `.env` e é injetada pelo Cloud apenas em runtime, no servidor — nunca no browser nem no repositório.
