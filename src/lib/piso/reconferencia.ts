import { etapasVisiveisPiso, prerequisitosTransitivosEtapaPiso } from "./etapas";
import { requerAnulacaoPiso } from "./anulacao";
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
  const requerAnulacao = requerAnulacaoPiso(ctx.obrigs);
  const concluidas = ctx.comp.etapas_concluidas ?? {};
  for (const etapa of etapasVisiveisPiso(ctx.comp.tipo_parcela, requerAnulacao)) {
    if (!concluidas[String(etapa.n)]) continue;
    const preRequisitos = prerequisitosTransitivosEtapaPiso(
      etapa.n, ctx.comp.tipo_parcela, requerAnulacao,
    );
    // Uma etapa concluída historicamente não permanece válida quando seus
    // requisitos ainda estão abertos ou exigem reconferência. Isso detecta
    // especialmente a etapa 4 marcada antes da publicação municipal (etapa 3).
    if (
      pendenciasEtapa(etapa.n, ctx).length > 0 ||
      preRequisitos.some(n => !concluidas[String(n)] || etapas.has(n))
    ) etapas.add(etapa.n);
  }
  return [...etapas].filter(n => ctx.comp.tipo_parcela !== "decimo_terceiro" || n >= 2)
    .sort((a, b) => a - b);
}

/** Compara o conteúdo, sem gerar gravações por diferenças apenas de ordem. */
export function reconferenciaMudou(
  armazenadas: number[] | null | undefined,
  calculadas: number[],
): boolean {
  const anteriores = new Set(armazenadas ?? []);
  return anteriores.size !== calculadas.length || calculadas.some((n) => !anteriores.has(n));
}

/** Ao confirmar uma etapa, preserva todas as outras reconferências persistidas.
 * Evita que uma atualização pontual seja interpretada pelo trigger do banco como
 * aprovação simultânea de etapas posteriores (por exemplo 4 enquanto 3 é pendente).
 */
export function reconferenciaAposConclusao(
  etapa: number,
  armazenadas: number[] | null | undefined,
  calculadas: number[] | null | undefined,
): number[] {
  return [...new Set([...(armazenadas ?? []), ...(calculadas ?? [])])]
    .filter((n) => n !== etapa)
    .sort((a, b) => a - b);
}
