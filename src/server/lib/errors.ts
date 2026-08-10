/**
 * Hierarquia de erros da Gestão Inteligente.
 * Cada erro carrega código estável + mensagem em português para o usuário.
 * O detalhe técnico fica apenas no log do servidor.
 */
export type AppErrorCode =
  | "CONFIGURACAO"
  | "INTEGRACAO_INDISPONIVEL"
  | "INTEGRACAO_FALHA"
  | "VALIDACAO"
  | "NAO_AUTORIZADO"
  | "REGRA_NEGOCIO"
  | "INESPERADO";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly detail?: string | undefined;

  constructor(code: AppErrorCode, userMessage: string, detail?: string) {
    super(userMessage);
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
    this.detail = detail;
  }
}

export const configuracaoInvalida = (msg: string, detail?: string) =>
  new AppError("CONFIGURACAO", msg, detail);
export const integracaoIndisponivel = (msg: string, detail?: string) =>
  new AppError("INTEGRACAO_INDISPONIVEL", msg, detail);
export const integracaoFalhou = (msg: string, detail?: string) =>
  new AppError("INTEGRACAO_FALHA", msg, detail);
export const validacao = (msg: string) => new AppError("VALIDACAO", msg);
export const naoAutorizado = (msg = "Você não tem permissão para esta ação.") =>
  new AppError("NAO_AUTORIZADO", msg);
export const regraNegocio = (msg: string) => new AppError("REGRA_NEGOCIO", msg);

/**
 * Converte qualquer erro em um Error seguro para atravessar a fronteira RPC.
 * A mensagem chega ao cliente no formato `CODIGO::mensagem`.
 */
export function toClientError(error: unknown): Error {
  if (error instanceof AppError) {
    if (error.detail) console.error(`[${error.code}] ${error.userMessage} :: ${error.detail}`);
    return new Error(`${error.code}::${error.userMessage}`);
  }
  console.error(error);
  return new Error(
    "INESPERADO::Ocorreu um erro inesperado ao processar a solicitação. Tente novamente.",
  );
}
