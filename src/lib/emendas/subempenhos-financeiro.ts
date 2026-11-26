/**
 * Projeção financeira das NEs das Emendas.
 * Apoio à interface e aos testes; a autoridade para gravar é PostgreSQL.
 */
export type SituacaoSubempenhoEmenda =
  | "rascunho"
  | "solicitado"
  | "em_liquidacao"
  | "subempenhado"
  | "cancelado";
export type ValorSubempenhoEmenda = {
  status: SituacaoSubempenhoEmenda;
  valor_solicitado: number;
  valor_subempenhado?: number | null;
};
const centavos = (valor: number) => Math.round(valor * 100);
const reais = (valor: number) => valor / 100;

/** Soma reservas abertas, utilizando valor efetivo quando o aviso está registrado. */
export function totalComprometidoSubempenhosEmenda(
  registros: ValorSubempenhoEmenda[],
): number {
  return reais(registros.reduce((soma, registro) => {
    if (registro.status === "cancelado") return soma;
    return soma + centavos(
      registro.status === "subempenhado"
        ? (registro.valor_subempenhado ?? 0)
        : registro.valor_solicitado,
    );
  }, 0));
}

export function saldoDisponivelNeEmenda(args: {
  valorNe: number;
  totalAnulado: number;
  liberadoLegado: number;
  subempenhos: ValorSubempenhoEmenda[];
}): { saldo: number | null; origem: "legado" | "subempenho" | "sem_movimentacao" | "conflito" } {
  const reservado = centavos(totalComprometidoSubempenhosEmenda(args.subempenhos));
  const legado = centavos(args.liberadoLegado);
  if (reservado > 0 && legado > 0) return { saldo: null, origem: "conflito" };
  return {
    saldo: reais(centavos(args.valorNe) - centavos(args.totalAnulado) - (legado > 0 ? legado : reservado)),
    origem: legado > 0 ? "legado" : reservado > 0 ? "subempenho" : "sem_movimentacao",
  };
}
