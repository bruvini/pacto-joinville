import * as XLSX from "xlsx";
import {supabase} from "@/integrations/supabase/client";
import {lerFontesEC, type ArquivoBrutoEC} from "../../../supabase/functions/_shared/eletivas-leitores";
import {conciliarEletivas} from "./motor";
import {validarEstruturaFonte} from "./validarEstruturaFonte";
import type {Json,Tables} from "@/integrations/supabase/types";
import {FONTES_ELETIVAS,type FonteId} from "./fontes";

export type FonteEscolhida=Tables<"eletivas_arquivos">;
export type SelecaoFonteEC=Partial<Record<FonteId,string>>;
export type ManifestoEC={id:string;categoria:FonteId;sha256:string};
export const MOTOR_BROWSER="browser-eletivas-fase1.0";

export function construirManifestoEC(
 arquivos:FonteEscolhida[],selecao:SelecaoFonteEC,competencia:string,
):{fontes:FonteEscolhida[];manifesto:ManifestoEC[]}{
 const cadastrados=new Map(arquivos.map(a=>[a.id,a]));
 const fontes:FonteEscolhida[]=[];
 const usadas=new Set<string>();
 const hashes=new Set<string>();
 for(const papel of FONTES_ELETIVAS){
   if(papel.grupo==="SEI"||papel.id==="outros")continue;
   const id=selecao[papel.id];
   if(!id)continue;
   const arquivo=cadastrados.get(id);
   if(!arquivo||arquivo.categoria!==papel.id)
     throw Error("Versão escolhida para "+papel.rotulo+" não pertence a essa competência/papel.");
   if(usadas.has(arquivo.categoria))throw Error("Papel de evidência repetido: "+arquivo.categoria);
   if(hashes.has(arquivo.sha256))throw Error("O mesmo arquivo foi classificado em dois papéis. Revise.");
   usadas.add(arquivo.categoria);hashes.add(arquivo.sha256);fontes.push(arquivo);
 }
 const obrigatorias=["dbf_faec","dbf_mac","s_faec","s_mac"];
 const [mm,aaaa]=competencia.split("/").map(Number);
 if(aaaa*100+mm>=202607)obrigatorias.push("s_mac_ms");
 const faltam=obrigatorias.filter(cat=>!usadas.has(cat));
 if(faltam.length)throw Error("Escolha explicitamente uma versão para: "+faltam.join(", "));
 if(fontes.length>16)throw Error("São permitidas até 16 fontes de cálculo/apoio.");
 return {fontes,manifesto:fontes.map(a=>({id:a.id,categoria:a.categoria as FonteId,sha256:a.sha256}))};
}

const shaHex=(bytes:ArrayBuffer)=>crypto.subtle.digest("SHA-256",bytes).then(digest=>
 [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join(""));
const categoriaLegivel=(id:string)=>FONTES_ELETIVAS.find(x=>x.id===id)?.rotulo??id;

export async function executarPreConciliacaoLocal(args:{
 id:string;cnes:string;competencia:string;arquivos:FonteEscolhida[];
 selecao:SelecaoFonteEC;progresso?:(msg:string)=>void;
}){
 const {fontes,manifesto}=construirManifestoEC(args.arquivos,args.selecao,args.competencia);
 const brutos:ArquivoBrutoEC[]=[];
 for(const arq of fontes){
   args.progresso?.("Baixando "+categoriaLegivel(arq.categoria)+"…");
   const {data,error}=await supabase.storage.from("eletivas-arquivos").download(arq.storage_path);
   if(error||!data)throw Error("Falha ao baixar "+categoriaLegivel(arq.categoria)+": "+(error?.message??"Arquivo não encontrado."));
   if(data.size<=0||data.size>50*1024*1024||data.size!==arq.tamanho)
      throw Error("Tamanho divergente ou superior a 50 MB: "+arq.nome_original);
   const bytes=await data.arrayBuffer();
   const hash=await shaHex(bytes);
   if(hash!==arq.sha256)throw Error("Integridade SHA-256 falhou: "+arq.nome_original);
   args.progresso?.("Validando "+categoriaLegivel(arq.categoria)+"…");
   try{
     validarEstruturaFonte(arq.categoria as FonteId,bytes,args.cnes,arq.nome_original);
   }catch(e){
     throw Error(categoriaLegivel(arq.categoria)+" / "+arq.nome_original+": "+
       (e instanceof Error?e.message:String(e)));
   }
   brutos.push({categoria:arq.categoria,bytes});
 }
 let normalizados:ReturnType<typeof lerFontesEC>;
 try{
   args.progresso?.("Lendo matrizes oficiais e quantidades internas…");
   normalizados=lerFontesEC(brutos,args.cnes,
      XLSX as unknown as Parameters<typeof lerFontesEC>[2]);
 }catch(e){throw Error("Leitura TabWin/SES: "+(e instanceof Error?e.message:String(e)));}
 args.progresso?.("Conciliando componentes financeiros no navegador…");
 const r=conciliarEletivas(normalizados);
 if(r.impedimentos.length)throw Error("Conciliação bloqueada, nenhum item gravado: "+
   r.impedimentos.slice(0,8).join(" | ")+(r.impedimentos.length>8?
   " (mais "+(r.impedimentos.length-8)+" impedimentos)":""));
 if(!r.itens.length)throw Error("Nenhum item válido produzido. Nenhum resultado foi gravado.");
 args.progresso?.("Gravando pré-conciliação e manifesto com validação de perfil…");
 const {data,error}=await supabase.rpc("ec_importar_itens_local",{
   p_comp:args.id,p_evidencias:manifesto as unknown as Json,
   p_itens:r.itens as unknown as Json,p_motor_versao:MOTOR_BROWSER,
 });
 if(error)throw Error("Registro seguro no banco: "+error.message);
 return {itens:Number(data),totais:r.totais,manifesto};
}
