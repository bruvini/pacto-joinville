/** Datas civis, sem deslocamento de fuso nos campos YYYY-MM-DD. */
const DIA = 86_400_000;
const formatoDiaJoinville = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});

function dataCivil(valor: string | null | undefined): Date | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const data = new Date(valor + "T00:00:00Z");
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor ? data : null;
}

/** Dia civil de referência no horário de Joinville, independente do fuso do navegador. */
export function diaConvenio(agora: Date = new Date()): string {
  const partes = formatoDiaJoinville.formatToParts(agora);
  return ["year", "month", "day"].map(tipo => partes.find(p => p.type === tipo)?.value).join("-");
}

export function formatarDataConvenio(valor: string | null | undefined): string {
  const data = dataCivil(valor);
  return data ? data.toLocaleDateString("pt-BR", {timeZone: "UTC"}) : "—";
}

export type DadosVigencia = {
  data_inicio_vigencia?: string | null;
  total_parcelas?: number | string | null;
  pagamento_pontual?: boolean | null;
};

export function vigenciaConvenio(c: DadosVigencia, hoje: Date = new Date()) {
  const inicio = dataCivil(c.data_inicio_vigencia);
  const meses = Number(c.total_parcelas);
  if (c.pagamento_pontual || !inicio || !Number.isSafeInteger(meses) || meses <= 0) return null;
  // Acrescenta N meses mantendo o dia de aniversário, limitado ao último dia do mês.
  const fim = new Date(inicio);
  fim.setUTCDate(1);
  fim.setUTCMonth(fim.getUTCMonth() + meses);
  if (!Number.isFinite(fim.getTime())) return null;
  const ultimoDia = new Date(fim);
  ultimoDia.setUTCMonth(ultimoDia.getUTCMonth() + 1, 0);
  fim.setUTCDate(Math.min(inicio.getUTCDate(), ultimoDia.getUTCDate()));
  const atual = dataCivil(diaConvenio(hoje))!;
  const restantes = Math.round((fim.getTime() - atual.getTime()) / DIA);
  const ateInicio = Math.max(0, Math.round((inicio.getTime() - atual.getTime()) / DIA));
  const decorrido = Math.max(0, Math.min(100, Math.round((atual.getTime() - inicio.getTime()) / (fim.getTime() - inicio.getTime()) * 100)));
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10), restantes, ateInicio, decorrido };
}

export type TermoComTeto = {
  id: string;
  convenio_id: string;
  identificador?: string | null;
  valor_total?: number | string | null;
  data_assinatura?: string | null;
  created_at?: string | null;
};

/** Ordena cópia, sem depender da ordem de uma consulta ou do cache compartilhado. */
export function ordenarTermosConvenio<T extends TermoComTeto>(termos: readonly T[]): T[] {
  return [...termos].sort((a, b) =>
    (b.data_assinatura ?? "").localeCompare(a.data_assinatura ?? "") ||
    (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.id.localeCompare(a.id));
}

/** Um aditivo sem alteração financeira não substitui o teto anterior; termo futuro ainda não vigora. */
export function tetoVigenteConvenio<T extends TermoComTeto>(
  c: { id: string; teto_mensal?: number | string | null }, termos: readonly T[], hoje: Date = new Date(),
) {
  const referencia = diaConvenio(hoje);
  const termo = ordenarTermosConvenio(termos.filter(t => t.convenio_id === c.id))
    .find(t => Number(t.valor_total) > 0 && (!t.data_assinatura || (dataCivil(t.data_assinatura) && t.data_assinatura <= referencia)));
  return { termo, teto: Number(termo?.valor_total ?? c.teto_mensal ?? 0) };
}
