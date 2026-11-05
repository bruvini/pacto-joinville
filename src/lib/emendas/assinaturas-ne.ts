/** A NE exige uma assinatura financeira, mas pode registrar ambas. */
export function papelFinanceiroComplementarDisponivel(
  papel: string,
  assinaturas: ReadonlyArray<{ papel: string }>,
): boolean {
  if (papel !== "financeira" && papel !== "secretaria") return false;
  const outro = papel === "financeira" ? "secretaria" : "financeira";
  return !assinaturas.some((a) => a.papel === papel) &&
    assinaturas.some((a) => a.papel === outro);
}

export function complementoFinanceiroPendente(
  assinaturas: ReadonlyArray<{ papel: string }>,
): boolean {
  return papelFinanceiroComplementarDisponivel("financeira", assinaturas) ||
    papelFinanceiroComplementarDisponivel("secretaria", assinaturas);
}
