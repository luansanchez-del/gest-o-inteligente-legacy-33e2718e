import { extractText } from "unpdf";
import * as XLSX from "xlsx";

import { pierAdapter } from "../../integrations/pier/pier.adapter";
import type { PierFile } from "../../integrations/pier/pier.types";

export type StatusLeituraAnexo = "LIDO" | "PARCIAL" | "NAO_SUPORTADO" | "ERRO";

export interface LeituraAnexo {
  arquivoId: string;
  nome: string;
  mimeType: string | null;
  status: StatusLeituraAnexo;
  resumo: string;
  motivo: string | null;
  conteudoParaContexto: string;
}

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_CONTEXTO = 14_000;
const MAX_RESUMO_LOCAL = 1_500;

function extensao(nome: string) {
  const limpo = nome.toLowerCase().split("?")[0] ?? "";
  const pos = limpo.lastIndexOf(".");
  return pos >= 0 ? limpo.slice(pos + 1) : "";
}

function cortar(texto: string, limite: number) {
  const limpo = texto.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite)}\n[…conteúdo truncado…]` : limpo;
}

function mimeEfetivo(arquivo: PierFile) {
  if (arquivo.mimeType) return arquivo.mimeType.toLowerCase();
  const ext = extensao(arquivo.name ?? "");
  const mapa: Record<string, string> = {
    pdf: "application/pdf",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    xml: "text/xml",
    html: "text/html",
    htm: "text/html",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    bmp: "image/bmp",
  };
  return mapa[ext] ?? "application/octet-stream";
}

function bytesParaBase64(bytes: Uint8Array) {
  let binario = "";
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    binario += String.fromCharCode(...bytes.subarray(i, Math.min(i + passo, bytes.length)));
  }
  return btoa(binario);
}

function extrairRespostaGateway(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown[] }).choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const partes = content
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const obj = item as { text?: unknown; content?: unknown };
        return typeof obj.text === "string"
          ? obj.text
          : typeof obj.content === "string"
            ? obj.content
            : "";
      })
      .filter(Boolean);
    return partes.join("\n").trim() || null;
  }
  return null;
}

async function resumirTextoComIA(nome: string, texto: string) {
  const key = process.env["LOVABLE_API_KEY"]?.trim();
  if (!key) return null;
  const trecho = cortar(texto, 18_000);
  if (!trecho) return null;

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
            "Você analisa documentos de solicitações de um escritório contábil. Responda em português, de forma objetiva. Não invente dados. Identifique o que o arquivo é, empresa/pessoa quando constar, competência/data, valores ou tributos relevantes, o que está sendo pedido/comprovado e qualquer ação necessária. Se algo não estiver no arquivo, não presuma.",
        },
        {
          role: "user",
          content: `Arquivo: ${nome}\n\nConteúdo extraído:\n${trecho}\n\nFaça um resumo operacional em até 8 linhas.`,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Lovable AI HTTP ${response.status}`);
  return extrairRespostaGateway(await response.json());
}

async function analisarBinarioComIA(
  nome: string,
  mimeType: string,
  bytes: Uint8Array,
) {
  const key = process.env["LOVABLE_API_KEY"]?.trim();
  if (!key) throw new Error("Lovable AI não está disponível no ambiente do servidor.");

  const dataUrl = `data:${mimeType};base64,${bytesParaBase64(bytes)}`;
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
            "Você analisa anexos de solicitações de um escritório contábil. Leia visualmente todo conteúdo legível. Responda em português e não invente. Identifique tipo do documento, emissor/destinatário, empresa/CNPJ quando visível, datas/competência, valores, tributos, assunto principal, o que o documento comprova e qual ação operacional ele sugere. Se for somente imagem informativa, diga isso.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Leia o anexo ${nome}. Faça um resumo operacional em até 10 linhas e transcreva os dados essenciais que sustentam o resumo.`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Lovable AI HTTP ${response.status}`);
  const texto = extrairRespostaGateway(await response.json());
  if (!texto) throw new Error("A IA não retornou conteúdo legível para o anexo.");
  return texto;
}

function lerTexto(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function lerPlanilha(bytes: Uint8Array) {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const partes: string[] = [];
  for (const nome of workbook.SheetNames.slice(0, 8)) {
    const sheet = workbook.Sheets[nome];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    partes.push(`### ${nome}\n${cortar(csv, 8_000)}`);
  }
  return partes.join("\n\n");
}

async function lerPdf(bytes: Uint8Array) {
  const { text, totalPages } = await extractText(bytes, { mergePages: true });
  return { texto: cortar(text, MAX_CONTEXTO), totalPages };
}

export async function lerAnexoPier(arquivo: PierFile): Promise<LeituraAnexo> {
  const nome = arquivo.name?.trim() || `Arquivo ${arquivo.externalId}`;
  const mimeType = mimeEfetivo(arquivo);

  if (arquivo.sizeBytes && arquivo.sizeBytes > MAX_BYTES) {
    return {
      arquivoId: arquivo.externalId,
      nome,
      mimeType,
      status: "PARCIAL",
      resumo: "Arquivo identificado, mas excede o limite de leitura automática desta tela.",
      motivo: `Tamanho ${arquivo.sizeBytes} bytes; limite ${MAX_BYTES} bytes.`,
      conteudoParaContexto: "",
    };
  }

  try {
    const bytes = await pierAdapter.downloadFile({ fileExternalId: arquivo.externalId });
    if (!bytes.length) throw new Error("Arquivo vazio.");
    if (bytes.length > MAX_BYTES) {
      return {
        arquivoId: arquivo.externalId,
        nome,
        mimeType,
        status: "PARCIAL",
        resumo: "Arquivo baixado, mas excede o limite de leitura automática desta tela.",
        motivo: `Tamanho ${bytes.length} bytes; limite ${MAX_BYTES} bytes.`,
        conteudoParaContexto: "",
      };
    }

    const ext = extensao(nome);
    const ehTexto =
      mimeType.startsWith("text/") ||
      ["application/json", "application/xml", "text/xml"].includes(mimeType) ||
      ["txt", "csv", "json", "xml", "html", "htm", "md"].includes(ext);

    if (ehTexto) {
      const texto = cortar(lerTexto(bytes), MAX_CONTEXTO);
      const resumoIA = await resumirTextoComIA(nome, texto).catch(() => null);
      return {
        arquivoId: arquivo.externalId,
        nome,
        mimeType,
        status: "LIDO",
        resumo: resumoIA ?? cortar(texto, MAX_RESUMO_LOCAL),
        motivo: resumoIA ? null : "Texto lido diretamente; resumo de IA indisponível.",
        conteudoParaContexto: texto,
      };
    }

    if (
      mimeType.includes("spreadsheet") ||
      mimeType === "application/vnd.ms-excel" ||
      ["xls", "xlsx"].includes(ext)
    ) {
      const texto = cortar(lerPlanilha(bytes), MAX_CONTEXTO);
      const resumoIA = await resumirTextoComIA(nome, texto).catch(() => null);
      return {
        arquivoId: arquivo.externalId,
        nome,
        mimeType,
        status: "LIDO",
        resumo: resumoIA ?? cortar(texto, MAX_RESUMO_LOCAL),
        motivo: resumoIA ? null : "Planilha lida; resumo de IA indisponível.",
        conteudoParaContexto: texto,
      };
    }

    if (mimeType === "application/pdf" || ext === "pdf") {
      try {
        const pdf = await lerPdf(bytes);
        if (pdf.texto.length >= 80) {
          const resumoIA = await resumirTextoComIA(nome, pdf.texto).catch(() => null);
          return {
            arquivoId: arquivo.externalId,
            nome,
            mimeType,
            status: "LIDO",
            resumo:
              resumoIA ?? `PDF com ${pdf.totalPages} página(s). ${cortar(pdf.texto, MAX_RESUMO_LOCAL)}`,
            motivo: resumoIA ? null : "PDF lido por extração de texto; resumo de IA indisponível.",
            conteudoParaContexto: pdf.texto,
          };
        }
      } catch {
        // PDF digitalizado ou com estrutura não extraível: cai para leitura multimodal.
      }

      try {
        const visual = await analisarBinarioComIA(nome, "application/pdf", bytes);
        return {
          arquivoId: arquivo.externalId,
          nome,
          mimeType,
          status: "LIDO",
          resumo: visual,
          motivo: "PDF interpretado por leitura multimodal.",
          conteudoParaContexto: cortar(visual, MAX_CONTEXTO),
        };
      } catch (error) {
        return {
          arquivoId: arquivo.externalId,
          nome,
          mimeType,
          status: "PARCIAL",
          resumo: "O PDF foi localizado, mas não foi possível extrair conteúdo legível automaticamente.",
          motivo: error instanceof Error ? error.message : String(error),
          conteudoParaContexto: "",
        };
      }
    }

    if (mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "bmp"].includes(ext)) {
      const visual = await analisarBinarioComIA(nome, mimeType, bytes);
      return {
        arquivoId: arquivo.externalId,
        nome,
        mimeType,
        status: "LIDO",
        resumo: visual,
        motivo: "Imagem interpretada por leitura multimodal.",
        conteudoParaContexto: cortar(visual, MAX_CONTEXTO),
      };
    }

    return {
      arquivoId: arquivo.externalId,
      nome,
      mimeType,
      status: "NAO_SUPORTADO",
      resumo: "Formato ainda não possui leitor automático nesta versão.",
      motivo: `Tipo detectado: ${mimeType}.`,
      conteudoParaContexto: "",
    };
  } catch (error) {
    return {
      arquivoId: arquivo.externalId,
      nome,
      mimeType,
      status: "ERRO",
      resumo: "Não foi possível ler este anexo.",
      motivo: error instanceof Error ? error.message : String(error),
      conteudoParaContexto: "",
    };
  }
}

export async function lerAnexosPier(arquivos: PierFile[]) {
  const resultados: LeituraAnexo[] = [];
  // Mantém baixa concorrência para não pressionar PIER nem o gateway multimodal.
  for (let i = 0; i < arquivos.length; i += 2) {
    resultados.push(...(await Promise.all(arquivos.slice(i, i + 2).map(lerAnexoPier))));
  }
  return resultados;
}
