import {useState} from "react";
import {useMutation,useQuery} from "@tanstack/react-query";
import {CheckCircle2,X} from "lucide-react";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select,SelectContent,SelectTrigger,SelectValue,SelectItem} from "@/components/ui/select";
import {Badge} from "@/components/ui/badge";
import {SLOTS_PADRAO,SLOTS_LIBERA_ORC} from "@/components/BlocoAssinaturas";
import type {Tables} from "@/integrations/supabase/types";
export type AssinaturaFluxo=Tables<"emenda_fluxo_assinaturas">;
type Grupo={titulo:string;opcoes:{papel:string;rotulo:string;cargos:string[]}[]};
const alternativoFinanceiro:Grupo={titulo:SLOTS_PADRAO[3].label,opcoes:[
 {papel:"financeira",rotulo:"Diretoria Financeira",cargos:["Diretoria Financeira"]},
 {papel:"secretaria",rotulo:"Secretária de Saúde",cargos:["Secretária de Saúde"]}]};
const grupos=(tipo:"ne"|"liberacao"|"anulacao"):Grupo[]=>tipo==="ne"?[
 {titulo:SLOTS_LIBERA_ORC[0].label,opcoes:[{papel:"sefaz",rotulo:"Membro da SEFAZ",cargos:[]}]},
 alternativoFinanceiro
]:[
 {titulo:SLOTS_PADRAO[0].label,opcoes:[{papel:"fiscal",rotulo:"Fiscal",cargos:["Fiscal"]}]},
 {titulo:SLOTS_PADRAO[1].label,opcoes:[
  {papel:"gerente",rotulo:"Gerente",cargos:["Gerente"]},
  {papel:"coordenador",rotulo:"Coordenador ACP",cargos:["Coordenador ACP","Coordenador"]}]},
 {titulo:SLOTS_PADRAO[2].label,opcoes:[{papel:"diretor",rotulo:"Diretor",cargos:["Diretor de Serviços Complementares"]}]},
 alternativoFinanceiro
];
export function assinaturasFluxoCompletas(tipo:"ne"|"liberacao"|"anulacao",assinaturas:AssinaturaFluxo[]){
 return grupos(tipo).every(g=>g.opcoes.some(o=>assinaturas.some(a=>a.papel===o.papel)));
}
export function FluxoAssinaturasEmenda({documentoId,tipo,assinaturas,editavel,onAtualizar}:{
 documentoId:string;tipo:"ne"|"liberacao"|"anulacao";assinaturas:AssinaturaFluxo[];
 editavel:boolean;onAtualizar:()=>Promise<void>;
}){
 const [nomeManual,setNomeManual]=useState("");
 const {data:pool=[]}=useQuery({queryKey:["assinaturas_config"],
  queryFn:async()=>{const r=await supabase.from("assinaturas_config").select("*").eq("ativo",true).order("nome_servidor");
   if(r.error)throw r.error;return r.data??[];},staleTime:120000});
 const registrar=useMutation({mutationFn:async(p:{papel:string;id?:string;nome?:string})=>{
  const r=await supabase.rpc("emenda_fluxo_assinar",{p_documento:documentoId,p_papel:p.papel,
   p_signatario:p.id??null,p_manual:p.nome??null});if(r.error)throw r.error;
 },onSuccess:async()=>{setNomeManual("");await onAtualizar();toast.success("Conferência registrada.");},
 onError:(e:Error)=>toast.error(e.message)});
 const remover=useMutation({mutationFn:async(id:string)=>{
  const r=await supabase.rpc("emenda_fluxo_remover_assinatura",{p_assinatura:id});
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Conferência retirada (com auditoria).");},
 onError:(e:Error)=>toast.error(e.message)});
 const gs=grupos(tipo);
 const concluidos=gs.filter(g=>g.opcoes.some(o=>assinaturas.some(a=>a.papel===o.papel))).length;
 return <div className={"rounded-lg border p-3 space-y-2 "+(concluidos===gs.length?"border-emerald-600/30 bg-emerald-600/5":"bg-muted/10")}>
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h4 className="text-xs font-semibold">ASSINATURAS</h4><Badge variant={concluidos===gs.length?"default":"outline"}>{concluidos}/{gs.length} grupos</Badge>
  </div>
  {gs.map(g=>{
   const existentes=assinaturas.filter(a=>g.opcoes.some(o=>o.papel===a.papel));
   return <div key={g.titulo} className="rounded-md border bg-background px-3 py-2 space-y-2">
    <div className="flex items-center justify-between gap-2">
     <p className="text-xs font-medium">{g.titulo}{g.opcoes.length>1?" · pelo menos uma":""}</p>
     {existentes.length>0&&<CheckCircle2 className="h-4 w-4 text-emerald-600"/>}
    </div>
    {existentes.map(a=><div key={a.id} className="flex items-center gap-2 text-xs">
     <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600"/>
     <span className="min-w-0 flex-1">{a.nome} · {a.cargo}
      <span className="ml-1 text-[10px] text-muted-foreground">
       {new Date(a.confirmado_em).toLocaleString("pt-BR")}</span>
     </span>
     {editavel&&<Button size="icon" variant="ghost" className="h-7 w-7"
      aria-label={"Retirar conferência de "+a.nome} onClick={()=>remover.mutate(a.id)}>
      <X className="h-3.5 w-3.5 text-destructive"/></Button>}
    </div>)}
    {editavel&&<div className={"grid gap-2 "+(g.opcoes.length>1?"sm:grid-cols-2":"sm:grid-cols-1")}>
     {g.opcoes.map(o=>{
      if(o.papel==="sefaz")return <div key={o.papel} className="flex gap-2">
       <Input className="h-9" value={nomeManual} onChange={e=>setNomeManual(e.target.value)}
        onBlur={()=>{if(nomeManual.trim().length>=3&&!registrar.isPending)
         registrar.mutate({papel:"sefaz",nome:nomeManual});}}
        placeholder="Nome do membro da SEFAZ · salva ao sair do campo"/>
      </div>;
      const atual=existentes.find(a=>a.papel===o.papel);
      const usados=assinaturas.filter(a=>a.papel!==o.papel).map(a=>a.signatario_config_id);
      const disponiveis=pool.filter(p=>o.cargos.includes(p.cargo)&&!usados.includes(p.id));
      return <Select key={o.papel} value={atual?.signatario_config_id??""}
       disabled={registrar.isPending||remover.isPending}
       onValueChange={id=>registrar.mutate({papel:o.papel,id})}>
       <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={o.rotulo+": selecionar"}/></SelectTrigger>
       <SelectContent>{disponiveis.map(p=><SelectItem key={p.id} value={p.id}>
        {p.nome_servidor} · {p.cargo}</SelectItem>)}</SelectContent>
      </Select>;
     })}
    </div>}
   </div>;
  })}
  <p className="text-[11px] text-muted-foreground">
   Os pares opcionais ficam na mesma linha e aceitam uma ou duas assinaturas. A conclusão exige pelo menos uma.
  </p>
 </div>;
}
