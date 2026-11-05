import type { CtxPiso } from "./regras";

/** Somente os setores/unidades do memorando, únicos e sem valores vazios. */
export function unidadesDestinatariasMemorando(
  destinatarios: Array<{ unidade?: string | null }> | null | undefined,
): string[] {
  const vistos = new Set<string>();
  return (destinatarios ?? []).flatMap((d) => {
    const unidade = String(d?.unidade ?? "").trim().replace(/\s+/g, " ");
    if (!unidade || vistos.has(unidade.toLocaleUpperCase("pt-BR"))) return [];
    vistos.add(unidade.toLocaleUpperCase("pt-BR"));
    return [unidade];
  });
}

/** Snapshot comparável mesmo quando a ordem dos destinatários é modificada. */
export function destinoEncaminhamentoMemorando(unidades: string[]): string {
  return [...unidades].map((s) => s.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR"))
    .filter(Boolean).sort().join("; ");
}

export function assinaturasObrigatoriasMemorandoColetadas(ctx: CtxPiso): boolean {
  const memorando = ctx.docs.find((d) => d.tipo === "memorando" && !d.participante_id && !d.obrigacao_id);
  if (!memorando) return false;
  const obrigatorias = ctx.matriz.filter(
    (slot) => slot.tipo_documento === "memorando" && !slot.opcional,
  );
  return obrigatorias.length > 0 && obrigatorias.every(
    (slot) => ctx.assinaturas.some(
      (a) => a.documento_id === memorando.id && a.slot === slot.slot_key,
    ),
  );
}

/**
 * Um encaminhamento só vale para a lista atual de unidades e para a
 * versão de assinaturas recolhidas. Alterar signatários ou destinatários
 * obriga nova confirmação, preservando o evento anterior no histórico.
 */
export function memorandoEncaminhadoParaDestinatarios(ctx: CtxPiso): boolean {
  const memorando = ctx.docs.find((d) => d.tipo === "memorando" && !d.participante_id && !d.obrigacao_id);
  const destinos = unidadesDestinatariasMemorando(ctx.comp.municipal_config?.destinatarios);
  if (!memorando || destinos.length === 0 || !assinaturasObrigatoriasMemorandoColetadas(ctx))
    return false;
  const todos = ctx.encaminhamentos
    .filter((e) => e.documento_id === memorando.id)
    .sort((a, b) => (a.ocorrido_em ?? "").localeCompare(b.ocorrido_em ?? ""));
  const ultimo = todos.at(-1);
  if (ultimo?.acao !== "encaminhado" ||
      ultimo.destino !== destinoEncaminhamentoMemorando(destinos)) return false;
  // Se uma assinatura foi substituída após a confirmação, pedir novo envio.
  const assinaturaMaisRecente = ctx.assinaturas
    .filter((a) => a.documento_id === memorando.id)
    .map((a) => a.assinado_em)
    .filter((data): data is string => Boolean(data))
    .sort().at(-1);
  return !assinaturaMaisRecente ||
    new Date(ultimo.ocorrido_em).getTime() >= new Date(assinaturaMaisRecente).getTime();
}
