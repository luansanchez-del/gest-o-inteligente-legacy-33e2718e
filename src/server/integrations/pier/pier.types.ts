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

export interface PierRequest {
  externalId: string;
  clientExternalId: string | null;
  clientName: string | null;
  clientDocument: string | null;
  number: string | null;
  description: string | null;
  typeExternalId: string | null;
  typeName: string | null;
  purpose: "ACCOUNTING_CLOSING" | "TAX_CLOSING" | "OTHER" | "UNMAPPED";
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

export interface PierAdapter {
  /** Informa se a integração está configurada e utilizável. */
  status(): Promise<{ available: boolean; reason?: string }>;
  listClients(options?: { status?: "Ativo" | "Inativo" | "Todos" }): Promise<PierClient[]>;
  listUsers(options?: { status?: "Ativo" | "Inativo" | "Todos" }): Promise<PierUser[]>;
  /** Solicitações de um tipo (ex.: Fechamento Contábil) filtradas pela competência. */
  listRequestsByType(input: {
    typeExternalId: string;
    referenceMonth: string;
  }): Promise<PierRequest[]>;
  listPosts(input: { requestExternalId: string }): Promise<PierPost[]>;
}
