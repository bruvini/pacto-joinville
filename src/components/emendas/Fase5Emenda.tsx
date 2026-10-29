import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {brl} from "@/lib/format";
import {normalizarLinkHttpsSei,linkHttpsValido} from "@/lib/emendas/cadastro";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {Badge} from "@/components/ui/badge";
import {SeiButton} from "@/components/inputs/SeiLink";
import {CurrencyInput} from "@/components/inputs/CurrencyInput";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";
import type {Tables} from "@/integrations/supabase/types";
type Anulacao=Tables<"emenda_anulacoes">;
type Conciliacao=Tables<"emenda_conciliacoes_ne">;
type Solicitacao=Tables<"emenda_solicitacoes">;
type Liberacao=Tables<"emenda_liberacoes">;
type Pagamento=Tables<"emenda_blocos_pagamento">;
type Props={lancamentoId:string;nota?:Solicitacao;anulacoes:Anulacao[];conciliacao?:Conciliacao;
 liberacoes:Liberacao[];pagamentos:Pagamento[];competencias:number;podeEditar:boolean;onAtualizar:()=>Promise<void>};
export function Fase5Emenda({lancamentoId,nota,anulacoes,conciliacao,liberacoes,pagamentos,competencias,podeEditar,onAtualizar}:Props){
 const [acao,setAcao]=useState<"anular"|"encerrar"|null>(null);
 const [valor,setValor]=useState(0);
 const [motivo,setMotivo]=useState("");
 const [numero,setNumero]=useState("");
 const [link,setLink]=useState("");
 const [erro,setErro]=useState("");
 const totalAnulado=anulacoes.reduce((n,a)=>n+Number(a.valor),0);
 const totalLiberado=liberacoes.reduce((n,a)=>n+Number(a.valor),0);
 const totalPago=pagamentos.reduce((n,a)=>n+Number(a.valor),0);
 const totalNE=Number(nota?.valor_ne??0);
 const residual=Math.max(0,Math.round((totalNE-totalAnulado-totalLiberado)*100)/100);
 const iniciar=(s:"anular"|"encerrar")=>{setAcao(s);setValor(0);setMotivo("");setNumero("");setLink("");setErro("");};
 const salvar=useMutation({
  mutationFn:async()=>{
   if(!numero.trim()||!link.trim()||!linkHttpsValido(link))throw Error("Informe número e link HTTPS do SEI.");
   const url=normalizarLinkHttpsSei(link)!;
   const r=acao==="anular"?
    await supabase.rpc("emenda_anular_residual",{
     p_lancamento:lancamentoId,p_valor:valor,p_justificativa:motivo.trim(),
     p_numero_sei:numero.trim(),p_link_sei:url,
    }):await supabase.rpc("emenda_conciliar_encerrar_ne",{
     p_lancamento:lancamentoId,p_numero_sei:numero.trim(),p_link_sei:url,
    });
   if(r.error)throw r.error;
  },
  onSuccess:async()=>{await onAtualizar();setAcao(null);toast.success("Registro financeiro confirmado no PACTO.");},
  onError:(e:Error)=>{setErro(e.message);toast.error(e.message);},
 });
 if(!nota?.numero_ne)return null;
 return <section className="space-y-3 border-t pt-4">
  <div className="flex flex-wrap items-start justify-between gap-2">
   <div><h3 className="text-sm font-semibold">7. Anulação residual e conciliação da NE</h3>
    <p className="text-xs text-muted-foreground">Anulações são referenciadas no processo principal. O PACTO não realiza anulação na SEFAZ.</p>
   </div>
   {conciliacao&&<Badge variant="default">Nota conciliada e encerrada</Badge>}
  </div>
  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
   {[
    ["NE registrada",totalNE],["Anulações",totalAnulado],
    ["Liberado",totalLiberado],["Pagamentos",totalPago],
   ].map(([nome,v])=><div key={String(nome)} className="rounded-md border p-3 text-xs">
    <p className="text-muted-foreground">{nome}</p><strong className="text-base">{brl(Number(v))}</strong>
   </div>)}
  </div>
  <p className="text-xs">Residual não liberado: <strong>{brl(residual)}</strong> · {competencias} competência(s) vinculada(s).</p>
  {anulacoes.length>0&&<div className="space-y-1 text-xs">
   {anulacoes.map(a=><div key={a.id} className="flex flex-wrap gap-2 items-center justify-between rounded-md border px-3 py-2">
    <span>{brl(Number(a.valor))} · {a.motivo}</span><SeiButton href={a.link_sei} label={"SEI "+a.numero_sei}/>
   </div>)}
  </div>}
  {conciliacao?<div className="rounded-lg border bg-muted/20 p-3 text-xs">
   Conciliada em {new Date(conciliacao.conferido_em).toLocaleString("pt-BR")}.
   <SeiButton href={conciliacao.link_sei} label={"Documento "+conciliacao.numero_sei}/>
   <p className="mt-1 text-muted-foreground">NE líquida: {brl(Number(conciliacao.valor_ne)-Number(conciliacao.total_anulado))}; pagamentos conferidos.</p>
  </div>:
   podeEditar&&<div className="flex flex-wrap gap-2">
    <Button size="sm" variant="outline" disabled={residual<=0} onClick={()=>iniciar("anular")}>Registrar anulação residual</Button>
    <Button size="sm" variant="outline" onClick={()=>iniciar("encerrar")}>Conciliar e encerrar NE</Button>
   </div>}
  <Dialog open={!!acao} onOpenChange={v=>{if(!v)setAcao(null);}}>
   <DialogContent><DialogHeader>
    <DialogTitle>{acao==="anular"?"Anulação residual no processo principal":"Conciliar e encerrar Nota de Empenho"}</DialogTitle>
    <DialogDescription>Conferência administrativa no PACTO; exige documentação do ato externo. Esta ação não pode ser desfeita pela interface.</DialogDescription>
   </DialogHeader>
   <div className="space-y-3">
    {acao==="anular"&&<>
     <div><Label>Valor a anular · máximo {brl(residual)}</Label>
      <CurrencyInput value={valor} onChange={setValor}/></div>
     <div><Label>Justificativa</Label><Textarea value={motivo} rows={3} onChange={e=>setMotivo(e.target.value)}/></div>
    </>}
    {acao==="encerrar"&&<p className="text-xs text-muted-foreground">
     Para encerrar: todas as competências devem estar quitadas ou encerradas sem execução; pagamentos devem igualar liberações; NE líquida deve igualar o total liberado. Se houver saldo residual, anule-o primeiro.</p>}
    <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
     <div><Label>Número SEI</Label><Input autoComplete="off" value={numero} onChange={e=>setNumero(e.target.value)}/></div>
     <div><Label>Link SEI</Label><Input autoComplete="off" value={link} onChange={e=>setLink(e.target.value)}/></div>
    </div>
    {erro&&<p role="alert" className="text-sm text-destructive">{erro}</p>}
   </div>
   <DialogFooter><Button variant="outline" onClick={()=>setAcao(null)}>Cancelar</Button>
    <Button disabled={salvar.isPending||(acao==="anular"&&(valor<=0||valor>residual||motivo.trim().length<10))}
     onClick={()=>salvar.mutate()}>{acao==="anular"?"Confirmar registro":"Confirmar encerramento"}</Button>
   </DialogFooter>
  </Dialog>
 </section>;
}
