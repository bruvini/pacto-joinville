/**
 * Piso · alocação do devido entre múltiplas NEs e cadeias de subempenho.
 * O devido é contado UMA vez por participante. Cada NE contribui com
 * `valor_aplicado`; em registro legado (NE única sem alocação) o valor
 * aplicado é o `valor_a_liquidar` derivado no servidor.
 * Todos os cálculos em centavos inteiros.
 */
export const cents = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);
const reais = (c: number) => c / 100;

export type ObrigAloc = {
  id: string;
  participante_id: string;
  valor_empenhado?: number | null;
  valor_aplicado?: number | null;
  alocacao_manual?: boolean;
  valor_a_liquidar?: number | null;
  valor_pago?: number | null;
  valor_anulado?: number | null;
};
export type SubempenhoAloc = { id: string; obrigacao_id: string; valor?: number | null; legado?: boolean; sequencia?: number; updated_at?: string };

/** Valor aplicado de uma NE; null = ainda não definido (rascunho). */
export function valorAplicadoNe(o: ObrigAloc, todas: ObrigAloc[]): number | null {
  if (o.valor_aplicado != null) return Number(o.valor_aplicado);
  if (o.alocacao_manual) return null;
  const irmas = todas.filter((x) => x.participante_id === o.participante_id);
  if (irmas.length === 1 && o.valor_a_liquidar != null) return o.valor_empenhado == null
    ? Number(o.valor_a_liquidar) : reais(Math.min(cents(o.valor_a_liquidar), cents(o.valor_empenhado)));
  return null;
}

/** Distribuição sugerida: nunca ultrapassa o devido restante nem a capacidade da NE. */
export function sugerirValorAplicadoNe(devido: number | null | undefined, obrigs: ObrigAloc[], participanteId: string, editId: string, capacidade: number | null | undefined): number | null {
  if (devido == null || capacidade == null) return null;
  const outras = obrigs.filter(o => o.participante_id === participanteId && o.id !== editId);
  if (outras.some(o => valorAplicadoNe(o, obrigs) == null)) return null;
  const reservado = outras.reduce((s, o) => s + cents(valorAplicadoNe(o, obrigs)), 0);
  return reais(Math.max(0, Math.min(cents(capacidade), cents(devido) - reservado)));
}

/** Excluir do PACTO não é anular oficialmente a NE. Protege documentos posteriores. */
export function bloqueioExclusaoNe(o: ObrigAloc & { data_pagamento?: unknown; data_programacao?: unknown; data_movimento_liquidacao?: unknown; data_solicitacao_liquidacao?: unknown; movimento_transmitido?: boolean }, docs: { obrigacao_id?: string | null; tipo: string }[], subs: { obrigacao_id: string }[]): string | null {
  if (subs.some(s => s.obrigacao_id === o.id) || docs.some(d => d.obrigacao_id === o.id && !["solicitacao_ne", "nota_empenho"].includes(d.tipo)) ||
    cents(o.valor_pago) > 0 || cents(o.valor_anulado) > 0 || o.data_pagamento || o.data_programacao || o.data_movimento_liquidacao || o.data_solicitacao_liquidacao || o.movimento_transmitido)
    return "A NE possui subempenho, liquidação, pagamento ou anulação vinculados. Preserve o histórico e corrija os registros dependentes primeiro.";
  return null;
}

export type ResumoAlocacao = {
  participanteId: string;
  devido: number | null;
  totalEmpenhado: number;
  totalAplicado: number;
  saldoAEmpenhar: number | null; // devido - aplicado (≥0)
  excedente: number | null; // aplicado acima do devido (não deveria ocorrer)
  totalPago: number;
  pendentes: number; // NEs sem valor aplicado definido
  fechado: boolean; // aplicado == devido em centavos e sem pendências
};

export function resumoAlocacao(
  participanteId: string,
  devido: number | null | undefined,
  obrigs: ObrigAloc[],
): ResumoAlocacao {
  const os = obrigs.filter((o) => o.participante_id === participanteId);
  let emp = 0, apl = 0, pago = 0, pend = 0;
  for (const o of os) {
    emp += cents(o.valor_empenhado);
    pago += cents(o.valor_pago);
    const a = valorAplicadoNe(o, obrigs);
    if (a == null) pend++; else apl += cents(a);
  }
  const d = devido == null ? null : cents(devido);
  return {
    participanteId,
    devido: d == null ? null : reais(d),
    totalEmpenhado: reais(emp),
    totalAplicado: reais(apl),
    saldoAEmpenhar: d == null ? null : reais(Math.max(0, d - apl)),
    excedente: d == null ? null : reais(Math.max(0, apl - d)),
    totalPago: reais(pago),
    pendentes: pend,
    fechado: d != null && os.length > 0 && pend === 0 && apl === d,
  };
}

/** Valida uma nova alocação (inserção ou edição) contra o devido. */
export function validarAlocacao(
  devido: number | null | undefined,
  obrigs: ObrigAloc[],
  participanteId: string,
  editId: string | null,
  novoAplicado: number | null,
  valorEmpenhado: number | null,
): string | null {
  if (novoAplicado == null) return null; // rascunho permitido
  if (novoAplicado < 0) return "Valor aplicado não pode ser negativo.";
  if (valorEmpenhado != null && cents(novoAplicado) > cents(valorEmpenhado))
    return "Valor aplicado maior que o valor da NE.";
  if (devido == null) return null;
  const outras = obrigs.filter((o) => o.participante_id === participanteId && o.id !== editId);
  const soma = outras.reduce((s, o) => s + cents(valorAplicadoNe(o, obrigs) ?? 0), 0);
  if (soma + cents(novoAplicado) > cents(devido))
    return `Soma das alocações (${reais(soma + cents(novoAplicado)).toFixed(2)}) excede o devido (${Number(devido).toFixed(2)}).`;
  return null;
}

export function totalSubempenhado(obrigacaoId: string, subs: SubempenhoAloc[]): number {
  return reais(subs.filter((s) => s.obrigacao_id === obrigacaoId).reduce((t, s) => t + cents(s.valor), 0));
}

/** Valida subempenho contra o valor aplicável da NE. */
export function validarSubempenho(
  ne: ObrigAloc,
  obrigs: ObrigAloc[],
  subs: SubempenhoAloc[],
  editId: string | null,
  valor: number | null,
): string | null {
  if (valor == null) return null; // rascunho
  if (valor <= 0) return "Valor do subempenho deve ser positivo.";
  const aplicavel = valorAplicadoNe(ne, obrigs);
  if (aplicavel == null) return "Defina o valor aplicado à competência na NE antes de subempenhar.";
  const outros = subs.filter((s) => s.obrigacao_id === ne.id && s.id !== editId)
    .reduce((t, s) => t + cents(s.valor), 0);
  if (outros + cents(valor) > cents(aplicavel))
    return `Soma dos subempenhos (${reais(outros + cents(valor)).toFixed(2)}) excede o valor aplicável da NE (${aplicavel.toFixed(2)}).`;
  return null;
}

/** Saldo de anulação 7A por NE: empenhado - aplicado daquela nota. */
export function saldoAnulacaoNe(o: ObrigAloc, obrigs: ObrigAloc[]): number | null {
  if (o.valor_empenhado == null) return null;
  const a = valorAplicadoNe(o, obrigs);
  if (a == null) return null;
  return reais(Math.max(0, cents(o.valor_empenhado) - cents(a)));
}

/** Total devido da competência contando cada participante uma única vez. */
export function totalDevidoUnico(parts: Array<{ id: string; valor_devido?: number | null; sem_elegiveis?: boolean | null }>) {
  return reais(parts.filter((p) => !p.sem_elegiveis).reduce((s, p) => s + cents(p.valor_devido), 0));
}
