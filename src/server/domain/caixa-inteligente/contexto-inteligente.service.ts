import type { LeituraAnexo } from "./anexo-inteligente.service";

export interface AnaliseContextualIA {
  resumo: string;
  categoria:
    | "BALANCETE"
    | "CONTABIL"
    | "FISCAL"
    | "FOLHA"
    | "FINANCEIRO"
    | "DOCUMENTO"
    | "ADMINISTRATIVO"
    | "OUTRO";
  confianca: "ALTA" | "MEDIA" | "BAIXA";
  acaoSugerida:
    | "RESPONDER_FINALIZAR"
    | "RESPONDER_MANTER_ABERTA"
    | "FINALIZAR_SEM_RESPONDER"
    | "REVISAO_HUMANA";
  motivo: string;
  respostaSugerida: string;
  somenteInformativo: boolean;
}

function limparJson(texto: string) {
  return texto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function validarCategoria(value: unknown): AnaliseContextualIA["categoria"] {
  const permitidas = [
    "BALANCETE",
    "CONTABIL",
    "FISCAL",
    "FOLHA",
    "FINANCEIRO",
    "DOCUMENTO",
    "ADMINISTRATIVO",
    "OUTRO",
  ];
  return permitidas.includes(String(value))
    ? (String(value) as AnaliseContextualIA["categoria"])
    : "OUTRO";
}

function validarConfianca(value: unknown): AnaliseContextualIA["confianca"] {
  return ["ALTA", "MEDIA", "BAIXA"].includes(String(value))
    ? (String(value) as AnaliseContextualIA["confianca"])
    : "BAIXA";
}

function validarAcao(value: unknown): AnaliseContextualIA["acaoSugerida"] {
  const permitidas = [
    "RESPONDER_FINALIZAR",
    "RESPONDER_MANTER_ABERTA",
    "FINALIZAR_SEM_RESPONDER",
    "REVISAO_HUMANA",
  ];
  return permitidas.includes(String(value))
    ? (String(value) as AnaliseContextualIA["acaoSugerida"])
    : "REVISAO_HUMANA";
}

export async function analisarContextoComIA(input: {
  tipo: string | null;
  descricao: string | null;
  cliente: string | null;
  postagens: Array<{ autor: string | null; conteudo: string | null }>;
  anexos: LeituraAnexo[];
}): Promise<AnaliseContextualIA | null> {
  const key = process.env["LOVABLE_API_KEY"]?.trim();
  if (!key) return null;

  const anexos = input.anexos.map((a) => ({
    nome: a.nome,
    status: a.status,
    resumo: a.resumo,
    motivo: a.motivo,
  }));
  const postagens = input.postagens.slice(-12);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente operacional de escritório contábil. Analise a solicitação, postagens e anexos já lidos. Não invente fatos, não considere prazo como decisão técnica e nunca diga que um documento foi validado se o conteúdo não comprovar isso. Identifique a área correta e se é mero e-mail/documento informativo que pode ser encerrado sem resposta. A decisão final é sempre humana. Retorne APENAS JSON válido.",
        },
        {
          role: "user",
          content: `Analise este contexto:\n${JSON.stringify(
            {
              cliente: input.cliente,
              tipo: input.tipo,
              descricao: input.descricao,
              postagens,
              anexos,
            },
            null,
            2,
          )}\n\nRetorne exatamente estas chaves: resumo (explicação objetiva do que está acontecendo e do que os anexos mostram), categoria (BALANCETE|CONTABIL|FISCAL|FOLHA|FINANCEIRO|DOCUMENTO|ADMINISTRATIVO|OUTRO), confianca (ALTA|MEDIA|BAIXA), acaoSugerida (RESPONDER_FINALIZAR|RESPONDER_MANTER_ABERTA|FINALIZAR_SEM_RESPONDER|REVISAO_HUMANA), motivo, respostaSugerida (texto profissional pronto para o solicitante quando resposta fizer sentido; vazio se for somente informativo), somenteInformativo (boolean). Só recomende RESPONDER_FINALIZAR se o contexto demonstrar que a demanda foi efetivamente atendida. Só recomende FINALIZAR_SEM_RESPONDER quando o conteúdo for claramente informativo e não houver pergunta, pendência ou ação a devolver.`,
        },
      ],
    }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const texto = payload.choices?.[0]?.message?.content;
  if (!texto) return null;

  try {
    const raw = JSON.parse(limparJson(texto)) as Record<string, unknown>;
    return {
      resumo: typeof raw.resumo === "string" ? raw.resumo.trim() : "",
      categoria: validarCategoria(raw.categoria),
      confianca: validarConfianca(raw.confianca),
      acaoSugerida: validarAcao(raw.acaoSugerida),
      motivo: typeof raw.motivo === "string" ? raw.motivo.trim() : "",
      respostaSugerida:
        typeof raw.respostaSugerida === "string" ? raw.respostaSugerida.trim() : "",
      somenteInformativo: raw.somenteInformativo === true,
    };
  } catch {
    return null;
  }
}
