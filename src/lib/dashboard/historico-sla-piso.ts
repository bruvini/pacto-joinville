import { supabase } from "@/integrations/supabase/client";

export type EventoConclusaoPiso = {
  piso_competencia_id: string | null;
  data_hora: string | null;
  detalhes: unknown;
};

/** Página menor que o teto padrão de 1.000 linhas do PostgREST.
 * Uma resposta truncada NUNCA pode ser tratada como histórico completo.
 */
export async function paginarEventosPiso<T>(
  obterPagina: (inicio: number, fim: number) => Promise<T[]>,
  tamanhoPagina = 500,
  maxPaginas = 100,
): Promise<T[]> {
  const resultado: T[] = [];
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const inicio = pagina * tamanhoPagina;
    const dados = await obterPagina(inicio, inicio + tamanhoPagina - 1);
    resultado.push(...dados);
    if (dados.length < tamanhoPagina) return resultado;
  }
  throw new Error("Histórico do Piso incompleto: limite de paginação atingido.");
}

/** Query dedicada aos marcos de conclusão do Piso.
 * A consulta genérica do dashboard pode ter suas primeiras competências
 * excluídas pelo limite de linhas da API, invalidando o indicador de SLA.
 */
export async function carregarHistoricoSlaPiso(): Promise<EventoConclusaoPiso[]> {
  return paginarEventosPiso(async (inicio, fim) => {
    const { data, error } = await supabase
      .from("historico_logs")
      .select("piso_competencia_id, data_hora, detalhes")
      .not("piso_competencia_id", "is", null)
      .eq("acao", "Piso · atualizado: piso_competencias")
      .order("data_hora", { ascending: true })
      .range(inicio, fim);
    if (error) throw error;
    return (data ?? []) as EventoConclusaoPiso[];
  });
}
