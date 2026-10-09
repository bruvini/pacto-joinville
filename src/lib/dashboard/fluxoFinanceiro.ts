/**
 * Referência de acompanhamento: somente UMA grandeza por módulo.
 * Não confundir volume sob monitoramento com caixa, despesa liquidada
 * ou execução consolidada; convênios e PVH podem ter vínculos contábeis.
 */
export type OrigemFinanceira = "convenios" | "piso" | "cacon" | "pvh";

export type ReferenciaFinanceira = {
  id: OrigemFinanceira;
  valorReferencia: number;
};

/** Soma valores de referência em centavos para evitar erros de ponto flutuante.
 * Cada módulo só pode contribuir uma vez; múltiplas métricas dentro do card
 * não entram no total. Valores ausentes ou inválidos não são inferidos.
 */
export function calcularVolumeFinanceiroAcompanhado(
  origens: readonly ReferenciaFinanceira[],
): number {
  const encontrados = new Set<OrigemFinanceira>();
  let centavos = 0;
  for (const origem of origens) {
    if (encontrados.has(origem.id)) {
      throw new Error(`Origem financeira duplicada no volume: ${origem.id}`);
    }
    encontrados.add(origem.id);
    if (Number.isFinite(origem.valorReferencia) && origem.valorReferencia > 0) {
      centavos += Math.round(origem.valorReferencia * 100);
    }
  }
  return centavos / 100;
}
