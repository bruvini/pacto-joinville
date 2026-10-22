import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { montarLinhasPlanilha } from "@/lib/financeiro/planilha-atualizacao";

/** Evita o limite de 1.000 registros do PostgREST sem tratar dados truncados como completos. */
export async function paginarPlanilha(
  obter: (inicio: number, fim: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>,
) {
  const itens: any[] = [];
  for (let pagina = 0; pagina < 100; pagina++) {
    const inicio = pagina * 500;
    const { data, error } = await obter(inicio, inicio + 499);
    if (error) throw new Error(error.message);
    itens.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return itens;
  }
  throw new Error("Limite de paginação atingido. A central não exibirá um resultado incompleto.");
}

/** Somente SELECT, respeita RLS. Não guarda cópias locais dos processos. */
export async function buscarLinhasPlanilha() {
  const [
    lancamentos, pisoCompetencias, pisoDocumentos, pvhCompetencias,
    pvhParticipantes, pvhEmpenhos, pvhAlocacoes,
  ] = await Promise.all([
    paginarPlanilha((i,f)=>supabase.from("lancamentos_pagamento")
      .select("id,parent_id,convenio_id,competencia,parcela,valor_solicitado,valor_empenho_liquido,valor_atestado,valor_anulado,link_solicitacao_sei,dotacao_orcamentaria,fonte_pagamento,numero_empenho,link_empenho_sei,link_solicitacao_anulacao,link_anulacao_sei,prestadores(nome_instituicao),convenios(objeto,numero_processo_sei_mae)")
      .order("id").range(i,f)),
    paginarPlanilha((i,f)=>supabase.from("piso_competencias")
      .select("id,competencia,tipo_parcela,piso_participantes(id,prestador_id,valor_devido,prestadores(nome_instituicao),piso_obrigacoes(id,cr_dotacao,fonte,valor_a_liquidar,valor_empenhado,valor_anulado))")
      .order("id").range(i,f)),
    paginarPlanilha((i,f)=>supabase.from("piso_documentos")
      .select("id,obrigacao_id,tipo,numero,numero_sei,link_sei")
      .in("tipo",["solicitacao_ne","nota_empenho","solicitacao_anulacao","aviso_anulacao"])
      .order("id").range(i,f)),
    paginarPlanilha((i,f)=>supabase.from("pvh_competencias")
      .select("id,competencia").order("id").range(i,f)),
    paginarPlanilha((i,f)=>supabase.from("pvh_participantes")
      .select("id,competencia_id,prestador_id,cr_dotacao,fonte_recurso,valor_estadual,valor_municipal,valor_pago,prestadores(nome_instituicao)")
      .order("id").range(i,f)),
    paginarPlanilha((i,f)=>supabase.from("pvh_empenhos")
      .select("id,prestador_id,solicitacao_competencia_id,valor_total,solicitacao_sei_link,solicitacao_sei_numero,cr_dotacao,fonte_recurso,numero_ne,nota_empenho_sei_link,nota_empenho_sei_numero")
      .order("id").range(i,f)),
    paginarPlanilha((i,f)=>supabase.from("pvh_empenho_alocacoes")
      .select("id,empenho_id,participante_id,valor_alocado")
      .order("id").range(i,f)),
  ]);
  return montarLinhasPlanilha({lancamentos,pisoCompetencias,pisoDocumentos,
    pvhCompetencias,pvhParticipantes,pvhEmpenhos,pvhAlocacoes});
}

export function useCentralPlanilha() {
  return useQuery({queryKey:["central-planilha","v2"],queryFn:buscarLinhasPlanilha,staleTime:60_000});
}
