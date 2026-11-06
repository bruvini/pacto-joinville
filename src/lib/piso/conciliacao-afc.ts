/** Disponibilidade da AFC no FMS: valores de extrato, compromissos e reservas.
 * Um extrato já inclui os créditos registrados até sua data de referência.
 * NUNCA somar o crédito do FMS ao saldo bancário novamente.
 */
export type ContaAfcFms = {
  id: string;
  identificacao: string;
  saldo_bancario: number | null;
  compromissos_preexistentes: number | null;
  data_saldo?: string | null;
  documento_sei?: string | null;
  documento_link?: string | null;
};
export type ConciliacaoAfcFms = {
  id?: string;
  competencia_id?: string;
  conta_id?: string | null;
  situacao: string;
  valor_reservado?: number | null;
  justificativa?: string | null;
  confirmada_em?: string | null;
  conta?: ContaAfcFms | null;
};
export const CENTAVOS_AFC = (n: number) => Math.round(n * 100);
export function disponibilidadeExtratoAfc(
  conta: ContaAfcFms | null | undefined,
  outrasReservas: number | null | undefined,
): number | null {
  if (!conta || conta.saldo_bancario == null ||
      conta.compromissos_preexistentes == null || outrasReservas == null) return null;
  const centavos = CENTAVOS_AFC(Number(conta.saldo_bancario)) -
    CENTAVOS_AFC(Number(conta.compromissos_preexistentes)) -
    CENTAVOS_AFC(Number(outrasReservas));
  return centavos / 100;
}
export type SituacaoConciliacaoAfc =
  | "Saldo não informado" | "Aguardando conciliação"
  | "Disponibilidade comprovada" | "Divergência documental"
  | "Disponibilidade insuficiente" | "Exceção autorizada";

export function situacaoConciliacaoAfc(
  dados: {
    valor_homologado?: number | null;
    valor_transferido?: number | null;
    credito_fms_valor?: number | null;
    credito_fms_data?: string | null;
    credito_fms_link?: string | null;
  },
  conciliacao?: ConciliacaoAfcFms | null,
  conta?: ContaAfcFms | null,
  outrasReservas?: number | null,
): SituacaoConciliacaoAfc {
  if (conciliacao?.situacao === "excecao_autorizada") return "Exceção autorizada";
  if (!conta || conta.saldo_bancario == null ||
      conta.compromissos_preexistentes == null) return "Saldo não informado";
  const saldo = disponibilidadeExtratoAfc(conta, outrasReservas);
  if (saldo === null) return "Aguardando conciliação";
  if (dados.valor_homologado != null && CENTAVOS_AFC(saldo) < CENTAVOS_AFC(dados.valor_homologado))
    return "Disponibilidade insuficiente";
  if (dados.credito_fms_valor != null && dados.valor_transferido != null &&
      Math.abs(CENTAVOS_AFC(dados.credito_fms_valor) - CENTAVOS_AFC(dados.valor_transferido)) > 2)
    return "Divergência documental";
  if (!dados.credito_fms_data || dados.credito_fms_valor == null || !dados.credito_fms_link)
    return "Aguardando conciliação";
  return conciliacao?.situacao === "confirmada"
    ? "Disponibilidade comprovada" : "Aguardando conciliação";
}
export function valorPublicacaoMunicipalComprovada(
  competencia: {
    etapas_concluidas?: Record<string, boolean>;
    etapas_reconferir?: number[];
    total_publicado_municipal?: number | null;
    municipal_config?: Record<string, any>;
  },
  documentos: Array<{
    id?: string; tipo: string; numero_sei?: string | null;
    link_sei?: string | null; data_documento?: string | null;
  }>,
): number | null {
  if (!competencia.etapas_concluidas?.["3"] ||
      competencia.etapas_reconferir?.includes(3) ||
      !competencia.municipal_config?.portaria_numero) return null;
  const doc = documentos.find(d => d.tipo === "portaria_municipal");
  const confirmacao = competencia.municipal_config?.publicacao_conferida;
  if (!doc?.numero_sei || !doc.link_sei || !doc.data_documento ||
      !confirmacao?.documento_id || confirmacao.documento_id !== (doc as any).id ||
      confirmacao.numero_sei !== doc.numero_sei ||
      confirmacao.origem !== "conferencia_manual_documental" ||
      competencia.total_publicado_municipal == null ||
      Math.abs(Number(confirmacao.valor) - Number(competencia.total_publicado_municipal)) > 0.02)
    return null;
  return competencia.total_publicado_municipal;
}
