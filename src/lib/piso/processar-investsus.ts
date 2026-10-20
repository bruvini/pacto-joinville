import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auditarPlanilhaCarga, lerPlanilhaComCabecalho } from "@/lib/piso/planilha";
import {
  INVESTSUS_AUDIT_RULES_VERSION,
  auditarInvestsus,
  conciliarCargaInvestsus,
  type RegistroCargaInstituicao,
} from "@/lib/piso/investsus";

const entradaSchema = z.object({
  competenciaId: z.string().uuid(),
  arquivoId: z.string().uuid(),
});

async function baixarVerificado(admin: any, arquivo: any): Promise<ArrayBuffer> {
  const { data, error } = await admin.storage.from("piso-arquivos").download(arquivo.storage_path);
  if (error || !data) throw new Error("Não foi possível recuperar a evidência original do Storage.");
  const buffer = await data.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  const hex = Array.from(new Uint8Array(hash)).map(v => v.toString(16).padStart(2, "0")).join("");
  if (!arquivo.sha256 || hex !== String(arquivo.sha256).toLowerCase()) {
    throw new Error("Hash SHA-256 da planilha não confere com o arquivo cadastrado.");
  }
  return buffer;
}

function nomeInstituicao(prestador: any): string {
  return Array.isArray(prestador) ? prestador[0]?.nome_instituicao ?? "Instituição"
    : prestador?.nome_instituicao ?? "Instituição";
}

async function substituirOcorrencias(
  admin: any,
  competenciaId: string,
  arquivoId: string,
  categoria: "investsus" | "conciliacao",
  ocorrencias: Array<{
    severidade: string; regra: string; linha?: number;
    descricao: string; cpf_mascarado?: string; cnes?: string;
    instituicao_nome?: string; dados?: Record<string, unknown>;
  }>,
) {
  const { error: apagarErro } = await admin.from("piso_ocorrencias")
    .delete().eq("arquivo_id", arquivoId).eq("categoria", categoria);
  if (apagarErro) throw apagarErro;
  if (!ocorrencias.length) return;
  // Não persistir CPF sem máscara ou nome de profissional nas ocorrências.
  const payload = ocorrencias.map(o => ({
    competencia_id: competenciaId,
    arquivo_id: arquivoId,
    participante_id: null,
    categoria,
    severidade: o.severidade,
    regra: o.regra,
    linha: o.linha || null,
    descricao: o.descricao,
    cpf_mascarado: o.cpf_mascarado || null,
    cnes: o.cnes || null,
    instituicao_nome: o.instituicao_nome || null,
    dados: o.dados || {},
  }));
  const { error } = await admin.from("piso_ocorrencias").insert(payload);
  if (error) throw error;
}

/** Processamento de InvestSUS mensal na mesma infraestrutura server-side da Planilha de Carga.
 * A saída oficial é relida do arquivo privado, nunca do texto fornecido pelo navegador.
 */
export const processarInvestsusPisoServidor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => entradaSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const userId = String((context as any).userId ?? "");
    if (!userId) throw new Error("Sessão não identificada.");

    const { data: roles, error: roleError } = await admin
      .from("user_roles").select("role").eq("user_id", userId);
    if (roleError) throw roleError;
    if (!(roles ?? []).some((r: any) => ["admin", "acp", "aco"].includes(r.role))) {
      throw new Error("Você não tem permissão para processar a auditoria do Piso.");
    }

    const { data: comp, error: compErro } = await admin.from("piso_competencias")
      .select("id,tipo_parcela").eq("id", data.competenciaId).single();
    if (compErro || !comp) throw new Error("Competência do Piso não localizada.");
    if (comp.tipo_parcela === "decimo_terceiro") {
      throw new Error("A memória da 13ª parcela usa regras próprias. Não aplicar a conciliação mensal do InvestSUS.");
    }
    const { data: arquivo, error: arqErro } = await admin.from("piso_arquivos")
      .select("*").eq("id", data.arquivoId).eq("competencia_id", data.competenciaId)
      .eq("categoria", "investsus").single();
    if (arqErro || !arquivo) throw new Error("Planilha do InvestSUS não encontrada nesta competência.");

    const buffer = await baixarVerificado(admin, arquivo);
    const linhas = await lerPlanilhaComCabecalho(buffer, "investsus");
    const audit = auditarInvestsus(linhas);

    const { data: participantes, error: participantesErro } = await admin
      .from("piso_participantes").select("id,prestador_id,prestadores(nome_instituicao)")
      .eq("competencia_id", data.competenciaId);
    if (participantesErro) throw participantesErro;

    const prestadores = [...new Set((participantes ?? []).map((p: any) => p.prestador_id).filter(Boolean))];
    const { data: cnes, error: cnesErro } = prestadores.length
      ? await admin.from("prestador_cnes").select("prestador_id,cnes").in("prestador_id", prestadores)
      : { data: [], error: null };
    if (cnesErro) throw cnesErro;

    const { data: anexosCarga, error: anexosErro } = await admin.from("piso_arquivos")
      .select("*").eq("competencia_id", data.competenciaId)
      .eq("categoria", "planilha_carga")
      .order("enviado_em", { ascending: false });
    if (anexosErro) throw anexosErro;
    const ultimaCarga = new Map<string, any>();
    for (const anexo of anexosCarga ?? []) {
      if (anexo.participante_id && !ultimaCarga.has(anexo.participante_id)) {
        ultimaCarga.set(anexo.participante_id, anexo);
      }
    }

    const cargas: RegistroCargaInstituicao[] = [];
    for (const p of participantes ?? []) {
      const anexo = ultimaCarga.get(p.id);
      if (!anexo) continue;
      const cargaBytes = await baixarVerificado(admin, anexo);
      const linhasCarga = await lerPlanilhaComCabecalho(cargaBytes);
      const permitidos = (cnes ?? [])
        .filter((item: any) => item.prestador_id === p.prestador_id)
        .map((item: any) => String(item.cnes));
      const resultado = auditarPlanilhaCarga(linhasCarga, permitidos);
      cargas.push(...resultado.registros.map(r => ({
        ...r, instituicao_nome: nomeInstituicao(p.prestadores),
      })));
    }

    const cruzada = conciliarCargaInvestsus(cargas, audit.registros);
    await substituirOcorrencias(admin, data.competenciaId, arquivo.id, "investsus", audit.ocorrencias);
    await substituirOcorrencias(admin, data.competenciaId, arquivo.id, "conciliacao", cruzada.ocorrencias);
    const resumo = {
      ...audit.resumo,
      arquivo_id: arquivo.id,
      processado_em: new Date().toISOString(),
      versao_regras: INVESTSUS_AUDIT_RULES_VERSION,
      origem_calculo: "server_fn",
    };
    const { error: atualizarErro } = await admin.from("piso_competencias")
      .update({
        investsus_resumo: resumo,
        investsus_auditoria: {
          versao_regras: INVESTSUS_AUDIT_RULES_VERSION,
          origem_calculo: "server_fn",
          interna: { erros: audit.resumo.erros, alertas: audit.resumo.alertas },
          conciliacao: cruzada.resumo,
        },
        valor_apurado_investsus: audit.resumo.total_complemento,
        total_publicado_municipal: audit.resumo.total_complemento,
      }).eq("id", data.competenciaId);
    if (atualizarErro) throw atualizarErro;

    for (const p of participantes ?? []) {
      const seusCnes = new Set((cnes ?? [])
        .filter((item: any) => item.prestador_id === p.prestador_id)
        .map((item: any) => String(item.cnes)));
      const total = Object.entries(audit.resumo.por_cnes)
        .filter(([codigo]) => seusCnes.has(codigo))
        .reduce((soma, [, valor]) => soma + Number(valor), 0);
      const { error } = await admin.from("piso_participantes")
        .update({ valor_devido: Math.round(total * 100) / 100 })
        .eq("id", p.id).eq("competencia_id", data.competenciaId);
      if (error) throw error;
    }

    const { data: perfil } = await admin.from("profiles")
      .select("nome").eq("id", userId).maybeSingle();
    await admin.from("historico_logs").insert({
      piso_competencia_id: data.competenciaId,
      usuario_id: userId,
      usuario_nome: perfil?.nome ?? "Usuário",
      acao: "Piso · InvestSUS processado no servidor",
      detalhes: {
        arquivo_id: arquivo.id,
        sha256: arquivo.sha256,
        versao_regras: INVESTSUS_AUDIT_RULES_VERSION,
        total_complemento: audit.resumo.total_complemento,
        criticas: cruzada.resumo.criticas,
        alertas: cruzada.resumo.alertas,
        origem_calculo: "server_fn",
      },
    });
    return {
      tipo: "investsus",
      audit: {
        linhas: audit.resumo.linhas,
        erros: audit.resumo.erros,
        alertas: audit.resumo.alertas,
        total_complemento: audit.resumo.total_complemento,
      },
      conciliacao: cruzada.resumo,
    };
  });
