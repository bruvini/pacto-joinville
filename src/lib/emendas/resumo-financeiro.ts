/** A consulta emendas_resumo já considera anulações nas NEs emitidas.
 * Não confundir comprometimento orçamentário com liberação ou pagamento.
 */
export type ValoresResumoFinanceiro = {
  limiteVigente: number;
  reservado: number;
  empenhado: number;
  disponivel: number;
};
const centavos = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);
const moeda = (centavosValor: number) =>
  (centavosValor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function descreverSituacaoFinanceiraEmenda(v: ValoresResumoFinanceiro) {
  const limite = centavos(v.limiteVigente);
  const reserva = centavos(v.reservado);
  const ne = centavos(v.empenhado);
  const livre = centavos(v.disponivel);
  const comprometido = reserva + ne;
  const percentual = limite > 0 ? Math.round((comprometido / limite) * 100) : 0;
  const distribuicao = limite > 0 ? {
    ne: Math.min(100, Math.max(0, ne / limite * 100)),
    reserva: Math.min(100, Math.max(0, reserva / limite * 100)),
    livre: Math.min(100, Math.max(0, livre / limite * 100)),
  } : { ne: 0, reserva: 0, livre: 0 };

  let titulo: string;
  let narrativa: string;
  if (limite <= 0) {
    titulo = "Limite financeiro ainda não definido";
    narrativa = "Confira o valor cadastrado, os rendimentos e os ajustes formais antes de assumir novos compromissos.";
  } else if (livre < 0 || comprometido > limite) {
    titulo = "Comprometimento acima do limite";
    narrativa = `O limite vigente é ${moeda(limite)}, mas ${moeda(ne)} estão vinculados a NEs e ${moeda(reserva)} permanecem reservados. Confira os registros e eventuais ajustes.`;
  } else if (comprometido === 0) {
    titulo = "Limite ainda livre para novos compromissos";
    narrativa = `Os ${moeda(limite)} vigentes ainda não possuem reservas pendentes nem NEs registradas. O saldo disponível é ${moeda(livre)}.`;
  } else {
    titulo = livre === 0 ? "Recurso integralmente comprometido" : "Recurso parcialmente comprometido";
    narrativa = `Do limite vigente de ${moeda(limite)}, ${moeda(ne)} ${ne === 100 ? "está" : "estão"} vinculado${ne === 100 ? "" : "s"} a NEs e ${moeda(reserva)} ${reserva === 100 ? "está" : "estão"} reservado${reserva === 100 ? "" : "s"} para solicitações aguardando emissão. ${livre === 0 ? "Não há saldo disponível para novos compromissos." : `Restam ${moeda(livre)} disponíveis para novos compromissos.`}`;
  }
  return { titulo, narrativa, percentual, distribuicao };
}
