/** Diferencia ausência de evidência de envio da declaração de inexistência de elegíveis. */
export function situacaoComprovanteEnvioPiso(
  semElegiveis: boolean,
  comprovanteConferido: boolean,
): "nao_aplicavel" | "conferido" | "pendente" {
  if (semElegiveis) return "nao_aplicavel";
  return comprovanteConferido ? "conferido" : "pendente";
}
