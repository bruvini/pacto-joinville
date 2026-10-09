import { etapaLiberadaPiso, prerequisitosEtapaPiso } from "./etapas";
import { pendenciasEtapa, type CtxPiso } from "./regras";
import { calcularReconferencia, contextoCompleto } from "./reconferencia";

/** Contexto incompleto nunca equivale a uma etapa sem pendências. */
export function pendenciasConclusao(n: number, ctx: CtxPiso | null | undefined): string[] {
  if (!contextoCompleto(ctx))
    return [
      "Não foi possível validar a etapa: aguarde o carregamento completo dos dados operacionais.",
    ];
  const pendencias = pendenciasEtapa(n, {
    ...ctx,
    comp: {
      ...ctx.comp,
      etapas_reconferir: (ctx.comp.etapas_reconferir ?? []).filter((e: number) => e !== n),
    },
  });
  const reconferencia = calcularReconferencia(ctx);
  const requisitos = prerequisitosEtapaPiso(n, ctx.comp.tipo_parcela);
  const anteriores = reconferencia.filter((etapa) => requisitos.includes(etapa));
  if (anteriores.length)
    pendencias.unshift(
      `Resolva a reconferência das etapas pré-requisito: ${anteriores.join(", ")}.`,
    );

  const foraDaSequencia =
    n < 1 ||
    n > 9 ||
    !etapaLiberadaPiso(n, ctx.comp.etapas_concluidas, reconferencia, ctx.comp.tipo_parcela);

  if (foraDaSequencia)
    pendencias.unshift("Conclua as etapas pré-requisito antes de avançar.");
  return pendencias;
}

export function validarConclusao(n: number, ctx: CtxPiso | null | undefined) {
  const pendencias = pendenciasConclusao(n, ctx);
  if (pendencias.length) throw new Error(pendencias.join("\n"));
}

export function etapaAposConclusao(n: number) {
  return Math.min(n + 1, 9);
}
