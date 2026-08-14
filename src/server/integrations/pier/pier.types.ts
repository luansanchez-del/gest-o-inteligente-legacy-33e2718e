/** Modelo normalizado que o domínio conhece. Nada do formato bruto do PIER vaza daqui. */
export interface PierClient {
  externalId: string;
  name: string;
  document: string | null;
  status: string | null;
  taxRegime: string | null;
  responsibleName: string | null;
  raw: Record<string, unknown>;
}

/** Usuário interno do PIER (colaborador, encarregado, gestor) ou usuário cliente. */
export interface PierUser {
  externalId: string;
  name: string;
  kind: string | null;
  login: string | null;
  email: string | null;
  status: string | null;
  departmentExternalId: string | null;
  raw: Record<string, unknown>;
}

export interface PierRequestType {
  externalId: string;
  name: string;
  status: string | null;
}

export interface PierRequest {
  externalId: string;
  clientExternalId: string | null;
  clientName: string | null;
  clientDocument: string | null;
  number: string | null;
  description: string | null;
  typeExternalId: string | null;
  typeName: string | null;
  purpose:
    | "ACCOUNTING_CLOSING"
    | "MONTHLY_FINANCIAL_MOVEMENT"
    | "TAX_CLOSING"
    | "OTHER"
    | "UNMAPPED";
  /** Competência AAAA-MM extraída da descrição da solicitação, quando existir. */
  referenceMonth: string | null;
  status: string | null;
  responsibleExternalId: string | null;
  responsibleName: string | null;
  requestedAt: string | null;
  finishedAt: string | null;
  deadlineAt: string | null;
  hasAttachment: boolean;
  raw: Record<string, unknown>;
}

export interface PierPost {
  externalId: string;
  requestExternalId: string;
  authorName: string | null;
  content: string | null;
  postedAt: string | null;
}

/** Arquivo anexado a uma solicitação (/api/v2/arquivos). */
export interface PierFile {
  externalId: string;
  requestExternalId: string | null;
  name: string | null;
  category: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string | null;
}

export interface PierAdapter {
  /** Informa se a integração está configurada e utilizável. */
  status(): Promise<{ available: boolean; reason?: string }>;
  listClients(options?: {
    status?: "Ativo" | "Inativo" | "Todos";
  }): Promise<PierClient[]>;
  listUsers(options?: {
    status?: "Ativo" | "Inativo" | "Todos";
  }): Promise<PierUser[]>;
  /** Tipos ativos disponíveis no PIER, usados para descobrir IDs sem hardcode. */
  listRequestTypes(): Promise<PierRequestType[]>;
  /** Solicitações de um tipo (ex.: Fechamento Contábil) filtradas pela competência. */
  listRequestsByType(input: {
    typeExternalId: string;
    referenceMonth: string;
    /** Inclui solicitações cuja competência não foi interpretada (revisão de competência). */
    incluirSemCompetencia?: boolean;
  }): Promise<PierRequest[]>;
  listPosts(input: { requestExternalId: string }): Promise<PierPost[]>;
  /** Estado real da solicitação — sempre consultado antes de qualquer ação. */
  getRequest(input: { requestExternalId: string }): Promise<PierRequest>;
  /** Anexos da solicitação, paginados. */
  listFiles(input: { requestExternalId: string }): Promise<PierFile[]>;
  /** Baixa o conteúdo do arquivo. A URL temporária nunca é devolvida nem persistida. */
  downloadFile(input: { fileExternalId: string }): Promise<Uint8Array>;
  /** Publica postagem (privada por padrão) e devolve o ID gerado pelo PIER. */
  createPost(input: {
    requestExternalId: string;
    mensagem: string;
    privada?: boolean;
  }): Promise<{ externalId: string | null }>;
  /** Finaliza a solicitação. Só pode ser chamada após a postagem confirmada. */
  finalizeRequest(input: { requestExternalId: string }): Promise<void>;
}
