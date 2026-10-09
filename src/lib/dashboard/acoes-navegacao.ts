/**
 * Estado de navegação da faixa "Ações necessárias".
 * IDs recebidos pela URL só selecionam registros carregados pelas consultas
 * já protegidas por RLS. Nunca servem como autorização de acesso.
 */
export type BuscaAcao = {
  alerta?: string;
  ids?: string;
  faltantes?: string;
  competencia?: string;
  prestador?: string;
};

export function validarBuscaAcao(search: Record<string, unknown>): BuscaAcao {
  const stringCurta = (valor: unknown, maximo: number) =>
    typeof valor === "string" && valor.length <= maximo ? valor : undefined;
  return {
    alerta: stringCurta(search.alerta, 80),
    ids: stringCurta(search.ids, 8000),
    faltantes: stringCurta(search.faltantes, 8000),
    competencia: stringCurta(search.competencia, 7),
    prestador: stringCurta(search.prestador, 80),
  };
}

export function idsBuscadosAcao(search: BuscaAcao): Set<string> | null {
  if (!search.ids) return null;
  return new Set(
    search.ids.split(",").slice(0, 200)
      .filter((id) => /^[a-z0-9-]{1,80}$/i.test(id)),
  );
}

export function filtrarPelaAcao<T extends { id: string }>(
  registros: T[],
  search: BuscaAcao,
): T[] {
  const ids = idsBuscadosAcao(search);
  return ids === null ? registros : registros.filter((registro) => ids.has(registro.id));
}
