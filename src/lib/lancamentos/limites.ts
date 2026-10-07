export function tetoMensalEfetivo(
  lancamento: any,
  convenio: any,
  termosPorId: Map<string, any>,
): number {
  const termo = lancamento?.termo_aditivo_id
    ? termosPorId.get(lancamento.termo_aditivo_id)
    : null;
  const tetoTermo = Number(termo?.valor_total ?? 0);
  if (tetoTermo > 0) return tetoTermo;
  return Math.max(0, Number(convenio?.teto_mensal ?? 0));
}

export function lancamentoAcimaTeto(
  lancamento: any,
  convenio: any,
  termosPorId: Map<string, any>,
): boolean {
  const teto = tetoMensalEfetivo(lancamento, convenio, termosPorId);
  return teto > 0 && Number(lancamento?.valor_solicitado ?? 0) > teto;
}
