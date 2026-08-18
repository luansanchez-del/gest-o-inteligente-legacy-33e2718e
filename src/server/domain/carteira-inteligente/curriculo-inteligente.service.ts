import { extractText } from "unpdf";

import { AppError } from "../../lib/errors";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 24_000;

function extensao(nome: string) {
  const p = nome.toLowerCase().lastIndexOf(".");
  return p >= 0 ? nome.toLowerCase().slice(p + 1) : "";
}

function base64ParaBytes(base64: string) {
  const limpo = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  const bin = atob(limpo);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesParaBase64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return btoa(bin);
}

function cortar(v: string, n = MAX_TEXT) {
  const t = v.replace(/\u0000/g, "").replace(/\s+\n/g, "\n").trim();
  return t.length > n ? `${t.slice(0, n)}\n[…truncado…]` : t;
}

function extrairResposta(payload: any) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((x: any) => x?.text ?? x?.content ?? "").join("\n").trim();
  return "";
}

function parseJsonSeguro(texto: string) {
  const semFence = texto.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const inicio = semFence.indexOf("{");
  const fim = semFence.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) throw new Error("A análise não retornou JSON válido.");
  return JSON.parse(semFence.slice(inicio, fim + 1));
}

function detectarLocalmente(texto: string) {
  const t = texto.toLowerCase();
  const regimes = ["Lucro Real", "Lucro Presumido", "Simples Nacional", "Terceiro Setor"].filter((x) => t.includes(x.toLowerCase().replace("terceiro setor", "terceiro setor")));
  const sistemas = ["Questor", "Domínio", "Protheus", "SAP", "TOTVS", "SCI", "Conta Azul", "Omie", "Alterdata"].filter((x) => t.includes(x.toLowerCase()));
  const segmentos = ["Indústria", "Comércio", "Serviços", "Construção", "Terceiro Setor", "Saúde", "Tecnologia"].filter((x) => t.includes(x.toLowerCase()));
  const mapa = [
    ["ECD", /\becd\b/], ["ECF", /\becf\b/], ["Conciliação", /concili/], ["Fechamento contábil", /fechamento/],
    ["Fiscal", /fiscal|tribut/], ["Folha/DP", /folha|departamento pessoal|esocial|e-social/], ["Lucro Real", /lucro real/],
    ["Centro de custos", /centro de custo/], ["SPED", /sped/], ["ICMS", /\bicms\b/], ["PIS/COFINS", /pis|cofins/],
  ] as const;
  const competencias = mapa.filter(([, re]) => re.test(t)).map(([nome]) => nome);
  const senioridade = /coordenador|coordenadora|gerente|especialista|senior|sênior/.test(t)
    ? "Sênior / liderança"
    : /analista/.test(t)
      ? "Analista"
      : null;
  return { regimes, sistemas, segmentos, competencias, senioridade };
}

async function analisarTextoComIA(nome: string, texto: string) {
  const key = process.env["LOVABLE_API_KEY"]?.trim();
  if (!key) return null;
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "Você analisa currículo profissional para apoiar um gestor de escritório contábil. Extraia SOMENTE informações profissionais relevantes. Ignore e não use idade, data de nascimento, gênero, estado civil, raça, religião, saúde, foto, endereço ou qualquer característica pessoal/sensível. Não decida contratação, aptidão ou inaptidão. Não invente. Retorne SOMENTE JSON válido com as chaves resumo (string), senioridade (string|null), regimes (array de strings), segmentos (array), sistemas (array), competencias (array) e observacoes (array). Priorize experiência contábil, fiscal, folha/DP, regimes tributários, segmentos, sistemas, fechamento, conciliação, ECD/ECF/SPED e liderança técnica.",
        },
        { role: "user", content: `Currículo: ${nome}\n\nConteúdo:\n${cortar(texto)}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Lovable AI HTTP ${response.status}`);
  const bruto = extrairResposta(await response.json());
  return parseJsonSeguro(bruto);
}

async function lerImagemComIA(nome: string, mimeType: string, bytes: Uint8Array) {
  const key = process.env["LOVABLE_API_KEY"]?.trim();
  if (!key) throw new Error("Leitura visual de currículo indisponível no ambiente.");
  const dataUrl = `data:${mimeType};base64,${bytesParaBase64(bytes)}`;
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "Transcreva apenas o conteúdo PROFISSIONAL do currículo visível. Ignore foto, idade/data de nascimento, gênero, estado civil, raça, religião, saúde, endereço e demais dados pessoais/sensíveis. Preserve experiências, cargos, empresas, atividades, cursos, sistemas e conhecimentos técnicos. Não faça avaliação.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Leia o currículo ${nome} e devolva o texto profissional relevante.` },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Lovable AI HTTP ${response.status}`);
  return extrairResposta(await response.json());
}

export async function analisarCurriculoArquivo(input: { nome: string; mimeType?: string | null; base64: string }) {
  const nome = input.nome?.trim() || "curriculo";
  const bytes = base64ParaBytes(input.base64);
  if (!bytes.length) throw new AppError("VALIDACAO", "O arquivo do currículo está vazio.");
  if (bytes.length > MAX_BYTES) throw new AppError("VALIDACAO", "O currículo excede 8 MB.");

  const ext = extensao(nome);
  const mime = (input.mimeType ?? "").toLowerCase();
  let texto = "";
  let metodo = "";

  if (mime === "application/pdf" || ext === "pdf") {
    const extraido = await extractText(bytes, { mergePages: true });
    texto = cortar(extraido.text || "");
    metodo = "PDF texto";
    if (texto.length < 80) {
      throw new AppError("VALIDACAO", "O PDF parece digitalizado e não trouxe texto suficiente. Envie o currículo como PDF com texto, TXT ou imagem nesta primeira versão.");
    }
  } else if (mime.startsWith("text/") || ["txt", "md", "csv"].includes(ext)) {
    texto = cortar(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
    metodo = "Texto";
  } else if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(ext)) {
    texto = cortar(await lerImagemComIA(nome, mime || `image/${ext === "jpg" ? "jpeg" : ext}`, bytes));
    metodo = "Imagem / visão";
  } else {
    throw new AppError("VALIDACAO", "Formato de currículo ainda não suportado. Use PDF, TXT, PNG, JPG ou WebP.");
  }

  if (!texto.trim()) throw new AppError("VALIDACAO", "Não foi possível extrair conteúdo profissional do currículo.");

  const local = detectarLocalmente(texto);
  let ia: any = null;
  try { ia = await analisarTextoComIA(nome, texto); } catch { ia = null; }
  const resultado = {
    resumo: typeof ia?.resumo === "string" && ia.resumo.trim() ? ia.resumo.trim() : `Currículo lido por ${metodo}. Revise as competências extraídas antes de usar na distribuição.`,
    senioridade: typeof ia?.senioridade === "string" ? ia.senioridade : local.senioridade,
    regimes: Array.isArray(ia?.regimes) ? ia.regimes.map(String) : local.regimes,
    segmentos: Array.isArray(ia?.segmentos) ? ia.segmentos.map(String) : local.segmentos,
    sistemas: Array.isArray(ia?.sistemas) ? ia.sistemas.map(String) : local.sistemas,
    competencias: Array.isArray(ia?.competencias) ? ia.competencias.map(String) : local.competencias,
    observacoes: Array.isArray(ia?.observacoes) ? ia.observacoes.map(String) : [],
  };
  return { ...resultado, textoProfissional: texto, metodo };
}
