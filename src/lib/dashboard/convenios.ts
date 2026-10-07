import { supabase } from "@/integrations/supabase/client";

/**
 * Carrega os convênios necessários ao dashboard preservando compatibilidade
 * com bancos em que a migration de prazo_atesto_meses ainda não foi aplicada.
 * Nesse intervalo, a regra histórica M+1 é assumida.
 */
export async function carregarConveniosDashboard() {
  const primeira = await supabase
    .from("convenios")
    .select(
      "id, prestador_id, objeto, teto_mensal, valor_total, total_parcelas, data_inicio_vigencia, dia_inicio_execucao, dia_fim_execucao, prazo_atesto_meses, prazo_prestacao_contas_dias, prazo_retorno_entidade_dias, prazo_retorno_cgm_dias, exige_prestacao_contas, pagamento_pontual, status_convenio, modelo_fluxo, prestadores(nome_instituicao)",
    )
    .order("created_at");

  if (!primeira.error) return primeira.data ?? [];

  const fallback = await supabase
    .from("convenios")
    .select(
      "id, prestador_id, objeto, teto_mensal, valor_total, total_parcelas, data_inicio_vigencia, dia_inicio_execucao, dia_fim_execucao, prazo_prestacao_contas_dias, prazo_retorno_entidade_dias, prazo_retorno_cgm_dias, exige_prestacao_contas, pagamento_pontual, status_convenio, modelo_fluxo, prestadores(nome_instituicao)",
    )
    .order("created_at");

  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []).map((convenio: any) => ({
    ...convenio,
    prazo_atesto_meses: 1,
  }));
}
