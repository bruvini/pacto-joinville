/** Valores monetários do formulário de distribuição (pt-BR) com precisão de centavos. */
export function valorMoedaDistribuicao(entrada: string): number | null {
  const texto = entrada.trim().replace(/^R\$\s*/, "").replace(/\s/g, "");
  if (!texto) return null;
  const validoBR = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/;
  const simples = /^\d+(?:[,.]\d{1,2})?$/;
  if (!validoBR.test(texto) && !simples.test(texto)) return null;
  const normalizado = validoBR.test(texto)
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto.replace(",", ".");
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor > 0 && valor <= 99999999999999.99
    ? Math.round(valor * 100) / 100
    : null;
}

export function reaisDistribuicao(centavos: number): number {
  return Math.round(centavos * 100) / 100;
}

/** Não confundir distribuição planejada com recursos comprometidos. */
export function saldosDistribuicao(args: {
  ne: number;
  anulacoes: number;
  alocado: number;
  comprometido: number;
}) {
  const neLiquida = reaisDistribuicao(args.ne - args.anulacoes);
  return {
    neLiquida,
    semDistribuicao: reaisDistribuicao(neLiquida - args.alocado),
    aComprometer: reaisDistribuicao(neLiquida - args.comprometido),
  };
}
