import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {brl} from "@/lib/format";
import {normalizarLinkHttpsSei,linkHttpsValido} from "@/lib/emendas/cadastro";
import {exibirCompetenciaISO} from "@/lib/emendas/competencias";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {CurrencyInput} from "@/components/inputs/CurrencyInput";
import {SeiButton} from "@/components/inputs/SeiLink";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";
import {Select,SelectContent,SelectTrigger,SelectValue,SelectItem} from "@/components/ui/select";
import type {Tables} from "@/integrations/supabase/types";
type Mes=Tables<"emenda_lancamento_meses">;
type Comprovante=Tables<"emenda_comprovantes">;
type Liberacao=Tables<"emenda_liberacoes">;
type Pagamento=Tables<"emenda_blocos_pagamento">;
type Encerramento=Tables<"emenda_encerramentos_sem_execucao">;
type Acao="comprovante"|"liberacao"|"pagamento"|"encerrar";
type Props={lancamentoId:string;meses:Mes[];competencias:Map<string,string>;comprovantes:Comprovante[];
 liberacoes:Liberacao[];pagamentos:Pagamento[];encerramentos:Encerramento[];
 podeEditar:boolean;onAtualizar:()=>Promise<void>};
const hoje=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
function Campo({titulo,children}:{titulo:string;children:React.ReactNode}){
 return <div className="space-y-1.5"><Label className="text-xs">{titulo}</Label>{children}</div>;
}
export function Fase4Emenda({lancamentoId,meses,competencias,comprovantes,liberacoes,pagamentos,encerramentos,podeEditar,onAtualizar}:Props){
 const [acao,setAcao]=useState<Acao|null>(null);
 const [competencia,setCompetencia]=useState("");
 const [liberacaoId,setLiberacaoId]=useState("");
 const [tipo,setTipo]=useState("atesto");
 const [numero,setNumero]=useState("");const [link,setLink]=useState("");
 const [valor,setValor]=useState(0);const [data,setData]=useState(hoje);
 const [descricao,setDescricao]=useState("");const [erro,setErro]=useState("");
 const abrir=(a:Acao,c:string,l="")=>{
  setAcao(a);setCompetencia(c);setLiberacaoId(l);
  setTipo(a==="liberacao"?(liberacoes.some(x=>x.competencia_id===c&&x.tipo==="original")?"complementar":"original"):"atesto");
  setNumero("");setLink("");setValor(0);setData(hoje());setDescricao("");setErro("");
 };
 const registrar=useMutation({
  mutationFn:async()=>{
   if(!acao||!competencia)throw Error("Selecione a competência.");
   if(!numero.trim()||!link.trim()||!linkHttpsValido(link))
    throw Error("Informe número e link HTTPS do SEI.");
   const n=normalizarLinkHttpsSei(link)!;
   let r:{error:{message:string}|null};
   if(acao==="comprovante")r=await supabase.rpc("emenda_registrar_comprovante",{
    p_lancamento:lancamentoId,p_competencia:competencia,p_tipo:tipo,
    p_numero:numero.trim(),p_link:n,p_descricao:descricao||null,
   });
   else if(acao==="liberacao")r=await supabase.rpc("emenda_registrar_liberacao",{
    p_lancamento:lancamentoId,p_competencia:competencia,p_tipo:tipo,
    p_valor:valor,p_data:data,p_numero:numero.trim(),p_link:n,
   });
   else if(acao==="pagamento")r=await supabase.rpc("emenda_registrar_bloco_pagamento",{
    p_liberacao:liberacaoId,p_identificacao:descricao.trim(),p_valor:valor,
    p_data:data,p_numero:numero.trim(),p_link:n,
   });
   else r=await supabase.rpc("emenda_encerrar_competencia_sem_execucao",{
    p_lancamento:lancamentoId,p_competencia:competencia,p_justificativa:descricao.trim(),
    p_numero:numero.trim(),p_link:n,
   });
   if(r.error)throw new Error(r.error.message);
  },
  onSuccess:async()=>{await onAtualizar();setAcao(null);toast.success("Registro incluído na trilha de auditoria.");},
  onError:(e:Error)=>{setErro(e.message);toast.error(e.message);},
 });
 return <section className="space-y-3">
  <div><h4 className="font-semibold text-sm">6. Liberações, comprovantes e pagamentos</h4>
   <p className="text-xs text-muted-foreground">Registros internos documentados no SEI. Nenhum pagamento é executado pelo PACTO.</p></div>
  {meses.map(m=>{
   const cs=comprovantes.filter(c=>c.competencia_id===m.competencia_id);
   const ls=liberacoes.filter(l=>l.competencia_id===m.competencia_id);
   const ps=pagamentos.filter(p=>p.competencia_id===m.competencia_id);
   const encerramento=encerramentos.find(e=>e.competencia_id===m.competencia_id);
   const liberado=ls.reduce((v,l)=>v+Number(l.valor),0),pago=ps.reduce((v,p)=>v+Number(p.valor),0);
   return <div className="space-y-3 rounded-lg border bg-card p-3" key={m.id}>
    <div className="flex flex-wrap justify-between gap-2 items-center">
     <div><h5 className="font-semibold text-sm">{exibirCompetenciaISO(competencias.get(m.competencia_id)??"")} · Parcela {m.parcela_convenio}</h5>
      <p className="text-xs text-muted-foreground">Liberado {brl(liberado)} · Pago {brl(pago)} · {ls.length} de {m.liberacoes_minimas} liberação(ões) previstas</p></div>
     <Badge variant={encerramento?"secondary":ls.length>=m.liberacoes_minimas?"default":"outline"}>
      {encerramento?"Sem execução":ls.length>=m.liberacoes_minimas?"Liberação registrada":"Aguardando liberação"}</Badge>
    </div>
    {!encerramento&&podeEditar&&<div className="flex flex-wrap gap-2">
     <Button size="sm" variant="outline" onClick={()=>abrir("comprovante",m.competencia_id)}>+ Comprovante</Button>
     <Button size="sm" variant="outline" onClick={()=>abrir("liberacao",m.competencia_id)}>+ {ls.some(l=>l.tipo==="original")?"Liberação complementar":"Liberação original"}</Button>
     {!ls.length&&<Button size="sm" variant="ghost" onClick={()=>abrir("encerrar",m.competencia_id)}>Encerrar sem execução</Button>}
    </div>}
    {!!cs.length&&<div className="flex flex-wrap items-center gap-2 text-xs"><span>Comprovantes:</span>
     {cs.map(c=><SeiButton key={c.id} href={c.link_sei} label={c.tipo+" · "+c.numero_sei}/>)}</div>}
    {!!ls.length&&<div className="space-y-2">{ls.map(l=>{
     const pag=ps.filter(p=>p.liberacao_id===l.id);
     const total=pag.reduce((v,p)=>v+Number(p.valor),0);
     return <div key={l.id} className="space-y-2 rounded-md border bg-muted/10 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <div><strong>Liberação {l.tipo}</strong> · {brl(Number(l.valor))}
        <p className="text-muted-foreground">Pago {brl(total)} · Restante {brl(Number(l.valor)-total)}</p></div>
       <div className="flex flex-wrap gap-2"><SeiButton href={l.link_sei} label={"SEI "+l.numero_sei}/>
        {podeEditar&&!!cs.length&&total<Number(l.valor)&&<Button size="sm" variant="outline" onClick={()=>abrir("pagamento",m.competencia_id,l.id)}>+ Bloco de pagamento</Button>}</div>
      </div>
      {pag.map(p=><div key={p.id} className="flex flex-wrap justify-between gap-2 border-t pt-2">
       <span>{p.identificacao} · {brl(Number(p.valor))} · {new Date(p.data_pagamento+"T12:00:00").toLocaleDateString("pt-BR")}</span>
       <SeiButton href={p.link_sei} label={"SEI "+p.numero_sei}/></div>)}
     </div>;
    })}</div>}
    {encerramento&&<div className="space-y-2 text-xs"><p>Justificativa: {encerramento.justificativa}</p>
     <SeiButton href={encerramento.link_sei} label={"SEI "+encerramento.numero_sei}/>
     <p className="text-muted-foreground">Não cancela nem estorna automaticamente a NE.</p></div>}
   </div>;
  })}
  <Dialog open={acao!==null} onOpenChange={v=>{if(!v)setAcao(null);}}>
   <DialogContent className="max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>{acao==="comprovante"?"Documento comprobatório":acao==="liberacao"?"Liberação de recursos":acao==="pagamento"?"Bloco interno de pagamento":"Encerramento sem execução"}</DialogTitle>
     <DialogDescription>Registre apenas fatos documentados; nenhuma transação externa é efetuada.</DialogDescription></DialogHeader>
    <div className="space-y-3">
     {acao==="comprovante"&&<Campo titulo="Tipo do documento"><Select value={tipo} onValueChange={setTipo}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
      {["atesto","relatorio","nota_fiscal","outro"].map(t=><SelectItem key={t} value={t}>{t.replace("_"," ")}</SelectItem>)}
     </SelectContent></Select></Campo>}
     {acao==="liberacao"&&<Campo titulo="Tipo de liberação"><Select value={tipo} onValueChange={setTipo}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
      <SelectItem value="original">Original</SelectItem><SelectItem value="complementar">Complementar</SelectItem>
     </SelectContent></Select></Campo>}
     {["comprovante","pagamento","encerrar"].includes(acao??"")&&<Campo titulo={acao==="encerrar"?"Justificativa":"Descrição / identificação do bloco"}>
      {acao==="encerrar"?<Textarea rows={3} value={descricao} onChange={e=>setDescricao(e.target.value)}/>:<Input value={descricao} onChange={e=>setDescricao(e.target.value)}/>}
     </Campo>}
     {(acao==="liberacao"||acao==="pagamento")&&<>
      <Campo titulo="Valor"><CurrencyInput value={valor} onChange={setValor}/></Campo>
      <Campo titulo="Data"><Input type="date" value={data} onChange={e=>setData(e.target.value)}/></Campo></>}
     <Campo titulo="Número SEI"><Input value={numero} onChange={e=>setNumero(e.target.value)} autoComplete="off"/></Campo>
     <Campo titulo="Link SEI"><Input value={link} onChange={e=>setLink(e.target.value)} autoComplete="off"/></Campo>
     {erro&&<p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
    <DialogFooter><Button variant="outline" onClick={()=>setAcao(null)}>Cancelar</Button>
     <Button disabled={registrar.isPending} onClick={()=>registrar.mutate()}>Registrar</Button></DialogFooter>
   </DialogContent>
  </Dialog>
 </section>;
}