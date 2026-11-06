import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entrada = z.object({
  competenciaId: z.string().uuid(),
  valor: z.number().finite().nonnegative().nullable(),
  justificativa: z.string().trim().max(1200).optional(),
});

/** Confirma valor exclusivamente a partir do ato municipal já identificado no SEI.
 * Não é preenchido pelo parser do InvestSUS; preserva o valor homologado.
 */
export const registrarValorPublicadoPisoServidor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => entrada.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const userId = String((context as any).userId ?? "");
    if (!userId) throw new Error("Sessão expirada.");
    const { data: roles, error: erroPapel } = await admin.from("user_roles")
      .select("role").eq("user_id", userId);
    if (erroPapel) throw erroPapel;
    if (!(roles ?? []).some((r: any) => ["admin", "acp"].includes(r.role)))
      throw new Error("Somente ACP e administradores confirmam valores publicados.");
    const { data: comp, error: erroComp } = await admin.from("piso_competencias")
      .select("id,status,tipo_parcela,municipal_config,valor_apurado_investsus,total_publicado_municipal")
      .eq("id", data.competenciaId).single();
    if (erroComp || !comp) throw new Error("Competência não localizada.");
    if (comp.status === "encerrada") throw new Error("Reabra formalmente a competência encerrada.");
    if (comp.tipo_parcela === "decimo_terceiro")
      throw new Error("A 13ª parcela possui regra própria para publicação municipal.");
    const { data: doc, error: erroDoc } = await admin.from("piso_documentos")
      .select("id,numero_sei,link_sei,data_documento")
      .eq("competencia_id", data.competenciaId)
      .eq("tipo", "portaria_municipal").is("participante_id", null)
      .is("obrigacao_id", null).maybeSingle();
    if (erroDoc) throw erroDoc;
    if (data.valor !== null && (!doc?.numero_sei || !doc.link_sei ||
        !doc.data_documento || !comp.municipal_config?.portaria_numero)) {
      throw new Error("Informe o número da Portaria municipal, nº SEI, link e data da publicação antes de confirmar o valor.");
    }
    if (data.valor !== null &&
        Math.abs(data.valor - Number(comp.valor_apurado_investsus ?? NaN)) > 0.02 &&
        !data.justificativa?.trim()) {
      throw new Error("Valor publicado divergente da apuração do InvestSUS exige justificativa documental.");
    }
    const { error } = await admin.from("piso_competencias")
      .update({
        total_publicado_municipal: data.valor,
        municipal_config: {
          ...(comp.municipal_config ?? {}),
          publicacao_conferida: data.valor === null ? null : {
            valor: data.valor,
            documento_id: doc?.id,
            numero_sei: doc?.numero_sei,
            conferida_em: new Date().toISOString(),
            origem: "conferencia_manual_documental",
          },
        },
      })
      .eq("id", data.competenciaId).neq("status", "encerrada");
    if (error) throw error;
    const { data: perfil } = await admin.from("profiles").select("nome")
      .eq("id", userId).maybeSingle();
    const { error: historicoErro } = await admin.from("historico_logs").insert({
      piso_competencia_id: data.competenciaId,
      usuario_id: userId,
      usuario_nome: perfil?.nome ?? "Usuário",
      acao: "Piso · Valor municipal publicado confirmado",
      detalhes: {
        antes: comp.total_publicado_municipal, depois: data.valor,
        portaria_numero: comp.municipal_config?.portaria_numero,
        numero_sei: doc?.numero_sei ?? null,
        documento_id: doc?.id ?? null,
        justificativa: data.justificativa ?? null,
        origem: "conferencia_manual_documental",
      },
    });
    if (historicoErro) throw new Error("Valor salvo, mas houve falha na trilha de auditoria: " + historicoErro.message);
    return { valorPublicado: data.valor };
  });
