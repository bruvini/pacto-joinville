import type { CtxPiso } from "./regras";
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
    !(tipoParcela === "decimo_terceiro" && etapa <= 2);
}

/** Identidade sem timestamps de REFETCH. Uma falha de conclusão não pode
 * recomeçar indefinidamente apenas porque React Query consultou novamente.
 * Mudanças reais em documentos, assinaturas, valores ou etapas permitem
 * uma nova tentativa automática.
 */
export function assinaturaTentativaConclusaoPiso(etapa: number, ctx: CtxPiso): string {
  return JSON.stringify([
    etapa,
    ctx.comp.etapas_concluidas,
    ctx.comp.etapas_reconferir,
    ctx.comp.valor_homologado,
    ctx.comp.valor_apurado_investsus,
    ctx.comp.credito_fms_data, ctx.comp.credito_fms_valor, ctx.comp.credito_fms_referencia,
    ctx.comp.credito_fms_numero_sei, ctx.comp.credito_fms_link, ctx.comp.justificativa_credito,
    ctx.parts.map(p => [p.id, p.updated_at, p.valor_devido]),
    ctx.obrigs.map(o => [o.id, o.updated_at, o.valor_a_liquidar, o.valor_empenhado]),
    (ctx.subempenhos ?? []).map(s => [s.id, s.updated_at, s.valor]),
    ctx.docs.map(d => [d.id, (d as any).updated_at, d.numero_sei, d.data_documento, d.link_sei]),
    ctx.assinaturas.map(a => [(a as any).id, a.documento_id, a.slot]),
    ctx.encaminhamentos.map(e => [(e as any).id, e.documento_id, e.acao]),
    (ctx.notificacoesEmail ?? []).map(e => [e.id, e.updated_at, e.enviado_em]),
  ]);
}
