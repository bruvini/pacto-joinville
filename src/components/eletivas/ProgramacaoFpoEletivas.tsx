import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {reais} from "@/lib/eletivas/financeiro";

const cent=(x:unknown)=>Math.round(Number(x??0)*100);
export function ProgramacaoFpoEletivas({id,competencia,podeEditar}:{
 id:string;competencia:string;podeEditar:boolean;
}){
 const qc=useQueryClient();
 const [form,setForm]=useState({procedimento:"",competencia_programacao:competencia,
   vigencia_inicio:"",vigencia_fim:"",valor_federal_unitario:"",
   documento_sei:"",link_sei:"",fundamento:""});
 const [ato,setAto]=useState({aba:"",norma:"",fundamento:"",documento_sei:""});
 const fpo=useQuery({queryKey:["eletivas-fpo-programacoes",id],queryFn:async()=>{
   const {data,error}=await supabase.from("eletivas_fpo_programacoes")
     .select("*").eq("competencia_id",id)
     .order("registrado_em",{ascending:false});
   if(error)throw error;return data??[];
 }});
 const atos=useQuery({queryKey:["eletivas-atos-especiais",id],queryFn:async()=>{
   const {data,error}=await supabase.from("eletivas_atos_especiais")
     .select("*").eq("competencia_id",id).order("registrado_em",{ascending:false});
   if(error)throw error;return data??[];
 }});
 const salvar=useMutation({mutationFn:async()=>{
   if(!/^\d{9}$/.test(form.procedimento))throw Error("Informe o código SIGTAP com 9 dígitos.");
   if(!/^(0[1-9]|1[0-2])\/\d{4}$/.test(form.competencia_programacao))
     throw Error("Informe a competência da programação em MM/AAAA.");
   const valor=Number(form.valor_federal_unitario.replace(/\./g,"").replace(",","."));
   if(!Number.isFinite(valor)||valor<0)throw Error("Valor federal unitário inválido.");
   if(!form.vigencia_inicio||!form.vigencia_fim||form.vigencia_fim<form.vigencia_inicio)
     throw Error("Informe o início e o fim válidos da vigência comprovada.");
   if(form.documento_sei.trim().length<5||!/^https?:\/\//.test(form.link_sei)||
      form.fundamento.trim().length<10)
     throw Error("Informe número e link do documento SEI, além do fundamento da programação.");
   const {error}=await supabase.from("eletivas_fpo_programacoes").insert({
     competencia_id:id,procedimento:form.procedimento,
     competencia_programacao:form.competencia_programacao,
     vigencia_inicio:form.vigencia_inicio,vigencia_fim:form.vigencia_fim,
     valor_federal_unitario:Math.round(valor*100)/100,
     documento_sei:form.documento_sei.trim(),link_sei:form.link_sei.trim(),
     fundamento:form.fundamento.trim(),
   });
   if(error)throw error;
 },onSuccess:()=>{
   toast.success("Documento de programação FPO registrado com trilha fiscal.");
   qc.invalidateQueries({queryKey:["eletivas-fpo-programacoes",id]});
   setForm(x=>({...x,documento_sei:"",link_sei:"",fundamento:""}));
 },onError:(e:Error)=>toast.error(e.message)});
 const cadastrarAto=useMutation({mutationFn:async()=>{
   if(!ato.aba.trim()||!ato.norma.trim())throw Error("Informe a aba e a norma do ato.");
   const {error}=await supabase.from("eletivas_atos_especiais").insert({
     competencia_id:id,aba:ato.aba.trim(),norma:ato.norma.trim(),
     fundamento:ato.fundamento.trim(),regra_comprovada:false,
     documento_sei:ato.documento_sei.trim()||null,
   });
   if(error)throw error;
 },onSuccess:()=>{
   toast.success("Ato especial registrado como pendente de regra comprovada.");
   qc.invalidateQueries({queryKey:["eletivas-atos-especiais",id]});
   setAto({aba:"",norma:"",fundamento:"",documento_sei:""});
 },onError:(e:Error)=>toast.error(e.message)});
 return <div className="space-y-4">
   <section className="rounded-lg border p-4 space-y-3">
     <h3 className="font-semibold">Programação FPO efetivamente comprovada</h3>
     <p className="text-xs text-muted-foreground">
       Este registro é diferente do parâmetro FPO oficial. Use somente documento
       que comprove a programação do prestador no período. Ele não gera crédito
       estadual, repasse ou decisão automaticamente.
     </p>
     {fpo.isError&&<p role="alert" className="text-xs text-destructive">
       Não foi possível consultar a programação. Confira se aplicou a migration da Fase 3.</p>}
     {fpo.data?.length?<div className="space-y-2">{fpo.data.map(r=>
       <div key={r.id} className="rounded-md bg-muted/20 border p-3 text-xs">
         <p><strong>Procedimento {r.procedimento}</strong> · {r.competencia_programacao} ·
           {" "}{reais(cent(r.valor_federal_unitario))}/un.</p>
         <p>Vigência: {r.vigencia_inicio} a {r.vigencia_fim}</p>
         <a className="underline text-primary" href={r.link_sei} target="_blank"
           rel="noopener noreferrer">Documento SEI {r.documento_sei}</a>
         <p className="mt-1 text-muted-foreground">{r.fundamento}</p>
       </div>)}</div>:
       <p className="text-xs text-muted-foreground">
         Nenhuma evidência de programação efetiva foi registrada nesta competência.</p>}
     {podeEditar&&<div className="space-y-3 border-t pt-3">
       <h4 className="text-sm font-semibold">Registrar prova documental</h4>
       <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
         <label className="text-xs">SIGTAP de 9 dígitos
           <Input className="mt-1" value={form.procedimento}
             onChange={e=>setForm(x=>({...x,procedimento:e.target.value}))} placeholder="041501001"/></label>
         <label className="text-xs">Competência da programação
           <Input className="mt-1" value={form.competencia_programacao}
             onChange={e=>setForm(x=>({...x,competencia_programacao:e.target.value}))} placeholder="07/2026"/></label>
         <label className="text-xs">Valor federal efetivamente programado por unidade
           <Input className="mt-1" inputMode="decimal" value={form.valor_federal_unitario}
             onChange={e=>setForm(x=>({...x,valor_federal_unitario:e.target.value}))} placeholder="0,00"/></label>
         <label className="text-xs">Vigência inicial
           <Input className="mt-1" type="date" value={form.vigencia_inicio}
             onChange={e=>setForm(x=>({...x,vigencia_inicio:e.target.value}))}/></label>
         <label className="text-xs">Vigência final
           <Input className="mt-1" type="date" value={form.vigencia_fim}
             onChange={e=>setForm(x=>({...x,vigencia_fim:e.target.value}))}/></label>
         <label className="text-xs">Número do documento SEI
           <Input className="mt-1" value={form.documento_sei}
             onChange={e=>setForm(x=>({...x,documento_sei:e.target.value}))}/></label>
         <label className="text-xs sm:col-span-2">Link SEI do comprovante
           <Input className="mt-1" value={form.link_sei} placeholder="https://..."
             onChange={e=>setForm(x=>({...x,link_sei:e.target.value}))}/></label>
       </div>
       <label className="block text-xs">O que esse documento comprova?
         <Textarea className="mt-1" rows={2} value={form.fundamento}
           onChange={e=>setForm(x=>({...x,fundamento:e.target.value}))}
           placeholder="Descreva a programação e a responsabilidade financeira constatadas"/></label>
       <Button disabled={salvar.isPending} onClick={()=>salvar.mutate()}>
         {salvar.isPending?"Registrando…":"Registrar comprovação FPO"}
       </Button>
     </div>}
   </section>
   <section className="rounded-lg border p-4 space-y-3">
     <h3 className="font-semibold">Atos e deliberações especiais</h3>
     <p className="text-xs text-muted-foreground">
       Reconhecer uma aba do arquivo EC Deliberações não autoriza calcular ou cobrar
       valores. Registre a norma, a competência e a regra específica antes de
       classificar como aplicável. Sem prova, o ato permanece pendente.
     </p>
     {atos.data?.map(a=><div key={a.id} className="rounded-md border p-2 text-xs">
       <strong>{a.norma} · aba {a.aba}</strong>
       <p>{a.regra_comprovada?"Regra documentada":"Aguardando comprovação normativa"}
         {a.documento_sei?" · SEI "+a.documento_sei:""}</p>
       <p className="text-muted-foreground">{a.fundamento}</p>
     </div>)}
     {podeEditar&&<div className="border-t pt-3 space-y-2">
       <div className="grid gap-2 sm:grid-cols-2">
         <label className="text-xs">Aba da planilha
           <Input className="mt-1" value={ato.aba}
             onChange={e=>setAto(x=>({...x,aba:e.target.value}))}/></label>
         <label className="text-xs">Norma ou Deliberação
           <Input className="mt-1" value={ato.norma}
             onChange={e=>setAto(x=>({...x,norma:e.target.value}))}/></label>
         <label className="text-xs">Documento SEI (se houver)
           <Input className="mt-1" value={ato.documento_sei}
             onChange={e=>setAto(x=>({...x,documento_sei:e.target.value}))}/></label>
       </div>
       <Textarea rows={2} placeholder="Relevância e interpretação ainda a verificar"
         value={ato.fundamento} onChange={e=>setAto(x=>({...x,fundamento:e.target.value}))}/>
       <Button variant="outline" disabled={cadastrarAto.isPending}
         onClick={()=>cadastrarAto.mutate()}>Registrar ato para análise fiscal</Button>
     </div>}
   </section>
 </div>;
}
