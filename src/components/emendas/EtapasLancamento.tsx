import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Circle, FileCheck2, FileText, Landmark, Receipt, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiButton } from "@/components/inputs/SeiLink";
import { normalizarLinkHttpsSei, linkHttpsValido } from "@/lib/emendas/cadastro";
import { ROTULOS_ETAPA } from "@/lib/emendas/lancamentos";
import { brl } from "@/lib/format";
import type { Tables } from "@/integrations/supabase/types";

type Etapa=Tables<"emenda_etapas_documentais">;
type Assinatura=Tables<"emenda_assinaturas_conferidas">;
type Lancamento=Tables<"emenda_lancamentos">;
type Solicitacao=Tables<"emenda_solicitacoes">;
type TipoEtapa="dotacao"|"autorizacao"|"solicitacao";
type Papel="fiscal"|"gerencia"|"diretoria";
const papeis: {id:Papel;nome:string}[]=[
 {id:"fiscal",nome:"Fiscal"}, {id:"gerencia",nome:"Gerência/coordenação"},
 {id:"diretoria",nome:"Diretoria"},
];
type Props={
 lancamento:Lancamento;etapas:Etapa[];assinaturas:Assinatura[];nota?:Solicitacao;
 podeEditar:boolean;onAtualizar:()=>Promise<void>;
};
function Campo({label,children}:{label:string;children:React.ReactNode}) {
 return <div className="min-w-0 space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Documento({numero,link}:{numero:string;link:string}){
 return <SeiButton label={"SEI "+numero} href={link}/>;
}

export function EtapasLancamento({lancamento,etapas,assinaturas,nota,podeEditar,onAtualizar}:Props) {
 const [etapaEditando,setEtapaEditando]=useState<TipoEtapa|null>(null);
 const [numero,setNumero]=useState("");const [link,setLink]=useState("");
 const [dotacao,setDotacao]=useState("");const [fonte,setFonte]=useState("");
 const [valor,setValor]=useState(0);
 const [papel,setPapel]=useState<Papel|null>(null);
 const [signatario,setSignatario]=useState("");const [numeroAss,setNumeroAss]=useState("");const [linkAss,setLinkAss]=useState("");
 const [neNumero,setNeNumero]=useState("");const [neExercicio,setNeExercicio]=useState(new Date().getFullYear());
 const [neValor,setNeValor]=useState(0);const [neSei,setNeSei]=useState("");const [neLink,setNeLink]=useState("");
 const [erro,setErro]=useState("");
 const encontrados=useMemo(()=>new Map(etapas.map(e=>[e.etapa,e])),[etapas]);
 const assinados=useMemo(()=>new Map(assinaturas.map(a=>[a.papel,a])),[assinaturas]);
 const podeAlterar=podeEditar&&lancamento.status==="rascunho";
 const documentosCompletos=["dotacao","autorizacao","solicitacao"].every(k=>encontrados.has(k));
 const assinaturasCompletas=papeis.every(p=>assinados.has(p.id));
 function editarEtapa(k:TipoEtapa) {
  const e=encontrados.get(k);
  setEtapaEditando(k);setNumero(e?.numero_sei??"");setLink(e?.link_sei??"");
  setDotacao(e?.dotacao??"");setFonte(e?.fonte??"");setValor(Number(e?.valor_solicitado??0));setErro("");
 }
 function editarAssinatura(k:Papel){
  const s=assinados.get(k);setPapel(k);setSignatario(s?.nome_signatario??"");
  setNumeroAss(s?.numero_sei??"");setLinkAss(s?.link_sei??"");setErro("");
 }
 const mutation=(call:()=>Promise<void>,msg:string)=>({
  mutationFn:call,
  onSuccess:async()=>{await onAtualizar();setEtapaEditando(null);setPapel(null);setErro("");toast.success(msg);},
  onError:(err:Error)=>{setErro(err.message);toast.error("Não foi possível registrar", {description:err.message});},
 });
 const salvarEtapa=useMutation(mutation(async()=>{
  if(!etapaEditando)throw Error("Selecione a etapa.");
  if(!numero.trim()||!link.trim()||!linkHttpsValido(link))throw Error("Informe número SEI e link HTTPS.");
  const r=await supabase.rpc("emenda_salvar_etapa",{
   p_lancamento:lancamento.id,p_etapa:etapaEditando,
   p_numero_sei:numero.trim(),p_link_sei:normalizarLinkHttpsSei(link)!,
   p_dotacao:etapaEditando==="dotacao"?dotacao.trim():null,
   p_fonte:etapaEditando==="dotacao"?fonte.trim():null,
   p_valor:etapaEditando==="solicitacao"?valor:null,
  });
  if(r.error)throw r.error;
 },"Etapa documental conferida e registrada."));
 const salvarAssinatura=useMutation(mutation(async()=>{
  if(!papel||!signatario.trim()||!numeroAss.trim()||!linkAss.trim()||!linkHttpsValido(linkAss))
   throw Error("Informe signatário, documento SEI e link HTTPS.");
  const r=await supabase.rpc("emenda_conferir_assinatura",{
   p_lancamento:lancamento.id,p_papel:papel,p_nome:signatario.trim(),
   p_numero_sei:numeroAss.trim(),p_link_sei:normalizarLinkHttpsSei(linkAss)!,
  });
  if(r.error)throw r.error;
 },"Assinatura conferida por evidência no SEI."));
 const formalizar=useMutation(mutation(async()=>{
  const r=await supabase.rpc("emenda_formalizar_lancamento",{p_lancamento:lancamento.id});
  if(r.error)throw r.error;
 },"Solicitação formalizada; o valor foi reservado."));
 const registrarNE=useMutation(mutation(async()=>{
  if(!neNumero.trim()||!neSei.trim()||!neLink.trim()||!linkHttpsValido(neLink)||neValor<=0)
   throw Error("Preencha número, valor e evidência SEI da NE.");
  const r=await supabase.rpc("emenda_registrar_ne_documental",{
   p_lancamento:lancamento.id,p_numero_ne:neNumero.trim(),p_exercicio:neExercicio,
   p_valor:neValor,p_numero_sei:neSei.trim(),p_link_sei:normalizarLinkHttpsSei(neLink)!,
  });
  if(r.error)throw r.error;
 },"NE emitida registrada no PACTO."));
 useEffect(()=>{if(nota){setNeValor(Number(nota.valor_solicitado));}},[nota?.id]);

 return <div className="space-y-3">
  <div className="flex flex-wrap gap-2">
   {(["dotacao","autorizacao","solicitacao","assinaturas","ne"] as const).map((k,i)=>{
    const ok=i<3?encontrados.has(k):k==="assinaturas"?assinaturasCompletas:!!nota?.numero_ne;
    return <Badge key={k} variant={ok?"default":"outline"} className="gap-1 text-[11px]">
     {ok?<CheckCircle2 className="h-3 w-3"/>:<Circle className="h-3 w-3"/>}{ROTULOS_ETAPA[k]}
    </Badge>;
   })}
  </div>
  <div className="grid gap-3 xl:grid-cols-2">
   {(["dotacao","autorizacao","solicitacao"] as const).map((k,index)=>{
    const e=encontrados.get(k);
    const anterior=index===0||encontrados.has((["dotacao","autorizacao"] as const)[index-1]);
    return <Card key={k} className="min-w-0">
     <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm">
      <FileText className="h-4 w-4"/>{ROTULOS_ETAPA[k]}</CardTitle>
      <CardDescription>{e?"Conferida em "+new Date(e.conferido_em).toLocaleDateString("pt-BR"):"Aguardando documentação"}</CardDescription></CardHeader>
     <CardContent className="space-y-2 text-xs">
      {e&&<div className="space-y-1">
       {k==="dotacao"&&<p>Dotação {e.dotacao} · Fonte {e.fonte}</p>}
       {k==="solicitacao"&&<p>Valor solicitado: <strong>{brl(Number(e.valor_solicitado))}</strong></p>}
       <Documento numero={e.numero_sei} link={e.link_sei}/></div>}
      {podeAlterar&&anterior&&<Button size="sm" variant="outline" onClick={()=>editarEtapa(k)}>{e?"Reconferir":"Registrar etapa"}</Button>}
      {etapaEditando===k&&<div className="space-y-2 rounded-lg border bg-muted/20 p-3">
       <Campo label="Número SEI"><Input value={numero} onChange={e=>setNumero(e.target.value)} autoComplete="off"/></Campo>
       <Campo label="Link SEI"><Input value={link} onChange={e=>setLink(e.target.value)} autoComplete="off"/></Campo>
       {k==="dotacao"&&<><Campo label="Dotação"><Input value={dotacao} onChange={e=>setDotacao(e.target.value)}/></Campo>
        <Campo label="Fonte"><Input value={fonte} onChange={e=>setFonte(e.target.value)}/></Campo></>}
       {k==="solicitacao"&&<Campo label="Valor total a reservar"><CurrencyInput value={valor} onChange={setValor}/></Campo>}
       {erro&&<p role="alert" className="text-destructive">{erro}</p>}
       <div className="flex gap-2"><Button size="sm" onClick={()=>salvarEtapa.mutate()} disabled={salvarEtapa.isPending}>Confirmar conferência</Button>
        <Button size="sm" variant="ghost" onClick={()=>setEtapaEditando(null)}>Cancelar</Button></div>
      </div>}
     </CardContent>
    </Card>;
   })}
   <Card className="min-w-0">
    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm">
     <ShieldCheck className="h-4 w-4"/>4. Assinaturas verificadas no SEI</CardTitle>
     <CardDescription>Conferência documental; não realiza assinatura digital.</CardDescription></CardHeader>
    <CardContent className="space-y-2">
     {papeis.map(p=>{
      const a=assinados.get(p.id);
      return <div className="rounded-md border p-2" key={p.id}>
       <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>{p.nome}: <strong>{a?.nome_signatario??"Pendente"}</strong></span>
        {a&&<Documento numero={a.numero_sei} link={a.link_sei}/>}
        {podeAlterar&&documentosCompletos&&<Button variant="outline" size="sm" onClick={()=>editarAssinatura(p.id)}>{a?"Reconferir":"Conferir"}</Button>}
       </div>
       {papel===p.id&&<div className="mt-2 grid gap-2 rounded-lg bg-muted/20 p-2">
        <Campo label="Nome do signatário"><Input value={signatario} onChange={e=>setSignatario(e.target.value)}/></Campo>
        <Campo label="Documento SEI"><Input value={numeroAss} onChange={e=>setNumeroAss(e.target.value)}/></Campo>
        <Campo label="Link SEI assinado"><Input value={linkAss} onChange={e=>setLinkAss(e.target.value)}/></Campo>
        {erro&&<p className="text-xs text-destructive">{erro}</p>}
        <div className="flex gap-2"><Button size="sm" onClick={()=>salvarAssinatura.mutate()} disabled={salvarAssinatura.isPending}>Registrar conferência</Button>
         <Button size="sm" variant="ghost" onClick={()=>setPapel(null)}>Cancelar</Button></div>
       </div>}
      </div>;
     })}
    </CardContent>
   </Card>
  </div>
  <Card>
   <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Receipt className="h-4 w-4"/>5. Solicitação formalizada e Nota de Empenho</CardTitle>
    <CardDescription>A reserva só é lançada após as etapas e assinaturas. A NE é registrada apenas quando emitida.</CardDescription></CardHeader>
   <CardContent className="space-y-3">
    {lancamento.status==="rascunho"?
      <div className="flex flex-wrap items-center justify-between gap-2">
       <p className="text-xs text-muted-foreground">Antes da formalização: nenhuma reserva de saldo.</p>
       {podeEditar&&<Button disabled={!documentosCompletos||!assinaturasCompletas||formalizar.isPending}
        onClick={()=>formalizar.mutate()}><FileCheck2 className="mr-2 h-4 w-4"/>Formalizar solicitação e reservar</Button>}
      </div>:
      <div className="text-xs">Solicitação formalizada · <strong>{brl(Number(nota?.valor_solicitado??0))}</strong>
       {nota&&<div className="mt-2"><Documento numero={nota.numero_sei_solicitacao} link={nota.link_sei_solicitacao}/></div>}
      </div>}
    {nota?.numero_ne?<div className="text-xs">
      <p><strong>NE {nota.numero_ne}/{nota.exercicio_ne}</strong> · {brl(Number(nota.valor_ne))}</p>
      {nota.link_sei_ne&&<div className="mt-1"><Documento numero={nota.numero_sei_ne??nota.numero_ne} link={nota.link_sei_ne}/></div>}
     </div>:
      lancamento.status==="formalizado"&&podeEditar&&<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
       <Campo label="Número da NE"><Input value={neNumero} onChange={e=>setNeNumero(e.target.value)}/></Campo>
       <Campo label="Exercício da NE"><Input type="number" min={2000} max={2100} value={neExercicio} onChange={e=>setNeExercicio(Number(e.target.value))}/></Campo>
       <Campo label="Valor efetivo da NE"><CurrencyInput value={neValor} onChange={setNeValor}/></Campo>
       <Campo label="Número SEI da NE"><Input value={neSei} onChange={e=>setNeSei(e.target.value)}/></Campo>
       <Campo label="Link SEI da NE"><Input value={neLink} onChange={e=>setNeLink(e.target.value)}/></Campo>
       <div className="flex items-end"><Button onClick={()=>registrarNE.mutate()} disabled={registrarNE.isPending}>Registrar NE emitida</Button></div>
      </div>}
    {erro&&<p role="alert" className="text-xs text-destructive">{erro}</p>}
   </CardContent>
  </Card>
 </div>;
}
