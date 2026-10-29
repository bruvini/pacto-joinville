import {useEffect} from "react";
import {useMutation} from "@tanstack/react-query";
import {toast} from "sonner";
import {Badge} from "@/components/ui/badge";
import {FluxoCampoEmenda,documentoValor,type DocumentoFluxo} from "@/components/emendas/FluxoCampoEmenda";
import {FluxoAssinaturasEmenda,assinaturasFluxoCompletas,type AssinaturaFluxo} from "@/components/emendas/FluxoAssinaturasEmenda";
import {brl} from "@/lib/format";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
type Nota=Tables<"emenda_solicitacoes">;
export function FluxoNotaEmenda({lancamentoId,nota,documento,assinaturas,podeEditar,onAtualizar}:{
 lancamentoId:string;nota?:Nota;documento?:DocumentoFluxo;assinaturas:AssinaturaFluxo[];
 podeEditar:boolean;onAtualizar:()=>Promise<void>;
}){
 const jaEmitida=!!nota?.numero_ne;
 const campos=jaEmitida?{
  numero_ne:nota?.numero_ne??"",valor_ne:String(nota?.valor_ne??""),
  numero_sei:nota?.numero_sei_ne??"",link_sei:nota?.link_sei_ne??"",
 }:{
  numero_ne:documentoValor(documento,"numero_ne"),valor_ne:documentoValor(documento,"valor_ne"),
  numero_sei:documentoValor(documento,"numero_sei"),link_sei:documentoValor(documento,"link_sei"),
 };
 const preenchido=!!campos.numero_ne&&Number(campos.valor_ne)>0&&!!campos.numero_sei&&
  /^https:\/\//i.test(campos.link_sei);
 const completo=assinaturasFluxoCompletas("ne",assinaturas);
 const diferenca=Number(campos.valor_ne||0)-Number(nota?.valor_solicitado||0);
 const finalizar=useMutation({mutationFn:async()=>{
  const r=await supabase.rpc("emenda_fluxo_finalizar_ne",{p_lancamento:lancamentoId});
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Conferência da NE concluída.");},
 onError:(e:Error)=>toast.error(e.message)});
 useEffect(()=>{
  if(documento?.id&&preenchido&&completo&&!jaEmitida&&!finalizar.isPending&&!finalizar.isSuccess)
   finalizar.mutate();
 },[documento?.id,preenchido,completo,jaEmitida,finalizar.isPending,finalizar.isSuccess]);
 return <div className="space-y-3">
  <div className="grid gap-3 md:grid-cols-[minmax(150px,1fr)_180px_minmax(150px,.8fr)_minmax(250px,1.6fr)]">
   {([
    ["numero_ne","Número da Nota de Empenho","texto"],
    ["valor_ne","Valor da NE","moeda"],
    ["numero_sei","Número SEI","texto"],
    ["link_sei","Link da Nota de Empenho SEI","link"],
   ] as const).map(([campo,rotulo,tipo])=>
    jaEmitida?<div key={campo} className="min-w-0">
     <p className="mb-1 text-xs text-muted-foreground">{rotulo}</p>
     {campo==="link_sei"?<div className="flex items-center gap-2">
       <input className="h-9 min-w-0 w-full rounded-md border bg-muted/10 px-2 text-xs"
        readOnly value={campos.link_sei}/>
       <a href={campos.link_sei} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-primary underline">Abrir SEI</a>
      </div>:
      <p className="min-h-9 rounded-md border bg-muted/10 px-3 py-2 text-sm">
       {campo==="valor_ne"?brl(Number(campos.valor_ne)):campos[campo]}</p>}
    </div>:
    <FluxoCampoEmenda key={campo} lancamentoId={lancamentoId} contexto="ne"
     documento={documento} campo={campo} rotulo={rotulo} tipo={tipo}
     editavel={podeEditar&&!jaEmitida} onAtualizar={onAtualizar}/>
   )}
  </div>
  {preenchido&&Math.abs(diferenca)>=0.005&&<p className="rounded-md border border-amber-400/40 bg-amber-50 p-3 text-xs text-amber-900">
   Valor da NE difere do solicitado em <strong>{brl(Math.abs(diferenca))}</strong>
   {diferenca>0?" acima":" abaixo"} do valor solicitado ({brl(Number(nota?.valor_solicitado??0))}).
   Esta diferença não impede o registro da NE.
  </p>}
  {preenchido&&documento?.id&&<FluxoAssinaturasEmenda documentoId={documento.id} tipo="ne"
   assinaturas={assinaturas} editavel={podeEditar&&!completo}
   onAtualizar={onAtualizar}/>}
  {jaEmitida&&<p className="text-xs text-emerald-700">
   NE registrada documentalmente. Não é possível substituir uma NE já emitida sem retificação formal.
   Os registros históricos permanecem íntegros; as assinaturas desta etapa podem ser conferidas na matriz.
  </p>}
  {finalizar.isPending&&<p className="text-xs text-muted-foreground">Validando a NE e suas assinaturas…</p>}
 </div>;
}
