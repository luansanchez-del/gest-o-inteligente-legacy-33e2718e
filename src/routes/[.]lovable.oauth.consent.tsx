import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OAuthResult = { redirect_url?: string; redirect_to?: string };
type AuthorizationDetails = OAuthResult & { client?: { name?: string } | null; scope?: string };
type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Requisição de autorização inválida.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/auth",
        search: { next: location.pathname + location.searchStr },
      });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-lg font-semibold">Não foi possível carregar esta autorização</h1>
      <p className="text-muted-foreground mt-2 text-sm">{String((error as Error)?.message ?? error)}</p>
    </main>
  ),
  component: Consent,
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const cliente = details?.client?.name ?? "o aplicativo";

  async function decidir(aprovar: boolean) {
    setOcupado(true);
    setErro(null);
    const { data, error } = aprovar
      ? await oauthApi().approveAuthorization(authorization_id)
      : await oauthApi().denyAuthorization(authorization_id);
    if (error) {
      setOcupado(false);
      setErro(error.message);
      return;
    }
    const destino = data?.redirect_url ?? data?.redirect_to;
    if (!destino) {
      setOcupado(false);
      setErro("O servidor de autorização não retornou um endereço de retorno.");
      return;
    }
    window.location.href = destino;
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Conectar {cliente} à Gestão Inteligente</h1>
      <p className="text-muted-foreground text-sm">
        {cliente} poderá usar as ferramentas deste app como você, respeitando as mesmas permissões
        da sua conta.
      </p>
      {details?.scope && (
        <p className="text-muted-foreground text-xs">Permissões solicitadas: {details.scope}</p>
      )}
      {erro && (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      )}
      <div className="flex gap-3">
        <button
          disabled={ocupado}
          onClick={() => decidir(true)}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          Aprovar
        </button>
        <button
          disabled={ocupado}
          onClick={() => decidir(false)}
          className="border-border rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          Cancelar conexão
        </button>
      </div>
    </main>
  );
}
