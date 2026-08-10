import type { PierClient, PierPost, PierRequest } from "./pier.types";

type Raw = Record<string, unknown>;

const str = (raw: Raw, ...keys: string[]): string | null => {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
};

const bool = (raw: Raw, ...keys: string[]): boolean => {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.length > 0;
  }
  return false;
};

function inferPurpose(typeName: string | null): PierRequest["purpose"] {
  const value = (typeName ?? "").toLowerCase();
  if (!value) return "UNMAPPED";
  if (value.includes("contábil") || value.includes("contabil")) return "ACCOUNTING_CLOSING";
  if (value.includes("fiscal") || value.includes("tribut")) return "TAX_CLOSING";
  return "OTHER";
}

/** Mapeia o cliente da PIER Public API V2 para o modelo interno. */
export function mapClient(raw: Raw): PierClient {
  return {
    externalId: str(raw, "id", "idCliente", "externalId", "codigo") ?? "",
    name: str(raw, "nome", "name", "razaoSocial") ?? "Sem nome",
    document: str(raw, "documento", "document", "cnpj", "cpf"),
    status: str(raw, "status", "situacao"),
    taxRegime: str(raw, "tributacao", "taxRegime", "regime"),
    responsibleName: null,
    raw,
  };
}

export function mapRequest(raw: Raw, clientExternalId: string): PierRequest {
  const typeName = str(raw, "typeName", "tipo", "type");
  return {
    externalId: str(raw, "id", "externalId") ?? "",
    clientExternalId,
    number: str(raw, "number", "numero"),
    description: str(raw, "description", "descricao", "titulo"),
    typeName,
    purpose: inferPurpose(typeName),
    status: str(raw, "status", "situacao"),
    responsibleName: str(raw, "responsibleName", "responsavel"),
    requestedAt: str(raw, "requestedAt", "criadoEm", "dataSolicitacao"),
    finishedAt: str(raw, "finishedAt", "concluidoEm", "dataConclusao"),
    deadlineAt: str(raw, "deadlineAt", "prazo", "dataPrazo"),
    hasAttachment: bool(raw, "hasAttachment", "possuiAnexo", "anexos"),
    raw,
  };
}

export function mapPost(raw: Raw, requestExternalId: string): PierPost {
  return {
    externalId: str(raw, "id", "externalId") ?? "",
    requestExternalId,
    authorName: str(raw, "authorName", "autor", "usuario"),
    content: str(raw, "content", "mensagem", "texto"),
    postedAt: str(raw, "postedAt", "criadoEm", "data"),
  };
}
