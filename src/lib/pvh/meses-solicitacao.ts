/** Competências planejadas não são alocações financeiras. */
export const MESES_PVH = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

export type MesAbrangidoPvh = {
  competencia: string;
  origem_vinculo: "confirmada" | "historica_alocacao" | "historica_origem_pendente";
};

export function mesesDoExercicioPvh(ano: number) {
  return MESES_PVH.map((rotulo, i) => ({
    valor: `${String(i + 1).padStart(2, "0")}/${ano}`,
    rotulo,
  }));
}

export function normalizarMesesPvh(meses: readonly string[]) {
  return [...new Set(meses)].sort((a, b) => {
    const [ma, ya] = a.split("/").map(Number);
    const [mb, yb] = b.split("/").map(Number);
    return ya - yb || ma - mb;
  });
}

export function abrangenciaValidaPvh(
  meses: readonly string[], competenciaOrigem: string,
) {
  const ano = competenciaOrigem.split("/")[1];
  const normalizados = normalizarMesesPvh(meses);
  return normalizados.length >= 1 &&
    normalizados.length <= 12 &&
    normalizados.includes(competenciaOrigem) &&
    normalizados.every(m =>
      /^(0[1-9]|1[0-2])\/\d{4}$/.test(m) && m.endsWith("/" + ano));
}

/** Valores pedidos não são valores emitidos nem reserva de saldo. */
export function valorSolicitadoValidoPvh(valor: number | null) {
  return valor != null &&
    Number.isFinite(valor) &&
    valor > 0 &&
    Math.round(valor * 100) / 100 === valor;
}

/** Em legado, o pedido antigo não é reconstruído a partir da NE. */
export function exibicaoValorSolicitadoPvh(valor: number | null) {
  return valor == null ? "Não informado (registro anterior)" : undefined;
}
