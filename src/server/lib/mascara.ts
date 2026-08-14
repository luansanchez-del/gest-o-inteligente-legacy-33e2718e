/**
 * Máscara de credenciais.
 *
 * Qualquer texto que possa chegar a log, snapshot, evidência ou UI passa por
 * aqui. O objetivo é impedir que usuário/senha, tokens e segredos vazem a
 * partir de postagens do PIER, conteúdo de PDF ou mensagens de erro.
 */

const SUBSTITUTO = "[credencial oculta]";

const PADROES: RegExp[] = [
  // usuario: x senha: y  |  login = x / password = y
  /\b(?:usu[áa]rio|usuario|user(?:name)?|login)\s*[:=-]\s*\S+(?:\s*[/|,;]?\s*(?:senha|password|pass|pwd)\s*[:=-]\s*\S+)?/gi,
  /\b(?:senha|password|pass|pwd|secret|segredo|credencial|credentials?|api[_ -]?key|access[_ -]?key|token|bearer|authorization)\s*[:=-]\s*\S+/gi,
  // Bearer eyJ...
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  // JWT solto
  /\beyJ[A-Za-z0-9._-]{10,}\b/g,
];

/** Nomes de variáveis sensíveis que nunca podem aparecer com valor. */
const ENV_SENSIVEL =
  /\b(PIER_USUARIO|PIER_SENHA|PIER_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|LOVABLE_API_KEY)\b\s*[:=]?\s*\S*/g;

export function mascararTexto(valor: string): string {
  let saida = valor.replace(ENV_SENSIVEL, SUBSTITUTO);
  for (const padrao of PADROES) saida = saida.replace(padrao, SUBSTITUTO);
  return saida;
}

/** Aplica a máscara recursivamente em qualquer estrutura serializável. */
export function mascarar<T>(valor: T): T {
  if (typeof valor === "string") return mascararTexto(valor) as unknown as T;
  if (Array.isArray(valor)) return valor.map((item) => mascarar(item)) as unknown as T;
  if (valor && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      saida[chave] = mascarar(item);
    }
    return saida as unknown as T;
  }
  return valor;
}

/** Mensagem de erro segura para persistir/mostrar. */
export function erroSeguro(error: unknown): string {
  const bruto =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Falha inesperada.";
  return mascararTexto(bruto).slice(0, 500);
}
