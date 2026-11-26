import {useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {Landmark,Plus,Pencil,RotateCcw,ShieldAlert} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {brl} from "@/lib/format";
import {valorMoedaDistribuicao} from "@/lib/emendas/distribuicao-ne";
import {exibirCompetenciaISO} from "@/lib/emendas/competencias";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";

type Mes=Tables<"emenda_lancamento_meses">;
type Distribuicao=Tables<"emenda_ne_competencias_painel">;
type Modal={acao:"definir"|"cancelar";competenciaId:string;distribuicao:Distribuicao|null};

export function PainelDistribuicaoNeEmenda({
 emendaId,lancamentoId,notaId,meses,competencias,podeEditar,onAtualizar
}:{
 emendaId:string;lancamentoId:string;notaId:string;meses:Mes[];
 competencias:Map<string,string>;podeEditar:boolean;onAtualizar:()=>Promise<void>;
}){
 const qc=useQueryClient();
 const [modal,setModal]=useState<Modal|null>(null);
 const [valor,setValor]=useState("");
 const [motivo,setMotivo]=useState("");
 const dados=useQuery({
  queryKey:["emendas","fase-c-ne-distribuicao",emendaId],
  queryFn:async()=>{
   const [nes,alocacoes]=await Promise.all([
    supabase.from("emenda_ne_painel").select("*").eq("emenda_id",emendaId),
    supabase.from("emenda_ne_competencias_painel").select("*").eq("emenda_id",emendaId),
   ]);
   if(nes.error)throw nes.error;
   if(alocacoes.error)throw alocacoes.error;
   return {nes:nes.data??[],alocacoes:alocacoes.data??[]};
  }
 });
 const ne=dados.data?.nes.find(x=>x.solicitacao_id===notaId);
 const linhas=dados.data?.alocacoes??[];
 const vinculadas=linhas.filter(x=>x.solicitacao_id===notaId&&x.status==="ativa");
 const porCompetencia=new Map(vinculadas.map(x=>[x.competencia_id,x]));
 const valorDistribuido=Number(ne?.valor_distribuido??0);
 const saldoDistribuir=ne?.saldo_a_distribuir;
 const saldoComprometer=ne?.saldo_ne_a_comprometer;

 const recarregar=async()=>{
  await qc.invalidateQueries({queryKey:["emendas","fase-c-ne-distribuicao",emendaId]});
  await onAtualizar();
 };
 const definir=useMutation({
  mutationFn:async()=>{
   if(!modal||modal.acao!=="definir")throw Error("Selecione a competência.");
   const quantia=valorMoedaDistribuicao(valor);
   if(quantia===null)throw Error("Informe um valor positivo, em reais e com até dois decimais.");
   const anterior=modal.distribuicao;
   if(anterior&&anterior.valor_alocado!==quantia&&motivo.trim().length<10)
    throw Error("Ajustes de distribuição exigem justificativa de pelo menos 10 caracteres.");
   const r=await supabase.rpc("emenda_ne_competencia_definir",{
    p_lancamento:lancamentoId,p_competencia:modal.competenciaId,p_valor:quantia,
    p_justificativa:anterior?motivo.trim()||null:null,
   });
   if(r.error)throw r.error;
  },
  onSuccess:async()=>{setModal(null);await recarregar();toast.success("Distribuição da NE registrada com histórico.");},
  onError:(e:Error)=>toast.error(e.message),
 });
 const cancelar=useMutation({
  mutationFn:async()=>{
   if(!modal||modal.acao!=="cancelar"||!modal.distribuicao?.id)
    throw Error("Distribuição inexistente.");
   if(motivo.trim().length<10)throw Error("Informe justificativa de cancelamento de pelo menos 10 caracteres.");
   const r=await supabase.rpc("emenda_ne_competencia_cancelar",{
    p_distribuicao:modal.distribuicao.id,p_motivo:motivo.trim(),
   });
   if(r.error)throw r.error;
  },
  onSuccess:async()=>{setModal(null);await recarregar();toast.success("Distribuição cancelada, com histórico preservado.");},
  onError:(e:Error)=>toast.error(e.message),
 });
 function abrir(acao:Modal["acao"],competenciaId:string,distribuicao:Distribuicao|null){
  setModal({acao,competenciaId,distribuicao});
  setValor(distribuicao?.valor_alocado!=null?Number(distribuicao.valor_alocado).toFixed(2).replace(".",","):"");
  setMotivo("");
 }
 const statusLegado=ne?.modelo_financeiro==="modelo_legado"||ne?.modelo_financeiro==="conflito_entre_modelos";
 const podeDistribuir=podeEditar&&!statusLegado&&ne?.status_ne==="emitida"&&ne?.saldo_a_distribuir!=null;
 const motivoEdicao=modal?.distribuicao&&modal.acao==="definir";
 const emAndamento=definir.isPending||cancelar.isPending;

 return <section className="rounded-lg border" aria-label="Distribuição financeira da Nota de Empenho">
  <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
   <div>
    <h2 className="flex items-center gap-2 text-sm font-semibold">
     <Landmark className="h-4 w-4"/>Distribuição da Nota de Empenho
    </h2>
    <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
     Defina individualmente o valor que cada competência poderá utilizar desta NE.
     Esta distribuição é um planejamento de limite, não um subempenho ou pagamento;
     períodos trimestrais e anuais nunca são rateados automaticamente.
    </p>
   </div>
   <Badge variant="outline">{meses.length} {meses.length===1?"competência vinculada":"competências vinculadas"}</Badge>
  </header>
  <div className="space-y-4 p-4">
   {dados.isPending&&<p className="text-sm text-muted-foreground">Consultando distribuição e saldos da NE...</p>}
   {dados.error&&<p role="alert" className="text-sm text-destructive">
    Não foi possível consultar o painel. Confira se as migrations da Fase C estão aplicadas: {dados.error.message}
   </p>}
   {!dados.isPending&&!dados.error&&!ne&&<p className="text-sm text-muted-foreground">
    NE ainda não encontrada no resumo financeiro. Confira a emissão e a vinculação ao lançamento.
   </p>}
   {ne&&<>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
     <div className="rounded border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">NE emitida</p>
      <strong className="text-base">{brl(Number(ne.valor_ne_emitida??0))}</strong>
     </div>
     <div className="rounded border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">NE líquida de anulações</p>
      <strong className="text-base">{brl(Number(ne.ne_liquida??0))}</strong>
     </div>
     <div className="rounded border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">Distribuído às competências</p>
      <strong className="text-base">{brl(valorDistribuido)}</strong>
     </div>
     <div className="rounded border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">Ainda não distribuído</p>
      <strong className="text-base">{saldoDistribuir==null?"—":brl(Number(saldoDistribuir))}</strong>
     </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
     <span>Reservas e subempenhos vigentes: <strong>{brl(Number(ne.compromissos_novos??0))}</strong></span>
     <span>Saldo da NE ainda não comprometido: <strong>{saldoComprometer==null?"Não conciliável":brl(Number(saldoComprometer))}</strong></span>
     <span>Competências distribuídas: <strong>{ne.competencias_distribuidas??0}/{ne.competencias_previstas??0}</strong></span>
    </div>
    {statusLegado&&<div role="note" className="flex gap-2 rounded border border-amber-300/60 bg-amber-50/50 p-3 text-xs text-amber-900">
     <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0"/>
     Existe execução no fluxo legado de liberações. Para evitar dupla contabilização,
     novas distribuições ficam bloqueadas até a conciliação formal.
    </div>}
    {!vinculadas.length&&!statusLegado&&<p className="text-xs text-muted-foreground">
     A NE já possui competências previstas, mas nenhum valor foi distribuído.
     Informe cada valor conforme a programação efetivamente definida pela equipe.
    </p>}
    <div className="overflow-x-auto rounded-md border">
     <table className="w-full min-w-[800px] text-left text-xs">
      <thead className="bg-muted/40 text-muted-foreground"><tr>
       <th className="p-3">Competência</th>
       <th className="p-3">Parcela</th>
       <th className="p-3 text-right">Alocado nesta NE</th>
       <th className="p-3 text-right">Já comprometido</th>
       <th className="p-3 text-right">Saldo da competência</th>
       <th className="p-3">Outras NEs nesta competência</th>
       <th className="p-3 text-right">Ação</th>
      </tr></thead>
      <tbody className="divide-y">
       {meses.map(m=>{
        const item=porCompetencia.get(m.competencia_id);
        const outras=linhas.filter(x=>x.competencia_id===m.competencia_id
          &&x.solicitacao_id!==notaId&&x.status==="ativa");
        return <tr key={m.id}>
         <td className="p-3 font-semibold">{exibirCompetenciaISO(competencias.get(m.competencia_id)??"")}</td>
         <td className="p-3">{m.parcela_convenio}</td>
         <td className="p-3 text-right">{item?brl(Number(item.valor_alocado??0)):"Não distribuído"}</td>
         <td className="p-3 text-right">{item?brl(Number(item.comprometido_competencia??0)):"—"}</td>
         <td className="p-3 text-right font-medium">{item?brl(Number(item.saldo_competencia??0)):"—"}</td>
         <td className="p-3">{outras.length?
           outras.map(x=><p key={x.id}>{x.numero_ne?("NE "+x.numero_ne):"NE sem número"} · {brl(Number(x.valor_alocado??0))}</p>)
           :"—"}</td>
         <td className="p-3 text-right whitespace-nowrap">
          {podeDistribuir&&<div className="inline-flex gap-1">
           <Button size="sm" variant="outline" onClick={()=>abrir("definir",m.competencia_id,item??null)}>
            {item?<><Pencil className="mr-1 h-3 w-3"/>Alterar</>:<><Plus className="mr-1 h-3 w-3"/>Distribuir</>}</Button>
           {item&&<Button size="sm" variant="ghost" disabled={Number(item.comprometido_competencia??0)>0}
            onClick={()=>abrir("cancelar",m.competencia_id,item)} aria-label={"Cancelar distribuição de "+exibirCompetenciaISO(competencias.get(m.competencia_id)??"")}>
             <RotateCcw className="h-3.5 w-3.5"/>
            </Button>}
          </div>}
          {!podeDistribuir&&<span className="text-muted-foreground">Somente leitura</span>}
         </td>
        </tr>;
       })}
      </tbody>
     </table>
    </div>
    <p className="text-[11px] text-muted-foreground">
     A mesma competência pode ter distribuições independentes de outras NEs da emenda.
     Os saldos acima não representam caixa disponível no FMS nem pagamento confirmado.
    </p>
   </>}
  </div>
  <Dialog open={!!modal} onOpenChange={open=>{if(!open&&!emAndamento)setModal(null);}}>
   <DialogContent className="sm:max-w-md">
    <DialogHeader>
     <DialogTitle>{modal?.acao==="cancelar"?"Cancelar distribuição da NE":
       modal?.distribuicao?"Alterar distribuição da NE":"Distribuir valor da NE"}</DialogTitle>
     <DialogDescription>
      Competência {exibirCompetenciaISO(competencias.get(modal?.competenciaId??"")??"")}.
      A operação fica registrada na trilha de auditoria e não envia informação ao e-Pública.
     </DialogDescription>
    </DialogHeader>
    <div className="space-y-3">
     {modal?.acao==="definir"&&<div className="space-y-1">
      <Label htmlFor="valor-alocacao-ne">Valor alocado (R$)</Label>
      <Input id="valor-alocacao-ne" value={valor} onChange={e=>setValor(e.target.value)}
       inputMode="decimal" placeholder="0,00" autoComplete="off"/>
     </div>}
     {(motivoEdicao||modal?.acao==="cancelar")&&<div className="space-y-1">
      <Label htmlFor="motivo-alocacao-ne">Justificativa da alteração ou cancelamento</Label>
      <Textarea id="motivo-alocacao-ne" value={motivo} onChange={e=>setMotivo(e.target.value)}
       placeholder="Explique a mudança no planejamento financeiro" rows={3}/>
     </div>}
     {modal?.acao==="cancelar"&&<p className="text-xs text-muted-foreground">
      Apenas distribuições sem solicitações ou subempenhos ativos podem ser canceladas.
      O registro original não será excluído.
     </p>}
    </div>
    <DialogFooter>
     <Button variant="outline" disabled={emAndamento} onClick={()=>setModal(null)}>Voltar</Button>
     <Button disabled={emAndamento} variant={modal?.acao==="cancelar"?"destructive":"default"}
      onClick={()=>modal?.acao==="cancelar"?cancelar.mutate():definir.mutate()}>
      {modal?.acao==="cancelar"?"Confirmar cancelamento":"Salvar distribuição"}
     </Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 </section>;
}
