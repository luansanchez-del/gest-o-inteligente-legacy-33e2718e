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

export interface PierRequest {
  externalId: string;
  clientExternalId: string;
  number: string | null;
  description: string | null;
  typeName: string | null;
  purpose: "ACCOUNTING_CLOSING" | "TAX_CLOSING" | "OTHER" | "UNMAPPED";
  status: string | null;
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
  listClients(): Promise<PierClient[]>;
  listRequests(input: { clientExternalId: string; referenceMonth: string }): Promise<PierRequest[]>;
  listPosts(input: { requestExternalId: string }): Promise<PierPost[]>;
}
