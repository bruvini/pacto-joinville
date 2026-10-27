/** Lead Time de lançamentos concluídos, em dias corridos, com marcos auditáveis. */
export type MarcoLeadTime = { lancamento_id: string; marco: string; ocorrido_em: string };
export function calcularLeadTimeReal(
  marcos: MarcoLeadTime[],
  idsEscopo: ReadonlySet<string>,
): {media: number | null; n: number} {
  const porLancamento = new Map<string, {criado?: number; concluido?: number}>();
  for (const item of marcos) {
    if (!idsEscopo.has(item.lancamento_id)) continue;
    if (item.marco !== "criado" && item.marco !== "concluido") continue;
    const instante = Date.parse(item.ocorrido_em);
    if (!Number.isFinite(instante)) continue;
    const obj = porLancamento.get(item.lancamento_id) ?? {};
    if (item.marco === "criado") obj.criado = Math.min(obj.criado ?? instante, instante);
    else obj.concluido = Math.max(obj.concluido ?? instante, instante);
    porLancamento.set(item.lancamento_id, obj);
  }
  const dias: number[] = [];
  for (const obj of porLancamento.values()) {
    if (obj.criado === undefined || obj.concluido === undefined || obj.concluido <= obj.criado) continue;
    dias.push((obj.concluido - obj.criado) / 86_400_000);
  }
  return {media: dias.length ? dias.reduce((s,d)=>s+d,0)/dias.length : null,n:dias.length};
}
