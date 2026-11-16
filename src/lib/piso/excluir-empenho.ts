import { supabase } from "@/integrations/supabase/client";
import { bloqueioExclusaoNe } from "./alocacao";

/** Reconfere dependências e versão antes de excluir apenas o registro no PACTO. */
export async function excluirRegistroEmpenhoPiso(oid: string, participanteId: string, competenciaId: string) {
  const [atual, docs, subs, comp] = await Promise.all([
    supabase.from("piso_obrigacoes").select("*").eq("id", oid).eq("participante_id", participanteId).single(),
    supabase.from("piso_documentos").select("obrigacao_id,tipo").eq("obrigacao_id", oid),
    supabase.from("piso_subempenhos").select("obrigacao_id").eq("obrigacao_id", oid),
    supabase.from("piso_competencias").select("status").eq("id", competenciaId).single(),
  ]);
  for (const r of [atual, docs, subs, comp]) if (r.error) throw r.error;
  if (!atual.data || comp.data?.status === "encerrada") throw new Error("Registro indisponível ou competência encerrada.");
  const impedimento = bloqueioExclusaoNe(atual.data, docs.data ?? [], subs.data ?? []);
  if (impedimento) throw new Error(impedimento);
  const { error } = await supabase.from("piso_obrigacoes").delete().eq("id", oid).eq("participante_id", participanteId).eq("updated_at", atual.data.updated_at).select("id").single();
  if (error) throw error;
}
