import {useEffect,useState} from "react";
import {useMutation,useQuery} from "@tanstack/react-query";
import {CheckCircle2,LockKeyhole,ThumbsUp,ThumbsDown,RotateCcw} from "lucide-react";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/checkbox";
import {Badge} from "@/components/ui/badge";
import {Select,SelectTrigger,SelectContent,SelectItem,SelectValue} from "@/components/ui/select";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";
import {CurrencyInput} from "@/components/inputs/CurrencyInput";
import {SeiButton,SeiLink} from "@/components/inputs/SeiLink";
import {brl} from "@/lib/format";
import {normalizarLinkHttpsSei,linkHttpsValido} from "@/lib/emendas/cadastro";
import type {Tables} from "@/integrations/supabase/types";
type L=Tables<"emenda_lancamentos">;
type E=Tables<"emenda_etapas_documentais">;
type A=Tables<"emenda_assinaturas_conferidas">;
type S=Tables<"emenda_solicitacoes">;
type P=Tables<"emenda_pareceres_financeiros">;
type Envio=Tables<"emenda_envios_sefaz">;
const papeis=[
 {id:"orcamentos",label:"Coordenador de Orçamentos",cargos:["Coordenador de Orçamentos"]},
 {id:"fiscal",label:"Fiscal",cargos:["Fiscal"]},
 {id:"gerencia_acp",label:"Gerente / Coordenador ACP",cargos:["Gerente","Coordenador ACP","Coordenador"]},
 {id:"diretor_servicos",label:"Diretor de Serviços Complementares",cargos:["Diretor de Serviços Complementares"]},
 {id:"diretoria_financeira",label:"Diretoria Financeira / Secretária de Saúde",cargos:["Diretoria Financeira","Secretária de Saúde"]},
];
function Campo({label,children}:{label:string;children:React.ReactNode}){
 return <div className="min-w-0 space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Etapa({n,heading,ok,active,children}:{n:number;heading:string;ok:boolean;active:boolean;children:React.ReactNode}){
 return <section className={"rounded-lg border "+(active?"border-primary/50 bg-card":"bg-muted/10")}>
  <header className="flex items-center gap-3 px-4 py-3">
   <span className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold "+
    (ok?"bg-emerald-600 text-white":active?"bg-primary text-primary-foreground":"bg-muted text-muted-foreground")}>
    {ok?<CheckCircle2 className="h-4 w-4"/>:n}</span>
   <div className="flex-1"><h3 className="text-sm font-semibold">{heading}</h3>
    <p className="text-xs text-muted-foreground">{ok?"Concluída":active?"Etapa atual":"Aguardando etapa anterior"}</p></div>
   {!ok&&!active&&<LockKeyhole className="h-4 w-4 text-muted-foreground"/>}
  </header>
  {(active||ok)&&<div className="border-t p-4">{children}</div>}
 </section>;
}
type Props={lancamento:L;etapas:E[];assinaturas:A[];nota?:S;pareceres:P[];
 envio?:Envio;saldoDisponivel:number;podeEditar:boolean;onAtualizar:()=>Promise<void>};
export function EtapasLancamento({lancamento,etapas,assinaturas,nota,pareceres,envio,saldoDisponivel,podeEditar,onAtualizar}:Props){
 const dot=etapas.find(e=>e.etapa==="dotacao");
 const pedido=etapas.find(e=>e.etapa==="solicitacao");
 const opinioes=[...pareceres].sort((a,b)=>b.ocorrido_em.localeCompare(a.ocorrido_em)||b.id.localeCompare(a.id));
 const [dotacao,setDotacao]=useState(dot?.dotacao??"");
 const [fonte,setFonte]=useState(dot?.fonte??"");
 const [dotDesmarcada,setDotDesmarcada]=useState(false);
 const [pedidoSujo,setPedidoSujo]=useState(false);
 const [numero,setNumero]=useState(pedido?.numero_sei??"");
 const [link,setLink]=useState(pedido?.link_sei??"");
 const [valor,setValor]=useState(Number(pedido?.valor_solicitado??0));
 const [desfecho,setDesfecho]=useState<"aprovado"|"recusado">("aprovado");
 const [comentario,setComentario]=useState("");
 const [reverterAberto,setReverterAberto]=useState(false);
 const [ne,setNe]=useState("");const [exercicio,setExercicio]=useState(new Date().getFullYear());
 const [valorNE,setValorNE]=useState(Number(nota?.valor_solicitado??0));
 const [numeroNE,setNumeroNE]=useState("");const [linkNE,setLinkNE]=useState("");
 const [erro,setErro]=useState("");
 const editavel=podeEditar&&lancamento.status==="rascunho"&&!envio;
 const dotOk=dot?.coord_orcamentos_confirmada===true&&!dotDesmarcada&&
  !!dotacao.trim()&&!!fonte.trim()&&dotacao.trim()===dot.dotacao?.trim()&&fonte.trim()===dot.fonte?.trim();
 const aprovado=dotOk&&opinioes[0]?.desfecho==="aprovado"&&
  !!dot?.conferido_em&&opinioes[0].ocorrido_em>=dot.conferido_em;
 const pedidoValido=!!numero.trim()&&linkHttpsValido(link)&&valor>0&&valor<=saldoDisponivel;
 const pedidoOk=!!pedido&&aprovado&&!pedidoSujo&&pedido.numero_sei===numero.trim()&&
  pedido.link_sei===normalizarLinkHttpsSei(link)&&Number(pedido.valor_solicitado)===valor;
 const assinaturasCompletas=pedidoOk&&papeis.every(p=>assinaturas.some(a=>a.papel===p.id));
 const {data:pool=[],error:poolErro}=useQuery({
  queryKey:["assinaturas_config"],
  queryFn:async()=>{
   const r=await supabase.from("assinaturas_config").select("*").eq("ativo",true).order("nome_servidor");
   if(r.error)throw r.error;return r.data??[];
  },staleTime:120000,
 });
 const responsavel=useQuery({queryKey:["emendas","confirmador-dotacao",dot?.conferido_por],
  enabled:!!dot?.conferido_por,
  queryFn:async()=>{
   const r=await supabase.from("profiles").select("nome").eq("id",dot!.conferido_por).maybeSingle();
   if(r.error)throw r.error;return r.data?.nome??null;
  },staleTime:300000,
 });
 useEffect(()=>{setDotacao(dot?.dotacao??"");setFonte(dot?.fonte??"");setDotDesmarcada(false);},
  [dot?.id,dot?.conferido_em]);
 useEffect(()=>{if(!pedidoSujo){setNumero(pedido?.numero_sei??"");setLink(pedido?.link_sei??"");
  setValor(Number(pedido?.valor_solicitado??0));}},[pedido?.id,pedido?.conferido_em]);
 const mutate=(fn:()=>Promise<void>,ok:string)=>useMutation({
  mutationFn:fn,onSuccess:async()=>{setErro("");await onAtualizar();toast.success(ok);},
  onError:(e:Error)=>{setErro(e.message);toast.error(e.message);},
 });
 const confirmarDot=mutate(async()=>{
  if(!dotacao.trim()||!fonte.trim())throw Error("Informe dotação e fonte.");
  const r=await supabase.rpc("emenda_confirmar_dotacao",{
   p_lancamento:lancamento.id,p_dotacao:dotacao.trim(),p_fonte:fonte.trim(),p_confirmado:true});
  if(r.error)throw r.error;
 },"Dotação confirmada.");
 const invalidarDot=mutate(async()=>{
  const r=await supabase.rpc("emenda_invalidar_dotacao",{p_lancamento:lancamento.id});
  if(r.error)throw r.error;
 },"Confirmação retirada. Etapas seguintes bloqueadas.");
 const invalidar=()=>{
  if(!editavel||!dot?.coord_orcamentos_confirmada||invalidarDot.isPending)return;
  setDotDesmarcada(true);invalidarDot.mutate();
 };
 const aoSair=()=>{if(dot?.coord_orcamentos_confirmada&&(!dotacao.trim()||!fonte.trim())&&!dotDesmarcada)invalidar();};
 const salvarParecer=mutate(async()=>{
  if(desfecho==="recusado"&&comentario.trim().length<5)throw Error("Justifique a recusa.");
  const r=await supabase.rpc("emenda_parecer_financeiro",{
   p_lancamento:lancamento.id,p_desfecho:desfecho,
   p_comentario:desfecho==="recusado"?comentario.trim():""});
  if(r.error)throw r.error;setComentario("");
 },"Parecer registrado.");
 const reabrir=useMutation({mutationFn:async()=>{
  const r=await supabase.rpc("emenda_reabrir_aprovacao",{p_lancamento:lancamento.id});
  if(r.error)throw r.error;
 },onSuccess:async()=>{setReverterAberto(false);setPedidoSujo(false);await onAtualizar();
  toast.success("Aprovação revertida. Nova análise liberada.");},
  onError:(e:Error)=>{setErro(e.message);toast.error(e.message);}});
 const salvarPedido=useMutation({mutationFn:async()=>{
  const r=await supabase.rpc("emenda_salvar_etapa_documental",{
   p_lancamento:lancamento.id,p_etapa:"solicitacao",p_numero_sei:numero.trim(),
   p_link_sei:normalizarLinkHttpsSei(link)!,p_valor:valor});
  if(r.error)throw r.error;
 },onSuccess:async()=>{setPedidoSujo(false);setErro("");await onAtualizar();},
 onError:(e:Error)=>{setErro(e.message);toast.error(e.message);}});
 useEffect(()=>{
  if(!pedidoSujo||!pedidoValido||!editavel||!aprovado||salvarPedido.isPending)return;
  const t=setTimeout(()=>salvarPedido.mutate(),900);return ()=>clearTimeout(t);
 },[pedidoSujo,pedidoValido,editavel,aprovado,numero,link,valor,salvarPedido.isPending]);
 const salvarAss=useMutation({mutationFn:async(p:{papel:string;id:string})=>{
  const r=await supabase.rpc("emenda_selecionar_signatario",{
   p_lancamento:lancamento.id,p_papel:p.papel,p_signatario:p.id});
  if(r.error)throw r.error;
 },onSuccess:async()=>{await onAtualizar();toast.success("Signatário registrado.");},
 onError:(e:Error)=>{setErro(e.message);toast.error(e.message);}});
 const confirmarEnvio=mutate(async()=>{
  const r=await supabase.rpc("emenda_confirmar_envio_sefaz",{p_lancamento:lancamento.id});
  if(r.error)throw r.error;
 },"Envio confirmado e solicitação formalizada.");
 const registrarNE=mutate(async()=>{
  if(!ne.trim()||!numeroNE.trim()||!linkHttpsValido(linkNE)||valorNE<=0)
   throw Error("Preencha os dados e o link SEI da NE.");
  const r=await supabase.rpc("emenda_registrar_ne_documental",{
   p_lancamento:lancamento.id,p_numero_ne:ne.trim(),p_exercicio:exercicio,p_valor:valorNE,
   p_numero_sei:numeroNE.trim(),p_link_sei:normalizarLinkHttpsSei(linkNE)!});
  if(r.error)throw r.error;
 },"NE registrada.");
 return <div className="space-y-3">
  <Etapa n={1} heading="Dotação, fonte e autorização financeira" ok={aprovado} active={!aprovado}>
   <div className="space-y-4">
    <div className="space-y-2">
     <h4 className="text-xs font-semibold">Dotação e fonte · Coordenação de Orçamentos</h4>
     <div className="grid gap-3 md:grid-cols-2">
      <Campo label="Dotação"><Input value={dotacao} disabled={!editavel||invalidarDot.isPending}
       onBlur={aoSair} onChange={e=>setDotacao(e.target.value)}/></Campo>
      <Campo label="Fonte"><Input value={fonte} disabled={!editavel||invalidarDot.isPending}
       onBlur={aoSair} onChange={e=>setFonte(e.target.value)}/></Campo>
     </div>
     <label className="flex items-start gap-2 rounded-md border bg-background p-3 text-xs">
      <Checkbox checked={dotOk} disabled={!editavel||!dotacao.trim()||!fonte.trim()||confirmarDot.isPending||invalidarDot.isPending}
       onCheckedChange={v=>{if(v===true&&!dotOk)confirmarDot.mutate();if(v===false&&dotOk)invalidar();}}/>
      <span>Confirmo que registrei a dotação e a fonte no bloco da Coordenação de Orçamentos.
       {dotOk&&dot?.conferido_em&&<span className="mt-1 block text-[11px] text-muted-foreground">
        {responsavel.data??"Responsável não identificado"} · {new Date(dot.conferido_em).toLocaleString("pt-BR")}
       </span>}
      </span>
     </label>
    </div>
    <section className="space-y-3 border-t pt-4">
     <h4 className="text-xs font-semibold">Autorização financeira</h4>
     {opinioes.length>0&&<ol className="space-y-2">
      {opinioes.map(p=><li key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/10 px-3 py-2 text-xs">
       {p.desfecho==="aprovado"?<ThumbsUp className="h-4 w-4 text-emerald-600"/>:
        p.desfecho==="recusado"?<ThumbsDown className="h-4 w-4 text-destructive"/>:
        <RotateCcw className="h-4 w-4 text-muted-foreground"/>}
       <Badge variant={p.desfecho==="recusado"?"destructive":"secondary"}>
        {p.desfecho==="aprovado"?"Aprovado":p.desfecho==="recusado"?"Recusado":"Aprovação revertida"}</Badge>
       <span className="text-muted-foreground">{new Date(p.ocorrido_em).toLocaleString("pt-BR")}</span>
       {p.id===opinioes[0]?.id&&aprovado&&editavel&&<Button variant="outline" size="sm"
        className="ml-auto" onClick={()=>setReverterAberto(true)}>
        <RotateCcw className="mr-1 h-3.5 w-3.5"/>Reverter aprovação</Button>}
       {p.desfecho==="recusado"&&<p className="w-full whitespace-pre-wrap">{p.comentario}</p>}
      </li>)}
     </ol>}
     {editavel&&dotOk&&!aprovado&&<div className="rounded-md border p-3">
      <p className="mb-2 text-xs font-semibold">Registrar decisão da equipe financeira</p>
      <div className="flex gap-2">
       <Button size="sm" variant={desfecho==="aprovado"?"default":"outline"}
        onClick={()=>setDesfecho("aprovado")}>Aprovado</Button>
       <Button size="sm" variant={desfecho==="recusado"?"destructive":"outline"}
        onClick={()=>setDesfecho("recusado")}>Recusado</Button>
      </div>
      {desfecho==="recusado"&&<div className="mt-3 max-w-2xl">
       <Campo label="Justificativa da recusa"><Textarea value={comentario} rows={2}
        onChange={e=>setComentario(e.target.value)}/></Campo></div>}
      <div className="mt-3 flex justify-end"><Button size="sm"
       disabled={salvarParecer.isPending||(desfecho==="recusado"&&comentario.trim().length<5)}
       onClick={()=>salvarParecer.mutate()}>{desfecho==="aprovado"?"Confirmar aprovação":"Registrar recusa"}</Button></div>
     </div>}
     {!dotOk&&<p className="text-xs text-muted-foreground">Confirme a dotação e a fonte para liberar a análise financeira.</p>}
    </section>
   </div>
  </Etapa>
  <Etapa n={2} heading="Solicitação de empenho, assinaturas e envio" ok={!!envio} active={aprovado&&!envio}>
   <div className="space-y-5">
    <section className="space-y-2">
     <h4 className="text-xs font-semibold">Solicitação de empenho e conferência do saldo</h4>
     <div className="grid gap-3 md:grid-cols-[170px_minmax(250px,1fr)_180px] md:items-end">
      <Campo label="Número SEI da solicitação"><Input value={numero} disabled={!editavel}
       onChange={e=>{setNumero(e.target.value);setPedidoSujo(true);}} autoComplete="off"/></Campo>
      <Campo label="Link da solicitação SEI"><SeiLink value={link} editable={editavel}
       onChange={v=>{setLink(v);setPedidoSujo(true);}}/></Campo>
      <Campo label="Valor solicitado"><CurrencyInput value={valor} disabled={!editavel}
       onChange={v=>{setValor(v);setPedidoSujo(true);}} invalid={valor>saldoDisponivel}/></Campo>
     </div>
     {valor>saldoDisponivel&&<p role="alert" className="rounded-md border border-amber-400/40 bg-amber-50 p-2 text-xs text-amber-900">
      Valor solicitado ({brl(valor)}) maior que o saldo disponível ({brl(saldoDisponivel)}). Corrija para prosseguir.
     </p>}
     <p className="text-[11px] text-muted-foreground">Saldo disponível: {brl(saldoDisponivel)}.
      {salvarPedido.isPending?" Salvando automaticamente…":pedidoOk?" Solicitação salva e validada.":pedidoSujo&&pedidoValido?" Salvamento automático em andamento.":""}
     </p>
    </section>
    {pedidoOk&&<section className="space-y-3 border-t pt-4">
     <div className="flex items-center justify-between gap-2">
      <h4 className="text-xs font-semibold">Matriz de assinaturas</h4>
      <Badge variant={assinaturasCompletas?"default":"outline"}>
       {papeis.filter(p=>assinaturas.some(a=>a.papel===p.id)).length}/5 registradas</Badge>
     </div>
     <div className={"space-y-2 rounded-lg border p-3 "+(assinaturasCompletas?"border-emerald-600/30 bg-emerald-600/5":"bg-muted/10")}>
      {papeis.map(p=>{
       const ass=assinaturas.find(a=>a.papel===p.id);
       const usados=new Set(assinaturas.filter(a=>a.papel!==p.id).map(a=>a.signatario_config_id));
       const elegiveis=pool.filter(pessoa=>p.cargos.includes(pessoa.cargo)&&!usados.has(pessoa.id));
       return <div key={p.id} className="grid gap-2 rounded-md border bg-background px-3 py-2 sm:grid-cols-[minmax(210px,.8fr)_minmax(260px,1.2fr)] sm:items-center">
        <div><p className="text-xs font-medium">{p.label}</p>
         {ass?.conferido_em&&<p className="mt-0.5 text-[10px] text-muted-foreground">
          Registrado em {new Date(ass.conferido_em).toLocaleString("pt-BR")}</p>}</div>
        <div>{editavel?<Select value={ass?.signatario_config_id??""} disabled={salvarAss.isPending||!!poolErro}
         onValueChange={id=>salvarAss.mutate({papel:p.id,id})}>
         <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecionar signatário"/></SelectTrigger>
         <SelectContent>{elegiveis.map(pessoa=><SelectItem key={pessoa.id} value={pessoa.id}>
          {pessoa.nome_servidor} · {pessoa.cargo}</SelectItem>)}</SelectContent>
        </Select>:<p className="flex items-center gap-1 text-xs">
         {ass&&<CheckCircle2 className="h-4 w-4 text-emerald-600"/>}{ass?.nome_signatario??"Pendente"}</p>}
        {ass&&!ass.signatario_config_id&&<p className="mt-1 text-[10px] text-muted-foreground">
         Registro anterior: {ass.nome_signatario}. Selecione um signatário cadastrado para atualizar.
        </p>}
        {poolErro&&<p className="text-xs text-destructive">Erro ao consultar os signatários configurados.</p>}
        {!poolErro&&!ass&&!elegiveis.length&&<p className="mt-1 text-[10px] text-muted-foreground">
         Cadastre um signatário elegível em Configurações → Matriz de Assinaturas SEI.</p>}</div>
       </div>;
      })}
     </div>
     <p className="text-[11px] text-muted-foreground">Um signatário por função. Os cargos alternativos exigem somente uma pessoa, não duas.</p>
    </section>}
    {pedidoOk&&<section className="space-y-2 border-t pt-4">
     <h4 className="text-xs font-semibold">Envio à SEFAZ.UCG.AEO</h4>
     {envio?<p className="flex items-center gap-2 text-xs text-emerald-700">
      <CheckCircle2 className="h-4 w-4"/> Confirmado em {new Date(envio.confirmado_em).toLocaleString("pt-BR")}.
     </p>:<label className="flex items-start gap-2 rounded-md border p-3 text-xs">
      <Checkbox checked={false} disabled={!editavel||!assinaturasCompletas||confirmarEnvio.isPending}
       onCheckedChange={v=>{if(v===true)confirmarEnvio.mutate();}}/>
      Confirmo o encaminhamento do documento assinado à SEFAZ.UCG.AEO.
     </label>}
    </section>}
   </div>
  </Etapa>
  <Etapa n={3} heading="Nota de Empenho emitida" ok={!!nota?.numero_ne} active={!!envio&&!nota?.numero_ne}>
   {nota?.numero_ne?<p className="text-sm font-medium">NE {nota.numero_ne}/{nota.exercicio_ne} · {brl(Number(nota.valor_ne))}
    {nota.link_sei_ne&&<span className="ml-2"><SeiButton href={nota.link_sei_ne} label="Documento SEI"/></span>}</p>:
    podeEditar&&lancamento.status==="formalizado"&&<div className="grid gap-2 md:grid-cols-[1fr_100px_150px_130px_1fr_auto] md:items-end">
     <Campo label="Número NE"><Input value={ne} onChange={e=>setNe(e.target.value)}/></Campo>
     <Campo label="Exercício"><Input type="number" value={exercicio} onChange={e=>setExercicio(Number(e.target.value))}/></Campo>
     <Campo label="Valor NE"><CurrencyInput value={valorNE} onChange={setValorNE}/></Campo>
     <Campo label="Número SEI"><Input value={numeroNE} onChange={e=>setNumeroNE(e.target.value)}/></Campo>
     <Campo label="Link SEI"><Input value={linkNE} onChange={e=>setLinkNE(e.target.value)}/></Campo>
     <Button disabled={registrarNE.isPending} onClick={()=>registrarNE.mutate()}>Registrar NE</Button>
    </div>}
  </Etapa>
  {erro&&<p role="alert" className="rounded-md border border-destructive/30 p-3 text-xs text-destructive">{erro}</p>}
  <Dialog open={reverterAberto} onOpenChange={setReverterAberto}>
   <DialogContent><DialogHeader><DialogTitle>Reverter aprovação financeira?</DialogTitle>
    <DialogDescription>A aprovação permanecerá no histórico. Os dados da solicitação e as assinaturas
     ainda não formalizados serão invalidados. Após o envio à SEFAZ não será possível reverter por este fluxo.</DialogDescription>
   </DialogHeader>
   <DialogFooter><Button variant="outline" onClick={()=>setReverterAberto(false)}>Cancelar</Button>
    <Button variant="destructive" disabled={reabrir.isPending} onClick={()=>reabrir.mutate()}>Reverter aprovação</Button></DialogFooter>
   </DialogContent>
  </Dialog>
 </div>;
}
