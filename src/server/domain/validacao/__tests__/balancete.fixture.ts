/**
 * Fixture do caso piloto (TONIOLO PARTICIPAÇÃO LTDA), uma string por página.
 * Reproduz o layout textual típico do balancete analítico usado no PIER.
 */
export const PAGINAS_PILOTO: string[] = [
  [
    "TONIOLO PARTICIPACAO LTDA",
    "CNPJ: 54.876.405/0001-17",
    "Balancete Analitico",
    "Periodo: 01/01/2026 a 31/05/2026 Emissao: 10/06/2026",
    "Conta Descricao Saldo Anterior Debito Credito Saldo Atual",
    "1 ATIVO 5.765.616,30 3.000.000,00 1.000.000,00 7.765.616,30",
    "1.1.1.01.0001 CAIXA GERAL 1.688.184,24 0,00 0,00 1.688.184,24",
    "1.1.6.01.0001 ADIANTAMENTOS A FORNECEDORES 563.001,64 0,00 0,00 563.001,64",
    "1.2.3.01.0001 TONIOLO EMPREENDIMENTOS 0,00 0,00 448.800,00 (448.800,00)",
    "2 PASSIVO E PATRIMONIO LIQUIDO 5.765.616,30 390.000,00 2.393.348,29 7.768.964,59",
    "2.4.05.0001 ADIANTAMENTO DE LUCROS 578.176,10 0,00 0,00 578.176,10",
    "3 RECEITAS 0,00 0,00 2,79 2,79",
    "4 DESPESAS 0,00 7.239,64 3.888,56 3.351,08",
  ].join("\n"),
];

export const TITULO_PILOTO = "Fechamento Contabil - 01/2026";
export const POSTAGEM_PILOTO =
  "Segue demonstrativo atualizado de 01.2026 a 05.2026, para validacao. Usuario: contador Senha: 123456";
