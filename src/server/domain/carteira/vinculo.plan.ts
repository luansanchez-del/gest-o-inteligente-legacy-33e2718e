/**
 * Planejamento puro do vínculo automático da carteira.
 * Não toca no banco: recebe o estado carregado e devolve o que fazer.
 * Isso permite testar com milhares de registros sem usar produção.
 */

export type MotivoConflito =
  | "DOCUMENTO_INVALIDO"
  | "DOCUMENTO_DUPLICADO_PIER"
  | "EMPRESA_DUPLICADA";

export interface ClientePlano {
  id: string;
  name: string;
  document: string | null;
}

export interface EmpresaPlano {
  id: string;
  document_digits: string | null;
}

export interface VinculoExistente {
  pierClientId: string;
  companyId: string;
}

export interface EmpresaACriar {
  documento: string;
  nome: string;
  documentoOriginal: string | null;
  pierClientId: string;
}

export interface ConflitoPlano {
  pierClientId: string;
  nome: string;
  motivo: MotivoConflito;
  mensagem: string;
}

export interface PlanoVinculo {
  jaVinculados: number;
  vincularExistentes: VinculoExistente[];
  criarEmpresas: EmpresaACriar[];
  conflitos: ConflitoPlano[];
  semDocumento: { pierClientId: string; nome: string }[];
  total: number;
}

export function normalizarDocumento(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

/** Aceita CNPJ (14) e CPF (11); qualquer outro tamanho é documento inválido. */
export function documentoValido(digitos: string) {
  return digitos.length === 14 || digitos.length === 11;
}

export function planejarVinculo(entrada: {
  clientes: ClientePlano[];
  empresas: EmpresaPlano[];
  clientesJaVinculados: Iterable<string>;
}): PlanoVinculo {
  const { clientes, empresas } = entrada;
  const jaVinculados = new Set(entrada.clientesJaVinculados);

  const ocorrenciasPier = new Map<string, number>();
  for (const c of clientes) {
    const d = normalizarDocumento(c.document);
    if (d) ocorrenciasPier.set(d, (ocorrenciasPier.get(d) ?? 0) + 1);
  }

  const empresasPorDocumento = new Map<string, string[]>();
  for (const e of empresas) {
    const d = e.document_digits ?? "";
    if (!d) continue;
    const atual = empresasPorDocumento.get(d);
    if (atual) atual.push(e.id);
    else empresasPorDocumento.set(d, [e.id]);
  }

  const plano: PlanoVinculo = {
    jaVinculados: 0,
    vincularExistentes: [],
    criarEmpresas: [],
    conflitos: [],
    semDocumento: [],
    total: clientes.length,
  };

  // Documento que será criado nesta rodada só pode gerar UMA empresa.
  const documentosPlanejados = new Set<string>();

  for (const cliente of clientes) {
    if (jaVinculados.has(cliente.id)) {
      plano.jaVinculados += 1;
      continue;
    }

    const digitos = normalizarDocumento(cliente.document);
    if (!digitos) {
      plano.semDocumento.push({ pierClientId: cliente.id, nome: cliente.name });
      continue;
    }
    if (!documentoValido(digitos)) {
      plano.conflitos.push({
        pierClientId: cliente.id,
        nome: cliente.name,
        motivo: "DOCUMENTO_INVALIDO",
        mensagem: `${cliente.name}: documento inválido (${cliente.document}).`,
      });
      continue;
    }
    if ((ocorrenciasPier.get(digitos) ?? 0) > 1) {
      plano.conflitos.push({
        pierClientId: cliente.id,
        nome: cliente.name,
        motivo: "DOCUMENTO_DUPLICADO_PIER",
        mensagem: `${cliente.name}: CNPJ repetido na carteira do PIER.`,
      });
      continue;
    }

    const candidatas = empresasPorDocumento.get(digitos) ?? [];
    if (candidatas.length > 1) {
      plano.conflitos.push({
        pierClientId: cliente.id,
        nome: cliente.name,
        motivo: "EMPRESA_DUPLICADA",
        mensagem: `${cliente.name}: CNPJ presente em mais de uma empresa interna — revisão manual.`,
      });
      continue;
    }

    const empresaId = candidatas[0];
    if (empresaId) {
      plano.vincularExistentes.push({ pierClientId: cliente.id, companyId: empresaId });
      continue;
    }

    if (documentosPlanejados.has(digitos)) {
      plano.conflitos.push({
        pierClientId: cliente.id,
        nome: cliente.name,
        motivo: "DOCUMENTO_DUPLICADO_PIER",
        mensagem: `${cliente.name}: CNPJ repetido na carteira do PIER.`,
      });
      continue;
    }
    documentosPlanejados.add(digitos);
    plano.criarEmpresas.push({
      documento: digitos,
      documentoOriginal: cliente.document,
      nome: cliente.name,
      pierClientId: cliente.id,
    });
  }

  return plano;
}

export interface ResumoVinculoAutomatico {
  total: number;
  jaVinculados: number;
  reutilizarEmpresas: number;
  criarEmpresas: number;
  conflitos: number;
  semDocumento: number;
}

export function resumirPlano(plano: PlanoVinculo): ResumoVinculoAutomatico {
  return {
    total: plano.total,
    jaVinculados: plano.jaVinculados,
    reutilizarEmpresas: plano.vincularExistentes.length,
    criarEmpresas: plano.criarEmpresas.length,
    conflitos: plano.conflitos.length,
    semDocumento: plano.semDocumento.length,
  };
}
