/** Busca notas da Etapa 5 por número ou número/ano, sem confundir exercício e número. */
export type ComNotaEmpenho = { numero_empenho?: string | null };
export function correspondeNumeroEmpenho(valor: unknown, consulta: string): boolean {
  const busca = consulta.trim().replace(/\s+/g, "");
  if (!busca) return true;
  if (!/^\d+(?:\/\d{0,4})?$/.test(busca)) return false;
  const [numeroBuscado, anoBuscado] = busca.split("/");
  const referencias = String(valor ?? "").match(/\b\d+(?:\s*\/\s*\d{4})?\b/g) ?? [];
  return referencias.some((referencia) => {
    const [numero, ano = ""] = referencia.replace(/\s+/g, "").split("/");
    return numero.startsWith(numeroBuscado) &&
      (anoBuscado === undefined || ano.startsWith(anoBuscado));
  });
}
export function correspondeEmpenhoFamilia(
  pai: ComNotaEmpenho, filhos: ComNotaEmpenho[], consulta: string,
): boolean {
  if (!consulta.trim()) return true;
  return correspondeNumeroEmpenho(pai.numero_empenho, consulta) ||
    filhos.some((filho) => correspondeNumeroEmpenho(filho.numero_empenho, consulta));
}
export function filtrarFilhosPorEmpenho<T extends ComNotaEmpenho>(
  pai: ComNotaEmpenho, filhos: T[], consulta: string,
): T[] {
  if (!consulta.trim() || correspondeNumeroEmpenho(pai.numero_empenho, consulta)) return filhos;
  return filhos.filter((filho) => correspondeNumeroEmpenho(filho.numero_empenho, consulta));
}
