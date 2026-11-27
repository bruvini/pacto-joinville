import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {toast} from "sonner";
import {CheckCircle2,LockKeyhole,FileCheck2,AlertTriangle,WalletCards} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/checkbox";
import {Badge} from "@/components/ui/badge";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";
import {SeiLink} from "@/components/inputs/SeiLink";
import {FluxoCampoEmenda,documentoValor,type DocumentoFluxo} from "@/components/emendas/FluxoCampoEmenda";
import {FluxoAssinaturasEmenda,assinaturasFluxoCompletas,type AssinaturaFluxo} from "@/components/emendas/FluxoAssinaturasEmenda";
import {brl} from "@/lib/format";
import {exibirCompetenciaISO} from "@/lib/emendas/competencias";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";

type Conciliacao=Tables<"emenda_conciliacoes_ne">;
type Ne=Tables<"emenda_f_ne_painel">;
type Competencia=Tables<"emenda_f_competencias_painel">;
const nomeSituacao:Record<string,string>={
 sem_execucao:"Sem execução documentada",
 executada_novo:"Execução e pagamento conciliados",
 executada_legado:"Execução legada documentada",
 pendente:"Execução pendente",
 inconsistente:"Dados incompatíveis",
};
const textoTipo=(nome:string)=>nomeSituacao[nome]??nome;

export function FluxoAnulacaoEmenda({
 lancamentoId,documentos,assinaturas,conciliacao,ne,competencias,podeEditar,onAtualizar
}:{
 lancamentoId:string;documentos:DocumentoFluxo[];assinaturas:AssinaturaFluxo[];
 conciliacao?:Conciliacao;ne?:Ne;competencias:Competencia[];
 podeEditar:boolean;onAtualizar:()=>Promise<void>;
}){
 const [modalConclusao,setModalConclusao]=useState(false);
 const [numeroConclusao,setNumeroConclusao]=useState("");
 const [linkConclusao,setLinkConclusao]=useState("");
 const [semExec,setSemExec]=useState<Competencia|null>(null);
 const [motivoSem,setMotivoSem]=useState("");
 const [numeroSem,setNumeroSem]=useState("");
 const [linkSem,setLinkSem]=useState("");
 const doc=documentos.find(d=>d.contexto==="anulacao");
 const sigs=assinaturas.filter(s=>s.documento_id===doc?.id);
 const completas=assinaturasFluxoCompletas("anulacao",sigs);
 const residual=ne?.saldo_a_anular_fechamento;
 const anulavel=ne?.saldo_disponivel_anular;
 const temResidual=residual!==null&&residual!==undefined&&residual>0;
 const precisaReverDistribuicao=temResidual&&(anulavel===null||anulavel===undefined||anulavel<residual-0.005);
 const numero=!!documentoValor(doc,"solicitacao_numero");
 const link=/^https:\/\//i.test(documentoValor(doc,"solicitacao_link"));
 const aviso=!!documentoValor(doc,"aviso_numero")&&/^https:\/\//i.test(documentoValor(doc,"aviso_link"));
 const enviados=!!doc?.enviado_em;
 const podeAnular=podeEditar&&!conciliacao&&temResidual&&!precisaReverDistribuicao;
 const enviar=useMutation({mutationFn:async()=>{
  if(!doc?.id)throw Error("Registre o documento da solicitação.");
  const r=await supabase.rpc("emenda_fluxo_enviar",{p_documento:doc.id});
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Encaminhamento da anulação registrado.");},
 onError:(e:Error)=>toast.error(e.message)});
 const finalizar=useMutation({mutationFn:async()=>{
  if(!doc?.id)throw Error("Documento de anulação não localizado.");
  const r=await supabase.rpc("emenda_fluxo_finalizar_anulacao",{p_documento:doc.id});
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Anulação residual registrada com Aviso SEI.");},
 onError:(e:Error)=>toast.error(e.message)});
 const concluir=useMutation({mutationFn:async()=>{
  const r=await supabase.rpc("emenda_conciliar_encerrar_ne",{
   p_lancamento:lancamentoId,p_numero_sei:numeroConclusao.trim(),
   p_link_sei:linkConclusao.trim()
  });
  if(r.error)throw r.error;
 },onSuccess:async()=>{setModalConclusao(false);await onAtualizar();toast.success("NE conciliada e encerrada.");},
 onError:(e:Error)=>toast.error(e.message)});
 const registrarSem=useMutation({mutationFn:async()=>{
  if(!semExec?.competencia_id)throw Error("Selecione competência.");
  if(motivoSem.trim().length<10||!numeroSem.trim()||!/^https:\/\//i.test(linkSem))
   throw Error("Informe justificativa, número e link SEI do encerramento.");
  const r=await supabase.rpc("emenda_encerrar_competencia_sem_execucao",{
   p_lancamento:lancamentoId,p_competencia:semExec.competencia_id,
   p_justificativa:motivoSem.trim(),p_numero:numeroSem.trim(),p_link:linkSem.trim()
  });
  if(r.error)throw r.error;
 },onSuccess:async()=>{
  setSemExec(null);setMotivoSem("");setNumeroSem("");setLinkSem("");
  await onAtualizar();toast.success("Competência encerrada sem execução, com documento e histórico.");
 },onError:(e:Error)=>toast.error(e.message)});
 const campo=(chave:string,rotulo:string,tipo:"texto"|"link")=>
  <FluxoCampoEmenda lancamentoId={lancamentoId} contexto="anulacao" documento={doc}
   campo={chave} rotulo={rotulo} tipo={tipo}
   editavel={podeAnular&&!enviados} onAtualizar={onAtualizar}/>;
 const ultimoCampo=(chave:string,rotulo:string,tipo:"texto"|"link")=>
  <FluxoCampoEmenda lancamentoId={lancamentoId} contexto="anulacao" documento={doc}
   campo={chave} rotulo={rotulo} tipo={tipo}
   editavel={podeAnular&&!doc?.anulacao_id} onAtualizar={onAtualizar}/>;
 const pendencias=[
  {nome:"Competências sem encerramento válido",valor:ne?.competencias_pendentes},
  {nome:"Subempenhos ainda em processamento",valor:ne?.subempenhos_pendentes},
  {nome:"Pagamentos de subempenho não conciliados",valor:ne?.subempenhos_nao_conciliados},
  {nome:"Documentos operacionais pendentes",valor:ne?.documentos_pendentes},
 ];
 const statusFechado=!!conciliacao||!!ne?.conciliada;
 return <section className="space-y-4 rounded-lg border bg-card p-4">
  <header>
   <h3 className="flex items-center gap-2 text-sm font-semibold">
    <FileCheck2 className="h-4 w-4"/>Anulação residual e conciliação da NE
   </h3>
   <p className="mt-1 text-xs text-muted-foreground">
    A anulação protege compromissos e distribuições. A conciliação é uma verificação
    posterior: exige competências resolvidas, documentos e pagamentos devidamente conferidos.
   </p>
  </header>
  {!ne&&<p role="alert" className="text-xs text-destructive">
   Diagnóstico financeiro da NE indisponível. Confirme a instalação da Fase F.
  </p>}
  {ne&&<>
   <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
    <Indicador titulo="NE líquida de anulações" valor={ne.ne_liquida}/>
    <Indicador titulo="Compromissos efetivos" valor={
     Number(ne.liberacoes_legadas??0)>0?ne.liberacoes_legadas:ne.compromissos_novos}/>
    <Indicador titulo="Saldo livre para anular" valor={ne.saldo_disponivel_anular}/>
    <Indicador titulo="Residual a anular no fechamento" valor={ne.saldo_a_anular_fechamento}/>
   </div>
   {Number(ne.saldo_de_pagamentos_pendentes??0)>0&&<p className="rounded border border-amber-400/40 p-3 text-xs text-amber-900">
    Ainda há {brl(Number(ne.saldo_de_pagamentos_pendentes))} de compromissos sem
    pagamento líquido comprovado. Isso impede a conciliação, mas não deve ser
    confundido com saldo financeiro livre para anular.
   </p>}
   {ne.modelo_financeiro==="conflito_entre_modelos"&&<p role="alert"
    className="rounded border border-destructive/50 p-3 text-xs text-destructive">
    Execução em modelos financeiros conflitantes. Regularização necessária antes
    de anular ou conciliar a NE.
   </p>}
  </>}

  <div className="space-y-2 border-t pt-3">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <h4 className="text-xs font-semibold">Situação de cada competência</h4>
    <Badge variant="outline">{ne?.competencias_executadas??0} executadas ·
     {ne?.competencias_sem_execucao??0} sem execução · {ne?.competencias_pendentes??0} pendentes
    </Badge>
   </div>
   {competencias.map(c=>{
    const podeSem=!statusFechado&&podeEditar&&
     c.situacao_competencia==="pendente"&&!c.declarada_sem_execucao&&
     Number(c.valor_distribuido??0)===0&&Number(c.subempenhos_ativos??0)===0&&
     Number(c.liberado_legado??0)===0&&Number(c.pago_legado??0)===0&&
     Number(c.documentos_legados??0)===0;
    return <div key={c.competencia_id}
     className="flex flex-wrap items-center justify-between gap-2 rounded border bg-muted/10 p-3">
     <div className="space-y-1">
      <p className="text-xs font-medium">{exibirCompetenciaISO(c.competencia??"")}
       {" · "}Parcela {c.parcela_convenio}</p>
      <p className="text-[11px] text-muted-foreground">
       {textoTipo(c.situacao_competencia??"pendente")} ·
       Compromissos {brl(Number(c.liberado_legado??0)+Number(c.compromissos_novos??0))}
       {" · "}Pago líquido {brl(Number(c.pago_legado??0)+Number(c.pago_liquido_novo??0))}
      </p>
      {c.declarada_sem_execucao&&c.encerramento_link_sei&&
       <a href={c.encerramento_link_sei} target="_blank" rel="noopener noreferrer"
        className="text-[11px] text-primary underline">SEI {c.encerramento_numero_sei}</a>}
     </div>
     <div className="flex flex-wrap items-center gap-2">
      <Badge variant={c.situacao_competencia==="pendente"||
       c.situacao_competencia==="inconsistente"?"outline":"secondary"}>
       {textoTipo(c.situacao_competencia??"pendente")}
      </Badge>
      {podeSem&&<Button size="sm" variant="outline" onClick={()=>setSemExec(c)}>
       Encerrar sem execução
      </Button>}
     </div>
    </div>;
   })}
   {!competencias.length&&<p className="text-xs text-muted-foreground">
    Não há competências vinculadas à NE. Não é possível concluir o lançamento.
   </p>}
  </div>

  <div className="space-y-3 border-t pt-3">
   <h4 className="text-xs font-semibold">Anulação do saldo não comprometido</h4>
   {temResidual&&<p className="rounded border bg-muted/10 p-3 text-xs">
    Residual financeiro para o fechamento: <strong>{brl(Number(residual))}</strong>.
    Saldo atualmente livre, consideradas as distribuições: <strong>{brl(Number(anulavel??0))}</strong>.
   </p>}
   {precisaReverDistribuicao&&<p role="note"
    className="flex gap-2 rounded border border-amber-400/40 p-3 text-xs text-amber-900">
    <AlertTriangle className="h-4 w-4 shrink-0"/>
    Antes da anulação final, ajuste ou cancele a distribuição não comprometida
    no painel da NE. A distribuição não pode ser ignorada nem anulada automaticamente.
   </p>}
   {podeAnular&&<div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
     {campo("solicitacao_numero","Número SEI — solicitação de anulação","texto")}
     {campo("solicitacao_link","Link SEI — solicitação de anulação","link")}
    </div>
    {numero&&link&&doc?.id&&<FluxoAssinaturasEmenda documentoId={doc.id}
     tipo="anulacao" assinaturas={sigs} editavel={podeAnular&&!enviados}
     onAtualizar={onAtualizar}/>}
    {numero&&link&&completas&&<div className="rounded border p-3 text-xs">
     {enviados?<p className="flex items-center gap-2 text-emerald-700">
      <CheckCircle2 className="h-4 w-4"/>Envio à SEFAZ.UCG.AEO confirmado
      em {new Date(doc!.enviado_em!).toLocaleString("pt-BR")}.</p>:
      <label className="flex items-center gap-2">
       <Checkbox checked={false} disabled={enviar.isPending} onCheckedChange={v=>{
        if(v===true)enviar.mutate();
       }}/>Confirmo o encaminhamento efetivamente realizado à SEFAZ.UCG.AEO.
      </label>}
    </div>}
    {enviados&&<div className="space-y-3 border-t pt-3">
     <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
      {ultimoCampo("aviso_numero","Número SEI — Aviso de Movimento (Anulação)","texto")}
      {ultimoCampo("aviso_link","Link SEI — Aviso de Movimento (Anulação)","link")}
     </div>
     {aviso&&!doc?.anulacao_id&&<Button size="sm" disabled={finalizar.isPending}
      onClick={()=>finalizar.mutate()}>Registrar anulação do Aviso de Movimento</Button>}
    </div>}
   </div>}
   {!temResidual&&ne?.saldo_a_anular_fechamento===0&&<p
    className="flex items-center gap-2 text-xs text-emerald-700">
    <CheckCircle2 className="h-4 w-4"/>Não há residual financeiro pendente de anulação.
   </p>}
   {!!doc?.anulacao_id&&<p className="text-xs text-muted-foreground">
    Anulação registrada com histórico. Valor total anulado:
    {" "}<strong>{brl(Number(ne?.total_anulado??0))}</strong>.
   </p>}
  </div>

  <div className="space-y-2 border-t pt-3">
   <h4 className="flex items-center gap-2 text-xs font-semibold">
    <WalletCards className="h-4 w-4"/>Conciliação e fechamento da NE
   </h4>
   {pendencias.filter(p=>Number(p.valor??0)>0).map(p=>
    <p key={p.nome} className="flex items-center gap-2 text-xs text-amber-900">
     <LockKeyhole className="h-3.5 w-3.5"/> {p.nome}: {p.valor}
    </p>)}
   {!!ne?.ne_documental_pendente&&<p className="text-xs text-amber-900">
    A Nota de Empenho possui retificação documental em andamento.
   </p>}
   {!!ne?.anulacao_documental_pendente&&<p className="text-xs text-amber-900">
    Há solicitação de anulação encaminhada ainda sem Aviso concluído.
   </p>}
   {statusFechado?<p className="text-xs text-emerald-700">
    <CheckCircle2 className="mr-1 inline h-4 w-4"/>NE conciliada e encerrada
    {ne?.conciliacao_link_sei&&<a href={ne.conciliacao_link_sei}
     className="ml-1 text-primary underline" target="_blank" rel="noopener noreferrer">
     · SEI {ne.conciliacao_numero_sei}</a>}.
   </p>:<>
    {!ne?.pronta_conciliar&&<p className="text-xs text-muted-foreground">
     Conclusão indisponível até zerar o residual, conferir integralmente os pagamentos
     e resolver todas as competências. Pagamentos parciais permanecem pendentes.
    </p>}
    <Button disabled={!podeEditar||!ne?.pronta_conciliar}
     onClick={()=>setModalConclusao(true)}>
     {ne?.pronta_conciliar?"Conciliar e encerrar NE":"Conciliação bloqueada por pendências"}
    </Button>
   </>}
  </div>

  <Dialog open={!!semExec} onOpenChange={open=>{if(!open&&!registrarSem.isPending)setSemExec(null);}}>
   <DialogContent>
    <DialogHeader>
     <DialogTitle>Encerrar competência sem execução</DialogTitle>
     <DialogDescription>
      Competência {exibirCompetenciaISO(semExec?.competencia??"")}. Este ato exige
      ausência de distribuição ativa, subempenhos, liberações e documentos operacionais.
      Não gera anulação automática de saldo da NE.
     </DialogDescription>
    </DialogHeader>
    <div className="space-y-3">
     <label className="block space-y-1 text-xs">Justificativa
      <Textarea value={motivoSem} onChange={e=>setMotivoSem(e.target.value)} rows={3}/>
     </label>
     <label className="block space-y-1 text-xs">Número SEI
      <Input value={numeroSem} onChange={e=>setNumeroSem(e.target.value)}/>
     </label>
     <label className="block space-y-1 text-xs">Link do documento SEI
      <SeiLink value={linkSem} onChange={setLinkSem}/>
     </label>
    </div>
    <DialogFooter>
     <Button variant="outline" onClick={()=>setSemExec(null)}>Voltar</Button>
     <Button disabled={registrarSem.isPending||motivoSem.trim().length<10||
      !numeroSem.trim()||!/^https:\/\//i.test(linkSem)}
      onClick={()=>registrarSem.mutate()}>Confirmar encerramento sem execução</Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>

  <Dialog open={modalConclusao} onOpenChange={setModalConclusao}>
   <DialogContent>
    <DialogHeader>
     <DialogTitle>Conciliar e encerrar a Nota de Empenho</DialogTitle>
     <DialogDescription>
      O banco verificará novamente os saldos, todas as competências, os documentos,
      as conciliações de subempenhos e a ausência de pagamentos pendentes.
      O PACTO não executa operações na SEFAZ.
     </DialogDescription>
    </DialogHeader>
    <div className="space-y-3">
     <label className="block space-y-1 text-xs">Número SEI da conferência
      <Input value={numeroConclusao} onChange={e=>setNumeroConclusao(e.target.value)}/>
     </label>
     <label className="block space-y-1 text-xs">Link SEI da conferência
      <SeiLink value={linkConclusao} onChange={setLinkConclusao}/>
     </label>
    </div>
    <DialogFooter>
     <Button variant="outline" onClick={()=>setModalConclusao(false)}>Voltar</Button>
     <Button disabled={concluir.isPending||!numeroConclusao.trim()||
      !/^https:\/\//i.test(linkConclusao)||!ne?.pronta_conciliar}
      onClick={()=>concluir.mutate()}>Confirmar conciliação</Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 </section>;
}
function Indicador({titulo,valor}:{titulo:string;valor:number|null}){
 return <div className="space-y-1 rounded border bg-muted/10 p-3">
  <p className="text-[11px] text-muted-foreground">{titulo}</p>
  <strong className="text-base tabular-nums">{valor===null?"—":brl(Number(valor))}</strong>
 </div>;
}
