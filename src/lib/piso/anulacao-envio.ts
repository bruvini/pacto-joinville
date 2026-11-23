import type { CtxPiso } from "./regras";

export const DESTINO_ANULACAO_PISO = "SEFAZ.UCG.AEO";

/** Exatamente a matriz institucional de convênios, com seus quatro slots obrigatórios. */
export const SLOTS_ANULACAO_PISO = ["fiscal", "gerente", "diretor", "financeira"] as const;

export function matrizAnulacaoConfigurada(ctx: Pick<CtxPiso, "matriz">) {
  const slots = ctx.matriz.filter((m) => m.tipo_documento === "solicitacao_anulacao" && !m.opcional);
  return slots.length === SLOTS_ANULACAO_PISO.length &&
    SLOTS_ANULACAO_PISO.every((key) => slots.some((m) => m.slot_key === key && !m.opcional));
}

export function assinaturasAnulacaoCompletas(
  ctx: Pick<CtxPiso, "matriz" | "assinaturas">, documentoId: string | null | undefined,
) {
  if (!documentoId || !matrizAnulacaoConfigurada(ctx)) return false;
  return SLOTS_ANULACAO_PISO.every((key) =>
    ctx.assinaturas.some((a) => a.documento_id === documentoId && a.slot === key));
}

/** A confirmação é a última ação auditável, posterior às assinaturas vigentes. */
export function envioAnulacaoConfirmado(
  ctx: Pick<CtxPiso, "matriz" | "assinaturas" | "encaminhamentos">,
  documentoId: string | null | undefined,
) {
  if (!documentoId || !assinaturasAnulacaoCompletas(ctx, documentoId)) return false;
  const ultimo = ctx.encaminhamentos
    .filter((e) => e.documento_id === documentoId)
    .sort((a,b) => a.ocorrido_em.localeCompare(b.ocorrido_em)).at(-1);
  if (ultimo?.acao !== "encaminhado" || ultimo.destino !== DESTINO_ANULACAO_PISO) return false;
  const ultimaAssinatura = ctx.assinaturas
    .filter((a) => a.documento_id === documentoId)
    .map((a) => a.assinado_em)
    .filter((v): v is string => Boolean(v))
    .sort().at(-1);
  return !ultimaAssinatura || Date.parse(ultimo.ocorrido_em) >= Date.parse(ultimaAssinatura);
}
