import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {Plus,CalendarClock,ReceiptText,RotateCcw,FilePenLine,ArrowDownToLine,ClipboardCheck} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {brl} from "@/lib/format";
import {valorMoedaDistribuicao} from "@/lib/emendas/distribuicao-ne";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogHeader,DialogDescription,DialogTitle,DialogFooter} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";

type Parcela=Tables<"emenda_pagamento_parcelas_painel">;
type Resumo=Tables<"emenda_pagamento_subempenhos_painel">;
type Ajuste=Tables<"emenda_pagamento_ajustes">;
type Retificacao=Tables<"emenda_pagamento_retificacoes">;
type Programacao=Tables<"emenda_pagamento_programacoes">;
type Conciliacao=Tables<"emenda_pagamento_conciliacoes">;
type TipoAcao="nova"|"programar"|"reprogramar"|"cancelar_programacao"|"comprovar"|"devolucao"|"estorno"|"retificar"|"conciliar"|"reabrir";
type Acao={tipo:TipoAcao;parcela?:Parcela;origem?:{tipo:"programacao"|"comprovante"|"ajuste";id:string}};
const camposDeValor=new Set<TipoAcao>(["programar","reprogramar","comprovar","devolucao","estorno"]);
const precisaMotivo=new Set<TipoAcao>(["reprogramar","cancelar_programacao","devolucao","estorno","retificar","conciliar","reabrir"]);
const hoje=()=>{const d=new Date();return [
 d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")
].join("-");};

const titulos:Record<TipoAcao,string>={
 nova:"Incluir nova parcela",
 programar:"Registrar programação de pagamento",
 reprogramar:"Reprogramar a parcela",
 cancelar_programacao:"Cancelar programação com documento",
 comprovar:"Registrar comprovante de pagamento",
 devolucao:"Registrar devolução financeira",
 estorno:"Registrar estorno de lançamento",
 retificar:"Retificar referência documental",
 conciliar:"Conciliar e confirmar quitação",
 reabrir:"Reabrir conciliação",
};

export function PainelPagamentosEmenda({subempenhoId,emendaId,podeEditar,onAtualizar}:{
 subempenhoId:string;emendaId:string;podeEditar:boolean;onAtualizar:()=>Promise<void>;
}){
 const qc=useQueryClient();
 const [acao,setAcao]=useState<Acao|null>(null);
 const [valor,setValor]=useState("");
 const [numero,setNumero]=useState("");
 const [link,setLink]=useState("");
 const [dataDocumento,setDataDocumento]=useState(hoje);
 const [dataEvento,setDataEvento]=useState(hoje);
 const [dataPrevista,setDataPrevista]=useState(hoje);
 const [motivo,setMotivo]=useState("");
 const [chave,setChave]=useState(()=>crypto.randomUUID());
 const consulta=useQuery({
  queryKey:["emendas","pagamentos-subempenho",subempenhoId],
  queryFn:async()=>{
   const [resumo,parcelas,ajustes,retificacoes,programacoes,conciliacoes]=await Promise.all([
    supabase.from("emenda_pagamento_subempenhos_painel").select("*").eq("subempenho_id",subempenhoId).maybeSingle(),
    supabase.from("emenda_pagamento_parcelas_painel").select("*").eq("subempenho_id",subempenhoId).order("sequencia"),
    supabase.from("emenda_pagamento_ajustes").select("*").eq("subempenho_id",subempenhoId).order("registrado_em"),
    supabase.from("emenda_pagamento_retificacoes").select("*").eq("subempenho_id",subempenhoId).order("registrado_em"),
    supabase.from("emenda_pagamento_programacoes").select("*").eq("subempenho_id",subempenhoId).order("sequencia"),
    supabase.from("emenda_pagamento_conciliacoes").select("*").eq("subempenho_id",subempenhoId).order("sequencia"),
   ]);
   for(const r of [resumo,parcelas,ajustes,retificacoes,programacoes,conciliacoes])if(r.error)throw r.error;
   return {resumo:resumo.data,parcelas:parcelas.data??[],ajustes:ajustes.data??[],
    retificacoes:retificacoes.data??[],programacoes:programacoes.data??[],
    conciliacoes:conciliacoes.data??[]};
  },
 });
 const recarregar=async()=>{
  await qc.invalidateQueries({queryKey:["emendas","pagamentos-subempenho",subempenhoId]});
  await onAtualizar();
 };
 function abrir(tipo:TipoAcao,parcela?:Parcela,origem?:Acao["origem"]){
  setAcao({tipo,parcela,origem});setChave(crypto.randomUUID());setNumero("");setLink("");
  setDataDocumento(hoje());setDataEvento(hoje());setDataPrevista(hoje());setMotivo("");
  setValor(tipo==="cancelar_programacao"?"0":tipo==="comprovar"&&parcela?
   Number(parcela.valor_programado??0).toFixed(2).replace(".",","):"");
 }
 const executar=useMutation({
  mutationFn:async()=>{
   if(!acao)throw Error("Selecione uma ação.");
   const tipo=acao.tipo,p=acao.parcela;
   if(tipo==="nova"){
    const r=await supabase.rpc("emenda_pag_parcela_criar",{
     p_subempenho:subempenhoId,p_chave:chave});
    if(r.error)throw r.error;
    return;
   }
   if(!numero.trim()||!/^https:\/\/\S+$/i.test(link.trim())||!dataDocumento)
    throw Error("Informe número, link HTTPS e data do documento SEI.");
   if(precisaMotivo.has(tipo)&&motivo.trim().length<10)
    throw Error("Informe justificativa de pelo menos 10 caracteres.");
   const valorNumerico=camposDeValor.has(tipo)?valorMoedaDistribuicao(valor):null;
   if(camposDeValor.has(tipo)&&valorNumerico===null)
    throw Error("Informe um valor positivo em reais, com até dois decimais.");
   const doc={p_numero_sei:numero.trim(),p_link_sei:link.trim(),
    p_data_documento:dataDocumento,p_chave:chave};
   if(tipo==="programar"||tipo==="reprogramar"||tipo==="cancelar_programacao"){
    if(!p?.id)throw Error("Parcela não selecionada.");
    const r=await supabase.rpc("emenda_pag_programar",{
     ...doc,p_parcela:p.id,p_valor:tipo==="cancelar_programacao"?0:valorNumerico!,
     p_data_prevista:dataPrevista,p_motivo:tipo==="programar"?null:motivo.trim(),
    });
    if(r.error)throw r.error;
   }else if(tipo==="comprovar"){
    if(!p?.id)throw Error("Parcela não selecionada.");
    const r=await supabase.rpc("emenda_pag_comprovar",{
     ...doc,p_parcela:p.id,p_valor:valorNumerico!,p_data_pagamento:dataEvento,
    });
    if(r.error)throw r.error;
   }else if(tipo==="devolucao"||tipo==="estorno"){
    if(!p?.comprovante_id)throw Error("Comprovante não localizado.");
    const r=await supabase.rpc("emenda_pag_ajustar",{
     ...doc,p_comprovante:p.comprovante_id,p_tipo:tipo,p_valor:valorNumerico!,
     p_data_evento:dataEvento,p_motivo:motivo.trim(),
    });
    if(r.error)throw r.error;
   }else if(tipo==="retificar"){
    if(!acao.origem)throw Error("Selecione a evidência original.");
    const r=await supabase.rpc("emenda_pag_retificar",{
     p_programacao:acao.origem.tipo==="programacao"?acao.origem.id:null,
     p_comprovante:acao.origem.tipo==="comprovante"?acao.origem.id:null,
     p_ajuste:acao.origem.tipo==="ajuste"?acao.origem.id:null,
     ...doc,p_motivo:motivo.trim(),
    });
    if(r.error)throw r.error;
   }else if(tipo==="conciliar"||tipo==="reabrir"){
    const r=await supabase.rpc("emenda_pag_conciliar",{
     p_subempenho:subempenhoId,p_evento:tipo==="conciliar"?"conciliado":"reaberto",
     p_numero_sei:doc.p_numero_sei,p_link_sei:doc.p_link_sei,
     p_data_evento:dataEvento,p_motivo:motivo.trim(),p_chave:chave,
    });
    if(r.error)throw r.error;
   }
  },
  onSuccess:async()=>{
   setAcao(null);await recarregar();
   toast.success("Evento financeiro registrado com documento e histórico preservados.");
  },
  onError:(e:Error)=>toast.error(e.message),
 });
 const resumo=consulta.data?.resumo;
 const conciliado=resumo?.conciliado===true;
 const saldoZero=resumo?.valor_subempenhado!=null&&
  Math.abs(Number(resumo.saldo_a_pagar??1))<0.005 &&
  Math.abs(Number(resumo.saldo_a_programar??1))<0.005;
 return <section className="rounded-lg border bg-muted/5 p-3 space-y-3"
  aria-label="Programação e pagamentos parciais do subempenho">
  <header className="flex flex-wrap items-start justify-between gap-2">
   <div>
    <h4 className="text-sm font-semibold">Programação e pagamentos parciais</h4>
    <p className="text-xs text-muted-foreground">
     Cada cartão corresponde a uma parcela. Programação e comprovante são documentos
     separados; nem programação nem pagamento parcial significam quitação.
    </p>
   </div>
   <Badge variant={conciliado?"default":"outline"}>
    {conciliado?"Conciliado":saldoZero?"Saldo zerado · conciliação pendente":"Em execução"}
   </Badge>
  </header>
  {consulta.isPending&&<p className="text-xs text-muted-foreground">Consultando execução financeira...</p>}
  {consulta.error&&<p className="text-xs text-destructive" role="alert">
   Falha no painel de pagamentos. Confirme as migrations da Fase E: {consulta.error.message}
  </p>}
  {resumo&&<div className="space-y-3">
   <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
    <Metrica titulo="Valor subempenhado" valor={resumo.valor_subempenhado}/>
    <Metrica titulo="Programado vigente" valor={resumo.valor_programado}/>
    <Metrica titulo="Efetivamente pago (líquido)" valor={resumo.valor_pago_liquido}/>
    <Metrica titulo="Saldo a pagar" valor={resumo.saldo_a_pagar} destaque/>
   </div>
   <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
    <span>Pago bruto: <strong>{brl(Number(resumo.valor_pago_bruto??0))}</strong></span>
    <span>Devoluções: <strong>{brl(Number(resumo.valor_devolvido??0))}</strong></span>
    <span>Estornos: <strong>{brl(Number(resumo.valor_estornado??0))}</strong></span>
    <span>Não programado: <strong>{brl(Number(resumo.saldo_a_programar??0))}</strong></span>
    <span>Programado ainda não pago: <strong>{brl(Number(resumo.programado_nao_pago??0))}</strong></span>
   </div>
   {conciliado&&<div className="rounded-md border p-3 text-xs">
    Conciliação financeira registrada no SEI
    {resumo.conciliacao_link_sei&&<a href={resumo.conciliacao_link_sei}
     target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline">
      {resumo.conciliacao_numero_sei}</a>}.
    Alterações financeiras exigem reabertura documentada.
   </div>}
   <div className="flex flex-wrap gap-2">
    {podeEditar&&!conciliado&&<Button size="sm" onClick={()=>abrir("nova")}>
     <Plus className="mr-1 h-4 w-4"/>Nova parcela</Button>}
    {podeEditar&&!conciliado&&saldoZero&&<Button size="sm" variant="outline"
     onClick={()=>abrir("conciliar")}><ClipboardCheck className="mr-1 h-4 w-4"/>
     Conciliar pagamento</Button>}
    {podeEditar&&conciliado&&<Button size="sm" variant="outline"
     onClick={()=>abrir("reabrir")}><RotateCcw className="mr-1 h-4 w-4"/>Reabrir conciliação</Button>}
   </div>
   {!consulta.data?.parcelas.length&&<p className="text-xs text-muted-foreground rounded border border-dashed p-3">
    Nenhuma parcela cadastrada. Inclua uma parcela e registre sua programação documental.
   </p>}
   <div className="space-y-3">
    {(consulta.data?.parcelas??[]).map(p=><CartaoParcela key={p.id} parcela={p}
     ajustes={(consulta.data?.ajustes??[]).filter(x=>x.parcela_id===p.id)}
     retificacoes={(consulta.data?.retificacoes??[]).filter(x=>x.parcela_id===p.id)}
     programacoes={(consulta.data?.programacoes??[]).filter(x=>x.parcela_id===p.id)}
     podeEditar={podeEditar&&!conciliado} abrir={abrir}/>)}
   </div>
   {!!consulta.data?.conciliacoes.length&&<details className="text-xs">
    <summary className="cursor-pointer font-medium">Histórico de conciliação e reabertura</summary>
    <div className="mt-2 space-y-1">
     {consulta.data.conciliacoes.map(c=><p key={c.id} className="rounded border p-2">
      {c.evento==="conciliado"?"Conciliação":"Reabertura"} ·
      {c.data_evento} · líquido {brl(Number(c.valor_pago_liquido_snapshot))} ·
      <a href={c.link_sei} className="ml-1 text-primary underline" target="_blank"
       rel="noopener noreferrer">SEI {c.numero_sei}</a> · {c.motivo}
     </p>)}
    </div>
   </details>}
  </div>}
  <Dialog open={!!acao} onOpenChange={open=>{if(!open&&!executar.isPending)setAcao(null);}}>
   <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <DialogHeader>
     <DialogTitle>{acao?titulos[acao.tipo]:"Evento financeiro"}</DialogTitle>
     <DialogDescription>
      {acao?.parcela?"Parcela nº "+acao.parcela.sequencia+". ":""}
      O registro é documental e não executa transações no e-Pública ou no SEI.
      Os dados originais serão preservados na trilha de auditoria.
     </DialogDescription>
    </DialogHeader>
    {acao&&<div className="space-y-3">
     {acao.tipo==="nova"?<p className="text-sm">
      Será criado um cartão de parcela vazio, sem programação ou pagamento presumido.
     </p>:<>
      {camposDeValor.has(acao.tipo)&&<Campo label="Valor (R$)">
       <Input value={valor} onChange={e=>setValor(e.target.value)}
        placeholder="0,00" inputMode="decimal"/></Campo>}
      {acao.tipo==="cancelar_programacao"&&<p className="text-xs text-muted-foreground">
       A nova programação será R$ 0,00. Não é permitido cancelar uma programação
       com pagamento líquido ainda registrado; faça a regularização primeiro.
      </p>}
      {["programar","reprogramar","cancelar_programacao"].includes(acao.tipo)&&
       <Campo label="Data prevista para pagamento"><Input type="date"
        value={dataPrevista} onChange={e=>setDataPrevista(e.target.value)}/></Campo>}
      {["comprovar","devolucao","estorno","conciliar","reabrir"].includes(acao.tipo)&&
       <Campo label={acao.tipo==="comprovar"?"Data do pagamento":"Data do evento"}>
        <Input type="date" value={dataEvento} onChange={e=>setDataEvento(e.target.value)}/>
       </Campo>}
      <div className="grid gap-3 sm:grid-cols-2">
       <Campo label="Número do documento SEI"><Input value={numero}
        onChange={e=>setNumero(e.target.value)}/></Campo>
       <Campo label="Link do documento SEI"><Input value={link}
        onChange={e=>setLink(e.target.value)} placeholder="https://..."/></Campo>
      </div>
      {!["conciliar","reabrir"].includes(acao.tipo)&&<Campo label="Data do documento SEI">
       <Input type="date" value={dataDocumento} onChange={e=>setDataDocumento(e.target.value)}/></Campo>}
      {precisaMotivo.has(acao.tipo)&&<Campo label="Justificativa documentada">
       <Textarea value={motivo} onChange={e=>setMotivo(e.target.value)}
        rows={3} placeholder="Descreva o fundamento do ajuste e a referência ao processo"/></Campo>}
      {acao.tipo==="retificar"&&<p className="text-xs text-muted-foreground">
       Esta retificação corrige apenas a referência documental. Para corrigir o valor
       financeiro, registre estorno/devolução e, quando cabível, nova parcela.
      </p>}
      {acao.tipo==="conciliar"&&<p className="text-xs text-muted-foreground">
       O banco conferirá se pagamento líquido e programação vigentes são iguais
       ao valor subempenhado. O saldo zero, por si só, não marca quitação.
      </p>}
     </>}
    </div>}
    <DialogFooter>
     <Button variant="outline" disabled={executar.isPending} onClick={()=>setAcao(null)}>Voltar</Button>
     <Button disabled={executar.isPending} onClick={()=>executar.mutate()}>
      {acao?.tipo==="nova"?"Criar parcela":"Registrar evento"}
     </Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 </section>;
}

function Metrica({titulo,valor,destaque=false}:{titulo:string;valor:number|null;destaque?:boolean}){
 return <div className={"rounded border px-3 py-2 "+(destaque?"bg-muted/20":"bg-background")}>
  <p className="text-[11px] text-muted-foreground">{titulo}</p>
  <p className="text-sm font-semibold">{valor===null?"—":brl(Number(valor))}</p>
 </div>;
}
function Campo({label,children}:{label:string;children:React.ReactNode}){
 return <label className="block space-y-1">
  <span className="text-xs font-medium">{label}</span>{children}
 </label>;
}
function CartaoParcela({parcela:p,ajustes,retificacoes,programacoes,podeEditar,abrir}:{
 parcela:Parcela;ajustes:Ajuste[];retificacoes:Retificacao[];
 programacoes:Programacao[];podeEditar:boolean;
 abrir:(tipo:TipoAcao,parcela?:Parcela,origem?:Acao["origem"])=>void;
}){
 return <article className="space-y-3 rounded-lg border bg-card p-3">
  <header className="flex flex-wrap items-start justify-between gap-2">
   <div>
    <h5 className="text-sm font-semibold">Parcela #{p.sequencia}</h5>
    <p className="text-xs text-muted-foreground">
     Programado {brl(Number(p.valor_programado??0))} ·
     Pago líquido {brl(Number(p.valor_pago_liquido??0))} ·
     Pendente {brl(Number(p.saldo_programacao_pendente??0))}
    </p>
   </div>
   <Badge variant="outline">{p.situacao_parcela?.replaceAll("_"," ")}</Badge>
  </header>
  <div className="grid gap-3 md:grid-cols-2">
   <div className="space-y-2 rounded border p-3">
    <h6 className="flex items-center gap-2 text-xs font-semibold">
     <CalendarClock className="h-4 w-4"/>Programação
    </h6>
    {p.programacao_id?<div className="space-y-1 text-xs">
     <p>Versão {p.versao_programacao} · {p.tipo_programacao} · {brl(Number(p.valor_programado??0))}</p>
     <p>Previsão: {p.data_prevista}</p>
     <a href={p.programacao_link_sei??"#"} className="text-primary underline"
      target="_blank" rel="noopener noreferrer">SEI {p.programacao_numero_sei}</a>
     {p.programacao_numero_sei_original!==p.programacao_numero_sei&&<p className="text-muted-foreground">
      Original: {p.programacao_numero_sei_original} (preservado)</p>}
    </div>:<p className="text-xs text-muted-foreground">Ainda sem programação documental.</p>}
    {podeEditar&&<div className="flex flex-wrap gap-1">
     {!p.programacao_id?<Button size="sm" variant="outline"
      onClick={()=>abrir("programar",p)}>Programar</Button>:<>
      <Button size="sm" variant="outline" onClick={()=>abrir("reprogramar",p)}>
       <RotateCcw className="mr-1 h-3 w-3"/>Reprogramar</Button>
      {Number(p.valor_programado??0)>0&&<Button size="sm" variant="ghost"
       onClick={()=>abrir("cancelar_programacao",p)}>Cancelar programação</Button>}
      <Button size="sm" variant="ghost"
       onClick={()=>abrir("retificar",p,{tipo:"programacao",id:p.programacao_id!})}>
       <FilePenLine className="mr-1 h-3 w-3"/>Corrigir SEI</Button>
     </>}
    </div>}
   </div>
   <div className="space-y-2 rounded border p-3">
    <h6 className="flex items-center gap-2 text-xs font-semibold">
     <ReceiptText className="h-4 w-4"/>Comprovante de pagamento
    </h6>
    {p.comprovante_id?<div className="space-y-1 text-xs">
     <p>Pago em {p.data_pagamento} · bruto {brl(Number(p.valor_pago_bruto??0))}</p>
     <p>Devolvido {brl(Number(p.valor_devolvido??0))} · estornado {brl(Number(p.valor_estornado??0))}</p>
     <p className="font-medium">Pago líquido {brl(Number(p.valor_pago_liquido??0))}</p>
     <a href={p.comprovante_link_sei??"#"} className="text-primary underline"
      target="_blank" rel="noopener noreferrer">SEI {p.comprovante_numero_sei}</a>
     {p.comprovante_numero_sei_original!==p.comprovante_numero_sei&&<p className="text-muted-foreground">
      Original: {p.comprovante_numero_sei_original} (preservado)</p>}
    </div>:<p className="text-xs text-muted-foreground">
     Nenhum pagamento efetivamente comprovado.
    </p>}
    {podeEditar&&<div className="flex flex-wrap gap-1">
     {!p.comprovante_id&&Number(p.valor_programado??0)>0&&<Button size="sm" variant="outline"
      onClick={()=>abrir("comprovar",p)}>Registrar pagamento</Button>}
     {p.comprovante_id&&<>
      <Button size="sm" variant="outline" onClick={()=>abrir("devolucao",p)}>
       <ArrowDownToLine className="mr-1 h-3 w-3"/>Devolução</Button>
      <Button size="sm" variant="ghost" onClick={()=>abrir("estorno",p)}>Estorno</Button>
      <Button size="sm" variant="ghost"
       onClick={()=>abrir("retificar",p,{tipo:"comprovante",id:p.comprovante_id!})}>
       <FilePenLine className="mr-1 h-3 w-3"/>Corrigir SEI</Button>
     </>}
    </div>}
   </div>
  </div>
  {(ajustes.length>0||retificacoes.length>0||programacoes.length>1)&&<details className="text-xs">
   <summary className="cursor-pointer font-medium">
    Histórico financeiro e documental · {programacoes.length} programação(ões),
    {ajustes.length} ajuste(s), {retificacoes.length} retificação(ões)
   </summary>
   <div className="mt-2 space-y-2">
    {programacoes.map(g=><p key={g.id} className="rounded border p-2">
     Programação #{g.sequencia} · {g.tipo} · {brl(Number(g.valor_programado))}
     {" · "}{g.data_prevista} ·
     <a href={g.link_sei} className="ml-1 text-primary underline"
      target="_blank" rel="noopener noreferrer">SEI original {g.numero_sei}</a>
     {g.justificativa&&" · "+g.justificativa}
     {podeEditar&&<Button variant="ghost" size="sm" className="ml-2"
      onClick={()=>abrir("retificar",p,{tipo:"programacao",id:g.id})}>Retificar referência</Button>}
    </p>)}
    {ajustes.map(a=><p key={a.id} className="rounded border p-2">
     {a.tipo==="devolucao"?"Devolução":"Estorno"} · {brl(Number(a.valor))}
     {" · "}{a.data_evento} ·
     <a href={a.link_sei} className="ml-1 text-primary underline"
      target="_blank" rel="noopener noreferrer">SEI original {a.numero_sei}</a>
     {" · "}{a.motivo}
     {podeEditar&&<Button variant="ghost" size="sm" className="ml-2"
      onClick={()=>abrir("retificar",p,{tipo:"ajuste",id:a.id})}>Retificar referência</Button>}
    </p>)}
    {retificacoes.map(r=><p key={r.id} className="rounded border p-2">
     Retificação em {new Date(r.registrado_em).toLocaleString("pt-BR")} ·
     <a href={r.novo_link_sei} className="ml-1 text-primary underline"
      target="_blank" rel="noopener noreferrer">SEI {r.novo_numero_sei}</a>
     {" · "}{r.motivo}
    </p>)}
   </div>
  </details>}
 </article>;
}
