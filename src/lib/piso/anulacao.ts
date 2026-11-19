import { linkValido } from "@/lib/sei";
/** Etapa orçamentária condicional — uma solicitação de anulação por obrigação financeira.
 * A projeção NÃO substitui a confirmação de anulação pela SEFAZ.
 */
export type SaldoAnulacaoPiso = {
  obrigacaoId: string;
  participanteId: string;
  empenhado: number;
  necessario: number;
  previsto: number;
  anulado: number | null;
};

const centavos = (valor: number | null | undefined) =>
  Math.round(Number(valor ?? 0) * 100);

/** Valor necessário: obrigação conciliada. Nunca inferir a partir de pagamento
 * incompleto nem de crédito genérico de outra instituição.
 */
export function saldosAnulacaoPiso(
  obrigacoes: Array<{
    id: string;
    participante_id: string;
    valor_empenhado?: number | null;
    valor_a_liquidar?: number | null;
    valor_anulado?: number | null;
    ne_origem_id?: string | null;
    ne_competencias?: string[] | null;
    ne_saldo_anulavel?: number | null;
    ne_total_subempenhado?: number | null;
  }>,
): SaldoAnulacaoPiso[] {
  return obrigacoes.flatMap(o => {
    const compartilhada = !!o.ne_origem_id || (o.ne_competencias?.length ?? 0) > 1;
    if (compartilhada) {
      // Ausência de consulta global é bloqueio seguro, nunca estimativa local.
      if (o.ne_saldo_anulavel == null || centavos(o.ne_saldo_anulavel) <= 0 || o.valor_empenhado == null) return [];
      return [{ obrigacaoId:o.id, participanteId:o.participante_id,
        empenhado:Number(o.valor_empenhado), necessario:Number(o.ne_total_subempenhado ?? 0),
        previsto:Number(o.ne_saldo_anulavel), anulado:o.valor_anulado == null ? null : Number(o.valor_anulado) }];
    }
    if (o.valor_empenhado == null || o.valor_a_liquidar == null) return [];
    const empenhado = centavos(o.valor_empenhado);
    const necessario = centavos(o.valor_a_liquidar);
    if (empenhado <= necessario || necessario < 0) return [];
    return [{
      obrigacaoId: o.id, participanteId: o.participante_id,
      empenhado: empenhado / 100, necessario: necessario / 100,
      previsto: (empenhado - necessario) / 100,
      anulado: o.valor_anulado == null ? null : centavos(o.valor_anulado) / 100,
    }];
  });
}

export function requerAnulacaoPiso(obrigacoes: Parameters<typeof saldosAnulacaoPiso>[0]): boolean {
  return saldosAnulacaoPiso(obrigacoes).length > 0;
}

/** Sem antecipar anulação: o aviso da SEFAZ só é efetivo se documentado. */
export function situacaoAnulacaoPiso(
  saldo: SaldoAnulacaoPiso,
  documentos: Array<{ tipo: string; obrigacao_id: string | null; numero_sei?: string | null; link_sei?: string | null }>,
) {
  const docs = documentos.filter(d => d.obrigacao_id === saldo.obrigacaoId);
  const solicitacao = docs.find(d => d.tipo === "solicitacao_anulacao");
  const aviso = docs.find(d => d.tipo === "aviso_anulacao");
  return { solicitacao, aviso };
}

/** Uma programação documental completa de qualquer NE da competência libera
 * o trabalho paralelo de anulação e comunicação, sem exigir comprovante. */
export function programacaoPagamentoProntaPiso(
  docs: Array<{ tipo: string; obrigacao_id: string | null;
    numero_sei?: string | null; link_sei?: string | null; data_documento?: string | null }>,
  obrigacoes: Array<{ id: string }>,
): boolean {
  const ids = new Set(obrigacoes.map(o => o.id));
  return docs.some(d => d.tipo === "programacao_pagamento" &&
    d.obrigacao_id != null && ids.has(d.obrigacao_id) &&
    Boolean(d.numero_sei?.trim() && d.data_documento && linkValido(d.link_sei)));
}
