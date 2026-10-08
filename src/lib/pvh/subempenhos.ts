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
    subempenhos.length > 0 &&
    Math.abs(totalSubempenhadoPvh(subempenhos) - Number(valorAlocado ?? 0)) <
      0.01
  );
}
