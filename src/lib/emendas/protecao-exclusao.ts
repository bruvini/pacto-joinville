/** Proteção adicional no cliente; a RPC PostgreSQL continua sendo a autoridade. */
export type LancamentoExclusaoEmenda = {
  status: string;
  solicitacao_id?: string | null;
  excluido_em?: string | null;
};
export type EvidenciasExclusaoEmenda = {
  dotacaoConfirmada?: boolean;
  etapaPosterior?: boolean;
  parecer?: boolean;
  assinatura?: boolean;
  envioSeFaz?: boolean;
  documentoFluxo?: boolean;
  comprovante?: boolean;
  liberacao?: boolean;
  pagamento?: boolean;
  anulacao?: boolean;
  conciliacao?: boolean;
  encerramento?: boolean;
};

/** Apenas rascunho sem formalização ou evidência de ato pode ser descartado. */
export function motivoBloqueioExclusaoEmenda(
  lancamento: LancamentoExclusaoEmenda,
  evidencias: EvidenciasExclusaoEmenda,
): string | null {
  if (lancamento.excluido_em) return "Lançamento já excluído.";
  if (lancamento.status !== "rascunho" || lancamento.solicitacao_id)
    return "Lançamento formalizado ou com NE: preserve o registro e utilize cancelamento ou retificação administrativa.";
  if (Object.values(evidencias).some(Boolean))
    return "Há parecer, assinatura, confirmação ou documento vinculado: a exclusão definitiva não está disponível.";
  return null;
}
