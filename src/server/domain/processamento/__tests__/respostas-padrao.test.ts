import { describe, expect, it } from "vitest";

import {
  categoriaDoAchado,
  conferirRespostas,
  montarRespostaFechamento,
  opcoesDoAchado,
  type AchadoParaResposta,
} from "../../../../lib/fechamento/respostas-padrao";
import { paraAchadoDeResposta } from "../decisao-inteligente.service";

const socio: AchadoParaResposta = {
  id: "a1",
  codigo: "ADIANTAMENTO_MATERIAL",
  severidade: "WARNING",
  titulo: "Adiantamento material em aberto",
  contaCodigo: "1.1.3.1.2",
  contaNome: "Adiantamento a Sócios - Luiz Ernani",
  valor: 206838,
  exigeHumano: true,
};
const fornecedor: AchadoParaResposta = {
  ...socio,
  id: "a2",
  contaNome: "Adiantamentos a Fornecedores",
  valor: 2769.79,
};
const cofins: AchadoParaResposta = {
  ...socio,
  id: "a3",
  codigo: "NATUREZA_INVERTIDA",
  titulo: "Saldo com natureza potencialmente invertida",
  contaNome: "COFINS a Recolher",
  valor: -56.21,
};
const informativo: AchadoParaResposta = {
  id: "i1",
  codigo: "RESULTADO_PERIODO",
  severidade: "INFO",
  titulo: "Lucro do período",
};

describe("respostas padrão do fechamento", () => {
  it("classifica pelo código do alerta e pelo nome da conta", () => {
    expect(categoriaDoAchado(socio)).toBe("SOCIOS_LUCROS");
    expect(categoriaDoAchado(fornecedor)).toBe("ADIANTAMENTO");
    expect(categoriaDoAchado(cofins)).toBe("TRIBUTO");
    expect(categoriaDoAchado({ codigo: "NATUREZA_INVERTIDA", contaNome: "Clientes", titulo: "" })).toBe(
      "NATUREZA",
    );
    expect(categoriaDoAchado({ codigo: "RECONCILIACAO_RAZAO_DIVERGENTE", titulo: "" })).toBe("RAZAO");
    expect(categoriaDoAchado({ codigo: "EXTRACAO_PDF_INCOMPLETA", titulo: "" })).toBe("GERAL");
  });

  it("todo alerta tem ao menos uma opção com e uma sem acompanhamento", () => {
    for (const achado of [socio, fornecedor, cofins]) {
      const opcoes = opcoesDoAchado(achado);
      expect(opcoes.some((o) => o.acompanhar)).toBe(true);
      expect(opcoes.some((o) => !o.acompanhar)).toBe(true);
    }
  });

  it("aponta alertas sem resposta e ignora informativos e chaves de outra categoria", () => {
    const { itens, semResposta } = conferirRespostas(
      [socio, fornecedor, cofins, informativo],
      [
        { achadoId: "a1", chave: "SOCIO_BAIXA_ENCERRAMENTO" },
        { achadoId: "a2", chave: "TRIB_CONCILIADO_FISCAL" }, // chave de outra categoria
        { achadoId: "a3", chave: "TRIB_DIFERENCA_EXERCICIO_ANTERIOR", complemento: "Ajuste em 03/2026." },
      ],
    );
    expect(itens.map((i) => i.achado.id)).toEqual(["a1", "a3"]);
    expect(semResposta.map((a) => a.id)).toEqual(["a2"]);
    expect(itens[1]!.complemento).toBe("Ajuste em 03/2026.");
  });

  it("monta a resposta do PIER com tratamento, acompanhamento e pendências anteriores", () => {
    const { itens } = conferirRespostas(
      [socio, fornecedor],
      [
        { achadoId: "a1", chave: "SOCIO_BAIXA_ENCERRAMENTO" },
        { achadoId: "a2", chave: "ADIANT_COMPOSICAO_CONFERIDA" },
      ],
    );
    const texto = montarRespostaFechamento({
      clienteNome: "CLINICA EXEMPLO",
      competencia: "2026-02",
      itens,
      pendenciasConferidas: [
        {
          competencia: "2026-01",
          contaNome: "Adiantamento a Sócios - Luiz Otavio",
          contaCodigo: null,
          valor: 37659.61,
          titulo: "Adiantamento material em aberto",
          resposta: "Baixa prevista no encerramento.",
        },
      ],
    });
    expect(texto).toContain("Fechamento contábil 2026-02 — CLINICA EXEMPLO.");
    expect(texto).toContain("Adiantamento a Sócios - Luiz Ernani (1.1.3.1.2)");
    expect(texto).toContain("206.838,00");
    expect(texto).toContain("1 ponto(s) ficam em acompanhamento");
    expect(texto).toContain("Pendências do fechamento anterior conferidas");
    expect(texto).toContain("Luiz Otavio");
  });

  it("lê o valor da conta a partir da evidência gravada", () => {
    const achado = paraAchadoDeResposta({
      id: "x",
      codigo: "ADIANTAMENTO_MATERIAL",
      severidade: "WARNING",
      titulo: "t",
      evidencia: { codigo: "1.1", saldo: 2769.79, pagina: 1 },
    });
    expect(achado.valor).toBe(2769.79);
    expect(paraAchadoDeResposta({ id: "y", severidade: "INFO", titulo: "t" }).valor).toBeNull();
  });
});
