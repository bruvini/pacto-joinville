import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {brl} from "@/lib/format";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {CurrencyInput} from "@/components/inputs/CurrencyInput";

export function ValorAtestadoEtapa6({id,lanc,f,editavel,manualAlterado,onSelecionada}:{
 id:string;lanc:{valor_atestado:number|null};f:{
  valor_atestado_manual?:number|null;valor_atestado_automatico?:number|null;
  valor_atestado?:number|null;origem_valor_atestado?:string;
  ec_escolha_pendente?:boolean;
 };editavel:boolean;manualAlterado:(v:number)=>void;
 onSelecionada:(origem:"manual"|"automatico",valor:number)=>void;
}){
 const qc=useQueryClient();
 const [sei,setSei]=useState(""),[motivo,setMotivo]=useState("");
 const escolhas=useQuery({queryKey:["ec-atesto-escolhas",id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_atesto_escolhas")
   .select("id,origem_anterior,origem_nova,valor_anterior,valor_novo,sei,motivo,escolhido_em")
   .eq("lancamento_id",id).order("escolhido_em",{ascending:false}).limit(30);
  if(error)throw error;return data??[];
 }});
 const selecionar=useMutation({mutationFn:async(origem:"manual"|"automatico")=>{
   const {data,error}=await supabase.rpc("ec_atesto_escolher_fonte",{
     p_lanc:id,p_origem:origem,p_valor_anterior:lanc.valor_atestado,
     p_sei:sei.trim(),p_motivo:motivo.trim()});
   if(error)throw error;return {origem,valor:Number(data)};
  },onSuccess:({origem,valor})=>{
    onSelecionada(origem,valor);
    toast.success("Fonte do atesto selecionada e auditada.");
    qc.invalidateQueries({queryKey:["lanc",id]});
    qc.invalidateQueries({queryKey:["ec-atesto-escolhas",id]});
    setSei("");setMotivo("");
  },onError:(e:Error)=>toast.error(e.message)});
 const podeEscolher=editavel&&sei.trim().length>=5&&motivo.trim().length>=20;
 return <div className="space-y-3 rounded-lg border p-3">
   <p className="text-xs text-muted-foreground">
     Valor manual e cálculo do Encontro de Contas ficam registrados separadamente.
     O campo 4 considera apenas a origem escolhida pelo fiscal.</p>
   <div className="grid gap-3 sm:grid-cols-2">
     <label className="text-xs font-medium">Valor manual
       <CurrencyInput value={Number(f.valor_atestado_manual??0)}
         onChange={v=>{if(editavel)manualAlterado(v);}}/>
     </label>
     <div className="rounded-md border p-3">
       <p className="text-xs text-muted-foreground">Valor automático do Encontro de Contas</p>
       <strong>{f.valor_atestado_automatico==null?"Ainda não aplicado":brl(Number(f.valor_atestado_automatico))}</strong>
     </div>
   </div>
   <div className="rounded-md border bg-muted/20 p-3 text-xs">
     Fonte considerada: <strong>{f.origem_valor_atestado==="automatico"?"Automática":"Manual"}</strong>
     <p className="mt-1">4. Valor Atestado efetivo:
       <strong> {brl(Number(f.valor_atestado??0))}</strong></p>
   </div>
   {f.ec_escolha_pendente&&<p role="alert" className="rounded-md border border-amber-400 p-3 text-xs font-semibold text-amber-900">
     Há valores manual e automático. Selecione qual será considerado antes de avançar a liberação.</p>}
   {editavel&&(f.valor_atestado_manual!=null||f.valor_atestado_automatico!=null)&&
    <div className="space-y-2">
      <label className="block text-xs">Documento SEI da escolha
       <Input value={sei} onChange={e=>setSei(e.target.value)}/></label>
      <label className="block text-xs">Justificativa fiscal (mín. 20 caracteres)
       <Textarea rows={2} value={motivo} onChange={e=>setMotivo(e.target.value)}/></label>
      <div className="flex flex-wrap gap-2">
       <Button size="sm" variant="outline" disabled={!podeEscolher||
        selecionar.isPending||f.valor_atestado_manual==null}
        onClick={()=>selecionar.mutate("manual")}>Considerar valor manual</Button>
       <Button size="sm" variant="outline" disabled={!podeEscolher||
        selecionar.isPending||f.valor_atestado_automatico==null}
        onClick={()=>selecionar.mutate("automatico")}>Considerar valor automático</Button>
      </div>
    </div>}
   {(escolhas.data?.length??0)>0&&<details className="rounded-md border p-2 text-xs">
     <summary className="cursor-pointer font-semibold">
       Histórico de escolhas ({escolhas.data?.length})</summary>
     {escolhas.data?.map(e=><p key={e.id} className="border-t py-2">
       {new Date(e.escolhido_em).toLocaleString("pt-BR")} ·
       {e.origem_anterior??"Inicial"} → {e.origem_nova} ·
       {brl(Number(e.valor_anterior??0))} → {brl(Number(e.valor_novo??0))}
       · SEI {e.sei} · {e.motivo}</p>)}
   </details>}
 </div>;
}
