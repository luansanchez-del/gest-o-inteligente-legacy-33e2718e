/** Mensagens de erro amigáveis para a interface. */
export function mensagemDeErro(error: unknown): string {
  const bruto =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!bruto) return "Não foi possível concluir a operação. Tente novamente.";
  const [codigo, ...resto] = bruto.split("::");
  const mensagem = resto.join("::").trim();
  if (mensagem) return mensagem;
  switch (codigo) {
    case "NAO_AUTORIZADO":
      return "Sessão expirada. Entre novamente para continuar.";
    case "SEM_PERMISSAO":
      return "Você não tem permissão para executar esta ação.";
    case "INTEGRACAO_INDISPONIVEL":
      return "A integração com o PIER não está configurada.";
    default:
      return bruto;
  }
}

export function codigoDoErro(error: unknown): string | null {
  const bruto = error instanceof Error ? error.message : "";
  const [codigo] = bruto.split("::");
  return codigo && codigo === codigo.toUpperCase() ? codigo : null;
}
