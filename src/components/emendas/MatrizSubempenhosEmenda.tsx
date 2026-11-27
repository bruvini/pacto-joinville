import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {CheckCircle2,ShieldCheck} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {SeiLink} from "@/components/inputs/SeiLink";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";

export const TIPOS_SUBEMENDA=[
 ["solicitacao_liquidacao","1. Solicitação de Subempenho / Liquidação"],
 ["movimento_liquidacao","2. Aviso de Movimento — Empenho em Liquidação"],
 ["aviso_subempenho","3. Aviso de Movimento — Subempenho"],
] as const;
export type TipoDocumentoEmenda=(typeof TIPOS_SUBEMENDA)[number][0];

export const GRUPO_COMISSAO_SUBEMPENHO="Membro da Comissão de Gestão e Controle de Despesa";
export const GRUPO_FISCAL_SUBEMPENHO="Fiscal";

type Politica=Tables<"emenda_subempenho_matrizes">;

export function MatrizSubempenhosEmenda({
 emendaId,matrizes,podeAdministrar,onAtualizar
}:{
 emendaId:string;matrizes:Politica[];podeAdministrar:boolean;onAtualizar:()=>Promise<void>;
}){
 const [numero,setNumero]=useState("");
 const [link,setLink]=useState("");
 const [justificativa,setJustificativa]=useState("");
 const [mostraFormulario,setMostraFormulario]=useState(false);
 const matrizCompleta=TIPOS_SUBEMENDA.every(([tipo])=>matrizes.some(m=>m.tipo===tipo&&m.ativa));
 const homologar=useMutation({
  mutationFn:async()=>{
   if(!numero.trim()||!/^https:\/\/\S+$/i.test(link.trim())||justificativa.trim().length<10)
    throw Error("Informe número, link HTTPS do processo SEI e justificativa (mínimo 10 caracteres).");
   const {data,error}=await supabase.rpc("emenda_sub_matriz_padrao_homologar",{
    p_emenda:emendaId,p_numero_sei:numero.trim(),
    p_link_sei:link.trim(),p_justificativa:justificativa.trim(),
   });
   if(error)throw error;
   return data;
  },
  onSuccess:async(total)=>{
   setMostraFormulario(false);
   setNumero("");setLink("");setJustificativa("");
   await onAtualizar();
   toast.success(total===0?"Matriz já homologada com esta referência SEI.":
    "Matriz estruturada de Emendas homologada para as três subetapas.");
  },
  onError:(e:Error)=>toast.error(e.message)
 });
 return <section className="space-y-3 rounded-lg border bg-muted/10 p-3"
  aria-label="Regras de assinaturas para os subempenhos">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div className="space-y-1">
    <h3 className="text-sm font-semibold">Assinaturas do subempenho · estrutura existente no PACTO</h3>
    <p className="text-xs text-muted-foreground">
     Mesmas funções operacionais do PVH, com validação administrativa própria para Emendas.
     Não é necessário escrever nomes de grupos ou recriar a matriz por solicitação.
    </p>
   </div>
   <Badge variant={matrizCompleta?"secondary":"outline"}>
    {matrizCompleta?"Três etapas homologadas":"Aguardando homologação"}
   </Badge>
  </div>
  <div className="grid gap-2 md:grid-cols-3">
   {TIPOS_SUBEMENDA.map(([tipo,titulo])=>{
    const politica=matrizes.find(m=>m.tipo===tipo&&m.ativa);
    return <div key={tipo} className="space-y-1 rounded-md border bg-background p-3">
     <div className="flex items-center justify-between gap-2">
      <strong className="text-xs">{titulo}</strong>
      {politica?<CheckCircle2 className="h-4 w-4 text-emerald-600"/>:
       <Badge variant="outline">Pendente</Badge>}
     </div>
     <p className="text-xs text-muted-foreground">
      {tipo==="aviso_subempenho"?
       "Sem conferência adicional de signatários; registrar Aviso e valor efetivo.":
       "Fiscal (opcional) · Membro da Comissão (obrigatório)"}
     </p>
     {tipo==="movimento_liquidacao"&&
      <p className="text-xs">Encaminhamento à SEFAZ.UAF.ADE obrigatório.</p>}
     {politica&&<p className="text-[11px] text-muted-foreground">
      Versão {politica.versao} ·
      <a className="ml-1 text-primary underline" target="_blank" rel="noopener noreferrer"
       href={politica.referencia_link_sei}>Referência SEI {politica.referencia_sei}</a>
     </p>}
     {politica&&(
      JSON.stringify(politica.grupos_obrigatorios)!==
       JSON.stringify(tipo==="aviso_subempenho"?[]:[GRUPO_COMISSAO_SUBEMPENHO])||
      JSON.stringify(politica.grupos_opcionais)!==
       JSON.stringify(tipo==="aviso_subempenho"?[]:[GRUPO_FISCAL_SUBEMPENHO])
     )&&<p className="text-xs text-amber-700">
      Versão anterior com regras diferentes; respeitada para documentos já emitidos.
     </p>}
    </div>;
   })}
  </div>
  {!matrizCompleta&&<p className="text-xs text-muted-foreground">
   A homologação é exigida pelo banco antes de registrar documentos.
   A solicitação de subempenho pode ser criada em rascunho enquanto isso.
  </p>}
  {podeAdministrar&&!mostraFormulario&&
   <Button size="sm" variant="outline" onClick={()=>setMostraFormulario(true)}>
    <ShieldCheck className="mr-1.5 h-4 w-4"/>
    {matrizCompleta?"Homologar revisão da matriz":"Homologar matriz estruturada"}
   </Button>}
  {mostraFormulario&&podeAdministrar&&<div className="space-y-3 rounded-md border bg-card p-3">
   <p className="text-xs font-semibold">Aprovação administrativa das três etapas</p>
   <p className="text-xs text-muted-foreground">
    A referência SEI deve comprovar que as funções e o encaminhamento
    apresentados acima são aplicáveis ao procedimento de Emendas.
    A aprovação é única para esta versão, não para cada documento.
   </p>
   <div className="grid gap-2 md:grid-cols-[210px_minmax(260px,1fr)]">
    <div className="space-y-1">
     <Label htmlFor="emenda-matriz-sei">Número da referência SEI</Label>
     <Input id="emenda-matriz-sei" value={numero} onChange={e=>setNumero(e.target.value)}/>
    </div>
    <div className="min-w-0 space-y-1">
     <Label htmlFor="emenda-matriz-link">Link da referência SEI</Label>
     <SeiLink value={link} onChange={setLink}/>
    </div>
   </div>
   <div className="space-y-1">
    <Label htmlFor="emenda-matriz-just">Justificativa da homologação</Label>
    <Textarea id="emenda-matriz-just" rows={2} value={justificativa}
     onChange={e=>setJustificativa(e.target.value)}
     placeholder="Fundamentação da matriz de funções para as Emendas"/>
   </div>
   <div className="flex flex-wrap gap-2">
    <Button size="sm" disabled={homologar.isPending} onClick={()=>homologar.mutate()}>
     Aprovar regras das três subetapas
    </Button>
    <Button size="sm" variant="ghost" disabled={homologar.isPending}
     onClick={()=>setMostraFormulario(false)}>Cancelar</Button>
   </div>
  </div>}
 </section>;
}
