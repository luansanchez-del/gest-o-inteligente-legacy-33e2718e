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

  useEffect(() => {
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

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Entrar</h1>
        <p className="text-muted-foreground text-sm">
          Acesse a Gestão Inteligente de fechamentos contábeis.
        </p>
      </div>
      <button
        type="button"
        onClick={comGoogle}
        className="border-border hover:bg-accent rounded-md border px-4 py-2 text-sm font-medium"
      >
        Continuar com Google
      </button>
      <form onSubmit={comEmail} className="flex flex-col gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          className="border-border rounded-md border px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          minLength={6}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha"
          className="border-border rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={carregando}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {modo === "entrar" ? "Entrar" : "Criar conta"}
        </button>
      </form>
      <button
        type="button"
        className="text-muted-foreground text-sm underline"
        onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}
      >
        {modo === "entrar" ? "Criar uma conta" : "Já tenho conta"}
      </button>
      {mensagem && (
        <p role="alert" className="text-destructive text-sm">
          {mensagem}
        </p>
      )}
    </main>
  );
}
