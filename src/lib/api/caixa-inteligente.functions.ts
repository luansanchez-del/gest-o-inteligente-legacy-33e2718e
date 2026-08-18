import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { comContexto, emailDoToken } from "./contexto";

function identidadeEmail(value: string | null | undefined) {
  const bruto = (value ?? "").trim().toLowerCase();
  const local = bruto.includes("@") ? bruto.split("@")[0] ?? "" : bruto;
  return local
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export const obterVinculoPier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(
      context.userId,
      emailDoToken(context.claims),
      async (ctx) => {
        const service = await import(
          "@/server/domain/caixa-inteligente/caixa-inteligente.service"
        );
        const email = emailDoToken(context.claims);
        let resultado = await service.obterVinculoPier(ctx, { email });

        // O login do app pode usar um domínio diferente do cadastro no PIER
        // (ex.: nome.sobrenome@gmail.com x nome.sobrenome@empresa.com.br).
        // Quando o identificador local normalizado for único, vinculamos com segurança.
        if (!resultado.vinculado && email) {
          const identidade = identidadeEmail(email);
          if (identidade.length >= 5) {
            const candidatos = resultado.opcoes.filter((u) =>
              [u.email, u.login].some(
                (valor) => identidadeEmail(valor) === identidade,
              ),
            );
            if (candidatos.length === 1) {
              await service.vincularUsuarioPier(ctx, {
                externalId: candidatos[0].id,
              });
              resultado = await service.obterVinculoPier(ctx, { email });
            }
          }
        }

        return resultado;
      },
    ),
  );

export const vincularMeuUsuarioPier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { externalId: string }) => {
    if (!input?.externalId)
      throw new Error("VALIDACAO::Selecione seu usuário do PIER.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(
      context.userId,
      emailDoToken(context.claims),
      async (ctx) => {
        const service = await import(
          "@/server/domain/caixa-inteligente/caixa-inteligente.service"
        );
        const usuario = await service.vincularUsuarioPier(ctx, data);
        let sincronizacao:
          | { ok: true; processadas: number; possivelmenteParcial: boolean }
          | { ok: false; erro: string };

        try {
          const syncService = await import(
            "@/server/domain/caixa-inteligente/caixa-inteligente-sync.service"
          );
          const resultado = await syncService.sincronizarMinhaCaixaSegura(ctx, {
            email: emailDoToken(context.claims),
          });
          sincronizacao = {
            ok: true,
            processadas: resultado.processadas,
            possivelmenteParcial: resultado.possivelmenteParcial,
          };
        } catch (error) {
          sincronizacao = {
            ok: false,
            erro: error instanceof Error ? error.message : "Falha ao sincronizar a Caixa.",
          };
        }

        return {
          ...usuario,
          sincronizacao,
        };
      },
    ),
  );

export const sincronizarMinhaCaixa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    comContexto(
      context.userId,
      emailDoToken(context.claims),
      async (ctx) => {
        const syncService = await import(
          "@/server/domain/caixa-inteligente/caixa-inteligente-sync.service"
        );
        return syncService.sincronizarMinhaCaixaSegura(ctx, {
          email: emailDoToken(context.claims),
        });
      },
    ),
  );

export const listarMinhaCaixa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input?: { busca?: string | null; categoria?: string | null }) => input ?? {},
  )
  .handler(async ({ data, context }) =>
    comContexto(
      context.userId,
      emailDoToken(context.claims),
      async (ctx) => {
        const service = await import(
          "@/server/domain/caixa-inteligente/caixa-inteligente.service"
        );
        return service.listarMinhaCaixa(ctx, {
          email: emailDoToken(context.claims),
          busca: data.busca ?? null,
          categoria: data.categoria ?? null,
        });
      },
    ),
  );

export const analisarSolicitacaoInteligente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { solicitacaoExternalId: string }) => {
    if (!input?.solicitacaoExternalId)
      throw new Error("VALIDACAO::Solicitação não informada.");
    return input;
  })
  .handler(async ({ data, context }) =>
    comContexto(
      context.userId,
      emailDoToken(context.claims),
      async (ctx) => {
        const service = await import(
          "@/server/domain/caixa-inteligente/caixa-inteligente.service"
        );
        return service.analisarSolicitacao(ctx, {
          email: emailDoToken(context.claims),
          solicitacaoExternalId: data.solicitacaoExternalId,
        });
      },
    ),
  );

export const executarAcaoSolicitacaoInteligente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      solicitacaoExternalId: string;
      acao: "RESPONDER_MANTER_ABERTA" | "RESPONDER_FINALIZAR";
      mensagem: string;
      privada?: boolean;
    }) => {
      if (!input?.solicitacaoExternalId)
        throw new Error("VALIDACAO::Solicitação não informada.");
      if (
        !["RESPONDER_MANTER_ABERTA", "RESPONDER_FINALIZAR"].includes(
          input.acao,
        )
      )
        throw new Error("VALIDACAO::Ação inválida.");
      if (!input.mensagem?.trim())
        throw new Error("VALIDACAO::Informe a resposta antes de publicar.");
      return input;
    },
  )
  .handler(async ({ data, context }) =>
    comContexto(
      context.userId,
      emailDoToken(context.claims),
      async (ctx) => {
        const service = await import(
          "@/server/domain/caixa-inteligente/caixa-inteligente.service"
        );
        return service.executarAcao(ctx, {
          email: emailDoToken(context.claims),
          ...data,
        });
      },
    ),
  );
