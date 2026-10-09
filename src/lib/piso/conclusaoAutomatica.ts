/**
 * A 13ª parcela não percorre a coleta mensal de planilhas de carga.
 * Por isso, a conferência inicial de instituições e CNES precisa ser uma
 * decisão expressa do responsável, não a ausência automática de bloqueios.
 */
export function conclusaoAutomaticaPermitidaPiso(
  etapa: number | null,
  tipoParcela: string | null | undefined,
): boolean {
  return etapa !== null &&
    !(etapa === 1 && tipoParcela === "decimo_terceiro");
}
