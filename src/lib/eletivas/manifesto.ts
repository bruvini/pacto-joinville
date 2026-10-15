import type {Tables} from "@/integrations/supabase/types";
import {FONTES_ELETIVAS,type FonteId} from "./fontes";

export type FonteEscolhida=Tables<"eletivas_arquivos">;
export type SelecaoFonteEC=Partial<Record<FonteId,string>>;
export type ManifestoEC={id:string;categoria:FonteId;sha256:string};
export const MOTOR_BROWSER="browser-eletivas-fase2.0";

/** Seleciona automaticamente uma fonte por papel, sem escolhas redundantes.
 * Se houve reenvio, considera a última fonte publicada; o manifesto registra
 * o identificador e SHA-256 exatos, impedindo substituição silenciosa. */
export function construirManifestoEC(
 arquivos:FonteEscolhida[],competencia:string,
):{fontes:FonteEscolhida[];manifesto:ManifestoEC[];avisos:string[]}{
 const fontes:FonteEscolhida[]=[];
 const avisos:string[]=[];
 const hashes=new Set<string>();
 for(const papel of FONTES_ELETIVAS){
   if(papel.grupo==="SEI"||papel.id==="outros")continue;
   const opções=arquivos.filter(a=>a.categoria===papel.id)
     .sort((a,b)=>b.enviado_em.localeCompare(a.enviado_em)||
       b.id.localeCompare(a.id));
   if(!opções.length)continue;
   const arquivo=opções[0];
   if(hashes.has(arquivo.sha256))
     throw Error("O mesmo arquivo está cadastrado em dois papéis: "+papel.rotulo+
       ". Revise a identificação antes de conciliar.");
   hashes.add(arquivo.sha256);
   fontes.push(arquivo);
   if(opções.length>1)avisos.push(
     papel.rotulo+": "+opções.length+" uploads encontrados; adotado automaticamente o mais recente "+
     arquivo.nome_original+" (SHA "+arquivo.sha256.slice(0,12)+").");
 }
 const obrigatorias=["dbf_faec","dbf_mac","s_faec","s_mac"];
 const [mm,ano]=competencia.split("/").map(Number);
 if(ano*100+mm>=202607)obrigatorias.push("s_mac_ms");
 const presentes=new Set(fontes.map(x=>x.categoria));
 const faltantes=obrigatorias.filter(id=>!presentes.has(id));
 if(faltantes.length)throw Error("Ainda faltam os seguintes arquivos obrigatórios: "+
   faltantes.map(id=>FONTES_ELETIVAS.find(x=>x.id===id)?.rotulo??id).join(", "));
 return {fontes,avisos,manifesto:fontes.map(a=>({
   id:a.id,categoria:a.categoria as FonteId,sha256:a.sha256,
 }))};
}

