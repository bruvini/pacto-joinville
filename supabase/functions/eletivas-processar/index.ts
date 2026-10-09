import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";
import { lerFontesEC } from "../_shared/eletivas-leitores.ts";
import { conciliarEletivas } from "../_shared/eletivas-motor.ts";

const cors = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
};
const json=(status:number,data:unknown)=>new Response(JSON.stringify(data),{
  status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"},
});
/**
 * Processamento sob demanda (não é encerramento nem atesto automático).
 * Autoriza admin/ACP, lê fontes privadas, valida SHA-256 e registra em
 * uma única transação os itens não conferidos. Nenhum dado de paciente/CPF
 * retorna à resposta nem é gravado no log.
 */
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json(405,{error:"Método não permitido."});
  try{
    const url=Deno.env.get("SUPABASE_URL");
    const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!key)throw Error("Ambiente sem credenciais do servidor.");
    const jwt=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim();
    if(!jwt) return json(401,{error:"Sessão obrigatória."});
    const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError}=await admin.auth.getUser(jwt);
    if(authError||!user)return json(401,{error:"Sessão não autenticada."});
    const {data:roles,error:rolesErr}=await admin.from("user_roles")
      .select("role").eq("user_id",user.id);
    if(rolesErr)throw rolesErr;
    if(!(roles??[]).some(r=>r.role==="admin"||r.role==="acp"))
      return json(403,{error:"Perfil sem permissão para processar auditorias."});
    const body=await req.json();
    const competenciaId=String(body?.competencia_id??"");
    if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(competenciaId))
      return json(400,{error:"Identificador da competência inválido."});
    const {data:comp,error:errComp}=await admin.from("eletivas_competencias")
      .select("id,cnes,competencia,status").eq("id",competenciaId).single();
    if(errComp||!comp)return json(404,{error:"Competência não localizada."});
    if(comp.status==="encerrada")
      return json(409,{error:"Encontro já encerrado. Não reprocessar."});

    const {data:arquivos,error:errArq}=await admin.from("eletivas_arquivos")
      .select("id,categoria,storage_path,sha256,enviado_em")
      .eq("competencia_id",competenciaId).order("enviado_em",{ascending:false});
    if(errArq)throw errArq;
    const fontes=new Map<string,typeof arquivos[number]>();
    for(const arq of arquivos??[])
      if(!fontes.has(arq.categoria))fontes.set(arq.categoria,arq);
    for(const categoria of ["dbf_faec","dbf_mac","s_faec","s_mac"])
      if(!fontes.has(categoria))return json(422,{error:"Fonte obrigatória ausente: "+categoria});

    const bruto:Array<{categoria:string;bytes:ArrayBuffer}>=[];
    const ids:string[]=[];
    const faltantes:string[]=[];
    for(const [categoria,arq] of fontes.entries()){
      // Apenas arquivos de produção e SES entram no cálculo; documentos
      // SEI, FPO e workbook seguem preservados como evidência de apoio.
      if(!["dbf_faec","dbf_mac","dbf_sia","s_faec","s_mac","s_faec_est",
        "s_mac_fed","s_mac_faec","sia_faec","sia_faec_p","sia_mac"].includes(categoria))continue;
      const {data:blob,error:storageErr}=await admin.storage.from("eletivas-arquivos")
        .download(arq.storage_path);
      if(storageErr||!blob)throw Error("Não foi possível ler a evidência privada "+categoria);
      const bytes=await blob.arrayBuffer();
      const dig=await crypto.subtle.digest("SHA-256",bytes);
      const hash=[...new Uint8Array(dig)].map(n=>n.toString(16).padStart(2,"0")).join("");
      if(hash!==arq.sha256)throw Error("SHA-256 divergente para a fonte "+categoria);
      bruto.push({categoria,bytes});ids.push(arq.id);
    }
    const normalizados=lerFontesEC(bruto,comp.cnes,XLSX);
    const resultado=conciliarEletivas(normalizados);
    const naoTratados=[...resultado.impedimentos,...faltantes];
    if(naoTratados.length)
      return json(422,{error:"Conciliação incompleta; não houve gravação.",impedimentos:naoTratados});
    const payload=resultado.itens.map(item=>({
      ...item,detalhe:item.detalhe,
    }));
    const {data:count,error:writeError}=await admin.rpc("ec_importar_itens_processados",{
      p_comp:competenciaId,p_arquivos:ids,p_itens:payload,
    });
    if(writeError)throw Error(writeError.message);
    return json(200,{status:"auditoria",itens:count,
      totais:resultado.totais,
      aviso:"Itens processados. Cada conferência fiscal e o atesto continuam pendentes."});
  }catch(error){
    const e=error instanceof Error?error.message:"Falha inesperada.";
    return json(422,{error:e});
  }
});
