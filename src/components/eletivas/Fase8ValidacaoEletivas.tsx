import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {ShieldAlert,ShieldCheck,FileCheck2} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/checkbox";
import type {Tables,Json} from "@/integrations/supabase/types";
import {serializarGolden,type GoldenEC,type GoldenFonte} from "@/lib/eletivas/goldenMaster";
import {PERFIS_FASE8,TESTES_FASE8,perfilDaCompetencia} from "@/lib/eletivas/fase8Perfis";

type Comp=Tables<"eletivas_competencias">;
const sha256=async(txt:string)=>{
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(txt));
 return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
};
export function Fase8ValidacaoEletivas({comp,golden,atual,comparacaoOK,fontes}:{
 comp:Comp;golden:GoldenEC|null;atual:GoldenEC;
 comparacaoOK:boolean;fontes:GoldenFonte[];
}){
 const qc=useQueryClient();
 const [testes,setTestes]=useState<Record<string,boolean>>({});
 const [sei,setSei]=useState("");
 const [justificativa,setJustificativa]=useState("");
 const [declara,setDeclara]=useState(false);
 const perfil=perfilDaCompetencia(comp.competencia);
 const pronto=useQuery({queryKey:["ec-fase8-prontidao",comp.prestador_id],
   retry:false,queryFn:async()=>{
    const {data,error}=await supabase.rpc("ec_fase8_prontidao",
     {p_prestador:comp.prestador_id});if(error)throw error;
    return data&&typeof data==="object"&&!Array.isArray(data)?
     data as Record<string,unknown>:{};
   }});
 const registros=useQuery({queryKey:["ec-fase8-validacoes",comp.prestador_id],retry:false,
   queryFn:async()=>{
    const {data,error}=await supabase.from("eletivas_fase8_validacoes")
     .select("id,competencia_id,perfil,execucao_id,validado_em,documento_sei,validacao_fiscal_declarada")
     .eq("prestador_id",comp.prestador_id).order("validado_em",{ascending:false});
    if(error)throw error;return data??[];
   }});
 const okTodos=TESTES_FASE8.every(([k])=>testes[k]===true);
 const registrar=useMutation({mutationFn:async()=>{
  if(!perfil||!comparacaoOK||!golden||!comp.ec_execucao_id||!fontes.length)
   throw Error("Sem Golden HTML compatível e manifesto completo: homologação bloqueada.");
  if(!okTodos||!declara||sei.trim().length<7||justificativa.trim().length<30)
   throw Error("Confira os dez testes, informe documento SEI e fundamentação fiscal.");
  const [hashHtml,hashReact,hashManifesto]=await Promise.all([
   sha256(serializarGolden(golden)),sha256(serializarGolden(atual)),
   sha256(JSON.stringify([...fontes].sort((a,b)=>a.categoria.localeCompare(b.categoria))))
  ]);
  const flags=Object.fromEntries(TESTES_FASE8.map(([k])=>[k,testes[k]===true])) as Json;
  const {error}=await supabase.rpc("ec_fase8_registrar",{
   p_comp:comp.id,p_perfil:perfil,p_html_sha:hashHtml,p_react_sha:hashReact,
   p_manifesto_sha:hashManifesto,p_financeiras:0,p_funcionais:0,
   p_verificacoes:flags,p_documento_sei:sei.trim(),
   p_justificativa:justificativa.trim(),p_declaracao:true
  });
  if(error)throw error;
 },onSuccess:()=>{
  toast.success("Declaração de homologação registrada. Isso NÃO libera substituição automática.");
  qc.invalidateQueries({queryKey:["ec-fase8-prontidao",comp.prestador_id]});
  qc.invalidateQueries({queryKey:["ec-fase8-validacoes",comp.prestador_id]});
  setDeclara(false);
 },onError:(e:Error)=>toast.error(e.message)});
 return <section className="rounded-xl border p-4 space-y-4">
  <div className="flex gap-2 items-start">
   <ShieldAlert className="mt-1 h-5 w-5 text-amber-700"/>
   <div><h3 className="text-sm font-semibold">Fase 8 · Portão de homologação e implantação</h3>
    <p className="text-xs text-muted-foreground mt-1">
     A substituição operacional NÃO está autorizada pelo teste local.
     É obrigatório comparar três competências reais e obter validação fiscal expressa,
     com referência documental. Não há assinatura ou autenticação SEI automática.
    </p></div>
  </div>
  <div className="grid gap-2 sm:grid-cols-3">
   {PERFIS_FASE8.map(p=>{
    const registrado=registros.data?.find(x=>x.perfil===p.id);
    const valido=pronto.data?.[p.id==="abril_2026"?"abril":
     p.id==="julho_2026"?"julho":"agosto_ou_posterior"]===true;
    return <div key={p.id} className="rounded-lg border p-3 space-y-1">
      <p className="text-xs font-semibold">{p.label}</p>
      <p className="text-xs text-muted-foreground">{p.desc}</p>
      <p className="text-xs font-medium">{valido?"Validação fiscal registrada e execução vigente":
       registrado?"Registro existente; verificar reprocessamento ou condições":"Aguardando evidência oficial"}</p>
      {registrado&&<p className="text-xs text-muted-foreground">
       Documento declarado: {registrado.documento_sei}</p>}
    </div>;
   })}
  </div>
  {pronto.isError&&<p role="alert" className="text-xs text-red-700">
   Controle institucional de liberação não disponível.
   Execute a migration da Fase 8 antes de registrar homologações.
  </p>}
  <div className="rounded-lg bg-muted/20 p-3 text-xs space-y-1">
   <strong>Prontidão institucional: {String(pronto.data?.perfis_validos??0)} de 3 perfis válidos</strong>
   <p>Autorização administrativa:
    <strong> {pronto.data?.autorizacao_administrativa===true?
      "Registrada (implantação ainda não automática)":"Não concedida"}</strong>
   </p>
   <p>Qualquer reprocessamento que altere o identificador da execução
    invalida a prontidão da competência. A autorização administrativa
    não efetua deploy nem escreve valores no convênio.</p>
  </div>
  {perfil?<div className="space-y-3 border-t pt-3">
   <div><h4 className="text-sm font-semibold">Validar perfil {comp.competencia}</h4>
    <p className="text-xs text-muted-foreground">
     Comparação Golden Master HTML × React:
     <strong> {comparacaoOK?"sem diferenças detectadas neste contrato":
       "não aprovada ou ainda não executada"}</strong>.
     Os testes abaixo são declarações do fiscal, nunca aprovações automáticas.
    </p>
   </div>
   <div className="grid gap-3 sm:grid-cols-2">
    {TESTES_FASE8.map(([key,label])=><label key={key}
     className="flex gap-2 items-start rounded-md border p-2 text-xs cursor-pointer">
      <Checkbox checked={testes[key]===true}
       onCheckedChange={v=>setTestes(x=>({...x,[key]:v===true}))}/>
      <span>{label}</span></label>)}
   </div>
   <Input aria-label="Documento SEI da homologação fiscal"
     placeholder="Número do documento ou processo SEI da homologação"
     value={sei} onChange={e=>setSei(e.target.value)}/>
   <Textarea aria-label="Fundamentação da homologação"
     value={justificativa} onChange={e=>setJustificativa(e.target.value)}
     placeholder="Fundamente como cada arquivo oficial, relatório e fluxo foi confrontado (mínimo 30 caracteres)"
     rows={3}/>
   <label className="flex gap-2 text-xs items-start">
    <Checkbox checked={declara} onCheckedChange={v=>setDeclara(v===true)}/>
    <span>Declaro que os testes indicados foram efetivamente realizados, sem divergências
     financeiras ou funcionais não justificadas, e que verifiquei a evidência SEI.
     Este registro não equivale a assinatura eletrônica.</span>
   </label>
   <Button size="sm" variant="outline" disabled={!comparacaoOK||!okTodos||
    !declara||!perfil||registrar.isPending||!!pronto.isError||
    sei.trim().length<7||justificativa.trim().length<30}
    onClick={()=>registrar.mutate()}>
    <FileCheck2 className="mr-2 h-4 w-4"/>Registrar validação fiscal desta competência
   </Button>
  </div>:<p className="text-xs">
   Esta competência não pertence a um dos três perfis iniciais de homologação.</p>}
 </section>;
}
