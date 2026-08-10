import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, Building2, ClipboardList, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";


function safeNext(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "",
  }),
  head: () => ({
    meta: [
      { title: "Entrar | Gestão Inteligente de Fechamentos" },
      {
        name: "description",
        content:
          "Acesse o painel de Gestão Inteligente de fechamentos contábeis e a carteira PIER.",
      },
      { property: "og:title", content: "Entrar | Gestão Inteligente de Fechamentos" },
      {
        property: "og:description",
        content: "Acesse o painel de Gestão Inteligente de fechamentos contábeis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const destino = safeNext(next);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(destino);
    });
  }, [destino]);


  async function comEmail(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setMensagem("");
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      setCarregando(false);
      if (error) return setMensagem(error.message);
      window.location.replace(destino);
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { emailRedirectTo: `${window.location.origin}${destino}` },
    });
    setCarregando(false);
    if (error) return setMensagem(error.message);
    if (!data.session) return setMensagem("Confira seu e-mail para confirmar a conta.");
    window.location.replace(destino);
  }

  async function comGoogle() {
    setMensagem("");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}${destino}`,
    });
    if (result.error) return setMensagem("Não foi possível entrar com o Google.");
    if (result.redirected) return;
    navigate({ to: destino });
  }

  if (!montado) return null;

  const destaques = [
    { icone: Building2, titulo: "Carteira PIER", texto: "Clientes e vínculos em uma visão só." },
    { icone: BarChart3, titulo: "Índice de entrega", texto: "Previsto, entregue e prazo médio." },
    { icone: ShieldCheck, titulo: "Revisão humana", texto: "Decisões com evidência registrada." },
  ];

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="bg-sidebar text-sidebar-foreground hidden flex-col justify-between p-10 lg:flex">
        <div className="flex items-center gap-3">
          <span className="bg-sidebar-primary text-sidebar-primary-foreground flex h-10 w-10 items-center justify-center rounded-lg">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold leading-tight">Gestão Inteligente</p>
            <p className="text-sidebar-foreground/60 text-xs">Fechamentos contábeis</p>
          </div>
        </div>

        <div className="space-y-8">
          <h2 className="max-w-sm text-3xl font-semibold leading-tight">
            Controle completo dos fechamentos, da carteira à entrega.
          </h2>
          <ul className="space-y-5">
            {destaques.map((item) => (
              <li key={item.titulo} className="flex gap-3">
                <item.icone className="text-sidebar-primary mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{item.titulo}</p>
                  <p className="text-sidebar-foreground/60 text-sm">{item.texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sidebar-foreground/50 text-xs">
          Acesso restrito a usuários autorizados da organização.
        </p>
      </section>

      <section className="bg-muted/40 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="bg-primary text-primary-foreground flex h-9 w-9 items-center justify-center rounded-lg">
              <ClipboardList className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold">Gestão Inteligente</p>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">
                {modo === "entrar" ? "Entrar" : "Criar conta"}
              </CardTitle>
              <CardDescription>
                {modo === "entrar"
                  ? "Acesse o painel de fechamentos contábeis."
                  : "Cadastre-se para acessar a plataforma."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <Button type="button" variant="outline" className="w-full" onClick={comGoogle}>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5a4.7 4.7 0 0 1-2 3.1l3.2 2.5c1.9-1.7 3-4.3 3-7.3 0-.7-.1-1.4-.2-2z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 22c2.7 0 4.9-.9 6.6-2.3l-3.2-2.5c-.9.6-2 1-3.4 1a5.9 5.9 0 0 1-5.6-4.1L3.1 16.6A10 10 0 0 0 12 22"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.4 14.1a6 6 0 0 1 0-3.8L3.1 7.7a10 10 0 0 0 0 8.9z"
                  />
                  <path
                    fill="#4285F4"
                    d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.7l3.3 2.6A5.9 5.9 0 0 1 12 6.1"
                  />
                </svg>
                Continuar com Google
              </Button>

              <div className="flex items-center gap-3">
                <span className="bg-border h-px flex-1" />
                <span className="text-muted-foreground text-xs">ou continue com e-mail</span>
                <span className="bg-border h-px flex-1" />
              </div>

              <form onSubmit={comEmail} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@escritorio.com.br"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                {mensagem ? (
                  <Alert variant="destructive">
                    <AlertDescription>{mensagem}</AlertDescription>
                  </Alert>
                ) : null}

                <Button type="submit" className="w-full" disabled={carregando}>
                  {carregando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {carregando
                    ? modo === "entrar"
                      ? "Entrando…"
                      : "Criando conta…"
                    : modo === "entrar"
                      ? "Entrar"
                      : "Criar conta"}
                </Button>
              </form>

              <p className="text-muted-foreground text-center text-sm">
                {modo === "entrar" ? "Ainda não tem acesso?" : "Já possui conta?"}{" "}
                <button
                  type="button"
                  className="text-primary font-medium underline-offset-4 hover:underline"
                  onClick={() => {
                    setMensagem("");
                    setModo(modo === "entrar" ? "criar" : "entrar");
                  }}
                >
                  {modo === "entrar" ? "Criar uma conta" : "Entrar"}
                </button>
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );

}
