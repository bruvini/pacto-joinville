import {useEffect} from "react";
import {useMutation} from "@tanstack/react-query";
import {CheckCircle2,LockKeyhole,FileText,Send,WalletCards} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Checkbox} from "@/components/ui/checkbox";
import {FluxoCampoEmenda,documentoValor,type DocumentoFluxo} from "@/components/emendas/FluxoCampoEmenda";
import {FluxoAssinaturasEmenda,assinaturasFluxoCompletas,type AssinaturaFluxo} from "@/components/emendas/FluxoAssinaturasEmenda";
import {brl} from "@/lib/format";
import {supabase} from "@/integrations/supabase/client";
import {exibirCompetenciaISO} from "@/lib/emendas/competencias";
import type {Tables} from "@/integrations/supabase/types";
type Mes=Tables<"emenda_lancamento_meses">;
const sei=(x:string)=>/^https:\/\/\S+$/i.test(x);
const duplo=(d:DocumentoFluxo|undefined,nome:string)=>
 !!documentoValor(d,nome+"_numero").trim()&&sei(documentoValor(d,nome+"_link"));
export function FluxoParcelasEmenda({lancamentoId,meses,competencias,documentos,assinaturas,valorNE,podeEditar,onAtualizar}:{
 lancamentoId:string;meses:Mes[];competencias:Map<string,string>;
 documentos:DocumentoFluxo[];assinaturas:AssinaturaFluxo[];valorNE:number;
 podeEditar:boolean;onAtualizar:()=>Promise<void>;
}){
 return <div className="space-y-3">
  <p className="text-xs text-muted-foreground">
   Cada parcela segue os mesmos subpassos documentais do módulo de Convênios.
   Valores são controles internos; o PACTO não realiza transferências financeiras.
  </p>
  {meses.map((mes,i)=><Parcela key={mes.id} lancamentoId={lancamentoId}
   mes={mes} ordem={i+1} competencia={competencias.get(mes.competencia_id)??""}
   documento={documentos.find(d=>d.contexto==="lib:"+mes.competencia_id)}
   assinaturas={assinaturas} valorNE={valorNE} documentos={documentos}
   podeEditar={podeEditar} onAtualizar={onAtualizar}/>)}
 </div>;
}
function Parcela({lancamentoId,mes,ordem,competencia,documento,assinaturas,valorNE,documentos,podeEditar,onAtualizar}:{
 lancamentoId:string;mes:Mes;ordem:number;competencia:string;documento?:DocumentoFluxo;
 assinaturas:AssinaturaFluxo[];valorNE:number;documentos:DocumentoFluxo[];
 podeEditar:boolean;onAtualizar:()=>Promise<void>;
}){
 const ctx="lib:"+mes.competencia_id;
 const doDoc=(campo:string)=>documentoValor(documento,campo);
 const compOk=duplo(documento,"comprovante");
 const executado=Number(doDoc("valor_executado")||0);
 const totalOutrasParcelas=documentos.filter(d=>d.contexto.startsWith("lib:")&&d.id!==documento?.id)
  .reduce((n,d)=>n+Number(documentoValor(d,"valor_executado")||0),0);
 const maximo=Math.max(0,valorNE-totalOutrasParcelas);
 const executadoOk=executado>0&&executado<=maximo;
 const solicitacaoOk=duplo(documento,"solicitacao");
 const assinaturasDoc=assinaturas.filter(a=>a.documento_id===documento?.id);
 const sigOk=assinaturasFluxoCompletas("liberacao",assinaturasDoc);
 const enviado=!!documento?.enviado_em;
 const pagamentoOk=duplo(documento,"aviso")&&duplo(documento,"programacao")&&duplo(documento,"pagamento")&&!!doDoc("data_pagamento");
 const pago=!!documento?.pagamento_id;
 const enviar=useMutation({mutationFn:async()=>{
  const r=await supabase.rpc("emenda_fluxo_enviar",{p_documento:documento!.id});
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Envio à SEFAZ.UAF.ADE registrado.");},
 onError:(e:Error)=>toast.error(e.message)});
 const concluir=useMutation({mutationFn:async()=>{
  const r=await supabase.rpc("emenda_fluxo_finalizar_pagamento",{p_documento:documento!.id});
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Bloco de pagamento documentado.");},
 onError:(e:Error)=>toast.error(e.message)});
 useEffect(()=>{
  if(documento?.id&&enviado&&!pago&&pagamentoOk&&!concluir.isPending&&!concluir.isSuccess)concluir.mutate();
 },[documento?.id,enviado,pago,pagamentoOk,concluir.isPending,concluir.isSuccess]);
 const campo=(nome:string,rotulo:string,tipo:"texto"|"link"|"moeda"|"data"="texto",habilitado=true)=>
  <FluxoCampoEmenda key={nome} lancamentoId={lancamentoId} contexto={ctx}
   documento={documento} campo={nome} rotulo={rotulo} tipo={tipo}
   editavel={podeEditar&&habilitado&&!pago} onAtualizar={onAtualizar}/>;
 const par=(prefixo:string,rotulo:string,habilitado=true)=><div className="grid gap-2 sm:grid-cols-[180px_minmax(230px,1fr)]">
  {campo(prefixo+"_numero","Número SEI — "+rotulo,"texto",habilitado)}
  {campo(prefixo+"_link","Link SEI — "+rotulo,"link",habilitado)}
 </div>;
 return <section className="rounded-lg border bg-card">
  <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
   <div><h4 className="text-sm font-semibold">{exibirCompetenciaISO(competencia)} · Parcela {mes.parcela_convenio}</h4>
    <p className="text-xs text-muted-foreground">Competência {ordem} de {mesesPlaceholder(mes,ordem)} ·
     Valor executado: {brl(executado)}</p></div>
   <Badge variant={pago?"default":"outline"}>{pago?"Pagamento concluído":enviado?"Aguardando comprovantes de pagamento":"Em andamento"}</Badge>
  </div>
  <div className="space-y-4 p-4">
   <div className="space-y-2">
    <h5 className="flex items-center gap-2 text-xs font-semibold">
     {compOk?<CheckCircle2 className="h-4 w-4 text-emerald-600"/>:<FileText className="h-4 w-4"/>}
     1. Documento comprobatório
    </h5>
    {par("comprovante","documento comprobatório",!enviado)}
   </div>
   {compOk&&<div className="space-y-2 border-t pt-3">
    <h5 className="text-xs font-semibold">2. Valor executado</h5>
    <div className="max-w-sm">{campo("valor_executado","Valor a liberar (R$)","moeda",!enviado)}</div>
    <p className="text-[11px] text-muted-foreground">Limite para esta parcela considerando as demais: {brl(maximo)}.</p>
    {executado>maximo&&<p role="alert" className="rounded-md border border-amber-400/40 bg-amber-50 p-2 text-xs text-amber-900">
     Valor executado acima do saldo empenhado disponível. A liberação não será permitida.</p>}
   </div>}
   {executadoOk&&compOk&&<div className="space-y-3 border-t pt-3">
    <h5 className="text-xs font-semibold">3. Solicitação de liberação de recursos</h5>
    {par("solicitacao","solicitação de liberação",!enviado)}
    {solicitacaoOk&&documento?.id&&<FluxoAssinaturasEmenda documentoId={documento.id}
     tipo="liberacao" assinaturas={assinaturasDoc} editavel={podeEditar&&!enviado}
     onAtualizar={onAtualizar}/>}
    {solicitacaoOk&&sigOk&&<div className="rounded-md border bg-muted/10 p-3 text-xs">
     {enviado?<p className="flex items-center gap-2 text-emerald-700">
      <CheckCircle2 className="h-4 w-4"/> Enviado à SEFAZ.UAF.ADE em {new Date(documento!.enviado_em!).toLocaleString("pt-BR")}.</p>:
      <label className="flex items-center gap-2">
       <Checkbox checked={false} disabled={!podeEditar||enviar.isPending}
        onCheckedChange={v=>{if(v===true)enviar.mutate();}}/>
       Confirmo o envio à SEFAZ.UAF.ADE.</label>}
    </div>}
   </div>}
   {enviado&&<div className="space-y-3 border-t pt-3">
    <h5 className="flex items-center gap-2 text-xs font-semibold">
     <WalletCards className="h-4 w-4"/>4. Bloco interno de pagamento
    </h5>
    {par("aviso","Aviso de Movimento · Subempenho",!pago)}
    {par("programacao","Programação de Pagamento",!pago)}
    {par("pagamento","Comprovante de Pagamento",!pago)}
    <div className="max-w-xs">{campo("data_pagamento","Data do pagamento","data",!pago)}</div>
    {concluir.isPending&&<p className="text-xs text-muted-foreground">Registrando comprovantes e conciliando a parcela…</p>}
    {pago&&<p className="flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4"/>
     Pagamento documentado em {brl(executado)}.</p>}
   </div>}
   {!compOk&&<p className="flex items-center gap-2 text-xs text-muted-foreground">
    <LockKeyhole className="h-3.5 w-3.5"/>Os demais campos são liberados após o documento comprobatório.</p>}
  </div>
 </section>;
}
function mesesPlaceholder(m:Mes,n:number){return m.liberacoes_minimas>0?"execução prevista":"execução"; }
