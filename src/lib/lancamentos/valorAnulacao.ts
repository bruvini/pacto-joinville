/** Valor de anulação em BRL, pronto para copiar com R$, milhares e centavos. */
export function valorAnulacaoParaCopiar(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error("Valor de anulação inválido.");
  }
  // Intl insere espaço não separável entre R$ e número; normalizar para colagem.
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor).replace(/[\u00a0\u202f]/g, " ");
}
