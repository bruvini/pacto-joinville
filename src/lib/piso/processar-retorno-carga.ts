import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { lerPlanilhaComCabecalho } from "./planilha";
import { conciliarConfirmacaoCarga } from "./retorno-carga";

const entrada = z.object({ competenciaId:z.string().uuid(), arquivoId:z.string().uuid() });

export async function baixarRetornoVerificado(admin: any, arquivo: any): Promise<ArrayBuffer> {
  const { data, error } = await admin.storage.from("piso-arquivos").download(arquivo.storage_path);
  if (error || !data) throw new Error("Não foi possível recuperar a evidência do Storage privado.");
  const bytes = await data.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,"0")).join("");
  if (!arquivo.sha256 || hex !== String(arquivo.sha256).toLowerCase())
    throw new Error("Hash SHA-256 divergente: o arquivo não corresponde ao original registrado.");
  return bytes;
}

/** Audita o comprovante real após o upload, com as mesmas permissões da carga. */
export const processarRetornoCargaPisoServidor = createServerFn({ method:"POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown)=>entrada.parse(input))
  .handler(async ({ data, context })=>{
    const { supabaseAdmin }=await import("@/integrations/supabase/client.server");
    const admin=supabaseAdmin as any;
    const userId=String((context as any).userId??"");
    if (!userId) throw new Error("Sessão não identificada.");
    const {data: roles,error: roleError}=await admin.from("user_roles")
      .select("role").eq("user_id",userId);
    if (roleError) throw roleError;
    if (!(roles??[]).some((r:any)=>["admin","acp","aco"].includes(r.role)))
      throw new Error("Sem permissão para auditar o comprovante de carga.");

    const {data:arquivo,error:errArq}=await admin.from("piso_arquivos")
      .select("*").eq("competencia_id",data.competenciaId)
      .eq("id",data.arquivoId).eq("categoria","retorno_carga").single();
    if (errArq||!arquivo?.participante_id)
      throw new Error("O comprovante deve estar vinculado a uma instituição desta competência.");
    const {data:participante,error:errPart}=await admin.from("piso_participantes")
      .select("id,prestador_id").eq("id",arquivo.participante_id)
      .eq("competencia_id",data.competenciaId).single();
    if (errPart||!participante) throw new Error("Prestador desta competência não localizado.");
    const {data:carga,error:errCarga}=await admin.from("piso_arquivos")
      .select("*").eq("competencia_id",data.competenciaId)
      .eq("participante_id",participante.id).eq("categoria","planilha_carga")
      .order("enviado_em",{ascending:false}).limit(1).maybeSingle();
    if (errCarga||!carga) throw new Error("Anexe primeiro a Planilha de Carga da instituição na etapa 1A.");

    const [bufferRet,bufferCarga]=await Promise.all([
      baixarRetornoVerificado(admin,arquivo), baixarRetornoVerificado(admin,carga),
    ]);
    const [linhasRet,linhasCarga]=await Promise.all([
      lerPlanilhaComCabecalho(bufferRet,"carga"),lerPlanilhaComCabecalho(bufferCarga,"carga"),
    ]);
    const resultado=conciliarConfirmacaoCarga(linhasCarga,linhasRet);
    const {error:erroExcluir}=await admin.from("piso_ocorrencias").delete()
      .eq("arquivo_id",arquivo.id).eq("categoria","retorno_carga");
    if (erroExcluir) throw erroExcluir;
    const resumo={...resultado.resumo,
      arquivo_carga_id:carga.id,arquivo_retorno_id:arquivo.id,
      processado_em:new Date().toISOString()};
    const payload=[
      {categoria:"retorno_carga",regra:"resumo_retorno_carga",severidade:"info",
        linha:null,descricao:"Resumo da conferência do envio ao InvestSUS.",
        cpf_mascarado:null,cnes:null,dados:resumo},
      ...resultado.ocorrencias.map(o=>({
        categoria:"retorno_carga",regra:o.regra,severidade:o.severidade,
        linha:o.linha||null,descricao:o.descricao,
        cpf_mascarado:o.cpf_mascarado||null,cnes:o.cnes||null,
        dados:o.dados??{},
      })),
    ].map(o=>({
      ...o, competencia_id:data.competenciaId,arquivo_id:arquivo.id,
      participante_id:participante.id,
    }));
    const {error:errInsert}=await admin.from("piso_ocorrencias").insert(payload);
    if (errInsert) throw errInsert;

    const {data:perfil}=await admin.from("profiles")
      .select("nome").eq("id",userId).maybeSingle();
    await admin.from("historico_logs").insert({
      piso_competencia_id:data.competenciaId,usuario_id:userId,
      usuario_nome:perfil?.nome??"Usuário",
      acao:"Piso · confirmação de envio ao InvestSUS conciliada",
      detalhes:{
        arquivo_retorno_id:arquivo.id,arquivo_carga_id:carga.id,
        sha256:arquivo.sha256,resumo,origem_calculo:"server_fn",
      },
    });
    return {tipo:"retorno_carga",audit:resumo};
  });
