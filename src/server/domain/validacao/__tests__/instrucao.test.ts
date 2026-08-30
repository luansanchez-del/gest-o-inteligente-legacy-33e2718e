import { describe, expect, it } from "vitest";

import { extrairCompetencias, instrucaoEfetiva, interpretarTexto } from "../instrucao";

describe("interpretarTexto", () => {
  it("interpreta o título nominal do fechamento", () => {
    expect(interpretarTexto("FECHAMENTO CONTÁBIL - 02/2026")).toEqual({
      inicio: "2026-02",
      fim: "2026-02",
      tipo: "MES",
      trecho: "FECHAMENTO CONTÁBIL - 02/2026",
    });
  });

  it("interpreta uma postagem curta que declara o fechamento de um mês", () => {
    const resultado = interpretarTexto(
      "Fechamento contabil finalizado 02/2026, segue balancete para validação",
    );
    expect(resultado.inicio).toBe("2026-02");
    expect(resultado.fim).toBe("2026-02");
    expect(resultado.tipo).toBe("MES");
  });

  it("interpreta uma postagem que amplia o período com uma palavra de período", () => {
    const resultado = interpretarTexto("Período de 01/2026 à 05/2026, favor considerar todo o intervalo");
    expect(resultado.inicio).toBe("2026-01");
    expect(resultado.fim).toBe("2026-05");
    expect(resultado.tipo).toBe("INTERVALO");
  });

  it("ignora datas soltas em postagem de observações sem relação com o período do fechamento", () => {
    // Caso real: a postagem mais recente da solicitação só falava de
    // pendências fiscais e documentos recebidos em outros meses -- nenhuma
    // dessas datas é uma declaração de período, mas antes do fix o parser
    // pegava a menor e a maior data do texto inteiro e tratava como se
    // fosse o período "oficial", divergindo do balancete correto.
    const texto = [
      "OBSERVAÇÕES E SOLICITAÇÕES",
      "*EMPRESA ENVIOU ALGUNS BORDEROS EM 04/2026, ALOCADOS NA CONTA 1712",
      "*COFINS FALTOU PAGAMENTO DOS MESES 01/2026- 03/2026 CONFORME COMPROVANTES ECAC",
      "*PODERIA TIRAR O RELATORIO DE PENDENCIAS FISCAIS NO ECAC PARA VALIDARMOS OS IMPOSTOS SEM PAGAMENTO DO PERIODO",
    ].join(" ");

    expect(interpretarTexto(texto)).toEqual({
      inicio: null,
      fim: null,
      tipo: "INDEFINIDO",
      trecho: null,
    });
  });

  it("extrairCompetencias só considera datas perto de uma palavra-gatilho de período", () => {
    expect(
      extrairCompetencias("Cliente enviou documentos em 04/2026, sem novidades."),
    ).toEqual([]);
    expect(extrairCompetencias("Competência 06/2026 conforme solicitado.")).toEqual(["2026-06"]);
  });

  it("ignora um par 'de X a Y' formatado como range quando não tem relação com o período do fechamento", () => {
    // Caso real: a postagem de observações pedia extrato bancário "para
    // 01/01/2026 a 30/04/2026" -- é um range de datas de verdade, com
    // conector "a" entre elas, mas sobre extrato bancário, não sobre o
    // período do balancete. Só formar um par não deveria ser suficiente.
    const texto =
      "Solicitar extratos consolidados do banco Itau, pois tem saldo de aplicações sem pagamentos localizados no ECAC para 01/01/2026 a 30/04/2026. Fornecedor não foi possível validar pois tem muitos sispag.";

    expect(interpretarTexto(texto)).toEqual({
      inicio: null,
      fim: null,
      tipo: "INDEFINIDO",
      trecho: null,
    });
  });

  it("reconhece 'validação' (substantivo) como palavra-gatilho, mas não 'validar'/'validarmos' (verbo)", () => {
    expect(
      interpretarTexto("Empresa Lançada e Conciliada 01/2026 a 04/2026 e segue demonstrativos para Validação"),
    ).toMatchObject({ inicio: "2026-01", fim: "2026-04", tipo: "INTERVALO" });

    expect(
      interpretarTexto("Fornecedor não foi possível validar pois faltam notas de 03/2026."),
    ).toEqual({ inicio: null, fim: null, tipo: "INDEFINIDO", trecho: null });
  });
});

describe("instrucaoEfetiva com postagem de observação ruidosa", () => {
  it("prefere a postagem que declara o fechamento do mês em vez da postagem de observações mais recente", () => {
    const instrucoes = [
      {
        origem: "TITLE" as const,
        ocorridoEm: "2026-08-30T15:36:45Z",
        texto: "FECHAMENTO CONTÁBIL - 02/2026",
        interpretado: interpretarTexto("FECHAMENTO CONTÁBIL - 02/2026"),
      },
      {
        origem: "POST" as const,
        ocorridoEm: "2026-06-01T15:42:41Z",
        texto: "Fechamento contabil finalizado 02/2026, segue balancete para validação",
        interpretado: interpretarTexto(
          "Fechamento contabil finalizado 02/2026, segue balancete para validação",
        ),
      },
      {
        // Postagem mais recente que a do fechamento, mas só com observações
        // fiscais soltas -- não deve vencer como instrução efetiva.
        origem: "POST" as const,
        ocorridoEm: "2026-06-01T16:48:29Z",
        texto: "EMPRESA ENVIOU BORDEROS EM 04/2026. COFINS EM ATRASO DOS MESES 01/2026-03/2026.",
        interpretado: interpretarTexto(
          "EMPRESA ENVIOU BORDEROS EM 04/2026. COFINS EM ATRASO DOS MESES 01/2026-03/2026.",
        ),
      },
    ];

    const efetiva = instrucaoEfetiva(instrucoes);
    expect(efetiva?.interpretado.inicio).toBe("2026-02");
    expect(efetiva?.interpretado.fim).toBe("2026-02");
  });
});
