import { describe, expect, it } from "vitest";

import { parseBalancete } from "../balancete.parser";
import { conciliarComRazao } from "../balancete.validator";
import { parseRazao } from "../razao.parser";

/**
 * Linhas reais (trechos) do razão de um piloto (NEBOC ENGENHARIA), competência
 * 01/2026. Trechos escolhidos para cobrir: conta sem movimento (Caixa), conta
 * com movimento e saldo final "D" (Banco Itaú), "Totais da conta" com um só
 * valor (Adiantamentos a Fornecedores) e conta sem nenhuma linha de totais
 * (Adiantamento de Lucros).
 */
const PAGINA_1 = [
  "0728 NEBOC ENGENHARIA E COMERCIO LTDA - Matriz",
  "CNPJ: 01.005.077/0001-17",
  "26/08/2026 19:42 Pág:0001",
  "Período: 01/01/2026 a 31/01/2026",
  "Razão – Fiscal",
  "RAZÃO",
  "Valores expressos em Reais (R$)",
  "Data Histórico Contrapart. Débito Crédito Saldo",
  "Conta: 5 1.1.01.001.001 Caixa",
  "31/12/2025 Saldo anterior... 480,74",
  "Conta: 11 1.1.01.002.001 Banco Itaú",
  "31/12/2025 Saldo anterior... 279.186,70",
  "09/01/2026 Valor Referente PIX RECEBIDO IRINEU 09/01 IRINEU IMOVEIS LTDA 142 6.554,27",
  "02.147.925/0001-95",
  "30/01/2026 Valor Referente PIX RECEBIDO IRINEU 30/01 IRINEU IMOVEIS LTDA 142 3.344,86 311.278,82D",
  "02.147.925/0001-95",
  "*********** Totais da conta 88.670,88 56.578,76",
  "Conta: 288 1.1.04.013.001 Adiantamentos a Fornecedores",
  "31/12/2025 Saldo anterior... 0,00",
  "12/01/2026 Valor Referente PIX ENVIADO CLAUDIA GONCALVES LOUREIRO 11 3.200,00",
  "033.934.229-36",
  "28/01/2026 Valor Referente PIX ENVIADO CLAUDIA GONCALVES LOUREIRO 11 2.350,00 10.800,00D",
  "033.934.229-36",
  "*********** Totais da conta 10.800,00",
  "Conta: 4898 1.1.04.019.001 Adiantamento de Lucros",
  "31/12/2025 Saldo anterior... 232.807,39",
].join("\n");

/** Conta que atravessa quebra de página, com "*****Continuação" reabrindo o mesmo código. */
const PAGINA_3 = [
  "Conta: 1544 2.1.05.001.001 IRRF sobre Trabalho Assalariado",
  "31/12/2025 Saldo anterior... 8.709,98",
  "20/01/2026 Valor ReferenteIRRF - RENDIMENTOS DO TRABALHO ASSALARIADOIRRF 1659 3.600,28",
  "sobre Trabalho Assalariado",
  "31/01/2026 Valor ReferenteIRRF S/Folha de Pagamento Normal - 01/2026 2.192,48 7.302,18C",
].join("\n");

const PAGINA_4 = [
  "Conta: 1544 2.1.05.001.001 IRRF sobre Trabalho Assalariado *****Continuação",
  "*********** Totais da conta 3.600,28 2.192,48",
].join("\n");

describe("parseRazao — layout real do livro-razão", () => {
  const documento = parseRazao([PAGINA_1, PAGINA_3, PAGINA_4]);

  it("extrai cabeçalho", () => {
    expect(documento.cnpj).toBe("01005077000117");
    expect(documento.periodoInicio).toBe("01/01/2026");
    expect(documento.periodoFim).toBe("31/01/2026");
  });

  it("conta sem movimento: saldo final é o próprio saldo anterior", () => {
    const caixa = documento.contas.find((c) => c.codigo === "1.1.01.001.001")!;
    expect(caixa.nome).toBe("Caixa");
    expect(caixa.contaInterna).toBe("5");
    expect(caixa.saldoAnterior).toBe(480.74);
    expect(caixa.saldoFinal).toBe(480.74);
    expect(caixa.temMovimento).toBe(false);
  });

  it("conta com movimento: lê o saldo final impresso com o sufixo D/C", () => {
    const banco = documento.contas.find((c) => c.codigo === "1.1.01.002.001")!;
    expect(banco.saldoAnterior).toBe(279186.7);
    expect(banco.saldoFinal).toBe(311278.82);
    expect(banco.saldoFinalSinal).toBe("D");
    expect(banco.totalDebito).toBe(88670.88);
    expect(banco.totalCredito).toBe(56578.76);
    expect(banco.temMovimento).toBe(true);
  });

  it("'Totais da conta' com um só valor (só débito, sem crédito)", () => {
    const adiantamento = documento.contas.find((c) => c.codigo === "1.1.04.013.001")!;
    expect(adiantamento.totalDebito).toBe(10800);
    expect(adiantamento.totalCredito).toBeNull();
    expect(adiantamento.saldoFinal).toBe(10800);
    expect(adiantamento.saldoFinalSinal).toBe("D");
  });

  it("conta sem nenhuma linha de totais (sem movimento) não quebra o parser", () => {
    const lucros = documento.contas.find((c) => c.codigo === "1.1.04.019.001")!;
    expect(lucros.saldoAnterior).toBe(232807.39);
    expect(lucros.saldoFinal).toBe(232807.39);
    expect(lucros.temMovimento).toBe(false);
  });

  it("conta que atravessa quebra de página não vira entrada duplicada", () => {
    const irrf = documento.contas.filter((c) => c.codigo === "2.1.05.001.001");
    expect(irrf).toHaveLength(1);
    expect(irrf[0]!.nome).toBe("IRRF sobre Trabalho Assalariado");
    expect(irrf[0]!.saldoFinal).toBe(7302.18);
    expect(irrf[0]!.saldoFinalSinal).toBe("C");
    // "Totais da conta" da página 4 (continuação) acumula na mesma conta.
    expect(irrf[0]!.totalDebito).toBe(3600.28);
    expect(irrf[0]!.totalCredito).toBe(2192.48);
  });
});

describe("conciliarComRazao", () => {
  const razao = parseRazao([PAGINA_1]);

  function balanceteSintetico(saldoBancoItau: string) {
    const pagina = [
      "EMPRESA TESTE LTDA",
      "CNPJ: 01.005.077/0001-17",
      "Balancete Analitico",
      "Periodo: 01/01/2026 a 31/01/2026",
      "Conta C/S Classificacao Descricao Saldo Anterior Debito Credito Movimento Saldo Atual",
      "5   1.1.01.001.001 Caixa 480,74 0,00 0,00 0,00 480,74",
      `11   1.1.01.002.001 Banco Itau 279.186,70 88.670,88 56.578,76 32.092,12 ${saldoBancoItau}`,
      "9999   9.9.99.999.999 Conta Sem Razao 1.000,00 0,00 0,00 0,00 1.000,00",
    ].join("\n");
    return parseBalancete([pagina]);
  }

  it("concilia sem achado quando os saldos batem, e ignora conta que só existe de um lado", () => {
    const documento = balanceteSintetico("311.278,82");
    const achados = conciliarComRazao(documento, razao);

    expect(achados.some((a) => a.code === "RECONCILIACAO_RAZAO_DIVERGENTE")).toBe(false);
    const resumo = achados.find((a) => a.code === "RECONCILIACAO_RAZAO_RESUMO")!;
    expect(resumo.severity).toBe("INFO");
    expect(resumo.evidence).toMatchObject({ conciliadas: 2, divergentes: 0 });
  });

  it("aponta divergência como WARNING + revisão humana, nunca bloqueia sozinho", () => {
    const documento = balanceteSintetico("300.000,00");
    const achados = conciliarComRazao(documento, razao);

    const divergencia = achados.find((a) => a.code === "RECONCILIACAO_RAZAO_DIVERGENTE");
    expect(divergencia).toMatchObject({
      severity: "WARNING",
      requiresHuman: true,
      accountCode: "1.1.01.002.001",
    });
    expect(achados.some((a) => a.severity === "BLOCKER" || a.severity === "ERROR")).toBe(false);

    const resumo = achados.find((a) => a.code === "RECONCILIACAO_RAZAO_RESUMO")!;
    expect(resumo.evidence).toMatchObject({ conciliadas: 2, divergentes: 1 });
  });

  it("razão sem contas reconhecidas gera aviso, sem travar nada", () => {
    const documento = balanceteSintetico("311.278,82");
    const achados = conciliarComRazao(documento, {
      empresa: null,
      cnpj: null,
      periodoInicio: null,
      periodoFim: null,
      paginas: 1,
      contas: [],
    });

    expect(achados).toHaveLength(1);
    expect(achados[0]).toMatchObject({
      code: "RAZAO_ILEGIVEL",
      severity: "WARNING",
      requiresHuman: true,
    });
  });
});
