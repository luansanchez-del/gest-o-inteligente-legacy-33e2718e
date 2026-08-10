# Tela de acesso com identidade visual

Hoje a página de entrada (`/auth`) usa campos e botões HTML crus, sem os componentes de interface do restante do sistema — por isso ela "não parece" fazer parte da plataforma. Também existe um aviso de renderização (hydration) nessa rota.

## O que muda

1. **Layout em duas colunas (desktop)**
   - Painel esquerdo em marinho/grafite com a marca "Gestão Inteligente", subtítulo "Fechamentos contábeis" e três pontos de valor (Carteira PIER, Índice de entrega, Revisão humana), com ícones Lucide.
   - Painel direito com o cartão de acesso centralizado. Em telas menores, apenas o cartão, com o cabeçalho da marca acima.

2. **Cartão de acesso com componentes do design system**
   - `Card` + `CardHeader/CardContent`, `Label`, `Input`, `Button` do shadcn.
   - Botão "Continuar com Google" em variante `outline` com ícone, separador "ou continue com e-mail".
   - Campos E-mail e Senha com rótulos, estados de foco e mensagens de erro em `Alert` (destructive), não texto solto.
   - Botão principal com estado de carregamento (spinner + texto "Entrando…" / "Criando conta…").
   - Alternância Entrar / Criar conta como link discreto no rodapé do cartão.

3. **Sem cores fixas**
   - Todas as cores via tokens semânticos já existentes (`primary`, `sidebar`, `muted-foreground`, `destructive`). Nada de `bg-[#...]` ou `text-white`.

4. **Correção do aviso de renderização**
   - A rota é `ssr: false`; o conteúdo passa a ser renderizado apenas após a hidratação (estado montado), eliminando a divergência entre servidor e cliente e o piscar da tela.

## Fora de escopo

- Nenhuma mudança em autenticação, regras de negócio, rotas protegidas ou backend. Só apresentação da tela `/auth`.

## Detalhes técnicos

- Arquivo alterado: `src/routes/auth.tsx` (apenas apresentação; `comEmail`, `comGoogle`, `safeNext` e o redirecionamento permanecem iguais).
- Componentes usados: `@/components/ui/{card,input,label,button,alert,separator}`.
- Ícones: `lucide-react` (`ClipboardList`, `Building2`, `BarChart3`, `ShieldCheck`, `Loader2`).
