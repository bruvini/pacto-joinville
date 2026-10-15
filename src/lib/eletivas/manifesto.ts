import type {Tables} from "@/integrations/supabase/types";
import {FONTES_ELETIVAS,type FonteId} from "./fontes";

export type FonteEscolhida=Tables<"eletivas_arquivos">;
export type SelecaoFonteEC=Partial<Record<FonteId,string>>;
export type ManifestoEC={id:string;categoria:FonteId;sha256:string};
export const MOTOR_BROWSER="browser-eletivas-fase2.0";

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

