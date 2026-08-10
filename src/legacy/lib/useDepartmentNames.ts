import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { PierDepartmentMapping, PierUsuario } from "../api/types";

/**
 * Nome de departamento PIER configurado pelo gestor. A API pública do PIER
 * não expõe nome de departamento em nenhum endpoint (confirmado no Swagger
 * real: `GET /api/v2/usuarios` só devolve `departamentoPrincipalId`) — este
 * hook descobre os ids vistos nos usuários carregados, registra os novos
 * (sem nome) no backend, e devolve o nome já configurado ou
 * "Departamento <id>" como identificação honesta enquanto ninguém nomeou.
 */
export function useDepartmentNames(users: PierUsuario[]) {
  const [mappings, setMappings] = useState<PierDepartmentMapping[]>([]);
  const ids = useMemo(
    () => [...new Set(users.map((user) => user.departamentoPrincipalId))],
    [users],
  );
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!ids.length) return;
    api.gestaoFechamentos.departmentMappings
      .ensure(ids)
      .then(setMappings)
      .catch(() => {});
  }, [idsKey]);

  const nameById = useMemo(
    () => new Map(mappings.map((item) => [item.externalDepartmentId, item.name])),
    [mappings],
  );

  function nameFor(id: number | string | null | undefined): string {
    if (id === null || id === undefined || id === "") return "Departamento não informado";
    return nameById.get(String(id)) ?? `Departamento ${id}`;
  }

  async function rename(id: number | string, name: string) {
    const saved = await api.gestaoFechamentos.departmentMappings.setName(String(id), name);
    setMappings((current) => [
      ...current.filter((item) => item.externalDepartmentId !== saved.externalDepartmentId),
      saved,
    ]);
  }

  const unnamed = ids.filter((id) => !nameById.get(String(id)));

  return { nameFor, rename, unnamed };
}
