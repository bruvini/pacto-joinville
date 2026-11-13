/** Valor exato em centavos, sem R$ ou separador de milhares, para colar no SEI/e-Pública. */
export function valorAnulacaoParaCopiar(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error("Valor de anulação inválido.");
  }
  return valor.toFixed(2).replace(".", ",");
}
