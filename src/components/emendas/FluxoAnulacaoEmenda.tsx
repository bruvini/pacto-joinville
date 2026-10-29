import {useEffect,useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {toast} from "sonner";
import {CheckCircle2,LockKeyhole} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Checkbox} from "@/components/ui/checkbox";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";
import {SeiLink} from "@/components/inputs/SeiLink";
import {FluxoCampoEmenda,documentoValor,type DocumentoFluxo} from "@/components/emendas/FluxoCampoEmenda";
import {FluxoAssinaturasEmenda,assinaturasFluxoCompletas,type AssinaturaFluxo} from "@/components/emendas/FluxoAssinaturasEmenda";
import {brl} from "@/lib/format";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
type Anulacao=Tables<"emenda_anulacoes">;
type Conciliacao=Tables<"emenda_conciliacoes_ne">;
export function FluxoAnulacaoEmenda({lancamentoId,documentos,assinaturas,anulacoes,
 conciliacao,valorNE,valorLiberado,competenciasTotal,podeEditar,onAtualizar}:{
 lancamentoId:string;documentos:DocumentoFluxo[];assinaturas:AssinaturaFluxo[];
 anulacoes:Anulacao[];conciliacao?:Conciliacao;valorNE:number;valorLiberado:number;
 competenciasTotal:number;podeEditar:boolean;onAtualizar:()=>Promise<void>;
}){
 const [modalConclusao,setModalConclusao]=useState(false);
 const [numeroConclusao,setNumeroConclusao]=useState("");
 const [linkConclusao,setLinkConclusao]=useState("");
 const doc=documentos.find(d=>d.contexto==="anulacao");
 const sigs=assinaturas.filter(s=>s.documento_id===doc?.id);
 const completas=assinaturasFluxoCompletas("anulacao",sigs);
 const parcelasCompletas=documentos.filter(d=>d.contexto.startsWith("lib:")&&!!d.pagamento_id).length===competenciasTotal&&competenciasTotal>0;
 const totalAnulado=anulacoes.reduce((n,a)=>n+Number(a.valor),0);
 const residual=Math.max(0,Math.round((valorNE-valorLiberado-totalAnulado)*100)/100);
 const numero=!!documentoValor(doc,"solicitacao_numero");
 const link=/^https:\/\//i.test(documentoValor(doc,"solicitacao_link"));
 const aviso=!!documentoValor(doc,"aviso_numero")&&/^https:\/\//i.test(documentoValor(doc,"aviso_link"));
 const enviados=!!doc?.enviado_em;
 const enviar=useMutation({mutationFn:async()=>{
  const r=await supabase.rpc("emenda_fluxo_enviar",{p_documento:doc!.id});
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Envio da anulação confirmado.");},
 onError:(e:Error)=>toast.error(e.message)});
 const finalizar=useMutation({mutationFn:async()=>{
  const r=await supabase.rpc("emenda_fluxo_finalizar_anulacao",{p_documento:doc!.id});
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Anulação residual documentada.");},
 onError:(e:Error)=>toast.error(e.message)});
 useEffect(()=>{
  if(doc?.id&&enviados&&aviso&&!doc.anulacao_id&&!finalizar.isPending&&!finalizar.isSuccess)finalizar.mutate();
 },[doc?.id,enviados,aviso,doc?.anulacao_id,finalizar.isPending,finalizar.isSuccess]);
 const concluir=useMutation({mutationFn:async()=>{
  const r=await supabase.rpc("emenda_conciliar_encerrar_ne",{p_lancamento:lancamentoId,
   p_numero_sei:numeroConclusao.trim(),p_link_sei:linkConclusao.trim()});if(r.error)throw r.error;
 },onSuccess:async()=>{setModalConclusao(false);await onAtualizar();toast.success("Nota conciliada e encerrada.");},
 onError:(e:Error)=>toast.error(e.message)});
 const campo=(campo:string,rotulo:string,tipo:"texto"|"link")=>
  <FluxoCampoEmenda lancamentoId={lancamentoId} contexto="anulacao" documento={doc}
   campo={campo} rotulo={rotulo} tipo={tipo}
   editavel={podeEditar&&!enviados} onAtualizar={onAtualizar}/>;
 const ultimoCampo=(campo:string,rotulo:string,tipo:"texto"|"link")=>
  <FluxoCampoEmenda lancamentoId={lancamentoId} contexto="anulacao" documento={doc}
   campo={campo} rotulo={rotulo} tipo={tipo}
   editavel={podeEditar&&!doc?.anulacao_id} onAtualizar={onAtualizar}/>;
 if(!parcelasCompletas)return <div className="flex items-center gap-2 rounded-lg border bg-muted/10 p-4 text-xs text-muted-foreground">
  <LockKeyhole className="h-4 w-4"/>A anulação e o encerramento serão liberados quando todas as parcelas tiverem pagamento documentado.</div>;
 return <section className="space-y-3 rounded-lg border bg-card p-4">
  <h3 className="text-sm font-semibold">Anulação residual e encerramento</h3>
  {(residual>0||!!doc?.anulacao_id)&&<div className="space-y-3">
   <p className="rounded-md border border-amber-400/30 bg-amber-50 p-3 text-sm text-amber-900">
    {residual>0?"Há":"Foi registrado"} <strong>{brl(residual>0?residual:totalAnulado)}</strong>
    {residual>0?" a anular (Empenhado − Liberado − Anulações anteriores).":" em anulação de saldo residual."}</p>
   <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
    {campo("solicitacao_numero","Número SEI — solicitação de anulação","texto")}
    {campo("solicitacao_link","Link SEI — solicitação de anulação","link")}
   </div>
   {numero&&link&&doc?.id&&<FluxoAssinaturasEmenda documentoId={doc.id}
    tipo="anulacao" assinaturas={sigs} editavel={podeEditar&&!enviados} onAtualizar={onAtualizar}/>}
   {numero&&link&&completas&&<div className="rounded-md border p-3 text-xs">
    {enviados?<p className="flex items-center gap-2 text-emerald-700">
     <CheckCircle2 className="h-4 w-4"/>Enviado à SEFAZ.UCG.AEO em {new Date(doc!.enviado_em!).toLocaleString("pt-BR")}.</p>:
     <label className="flex items-center gap-2"><Checkbox checked={false} disabled={!podeEditar||enviar.isPending}
      onCheckedChange={v=>{if(v===true)enviar.mutate();}}/>Confirmo o envio à SEFAZ.UCG.AEO.</label>}
   </div>}
   {enviados&&<div className="grid gap-3 sm:grid-cols-[180px_1fr] border-t pt-3">
    {ultimoCampo("aviso_numero","Número SEI — Anulação (Aviso de Movimento)","texto")}
    {ultimoCampo("aviso_link","Link SEI — Anulação (Aviso de Movimento)","link")}
   </div>}
   {finalizar.isPending&&<p className="text-xs text-muted-foreground">Registrando anulação documental…</p>}
  </div>}
  {residual===0&&<p className="flex items-center gap-2 text-xs text-emerald-700">
   <CheckCircle2 className="h-4 w-4"/>Sem saldo residual pendente de anulação.</p>}
  {residual===0&&<Button disabled={!podeEditar||!!conciliacao}
   onClick={()=>setModalConclusao(true)}>{conciliacao?"Lançamento concluído":"Concluir lançamento"}</Button>}
  <Dialog open={modalConclusao} onOpenChange={setModalConclusao}>
   <DialogContent><DialogHeader><DialogTitle>Concluir e conciliar a Nota de Empenho</DialogTitle>
    <DialogDescription>A conclusão exige documento SEI de conferência e registra o encerramento financeiro interno.
     Nenhuma operação é executada na SEFAZ.</DialogDescription></DialogHeader>
    <div className="grid gap-3"><label className="text-xs">Número SEI da conferência
     <Input value={numeroConclusao} onChange={e=>setNumeroConclusao(e.target.value)}/></label>
     <label className="text-xs">Link SEI da conferência
     <SeiLink value={linkConclusao} onChange={setLinkConclusao}/></label></div>
    <DialogFooter><Button variant="outline" onClick={()=>setModalConclusao(false)}>Cancelar</Button>
     <Button disabled={concluir.isPending||!numeroConclusao.trim()||!/^https:\/\//i.test(linkConclusao)}
      onClick={()=>concluir.mutate()}>Confirmar conclusão</Button></DialogFooter>
   </DialogContent>
  </Dialog>
 </section>;
}
