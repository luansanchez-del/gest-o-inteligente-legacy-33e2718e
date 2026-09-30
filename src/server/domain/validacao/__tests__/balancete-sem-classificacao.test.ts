import { describe, expect, it } from "vitest";

import { layoutSemClassificacao, parseBalancete } from "../balancete.parser";
import { validarBalancete } from "../balancete.validator";

/**
 * Layout "Balancete – Fiscal" (piloto 35924397): só conta interna + marcador
 * S + descrição, sem classificação. Recorte do PDF real, com as sintéticas
 * ajustadas para fechar com as filhas mantidas aqui.
 */
const PAGINA = [
  "0053 CLINICA EXEMPLO S/S",
  "CNPJ: 05.050.324/0001-58 11/07/2026 16:36 Pág:0001",
  "Período: 01/01/2026 a 31/01/2026",
  "Balancete – Fiscal",
  "Conta S Descrição Saldo Ant. Débito Crédito Saldo",
  "1 S ATIVO 1.000,00 200,00 50,00 1.150,00",
  "2 S CIRCULANTE 1.000,00 200,00 50,00 1.150,00",
  "4 S BENS NUMERÁRIOS 125,37 0,00 0,00 125,37",
  "5 Caixa 125,37 0,00 0,00 125,37",
  "6 S DEPÓSITOS BANCÁRIOS A VISTA 874,63 200,00 50,00 1.024,63",
  "9 Banco Bradesco 874,63 200,00 50,00 1.024,63",
  "1350 S PASSIVO 1.000,00 0,00 100,00 1.100,00",
  "1539 S OBRIGAÇÕES TRIBUTÁRIAS 1.000,00 0,00 100,00 1.100,00",
  "1552 COFINS a Recolher (56,21) 0,00 0,00 (56,21)",
  "1553 CSLL a Recolher 1.056,21 0,00 100,00 1.156,21",
  "2600 S RECEITAS 0,00 0,00 200,00 200,00",
  "2701 Serviços Prestados 0,00 0,00 200,00 200,00",
  "3000 S CUSTOS E DESPESAS 0,00 150,00 0,00 150,00",
  "4327 S DESPESAS COM PESSOAL 0,00 150,00 0,00 150,00",
  "4332 13º Salário 0,00 100,00 0,00 100,00",
  "25008 Auxilio Funeral 0,00 50,00 0,00 50,00",
].join("\n");

describe("balancete sem classificação (conta interna + marcador S)", () => {
  const documento = parseBalancete([PAGINA]);

  it("detecta o layout só quando não há classificação", () => {
    expect(layoutSemClassificacao([PAGINA])).toBe(true);
    expect(layoutSemClassificacao(["1 S 1 ATIVO 1,00 1,00 1,00 1,00 1,00"])).toBe(false);
    expect(layoutSemClassificacao(["1.1.1.01 CAIXA 1,00 1,00 1,00 1,00"])).toBe(false);
  });

  it("lê todas as contas, inclusive descrição iniciada por dígito", () => {
    expect(documento.linhas).toHaveLength(16);
    expect(documento.naoInterpretadas).toHaveLength(0);
    expect(documento.integridadeValores.razao).toBe(1);
    expect(documento.linhas.find((l) => l.contaInterna === "4332")?.nome).toBe("13º Salário");
  });

  it("reconstrói a hierarquia pelas somas e guarda a conta interna", () => {
    const porInterna = (c: string) => documento.linhas.find((l) => l.contaInterna === c)!;
    expect(porInterna("1").codigo).toBe("1");
    expect(porInterna("2").codigo).toBe("1.1");
    expect(porInterna("5").codigo).toBe("1.1.1.1");
    expect(porInterna("6").codigo).toBe("1.1.2");
    expect(porInterna("1350").codigo).toBe("2");
    expect(porInterna("2600").codigo).toBe("3");
    expect(porInterna("25008").codigo).toBe("4.1.2");
    expect(porInterna("5").analitica).toBe(true);
    expect(porInterna("4").analitica).toBe(false);
  });

  it("fecha a validação com natureza pelo nome das raízes", () => {
    const relatorio = validarBalancete(documento);
    expect(relatorio.totais.ativo).toBe(1150);
    expect(relatorio.totais.passivoPl).toBe(1100);
    expect(relatorio.totais.resultado).toBe(50);
    expect(relatorio.totais.diferencaEquacao).toBe(0);
  });

  it("acusa sintética que não bate com as filhas em vez de esconder", () => {
    const quebrado = PAGINA.replace("4332 13º Salário 0,00 100,00", "4332 13º Salário 0,00 90,00");
    const doc = parseBalancete([quebrado]);
    expect(doc.naoInterpretadas.map((l) => l.texto)).toEqual(
      expect.arrayContaining([expect.stringContaining("DESPESAS COM PESSOAL")]),
    );
  });
});
