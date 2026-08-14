import type {
  PierClient,
  PierFile,
  PierPost,
  PierRequest,
  PierRequestType,
  PierUser,
} from "./pier.types";

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
  if (value.includes("movimento") && value.includes("financeiro"))
    return "MONTHLY_FINANCIAL_MOVEMENT";
  if (value.includes("contábil") || value.includes("contabil"))
    return "ACCOUNTING_CLOSING";
  if (value.includes("fiscal") || value.includes("tribut"))
    return "TAX_CLOSING";
  return "OTHER";
}

export function mapRequestType(raw: Raw): PierRequestType {
  return {
    externalId: str(raw, "id", "idTipoSolicitacao", "externalId") ?? "",
    name: str(raw, "nome", "name", "descricao") ?? "Sem nome",
    status: str(raw, "status", "situacao"),
  };
}

/**
 * O PIER não expõe competência em campo próprio: ela vem na descrição
 * ("FECHAMENTO CONTÁBIL - 01/2026"). Extrai MM/AAAA e normaliza para AAAA-MM.
 */
export function extrairCompetencia(descricao: string | null): string | null {
  if (!descricao) return null;
  const match = descricao.match(/(0[1-9]|1[0-2])[/-](20\d{2})/);
  return match ? `${match[2]}-${match[1]}` : null;
}

/** A listagem de solicitações traz "NOME DA EMPRESA [00.000.000/0001-00]". */
export function separarNomeEDocumento(nomeCliente: string | null): {
  nome: string | null;
  documento: string | null;
} {
  if (!nomeCliente) return { nome: null, documento: null };
  const match = nomeCliente.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  if (!match) return { nome: nomeCliente.trim(), documento: null };
  return {
    nome: (match[1] ?? "").trim() || null,
    documento: (match[2] ?? "").trim() || null,
  };
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

/** Mapeia UsuarioResumoPublic (/api/v2/usuarios). */
export function mapUser(raw: Raw): PierUser {
  return {
    externalId: str(raw, "id") ?? "",
    name: str(raw, "nome", "name") ?? "Sem nome",
    kind: str(raw, "tipo"),
    login: str(raw, "login"),
    email: str(raw, "email"),
    status: str(raw, "status"),
    departmentExternalId: str(raw, "departamentoPrincipalId"),
    raw,
  };
}

/** Mapeia SolicitacaoPierPublic (/api/v2/solicitacoes). */
export function mapRequest(raw: Raw, typeName?: string | null): PierRequest {
  const descricao = str(raw, "descricao", "description", "assunto");
  const cliente = separarNomeEDocumento(str(raw, "nomeCliente"));
  const nomeTipo = typeName ?? str(raw, "nomeTipo", "typeName", "tipo");

  return {
    externalId: str(raw, "id", "externalId") ?? "",
    clientExternalId: str(raw, "idCliente"),
    clientName: cliente.nome,
    clientDocument: cliente.documento,
    number: str(raw, "numero", "number"),
    description: descricao,
    typeExternalId: str(raw, "idTipoSolicitacao"),
    typeName: nomeTipo,
    purpose: inferPurpose(nomeTipo ?? descricao),
    referenceMonth: extrairCompetencia(descricao),
    status: str(raw, "status", "situacao"),
    responsibleExternalId: str(raw, "idResponsavel"),
    responsibleName: str(raw, "nomeResponsavel", "responsavel"),
    requestedAt: str(raw, "solicitadaEm", "dataAbertura", "requestedAt"),
    finishedAt: str(raw, "finalizadaEm", "dataFinalizacao", "finishedAt"),
    deadlineAt: str(raw, "prazo", "dataPrazo", "deadlineAt"),
    hasAttachment: bool(raw, "flgTemAnexo", "hasAttachment", "possuiAnexo"),
    raw,
  };
}

/** Mapeia PostagemPublic (/api/v2/solicitacoes/{id}/postagens). */
export function mapPost(raw: Raw, requestExternalId: string): PierPost {
  return {
    externalId: str(raw, "idPostagem", "id", "externalId") ?? "",
    requestExternalId,
    authorName: str(raw, "nomeUsuario", "authorName", "autor", "usuario"),
    content: str(raw, "postagemTexto", "content", "mensagem", "texto"),
    postedAt: str(raw, "postadoEm", "postedAt", "criadoEm", "data"),
  };
}

/** Mapeia ArquivoPublic (/api/v2/arquivos). */
export function mapFile(raw: Raw, requestExternalId: string | null): PierFile {
  const tamanho = raw["tamanho"] ?? raw["tamanhoBytes"] ?? raw["size"];
  return {
    externalId: str(raw, "id", "idArquivo", "externalId") ?? "",
    requestExternalId: str(raw, "idSolicitacao") ?? requestExternalId,
    name: str(raw, "nome", "nomeArquivo", "filename", "name"),
    category: str(raw, "categoria", "nomeCategoria", "tipo", "descricao"),
    mimeType: str(raw, "mimeType", "contentType", "tipoConteudo"),
    sizeBytes: typeof tamanho === "number" ? tamanho : null,
    createdAt: str(raw, "criadoEm", "dataUpload", "data", "enviadoEm"),
  };
}
