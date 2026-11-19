/** Chaves distintas da competência mensal e do décimo terceiro, inclusive entre exercícios. */
export const competenciaNeValida = (chave: string) =>
  /^(0[1-9]|1[0-3])\/[0-9]{4}$/.test(chave) && Number(chave.slice(3)) >= 2020;

export function formatarCompetenciaNe(input: string) {
  const digitos = input.replace(/\D/g, "").slice(0, 6);
  return digitos.length > 2 ? digitos.slice(0, 2) + "/" + digitos.slice(2) : digitos;
}

export function ordenarCompetenciasNe(chaves: readonly string[]) {
  return [...new Set(chaves)].sort((a,b) =>
    a.slice(3).localeCompare(b.slice(3)) || a.slice(0,2).localeCompare(b.slice(0,2)));
}

export function adicionarCompetenciaNe(chaves: readonly string[], chave: string, atual: string) {
  if (!competenciaNeValida(chave)) return null;
  return ordenarCompetenciasNe([...chaves, atual, chave]);
}

export function removerCompetenciaNe(chaves: readonly string[], chave: string, atual: string) {
  return ordenarCompetenciasNe([...chaves.filter(c => c !== chave), atual]);
}
