import { describe, expect, it } from "vitest";

import { planejarVinculo, resumirPlano } from "../vinculo.plan";

function cnpj(n: number) {
  return String(10000000000000 + n);
}

describe("planejarVinculo", () => {
  it("planeja carteira grande sem duplicar empresas e sem inserts individuais", () => {
    const clientes = Array.from({ length: 3400 }, (_, i) => ({
      id: `pc-${i}`,
      name: `Cliente ${i}`,
      document: cnpj(i),
    }));
    // 1.217 já vinculados, 2.086 com empresa criada aguardando vínculo.
    const jaVinculados = clientes.slice(0, 1217).map((c) => c.id);
    const empresas = clientes
      .slice(0, 1217 + 2086)
      .map((c, i) => ({ id: `co-${i}`, document_digits: c.document }));

    const plano = planejarVinculo({ clientes, empresas, clientesJaVinculados: jaVinculados });
    const resumo = resumirPlano(plano);

    expect(resumo.total).toBe(3400);
    expect(resumo.jaVinculados).toBe(1217);
    expect(resumo.reutilizarEmpresas).toBe(2086);
    expect(resumo.criarEmpresas).toBe(3400 - 1217 - 2086);
    expect(resumo.conflitos).toBe(0);
    expect(resumo.semDocumento).toBe(0);
    // nenhum cliente aparece duas vezes
    const ids = [
      ...plano.vincularExistentes.map((v) => v.pierClientId),
      ...plano.criarEmpresas.map((c) => c.pierClientId),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("classifica sem documento, documento inválido, duplicidade no PIER e empresa duplicada", () => {
    const plano = planejarVinculo({
      clientes: [
        { id: "a", name: "Sem doc", document: null },
        { id: "b", name: "Invalido", document: "123" },
        { id: "c", name: "Dup PIER 1", document: cnpj(1) },
        { id: "d", name: "Dup PIER 2", document: cnpj(1) },
        { id: "e", name: "Empresa dupla", document: cnpj(2) },
        { id: "f", name: "Nova", document: cnpj(3) },
      ],
      empresas: [
        { id: "co-1", document_digits: cnpj(2) },
        { id: "co-2", document_digits: cnpj(2) },
      ],
      clientesJaVinculados: [],
    });

    const resumo = resumirPlano(plano);
    expect(resumo.semDocumento).toBe(1);
    expect(resumo.conflitos).toBe(4); // invalido + 2 dup PIER + empresa duplicada
    expect(resumo.criarEmpresas).toBe(1);
    expect(plano.criarEmpresas[0]?.pierClientId).toBe("f");
  });

  it("é idempotente: com tudo vinculado, não há nada a fazer", () => {
    const clientes = Array.from({ length: 3001 }, (_, i) => ({
      id: `p-${i}`,
      name: `C${i}`,
      document: cnpj(i),
    }));
    const plano = planejarVinculo({
      clientes,
      empresas: clientes.map((c, i) => ({ id: `co-${i}`, document_digits: c.document })),
      clientesJaVinculados: clientes.map((c) => c.id),
    });
    expect(resumirPlano(plano)).toMatchObject({
      jaVinculados: 3001,
      reutilizarEmpresas: 0,
      criarEmpresas: 0,
      conflitos: 0,
    });
  });
});
