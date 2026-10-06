import { etapaAtualPiso } from "./etapas";
import { pendenciasEtapa, type CtxPiso } from "./regras";

/** Contexto incompleto nunca equivale a uma etapa sem pendências. */
export function pendenciasConclusao(n: number, ctx: CtxPiso | null | undefined): string[] {
  if (
    !ctx?.comp ||
    ![
      ctx.parts,
      ctx.obrigs,
      ctx.docs,
      ctx.assinaturas,
      ctx.matriz,
      ctx.encaminhamentos,
      ctx.arquivos,
      ctx.ocorrencias,
    ].every(Array.isArray)
  )
    return [
      "Não foi possível validar a etapa: aguarde o carregamento completo dos dados operacionais.",
    ];
  const pendencias = pendenciasEtapa(n, ctx);
  if (n < 1 || n > 8 || n > etapaAtualPiso(ctx.comp.etapas_concluidas))
    pendencias.unshift("Conclua as etapas anteriores antes de avançar.");
  return pendencias;
}

export function validarConclusao(n: number, ctx: CtxPiso | null | undefined) {
  const pendencias = pendenciasConclusao(n, ctx);
  if (pendencias.length) throw new Error(pendencias.join("\n"));
}

export function etapaAposConclusao(n: number) {
  return Math.min(n + 1, 8);
}
