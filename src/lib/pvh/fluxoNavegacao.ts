/**
 * Avanço só é solicitado após o sucesso do botão "Concluir Etapa".
 * Etapas 5 e 6 são paralelas: caso 6 seja encerrada antes de 5, retorna à 5.
 */
export function proximaEtapaAposConclusaoPvh(
  etapa: number,
  concluidas: Record<string, boolean> = {},
): number | null {
  if (etapa < 1 || etapa > 6) return null;
  if (etapa === 5 && concluidas["6"] === true) return 7;
  if (etapa === 6 && concluidas["5"] !== true) return 5;
  return etapa + 1;
}
