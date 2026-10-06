/** Preserva a origem e a mensagem do backend, inclusive em falhas simultâneas. */
export async function consultarFonte<T>(
  fonte: string,
  consulta: PromiseLike<{ data: T | null; error?: unknown }>,
): Promise<T> {
  try {
    const resultado = await consulta;
    if (resultado.error) throw resultado.error;
    if (resultado.data == null) throw new Error("A consulta não retornou dados.");
    return resultado.data;
  } catch (erro) {
    const detalhe = erro as { message?: string; code?: string; details?: string; hint?: string };
    throw new Error(
      `${fonte}: ${detalhe?.message ?? String(erro)}` +
        (detalhe?.code ? ` (${detalhe.code})` : "") +
        (detalhe?.details ? ` — ${detalhe.details}` : "") +
        (detalhe?.hint ? ` — ${detalhe.hint}` : ""),
    );
  }
}

export async function reunirFontes<T extends Record<string, Promise<unknown>>>(fontes: T) {
  const nomes = Object.keys(fontes);
  const resultados = await Promise.allSettled(Object.values(fontes));
  const erros = resultados.flatMap((r) =>
    r.status === "rejected"
      ? [r.reason instanceof Error ? r.reason.message : String(r.reason)]
      : [],
  );
  if (erros.length) throw new Error(erros.join("\n"));
  return Object.fromEntries(
    resultados.map((r, i) => [nomes[i], r.status === "fulfilled" ? r.value : undefined]),
  ) as { [K in keyof T]: Awaited<T[K]> };
}
