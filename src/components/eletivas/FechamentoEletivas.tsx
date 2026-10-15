import {useState} from "react";
import {useQuery,useMutation,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/checkbox";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Link} from "@tanstack/react-router";
import type {Tables,Json} from "@/integrations/supabase/types";

type Comp=Tables<"eletivas_competencias">;
type Check={id:string;ok:boolean;detalhe:string};
const brl=(v:number|null|undefined)=>(Number(v??0)).toLocaleString("pt-BR",
  {style:"currency",currency:"BRL"});
const timestamp=(v:string)=>new Date(v).toLocaleString("pt-BR");
function unpack(j:Json|null):{apto:boolean;itens:Check[];observacao?:string}{
 if(!j||Array.isArray(j)||typeof j!=="object")return {apto:false,itens:[]};
 const d=j as Record<string,unknown>;
 return {apto:d.apto===true,itens:Array.isArray(d.itens)?
  d.itens.filter((v):v is Check=>!!v&&typeof v==="object"&&"id" in v) :[],
 observacao:String(d.observacao??"")};
}
export function FechamentoEletivas({comp,podeFiscal,podeAdmin,onRefresh}:{
 comp:Comp;podeFiscal:boolean;podeAdmin:boolean;onRefresh:()=>void;
}){
 const qc=useQueryClient(),encerrada=comp.status==="encerrada";
 const [convenioId,setConvenioId]=useState("");
 const [lancamentoId,setLancamentoId]=useState(comp.lancamento_id??"");
 const [vincMotivo,setVincMotivo]=useState("");
 const [linkSei,setLinkSei]=useState("");
 const [motivoFechamento,setMotivoFechamento]=useState("");
 const [confDocumento,setConfDocumento]=useState(false);
 const [confAuditoria,setConfAuditoria]=useState(false);
 const [propSei,setPropSei]=useState("");
 const [propJust,setPropJust]=useState("");
 const [confProposta,setConfProposta]=useState(false);
 const [confirmacaoAplicar,setConfirmacaoAplicar]=useState("");
 const [confAplicar,setConfAplicar]=useState(false);
 const [cancelMotivo,setCancelMotivo]=useState("");
 const [reabSei,setReabSei]=useState("");
 const [reabMotivo,setReabMotivo]=useState("");

 const checklist=useQuery({queryKey:["ec-checklist",comp.id,comp.atualizado_em],
   queryFn:async()=>{
    const {data,error}=await supabase.rpc("ec_checklist_fechamento",{p_comp:comp.id});
    if(error)throw error;return unpack(data);
   }});
 const historico=useQuery({queryKey:["ec-fechamentos",comp.id],
   queryFn:async()=>{
    const {data,error}=await supabase.from("eletivas_fechamentos")
      .select("id,revisao,valor_fechado,conteudo_md5,fechamento_em,fechamento_autor,sei_conferencia,motor_versao,execucao_id")
      .eq("competencia_id",comp.id).order("revisao",{ascending:false});
    if(error)throw error;return data??[];
   }});
 const propostas=useQuery({queryKey:["ec-integracoes",comp.id],
   queryFn:async()=>{
    const {data,error}=await supabase.from("eletivas_integracoes")
      .select("*").eq("competencia_id",comp.id).order("proposto_em",{ascending:false});
    if(error)throw error;return data??[];
   }});
 const convenios=useQuery({queryKey:["ec-convenios-destino",comp.prestador_id],
   queryFn:async()=>{
    const {data,error}=await supabase.from("convenios")
      .select("id,objeto,prestador_id,modelo_fluxo").eq("prestador_id",comp.prestador_id)
      .eq("modelo_fluxo","fluxo_1").order("created_at",{ascending:false});
    if(error)throw error;return data??[];
   }});
 const lancamentos=useQuery({queryKey:["ec-lancamentos-destino",comp.prestador_id,comp.competencia],
   queryFn:async()=>{
    const {data,error}=await supabase.from("lancamentos_pagamento")
     .select("id,convenio_id,prestador_id,competencia,parent_id,descricao,valor_atestado,valor_atestado_manual,valor_atestado_automatico,origem_valor_atestado,ec_escolha_pendente,concluido,data_pagamento,link_comprovante_pagamento_sei")
     .eq("prestador_id",comp.prestador_id)
     .eq("competencia",comp.competencia)
     .order("created_at",{ascending:false});
    if(error)throw error;return data??[];
   }});
 const selecionado=lancamentos.data?.find(l=>l.id===(comp.lancamento_id??lancamentoId));
 const propostasAtivas=propostas.data?.filter(x=>x.status==="proposta"||x.status==="aplicada")??[];
 const ultima=historico.data?.[0];
 const atualizar=()=>{
  onRefresh();
  for(const k of ["ec-checklist","ec-fechamentos","ec-integracoes"])
   qc.invalidateQueries({queryKey:[k,comp.id]});
  qc.invalidateQueries({queryKey:["ec-lancamentos-destino",comp.prestador_id,comp.competencia]});
  qc.invalidateQueries({queryKey:["lanc",comp.lancamento_id]});
 };
 const vincular=useMutation({mutationFn:async()=>{
  if(!convenioId||!lancamentoId||vincMotivo.trim().length<15)
   throw Error("Selecione convênio e lançamento e fundamente o vínculo.");
  const {error}=await supabase.rpc("ec_vincular_lancamento",{
   p_comp:comp.id,p_convenio:convenioId,p_lancamento:lancamentoId,
   p_justificativa:vincMotivo.trim()});
  if(error)throw error;
 },onSuccess:()=>{toast.success("Lançamento vinculado pelos IDs, sem alterar valores.");atualizar();},
 onError:(e:Error)=>toast.error(e.message)});
 const fechar=useMutation({mutationFn:async()=>{
  if(!checklist.data?.apto||!confDocumento||!confAuditoria)
   throw Error("Conclua o checklist e confirme as conferências documentais.");
  if(!comp.ec_execucao_id)throw Error("Execução do motor ausente.");
  const {data,error}=await supabase.rpc("ec_encerrar_seguro",{
   p_comp:comp.id,p_execucao:comp.ec_execucao_id,p_sei:linkSei.trim(),
   p_justificativa:motivoFechamento.trim(),p_confirmo:true});
  if(error)throw error;return data;
 },onSuccess:(v)=>{toast.success("Fechamento fiscal registrado: "+brl(Number(v))+". Snapshot preservado.");atualizar();},
 onError:(e:Error)=>toast.error(e.message)});
 const propor=useMutation({mutationFn:async()=>{
  if(!selecionado||!confProposta||!comp.lancamento_id)
   throw Error("Vínculo e confirmação expressa obrigatórios.");
  const {error}=await supabase.rpc("ec_propor_integracao",{
   p_comp:comp.id,p_lancamento:comp.lancamento_id,
   p_valor_anterior:selecionado.valor_atestado,
   p_sei:propSei.trim(),p_justificativa:propJust.trim(),p_confirmo:true});
  if(error)throw error;
 },onSuccess:()=>{toast.success("Proposta registrada. Nenhum valor do convênio foi alterado.");atualizar();},
 onError:(e:Error)=>toast.error(e.message)});
 const aplicar=useMutation({mutationFn:async(proposta:NonNullable<typeof propostas.data>[number])=>{
   if(!confAplicar||confirmacaoAplicar!=="APLICAR")
     throw Error('Para aplicar, marque a confirmação e digite APLICAR.');
   const {error}=await supabase.rpc("ec_aplicar_integracao",{
    p_proposta:proposta.id,p_valor_anterior:proposta.valor_anterior,p_confirmo:true});
   if(error)throw error;
 },onSuccess:()=>{toast.success("Valor encaminhado à Etapa 6 com registro fiscal imutável.");atualizar();
   setConfirmacaoAplicar("");setConfAplicar(false);},
 onError:(e:Error)=>toast.error(e.message)});
 const cancelar=useMutation({mutationFn:async(id:string)=>{
  const {error}=await supabase.rpc("ec_cancelar_proposta",{p_proposta:id,p_justificativa:cancelMotivo.trim()});
  if(error)throw error;
 },onSuccess:()=>{toast.success("Proposta cancelada; registro histórico preservado.");atualizar();},
 onError:(e:Error)=>toast.error(e.message)});
 const reabrir=useMutation({mutationFn:async()=>{
  if(!window.confirm("Esta ação reabre a auditoria, mas mantém o snapshot histórico. Confirma?"))
   return;
  const {error}=await supabase.rpc("ec_reabrir_controlado",{
   p_comp:comp.id,p_sei:reabSei.trim(),p_motivo:reabMotivo.trim()});
  if(error)throw error;
 },onSuccess:()=>{toast.success("Reabertura formal registrada. O snapshot anterior foi preservado.");atualizar();},
 onError:(e:Error)=>toast.error(e.message)});
 return <div className="space-y-5">
   <section className="rounded-lg border p-4 space-y-3">
    <h3 className="font-semibold">1. Checklist de fechamento fiscal</h3>
    <p className="text-xs text-muted-foreground">Checklist calculado no servidor,
      sem edições manuais no resultado. A conferência real do SEI é uma responsabilidade
      do fiscal — o sistema não simula autenticidade ou assinatura.</p>
    {checklist.isLoading&&<p className="text-sm">Conferindo execução, evidências e decisões…</p>}
    {checklist.isError&&<p role="alert" className="text-destructive text-sm">
      Não foi possível consultar o checklist. Confira a migration Fase 6.</p>}
    {(checklist.data?.itens??[]).map(item=><div key={item.id}
      className="flex gap-2 rounded border p-2 text-xs">
      <span className={item.ok?"text-emerald-700 font-semibold":"text-amber-700 font-semibold"}>
        {item.ok?"✓":"!"}</span><span>{item.detalhe}</span>
    </div>)}
    {encerrada?<p className="text-sm font-semibold">Competência encerrada:
      {brl(comp.valor_fechado)} — nenhuma transferência ao convênio foi feita automaticamente.</p>:
      <p className="text-xs font-semibold">{checklist.data?.apto?
        "Checklist técnico apto. Confirme as evidências no SEI antes de fechar.":
        "Checklist incompleto. Resolva os itens destacados antes do fechamento."}</p>}
    {!encerrada&&podeFiscal&&<div className="space-y-3 border-t pt-3">
      <label className="block text-xs">Documento SEI da conferência externa
        <Input value={linkSei} onChange={e=>setLinkSei(e.target.value)}
          placeholder="Número/documento SEI efetivamente conferido"/></label>
      <label className="block text-xs">Justificativa do fechamento
        <Textarea value={motivoFechamento} rows={2}
         onChange={e=>setMotivoFechamento(e.target.value)}
         placeholder="Descreva os documentos, as verificações e o fundamento do fechamento"/></label>
      <label className="flex items-start gap-2 text-xs">
        <Checkbox checked={confDocumento} onCheckedChange={v=>setConfDocumento(v===true)}/>
        Conferi externamente no SEI os documentos e assinaturas efetivas; reconheço
        que links digitados não equivalem a autenticação.</label>
      <label className="flex items-start gap-2 text-xs">
        <Checkbox checked={confAuditoria} onCheckedChange={v=>setConfAuditoria(v===true)}/>
        Conferi as fontes, hashes, motor, decisões fiscais e correções, e autorizo
        apenas o fechamento desta competência.</label>
      <Button disabled={fechar.isPending||!checklist.data?.apto||!confDocumento||!confAuditoria
        ||linkSei.trim().length<5||motivoFechamento.trim().length<20}
        onClick={()=>{if(window.confirm("Encerrar o Encontro de Contas? Será salvo um snapshot imutável e NÃO haverá lançamento automático."))fechar.mutate();}}>
        {fechar.isPending?"Fechando…":"Confirmar fechamento fiscal e congelar snapshot"}</Button>
    </div>}
   </section>
   <section className="rounded-lg border p-4 space-y-3">
     <h3 className="font-semibold">2. Vínculo explícito com o convênio</h3>
     <p className="text-xs text-muted-foreground">O vínculo exige o mesmo prestador, convênio
       Fluxo 1, competência MM/AAAA exata e lançamento específico. Descrição/objeto
       não são prova suficiente.</p>
     {(convenios.isError||lancamentos.isError)&&<p role="alert"
       className="text-xs text-destructive">Falha ao consultar possíveis vínculos.</p>}
     {comp.lancamento_id&&<p className="text-xs">Lançamento cadastrado: <b>{comp.lancamento_id}</b></p>}
     {!encerrada&&podeFiscal&&<div className="space-y-2">
       <Select value={convenioId} onValueChange={v=>{setConvenioId(v);setLancamentoId("");}}>
         <SelectTrigger><SelectValue placeholder="Selecione o convênio pelo registro"/></SelectTrigger>
         <SelectContent>{convenios.data?.map(cv=><SelectItem key={cv.id} value={cv.id}>
           {(cv.objeto??"Convênio sem descrição").slice(0,72)} · {cv.id.slice(0,8)}
         </SelectItem>)}</SelectContent>
       </Select>
       <Select value={lancamentoId} onValueChange={setLancamentoId} disabled={!convenioId}>
         <SelectTrigger><SelectValue placeholder="Selecione o lançamento da competência exata"/></SelectTrigger>
         <SelectContent>{(lancamentos.data??[]).filter(l=>l.convenio_id===convenioId)
           .map(l=><SelectItem key={l.id} value={l.id}>
             {l.descricao?.slice(0,70)??"Lançamento"} · {l.id.slice(0,8)} · {brl(l.valor_atestado)}
           </SelectItem>)}</SelectContent>
       </Select>
       <Textarea placeholder="Justifique qual processo/registro do convênio está sendo vinculado"
         rows={2} value={vincMotivo} onChange={e=>setVincMotivo(e.target.value)}/>
       <Button size="sm" disabled={vincular.isPending||!lancamentoId||vincMotivo.trim().length<15}
         onClick={()=>vincular.mutate()}>Confirmar vínculo pelos IDs (sem alterar valores)</Button>
     </div>}
   </section>
   <section className="rounded-lg border p-4 space-y-3">
     <h3 className="font-semibold">3. Propor valor fechado à Etapa 6</h3>
     <p className="text-xs text-muted-foreground">A proposta não altera o lançamento.
       Aplicação é uma segunda ação expressa, registrada com autoria, SEI e diferenças.</p>
     {selecionado&&<div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
       <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Anterior na Etapa 6</p>
        <strong>{brl(selecionado.valor_atestado)}</strong></div>
       <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Fechado no EC</p>
        <strong>{brl(comp.valor_fechado)}</strong></div>
       <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Diferença</p>
        <strong>{brl(Number(comp.valor_fechado??0)-Number(selecionado.valor_atestado??0))}</strong></div>
     </div>}
     {encerrada&&!comp.lancamento_id&&<p className="text-xs text-amber-800">
       A competência foi encerrada sem vínculo. Para integrar, será necessária
       reabertura administrativa controlada e novo fechamento após vincular.</p>}
     {selecionado&&Number(selecionado.valor_atestado_manual??0)>0&&
      <p className="text-xs text-amber-800">Já existe um valor manual. Ele será preservado;
        após aplicar o cálculo automático, será obrigatório escolher qual fonte
        será considerada no campo 4 da Etapa 6.</p>}
     {encerrada&&podeFiscal&&comp.lancamento_id&&propostasAtivas.length===0&&<div className="space-y-2">
       <Input placeholder="Documento SEI da autorização proposta" value={propSei}
         onChange={e=>setPropSei(e.target.value)}/>
       <Textarea rows={2} placeholder="Fundamente a integração do fechamento com a Etapa 6"
         value={propJust} onChange={e=>setPropJust(e.target.value)}/>
       <label className="flex gap-2 text-xs items-start">
         <Checkbox checked={confProposta} onCheckedChange={v=>setConfProposta(v===true)}/>
         Solicito apenas criar a proposta financeira identificada acima.
         Reconheço que nenhum valor será lançado nesta etapa.</label>
       <Button size="sm" disabled={propor.isPending||!selecionado||!confProposta||
         propSei.trim().length<5||propJust.trim().length<20}
         onClick={()=>propor.mutate()}>Registrar proposta auditável</Button>
     </div>}
     {(propostas.data??[]).map(p=><div key={p.id} className="rounded-md border p-3 space-y-2 text-xs">
       <p className="font-semibold">Proposta {p.id.slice(0,8)} · {p.status.toUpperCase()}
         {" "}· {brl(p.valor_anterior)} → {brl(p.valor_novo)} (Δ {brl(p.diferenca)})</p>
       <p>SEI: {p.sei_autorizacao} · {p.justificativa}</p>
       <p>Registrada em {timestamp(p.proposto_em)} · Fechamento {p.fechamento_id.slice(0,8)}</p>
       {p.status==="aplicada"&&<p className="text-emerald-800">
         Valor automático disponível na Etapa 6; o manual foi preservado.
         {selecionado?.ec_escolha_pendente?
           " ATENÇÃO: escolha a fonte do atesto no lançamento antes de prosseguir.":""}
         Não houve liquidação, pagamento ou assinatura automática.
         <Link to="/lancamentos/$id" params={{id:p.lancamento_id}}
          search={{foco:6}} className="ml-2 underline">Abrir lançamento</Link></p>}
       {p.status==="proposta"&&podeFiscal&&<div className="space-y-2 border-t pt-2">
         <label className="flex gap-2 items-start"><Checkbox checked={confAplicar}
           onCheckedChange={v=>setConfAplicar(v===true)}/>
           Confirmo a alteração expressa do valor da Etapa 6 deste lançamento.</label>
         <Input placeholder='Digite APLICAR para autorizar a alteração'
           value={confirmacaoAplicar} onChange={e=>setConfirmacaoAplicar(e.target.value)}/>
         <Button disabled={aplicar.isPending||!confAplicar||confirmacaoAplicar!=="APLICAR"||
           false}
           onClick={()=>{if(window.confirm("Alterar valor_atestado na Etapa 6 para "+brl(p.valor_novo)+"?"))aplicar.mutate(p);}}>
           Aplicar explicitamente na Etapa 6</Button>
         <Textarea rows={2} placeholder="Motivo do cancelamento, se necessário (mín. 20 caracteres)"
           value={cancelMotivo} onChange={e=>setCancelMotivo(e.target.value)}/>
         <Button size="sm" variant="outline" disabled={cancelar.isPending||cancelMotivo.trim().length<20}
           onClick={()=>cancelar.mutate(p.id)}>Cancelar proposta (manter histórico)</Button>
       </div>}
     </div>)}
   </section>
   <section className="rounded-lg border p-4 space-y-3">
    <h3 className="font-semibold">4. Fechamentos anteriores e reabertura</h3>
    {historico.isLoading&&<p className="text-xs">Carregando snapshots históricos…</p>}
    {(historico.data??[]).map(s=><div key={s.id} className="text-xs rounded border p-2">
      <strong>Revisão {s.revisao} · {brl(s.valor_fechado)}</strong>
      <p>{timestamp(s.fechamento_em)} · Motor {s.motor_versao} · Execução {s.execucao_id.slice(0,8)}</p>
      <p>Hash do snapshot: <code>{s.conteudo_md5}</code> · SEI {s.sei_conferencia}</p>
    </div>)}
    {encerrada&&podeAdmin&&<div className="space-y-2 border-t pt-2">
      <p className="text-xs">Reabertura exclusiva de Admin. Bloqueada quando houver proposta ativa
        ou valor já aplicado no convênio. A memória anterior permanece arquivada.</p>
      <Input placeholder="Documento SEI da reabertura" value={reabSei}
        onChange={e=>setReabSei(e.target.value)}/>
      <Textarea rows={2} placeholder="Motivo formal da reabertura (mín. 25 caracteres)"
        value={reabMotivo} onChange={e=>setReabMotivo(e.target.value)}/>
      <Button variant="outline" disabled={reabrir.isPending||propostasAtivas.length>0||
        reabSei.trim().length<5||reabMotivo.trim().length<25}
        onClick={()=>reabrir.mutate()}>Solicitar reabertura controlada</Button>
    </div>}
   </section>
 </div>;
}
