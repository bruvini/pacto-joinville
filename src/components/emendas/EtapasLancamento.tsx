import {useEffect,useMemo,useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {CheckCircle2,Clock3,LockKeyhole,Send} from "lucide-react";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/checkbox";
import {Badge} from "@/components/ui/badge";
import {CurrencyInput} from "@/components/inputs/CurrencyInput";
import {SeiButton} from "@/components/inputs/SeiLink";
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
 {id:"orcamentos",label:"Coordenador de Orçamentos"},
 {id:"fiscal",label:"Fiscal"},
 {id:"gerencia_acp",label:"Gerente / Coordenador ACP"},
 {id:"diretor_servicos",label:"Diretor de Serviços Complementares"},
 {id:"diretoria_financeira",label:"Diretoria Financeira / Secretária de Saúde"},
] as const;
function Campo({label,children}:{label:string;children:React.ReactNode}) {
 return <div className="min-w-0 space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Envelope({n,heading,ok,active,children}:{n:number;heading:string;ok:boolean;active:boolean;children?:React.ReactNode}){
 return <section className={"rounded-lg border "+(active?"border-primary/50 bg-card":"bg-muted/10")}>
  <header className="flex items-center gap-3 px-4 py-3">
   <span className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold "+(ok?"bg-emerald-600 text-white":active?"bg-primary text-primary-foreground":"bg-muted text-muted-foreground")}>
    {ok?<CheckCircle2 className="h-4 w-4"/>:n}</span>
   <div className="flex-1"><h3 className="text-sm font-semibold">{heading}</h3>
    <p className="text-xs text-muted-foreground">{ok?"Concluída":active?"Etapa atual":"Aguardando etapa anterior"}</p></div>
   {!ok&&!active&&<LockKeyhole className="h-4 w-4 text-muted-foreground"/>}
  </header>
  {(active||ok)&&children&&<div className="border-t px-4 py-4">{children}</div>}
 </section>;
}
type Props={lancamento:L;etapas:E[];assinaturas:A[];nota?:S;
 pareceres:P[];envio?:Envio;saldoDisponivel:number;podeEditar:boolean;onAtualizar:()=>Promise<void>};
export function EtapasLancamento({lancamento,etapas,assinaturas,nota,pareceres,envio,saldoDisponivel,podeEditar,onAtualizar}:Props){
 const dot=etapas.find(e=>e.etapa==="dotacao");
 const pedido=etapas.find(e=>e.etapa==="solicitacao");
 const opinioes=[...pareceres].sort((a,b)=>b.ocorrido_em.localeCompare(a.ocorrido_em)||b.id.localeCompare(a.id));
 const aprovado=opinioes[0]?.desfecho==="aprovado" &&
    !!dot?.conferido_em && opinioes[0].ocorrido_em>=dot.conferido_em;
 const dotOk=dot?.coord_orcamentos_confirmada===true;
 const pedidoOk=!!pedido&&aprovado;
 const assinaturasOk=papeis.every(p=>assinaturas.some(a=>a.papel===p.id));
 const emPreparacao=lancamento.status==="rascunho";
 const etapaAtiva=!dotOk?1:!aprovado?2:!pedidoOk?3:!assinaturasOk?4:!envio?5:!nota?.numero_ne?6:7;
 const editavel=podeEditar&&emPreparacao;
 const [dotacao,setDotacao]=useState(dot?.dotacao??"");
 const [fonte,setFonte]=useState(dot?.fonte??"");
 const [confirma,setConfirma]=useState(false);
 const [desfecho,setDesfecho]=useState<"aprovado"|"recusado">("aprovado");
 const [comentario,setComentario]=useState("");
 const [numero,setNumero]=useState(pedido?.numero_sei??"");
 const [link,setLink]=useState(pedido?.link_sei??"");
 const [valor,setValor]=useState(Number(pedido?.valor_solicitado??0));
 const [edicaoAss,setEdicaoAss]=useState<string>("");
 const [sign,setSign]=useState("");
 const [assinNumero,setAssinNumero]=useState("");
 const [assinLink,setAssinLink]=useState("");
 const [ne,setNe]=useState("");const [exercicio,setExercicio]=useState(new Date().getFullYear());
 const [valorNE,setValorNE]=useState(Number(nota?.valor_solicitado??0));
 const [numeroNE,setNumeroNE]=useState("");const [linkNE,setLinkNE]=useState("");
 const [erro,setErro]=useState("");
 useEffect(()=>{setDotacao(dot?.dotacao??"");setFonte(dot?.fonte??"");},[dot?.id,dot?.conferido_em]);
 useEffect(()=>{setNumero(pedido?.numero_sei??"");setLink(pedido?.link_sei??"");
  setValor(Number(pedido?.valor_solicitado??0));},[pedido?.id,pedido?.conferido_em]);
 const mutate=(fn:()=>Promise<void>,sucesso:string)=>useMutation({
  mutationFn:fn,onSuccess:async()=>{setErro("");await onAtualizar();toast.success(sucesso);},
  onError:(e:Error)=>{setErro(e.message);toast.error(e.message);},
 });
 const guardarDotacao=mutate(async()=>{
  if(!dotacao.trim()||!fonte.trim())throw Error("Informe dotação e fonte.");
  const r=await supabase.rpc("emenda_confirmar_dotacao",{
   p_lancamento:lancamento.id,p_dotacao:dotacao.trim(),p_fonte:fonte.trim(),p_confirmado:true});
  if(r.error)throw r.error;
  setConfirma(false);
 },"Dotação confirmada. Autorização financeira liberada.");
 const guardarParecer=mutate(async()=>{
  if(comentario.trim().length<5)throw Error("Descreva a decisão em pelo menos 5 caracteres.");
  const r=await supabase.rpc("emenda_parecer_financeiro",{
   p_lancamento:lancamento.id,p_desfecho:desfecho,p_comentario:comentario.trim()});
  if(r.error)throw r.error;setComentario("");
 },"Parecer financeiro registrado no histórico.");
 const guardarPedido=mutate(async()=>{
  if(!numero.trim()||!linkHttpsValido(link)||!link.trim())throw Error("Informe SEI e link HTTPS.");
  if(valor<=0||valor>saldoDisponivel)
   throw Error("O valor solicitado deve ser positivo e não pode exceder o disponível ("+brl(saldoDisponivel)+").");
  const r=await supabase.rpc("emenda_salvar_etapa_documental",{
   p_lancamento:lancamento.id,p_etapa:"solicitacao",p_numero_sei:numero.trim(),
   p_link_sei:normalizarLinkHttpsSei(link)!,p_valor:valor});
  if(r.error)throw r.error;
 },"Solicitação registrada. Matriz de assinaturas liberada.");
 const guardarAssinatura=mutate(async()=>{
  if(!edicaoAss||!sign.trim()||!assinNumero.trim()||!assinLink.trim()||!linkHttpsValido(assinLink))
   throw Error("Informe signatário e documento assinado no SEI.");
  const r=await supabase.rpc("emenda_conferir_assinatura",{
   p_lancamento:lancamento.id,p_papel:edicaoAss,p_nome:sign.trim(),
   p_numero_sei:assinNumero.trim(),p_link_sei:normalizarLinkHttpsSei(assinLink)!});
  if(r.error)throw r.error;
  setEdicaoAss("");setSign("");setAssinNumero("");setAssinLink("");
 },"Assinatura conferida.");
 const confirmarEnvio=mutate(async()=>{
  const r=await supabase.rpc("emenda_confirmar_envio_sefaz",{p_lancamento:lancamento.id});
  if(r.error)throw r.error;
 },"Envio SEFAZ.UCG.AEO confirmado; solicitação formalizada e saldo reservado.");
 const registrarNE=mutate(async()=>{
  if(!ne.trim()||!numeroNE.trim()||!linkNE.trim()||!linkHttpsValido(linkNE)||valorNE<=0)
   throw Error("Preencha a NE emitida e seu documento SEI.");
  const r=await supabase.rpc("emenda_registrar_ne_documental",{
   p_lancamento:lancamento.id,p_numero_ne:ne.trim(),p_exercicio:exercicio,p_valor:valorNE,
   p_numero_sei:numeroNE.trim(),p_link_sei:normalizarLinkHttpsSei(linkNE)!});
  if(r.error)throw r.error;
 },"NE emitida registrada no PACTO.");
 const painelErro=erro&&<p role="alert" className="mt-2 text-sm text-destructive">{erro}</p>;
 return <div className="space-y-2">
  <Envelope n={1} heading="Dotação e fonte · Coordenação de Orçamentos" ok={dotOk} active={etapaAtiva===1}>
   <div className="space-y-3">
    <div className="grid gap-3 md:grid-cols-2">
     <Campo label="Dotação"><Input value={dotacao} disabled={!editavel} onChange={e=>{setDotacao(e.target.value);setConfirma(false);}} placeholder="Dotação orçamentária"/></Campo>
     <Campo label="Fonte"><Input value={fonte} disabled={!editavel} onChange={e=>{setFonte(e.target.value);setConfirma(false);}} placeholder="Fonte de recursos"/></Campo>
    </div>
    {editavel&&dotacao.trim()&&fonte.trim()&&(!dotOk||dotacao!==dot?.dotacao||fonte!==dot?.fonte)&&
     <label className="flex items-center gap-2 rounded-md border p-3 text-xs">
      <Checkbox checked={confirma} disabled={guardarDotacao.isPending}
       onCheckedChange={v=>{if(v===true){setConfirma(true);guardarDotacao.mutate();}else setConfirma(false);}}/>
      Confirmo que registrei a dotação e a fonte no bloco da Coordenação de Orçamentos.
     </label>}
    {dotOk&&<p className="text-xs text-muted-foreground">Registro confirmado; alterações exigem nova confirmação e invalidam etapas posteriores.</p>}
   </div>
  </Envelope>
  <Envelope n={2} heading="Autorização financeira · Histórico de decisões" ok={aprovado} active={etapaAtiva===2}>
   <div className="space-y-3">
    {opinioes.length>0&&<ol className="space-y-2 border-l pl-4 text-xs">
     {opinioes.map(p=><li key={p.id} className="relative border-b pb-2 last:border-0">
      <span className={"font-semibold "+(p.desfecho==="recusado"?"text-destructive":"text-emerald-700")}>{p.desfecho==="recusado"?"RECUSADO":"APROVADO"}</span>
      <span className="text-muted-foreground"> · {new Date(p.ocorrido_em).toLocaleString("pt-BR")}</span>
      <p className="mt-1 whitespace-pre-wrap">{p.comentario}</p>
     </li>)}</ol>}
    {editavel&&dotOk&&(etapaAtiva===2||aprovado)&&<div className="grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-end">
     <Campo label="Decisão do financeiro">
      <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={desfecho}
       onChange={e=>setDesfecho(e.target.value as "aprovado"|"recusado")}>
       <option value="aprovado">Aprovado</option><option value="recusado">Recusado</option>
      </select>
     </Campo>
     <Campo label={desfecho==="recusado"?"Justificativa da recusa":"Comentário do parecer"}>
      <Textarea rows={1} value={comentario} onChange={e=>setComentario(e.target.value)} placeholder="Registre o desfecho da análise financeira"/>
     </Campo>
     <Button disabled={guardarParecer.isPending||comentario.trim().length<5}
      onClick={()=>guardarParecer.mutate()}>Registrar parecer</Button>
    </div>}
    {opinioes[0]?.desfecho==="recusado"&&<p className="text-xs text-destructive">
     A solicitação permanece bloqueada até novo parecer favorável.</p>}
   </div>
  </Envelope>
  <Envelope n={3} heading="Solicitação de empenho e conferência do saldo" ok={pedidoOk} active={etapaAtiva===3}>
   <div className="space-y-3">
    {pedido&&<p className="text-xs">Solicitação SEI {pedido.numero_sei} · {brl(Number(pedido.valor_solicitado))}
     {pedido.link_sei&&<span className="ml-2"><SeiButton href={pedido.link_sei} label="Abrir documento"/></span>}</p>}
    {editavel&&aprovado&&<div className="grid gap-3 md:grid-cols-[170px_minmax(160px,1fr)_180px_auto] md:items-end">
     <Campo label="Número SEI da solicitação"><Input value={numero} onChange={e=>setNumero(e.target.value)} autoComplete="off"/></Campo>
     <Campo label="Link SEI"><Input value={link} onChange={e=>setLink(e.target.value)} autoComplete="off"/></Campo>
     <Campo label="Valor solicitado"><CurrencyInput value={valor} onChange={setValor}/></Campo>
     <Button disabled={guardarPedido.isPending||valor<=0||valor>saldoDisponivel}
      onClick={()=>guardarPedido.mutate()}>Validar solicitação</Button>
    </div>}
    <p className="text-xs text-muted-foreground">Disponível para novas solicitações: {brl(saldoDisponivel)}.</p>
   </div>
  </Envelope>
  <Envelope n={4} heading="Matriz de cinco assinaturas" ok={assinaturasOk} active={etapaAtiva===4}>
   <div className="space-y-2">
    {papeis.map(p=>{
     const ass=assinaturas.find(a=>a.papel===p.id);
     return <div key={p.id} className="space-y-2 rounded-md border p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <div><strong>{p.label}</strong><p className="text-muted-foreground">{ass?ass.nome_signatario:"Assinatura pendente"}</p></div>
       <div className="flex items-center gap-2">{ass&&<SeiButton href={ass.link_sei} label={"SEI "+ass.numero_sei}/>}
        {editavel&&pedidoOk&&<Button size="sm" variant="outline"
         onClick={()=>{setEdicaoAss(p.id);setSign(ass?.nome_signatario??"");
          setAssinNumero(ass?.numero_sei??"");setAssinLink(ass?.link_sei??"");}}>
         {ass?"Revisar":"Conferir"}</Button>}</div>
      </div>
      {edicaoAss===p.id&&<div className="grid gap-2 md:grid-cols-[1fr_140px_1fr_auto] md:items-end">
       <Campo label="Nome do signatário"><Input value={sign} onChange={e=>setSign(e.target.value)}/></Campo>
       <Campo label="Número SEI"><Input value={assinNumero} onChange={e=>setAssinNumero(e.target.value)}/></Campo>
       <Campo label="Link do documento assinado"><Input value={assinLink} onChange={e=>setAssinLink(e.target.value)}/></Campo>
       <Button disabled={guardarAssinatura.isPending} onClick={()=>guardarAssinatura.mutate()}>Salvar conferência</Button>
      </div>}
     </div>;
    })}
   </div>
  </Envelope>
  <Envelope n={5} heading="Confirmação de envio à SEFAZ.UCG.AEO" ok={!!envio} active={etapaAtiva===5}>
   {envio?<p className="text-xs text-muted-foreground">Confirmado em {new Date(envio.confirmado_em).toLocaleString("pt-BR")}. A reserva foi formalizada.</p>:
    <label className="flex items-center gap-2 text-sm">
     <Checkbox disabled={!editavel||!assinaturasOk||confirmarEnvio.isPending} checked={false}
      onCheckedChange={v=>{if(v===true)confirmarEnvio.mutate();}}/>
     Confirmo que o documento assinado foi encaminhado para SEFAZ.UCG.AEO.
    </label>}
  </Envelope>
  <Envelope n={6} heading="Registro da Nota de Empenho emitida" ok={!!nota?.numero_ne} active={etapaAtiva===6}>
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
  </Envelope>
  {painelErro}
 </div>;
}
