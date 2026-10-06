import { PISO_ETAPAS } from "./etapas";
import { pendenciasEtapa, type CtxPiso } from "./regras";

export function contextoCompleto(ctx: CtxPiso | null | undefined): ctx is CtxPiso {
  return Boolean(
    ctx?.comp &&
    [
      ctx.parts,
      ctx.obrigs,
      ctx.docs,
      ctx.assinaturas,
      ctx.matriz,
      ctx.encaminhamentos,
      ctx.arquivos,
      ctx.ocorrencias,
      ctx.cnes,
    ].every(Array.isArray),
  );
}

/** Preserva as marcações dos triggers até reconferência explícita pelo usuário. */
export function calcularReconferencia(ctx: CtxPiso): number[] {
  const etapas = new Set<number>(ctx.comp.etapas_reconferir ?? []);
  for (const etapa of PISO_ETAPAS) {
    if (ctx.comp.etapas_concluidas?.[String(etapa.n)] && pendenciasEtapa(etapa.n, ctx).length)
      etapas.add(etapa.n);
  }
  return [...etapas].sort((a, b) => a - b);
}

/** Compara o conteúdo, sem gerar gravações por diferenças apenas de ordem. */
export function reconferenciaMudou(
  armazenadas: number[] | null | undefined,
  calculadas: number[],
): boolean {
  const anteriores = new Set(armazenadas ?? []);
  return anteriores.size !== calculadas.length || calculadas.some((n) => !anteriores.has(n));
}
