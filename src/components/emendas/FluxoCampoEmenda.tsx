import {useEffect,useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {toast} from "sonner";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {CurrencyInput} from "@/components/inputs/CurrencyInput";
import {SeiLink} from "@/components/inputs/SeiLink";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
export type DocumentoFluxo=Tables<"emenda_fluxo_documentos">;
export const documentoValor=(doc:DocumentoFluxo|undefined,campo:string)=>
 doc?.dados&&typeof doc.dados==="object"&&!Array.isArray(doc.dados)?
 String((doc.dados as Record<string,unknown>)[campo]??""):"";
export function FluxoCampoEmenda({lancamentoId,contexto,documento,campo,rotulo,tipo="texto",editavel,onAtualizar}:{
 lancamentoId:string;contexto:string;documento?:DocumentoFluxo;campo:string;rotulo:string;
 tipo?:"texto"|"moeda"|"link"|"data";editavel:boolean;onAtualizar:()=>Promise<void>;
}){
 const salvo=documentoValor(documento,campo);
 const [texto,setTexto]=useState(salvo);
 const [alterado,setAlterado]=useState(false);
 useEffect(()=>{if(!alterado)setTexto(salvo);},[salvo,alterado]);
 const gravar=useMutation({mutationFn:async()=>{
  const v=texto.trim();
  if(v===salvo)return;
  const r=await supabase.rpc("emenda_fluxo_salvar",{p_lancamento:lancamentoId,p_contexto:contexto,
   p_campo:campo,p_valor:v});
  if(r.error)throw r.error;
 },onSuccess:async()=>{setAlterado(false);await onAtualizar();},
 onError:(e:Error)=>toast.error("Não foi possível salvar "+rotulo+": "+e.message)});
 const commit=()=>{if(editavel&&alterado&&texto.trim()!==salvo)gravar.mutate();};
 return <div className="min-w-0 space-y-1">
  <Label className="text-xs">{rotulo}</Label>
  {tipo==="moeda"?<CurrencyInput value={Number(texto)||0}
   disabled={!editavel} onChange={v=>{setTexto(String(v));setAlterado(true);}}
   onBlur={commit}/>:
   tipo==="link"?<SeiLink value={texto} editable={editavel} manterInput onChange={v=>{setTexto(v);setAlterado(true);}}
    onBlur={commit}/>:
   <Input type={tipo==="data"?"date":"text"} value={texto} disabled={!editavel}
    onChange={e=>{setTexto(e.target.value);setAlterado(true);}} onBlur={commit} autoComplete="off"/>}
  {gravar.isPending&&<p className="text-[10px] text-muted-foreground">Salvando…</p>}
 </div>;
}
