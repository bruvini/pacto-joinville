import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extrairDadosPortariaGm } from "@/lib/piso/portaria";
import { lerMemoria13PorCnes } from "@/lib/piso/memoria13";

const entrada = z.object({
  competenciaId: z.string().uuid(),
  arquivoId: z.string().uuid(),
});
type Categoria = "portaria_gm" | "afc13_cnes";

/** Autenticação, autorização e integridade são verificadas de novo no servidor.
 * Não aceitar texto/valores extraídos no navegador como fonte financeira.
 */
async function carregarArquivoOficial(
  data:{competenciaId:string;arquivoId:string},
  context:unknown,
  categoria:Categoria,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin=supabaseAdmin as any;
  const userId=String((context as any).userId??"");
  if(!userId)throw new Error("Sessão não identificada.");

  const {data:roles,error:rolesErro}=await admin.from("user_roles")
    .select("role").eq("user_id",userId);
  if(rolesErro)throw rolesErro;
  if(!(roles??[]).some((r:any)=>["admin","acp","aco"].includes(r.role)))
    throw new Error("Você não tem permissão para processar documentos oficiais do Piso.");

  const {data:competencia,error:competenciaErro}=await admin.from("piso_competencias")
    .select("id,tipo_parcela,status,exercicio_referencia")
    .eq("id",data.competenciaId).single();
  if(competenciaErro||!competencia)throw new Error("Competência do Piso não localizada.");
  if(competencia.status==="encerrada")
    throw new Error("Competência encerrada. Reabra formalmente antes de reprocessar documentos oficiais.");
  if(categoria==="afc13_cnes"&&competencia.tipo_parcela!=="decimo_terceiro")
    throw new Error("A memória da 13ª só pode ser processada em parcela adicional.");

  const {data:arquivo,error:arquivoErro}=await admin.from("piso_arquivos")
    .select("*").eq("id",data.arquivoId)
    .eq("competencia_id",data.competenciaId).eq("categoria",categoria).single();
  if(arquivoErro||!arquivo)
    throw new Error("Arquivo original não localizado nesta competência/categoria.");

  if(Number(arquivo.tamanho??0)>30*1024*1024)
    throw new Error("Arquivo excede o limite de 30 MB para processamento seguro.");
  const {data:original,error:storageErro}=await admin.storage.from("piso-arquivos")
    .download(arquivo.storage_path);
  if(storageErro||!original)
    throw new Error("Não foi possível recuperar o documento original preservado no Storage.");
  const buffer=await original.arrayBuffer();
  if(buffer.byteLength>30*1024*1024)
    throw new Error("Arquivo excede o limite de 30 MB para processamento seguro.");
  const hash=await crypto.subtle.digest("SHA-256",buffer);
  const sha=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
  if(!arquivo.sha256||sha!==String(arquivo.sha256).toLowerCase())
    throw new Error("A integridade SHA-256 da evidência oficial não confere.");
  const {data:perfil}=await admin.from("profiles").select("nome")
    .eq("id",userId).maybeSingle();
  return {admin,competencia,arquivo,buffer,userId,nome:perfil?.nome??"Usuário"};
}

/** Extrai texto do PDF PRESERVADO no servidor; não solicita novo upload.
 * Lê as páginas até encontrar o cabeçalho do ato e a linha do município.
 * A extração é de texto nativo; PDFs somente escaneados exigem conferência manual.
 */
async function lerPdfOficial(buffer:ArrayBuffer):Promise<string> {
  const pdfjs=await (await import("@/lib/pdf-server")).carregarPdfjsServidor();
  const tarefa=pdfjs.getDocument({
    data:new Uint8Array(buffer),
    useSystemFonts:true,
    disableFontFace:true,
    isEvalSupported:false,
  });
  const pdf=await tarefa.promise;
  let cabecalho="", trechoMunicipio="";
  try {
    for(let n=1;n<=pdf.numPages;n++){
      const pagina=await pdf.getPage(n);
      const conteudo=await pagina.getTextContent();
      const texto=conteudo.items.map((x:any)=>"str" in x?x.str:"").join(" ");
      pagina.cleanup();
      if(!cabecalho && /PORTARIA\s+GM\/?MS\b/i.test(texto))
        cabecalho=texto.slice(0,20000);
      if(!trechoMunicipio && /420910\s+JOINVILLE\s+MUNICIPAL/i.test(texto))
        trechoMunicipio=texto;
      if(cabecalho&&trechoMunicipio)break;
    }
  }finally{await pdf.destroy();}
  return [cabecalho,trechoMunicipio].filter(Boolean).join("\n");
}

export const processarPortariaPisoServidor=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .validator((data:unknown)=>entrada.parse(data))
  .handler(async ({data,context})=>{
    const {admin,competencia,arquivo,buffer,userId,nome}=
      await carregarArquivoOficial(data,context,"portaria_gm");
    if(!String(arquivo.nome_original??"").toLowerCase().endsWith(".pdf")&&
       !String(arquivo.mime??"").toLowerCase().includes("pdf"))
      throw new Error("A Portaria GM/MS deve ser anexada em PDF.");
    const texto=await lerPdfOficial(buffer);
    if(!texto.trim())
      throw new Error("O PDF não contém texto reconhecível da Portaria. Confira se é PDF pesquisável.");
    const dados=extrairDadosPortariaGm(texto);
    if(!dados.numero)
      throw new Error("Não foi possível identificar o número da Portaria GM/MS no PDF.");
    const ementa=texto.slice(0,2500)
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const parcela13= /decima\s+terceira\s+parcela|13[aª]?\s+parcela|decimo\s+terceiro/.test(ementa);
    if(competencia.tipo_parcela==="decimo_terceiro"&&!parcela13)
      throw new Error("A Portaria não identifica expressamente a 13ª parcela na ementa.");
    if(competencia.tipo_parcela!=="decimo_terceiro"&&parcela13)
      throw new Error("A publicação é da 13ª parcela e não pode preencher uma competência mensal.");
    if(!dados.joinville_localizada)
      throw new Error("Não foi possível localizar e ler os quatro valores da linha financeira de Joinville na Portaria.");

    const patch=Object.fromEntries(Object.entries({
      portaria_gm_numero:dados.numero,
      portaria_gm_data_ato:dados.data_ato,
      portaria_gm_data_publicacao:dados.data_publicacao,
      portaria_gm_edicao:dados.edicao,
      portaria_gm_secao:dados.secao,
      portaria_gm_pagina:dados.pagina,
      valor_homologado:dados.valor_homologado,
      desconto_saldo:dados.desconto_saldo,
      acerto_contas:dados.acerto_contas,
      valor_transferido:dados.valor_transferido,
    }).filter(([,valor])=>valor!=null));
    const {error}=await admin.from("piso_competencias")
      .update(patch).eq("id",data.competenciaId);
    if(error)throw error;

    const {error:logErro}=await admin.from("historico_logs").insert({
      piso_competencia_id:data.competenciaId,
      usuario_id:userId,usuario_nome:nome,
      acao:"Piso · Portaria GM/MS processada no servidor",
      detalhes:{
        arquivo_id:arquivo.id,sha256:arquivo.sha256,portaria:dados.numero,
        valor_homologado:dados.valor_homologado,
        valor_transferido:dados.valor_transferido,origem_calculo:"server_fn",
      },
    });
    if(logErro)throw new Error("Portaria extraída e salva, mas falhou o registro do histórico: "+logErro.message);
    return {tipo:"portaria_gm",dados};
  });

export const processarMemoria13PisoServidor=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .validator((data:unknown)=>entrada.parse(data))
  .handler(async ({data,context})=>{
    const {admin,arquivo,buffer,userId}=
      await carregarArquivoOficial(data,context,"afc13_cnes");
    const linhas=lerMemoria13PorCnes(buffer);
    // A RPC existente valida CNES, datas, instituições e grava valores
    // numa transação, sem confiar em valores vindos do navegador.
    const {data:total,error}=await admin.rpc("piso_aplicar_memoria_13_cnes",{
      p_competencia:data.competenciaId,
      p_arquivo:arquivo.id,
      p_linhas:linhas,
      p_autor:userId,
    });
    if(error)throw error;
    return {
      tipo:"afc13_cnes",
      audit:{linhas:linhas.length,total_complemento:Number(total??0),erros:0,alertas:0},
      conciliacao:{criticas:0,alertas:0},
    };
  });
