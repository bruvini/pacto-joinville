import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { calcularSlaPiso } from "@/lib/dashboard/modulos";
import { carregarHistoricoSlaPiso } from "@/lib/dashboard/historico-sla-piso";

/** SLA do Piso usa sua própria trilha paginada, jamais os logs gerais
 * limitados por volume das outras funcionalidades.
 */
export function useSlaPiso(
  competencias: Array<{ id: string; created_at?: string | null; tipo_parcela?: string | null }>,
  documentos: Array<{ competencia_id: string; tipo: string; obrigacao_id?: string | null;
    created_at?: string | null; numero_sei?: string | null; link_sei?: string | null;
    data_documento?: string | null }> = [],
) {
  const { data: historico = [], error: erroHistoricoSlaPiso } = useQuery({
    queryKey: ["dash-piso-sla-historico"],
    queryFn: carregarHistoricoSlaPiso,
  });
  const slaPiso = useMemo(
    () => calcularSlaPiso(competencias, historico, documentos),
    [competencias, historico, documentos],
  );
  return { slaPiso, erroHistoricoSlaPiso };
}
