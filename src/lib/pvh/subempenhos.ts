export function totalSubempenhadoPvh(
  subempenhos: Array<{ valor?: number | null }>,
) {
  return subempenhos.reduce(
    (soma, subempenho) => soma + Number(subempenho.valor ?? 0),
    0,
  );
}

export function saldoSubempenharPvh(
  valorAlocado: number,
  subempenhos: Array<{ valor?: number | null }>,
) {
  return Math.max(0, Number(valorAlocado ?? 0) - totalSubempenhadoPvh(subempenhos));
}

export function coberturaSubempenhoFechadaPvh(
  valorAlocado: number,
  subempenhos: Array<{ valor?: number | null }>,
) {
  return (
    subempenhos.length === 1 &&
    Math.abs(Number(subempenhos[0]?.valor ?? 0) - Number(valorAlocado ?? 0)) <
      0.01
  );
}

export function fluxoUnicoSubempenhoPvh<T>(
  subempenhos: T[] | null | undefined,
): T | null {
  return (subempenhos ?? []).length === 1 ? (subempenhos ?? [])[0] : null;
}
