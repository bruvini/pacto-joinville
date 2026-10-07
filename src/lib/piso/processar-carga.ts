import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auditarPlanilhaCarga, lerPlanilhaComCabecalho } from "@/lib/piso/planilha";

const entradaSchema = z.object({
  competenciaId: z.string().uuid(),
  arquivoId: z.string().uuid(),
});

async function sha256Hex(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const processarCargaPisoServidor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => entradaSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = String((context as any).userId ?? "");
    if (!userId) throw new Error("Sessão não identificada.");

    const { data: roles, error: roleError } = await (supabaseAdmin as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleError) throw roleError;
    if (!(roles ?? []).some((r: any) => ["admin", "acp", "aco"].includes(r.role)))
      throw new Error("Você não tem permissão para auditar Planilhas de Carga.");

    const { data: arquivo, error: arquivoError } = await (supabaseAdmin as any)
      .from("piso_arquivos")
      .select("*")
      .eq("id", data.arquivoId)
      .eq("competencia_id", data.competenciaId)
      .eq("categoria", "planilha_carga")
      .single();
    if (arquivoError || !arquivo)
      throw new Error("Planilha de Carga não encontrada.");

    if (!arquivo.participante_id)
      throw new Error("A Planilha de Carga não está vinculada a uma instituição.");

    const { data: participante, error: participanteError } = await (supabaseAdmin as any)
      .from("piso_participantes")
      .select("id,prestador_id,prestadores(nome_instituicao)")
      .eq("id", arquivo.participante_id)
      .eq("competencia_id", data.competenciaId)
      .single();
    if (participanteError || !participante)
      throw new Error("Instituição participante não encontrada.");

    const { data: cnesRows, error: cnesError } = await (supabaseAdmin as any)
      .from("prestador_cnes")
      .select("cnes")
      .eq("prestador_id", participante.prestador_id);
    if (cnesError) throw cnesError;

    const permitidos = (cnesRows ?? []).map((item: any) => String(item.cnes)).filter(Boolean);
    if (!permitidos.length)
      throw new Error("Cadastre ao menos um CNES no prestador antes de auditar a Planilha de Carga.");

    const { data: binario, error: downloadError } = await (supabaseAdmin as any).storage
      .from("piso-arquivos")
      .download(arquivo.storage_path);
    if (downloadError || !binario)
      throw new Error("Não foi possível ler a Planilha de Carga original armazenada.");

    const arrayBuffer = await binario.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const hashServidor = await sha256Hex(bytes);
    if (
      arquivo.sha256 &&
      hashServidor.toLowerCase() !== String(arquivo.sha256).toLowerCase()
    ) {
      throw new Error("A integridade SHA-256 da Planilha de Carga não confere.");
    }

    const rows = await lerPlanilhaComCabecalho(arrayBuffer);
    const audit = auditarPlanilhaCarga(rows, permitidos);

    const { error: limparError } = await (supabaseAdmin as any)
      .from("piso_ocorrencias")
      .delete()
      .eq("arquivo_id", arquivo.id)
      .eq("categoria", "carga");
    if (limparError) throw limparError;

    if (audit.ocorrencias.length) {
      const instituicao = Array.isArray(participante.prestadores)
        ? participante.prestadores[0]?.nome_instituicao
        : participante.prestadores?.nome_instituicao;
      const payload = audit.ocorrencias.map((ocorrencia) => ({
        competencia_id: data.competenciaId,
        participante_id: participante.id,
        arquivo_id: arquivo.id,
        categoria: "carga",
        severidade: ocorrencia.severidade,
        regra: ocorrencia.regra,
        linha: ocorrencia.linha || null,
        descricao: ocorrencia.descricao,
        cpf_mascarado: ocorrencia.cpf_mascarado || null,
        cnes: ocorrencia.cnes || null,
        instituicao_nome: ocorrencia.instituicao_nome || instituicao || "Instituição",
        dados: ocorrencia.dados || {},
      }));
      const { error } = await (supabaseAdmin as any)
        .from("piso_ocorrencias")
        .insert(payload);
      if (error) throw error;
    }

    const processadoEm = new Date().toISOString();
    const resumo = {
      ...audit.resumo,
      processado_em: processadoEm,
      arquivo_id: arquivo.id,
      origem_calculo: "server_fn",
    };

    const { error: updateError } = await (supabaseAdmin as any)
      .from("piso_participantes")
      .update({ auditoria_resumo: resumo, sem_elegiveis: false })
      .eq("id", participante.id)
      .eq("competencia_id", data.competenciaId);
    if (updateError) throw updateError;

    const { data: perfil } = await (supabaseAdmin as any)
      .from("profiles")
      .select("nome")
      .eq("id", userId)
      .maybeSingle();

    await (supabaseAdmin as any).from("historico_logs").insert({
      piso_competencia_id: data.competenciaId,
      usuario_id: userId,
      usuario_nome: perfil?.nome ?? "Usuário",
      acao: "Piso · Planilha de Carga auditada no servidor",
      detalhes: {
        arquivo_id: arquivo.id,
        participante_id: participante.id,
        sha256: arquivo.sha256,
        linhas: resumo.linhas,
        erros: resumo.erros,
        alertas: resumo.alertas,
        origem_calculo: "server_fn",
      },
    });

    return { tipo: "planilha_carga", audit: resumo };
  });
