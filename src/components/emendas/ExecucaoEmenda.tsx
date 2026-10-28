import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronRight, FilePlus2, Plus, ReceiptText, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiButton } from "@/components/inputs/SeiLink";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl } from "@/lib/format";
import { invalidarEmendas } from "@/hooks/useEmendas";
import { competenciasPrevistas, competenciaValida, exibirCompetenciaISO, validarSolicitacao, MESES,
  type PeriodicidadeEmenda } from "@/lib/emendas/competencias";
import { linkHttpsValido } from "@/lib/emendas/cadastro";
import type { Tables } from "@/integrations/supabase/types";

type Comp = Tables<"emenda_competencias">;
type Solicitacao = Tables<"emenda_solicitacoes">;
type Filha = Tables<"emenda_competencias_filhas">;
type Resumo = Tables<"emendas_resumo">;
const situacao:Record<string,string>={
 aguardando_ne:"Prevista · aguardando NE",emitida:"NE registrada",cancelada:"Cancelada",encerrada:"Encerrada",
 prevista:"Prevista",aguardando_liberacao:"Aguardando liberação",sem_execucao:"Sem execução",concluida:"Concluída",
};
function MesInput({value,onChange}:{value:string;onChange:(s:string)=>void}) {
 return <Input type="text" name="competencia-operacional-mes" inputMode="text" autoComplete="off"
  data-lpignore="true" data-1p-ignore="true" placeholder="10/2026" value={value} onChange={e=>onChange(e.target.value)} />;
}
function Campo({label,children,info}:{label:string;children:React.ReactNode;info?:string}){
 return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}
  {info&&<p className="text-[11px] text-muted-foreground">{info}</p>}</div>;
}
function valor(n:number|null|undefined){return brl(Number(n??0));}
export function ExecucaoEmenda({emendaId,podeEditar,statusEmenda}:{emendaId:string;podeEditar:boolean;statusEmenda:string}){
 const qc=useQueryClient();
 const dados=useQuery({
  queryKey:["emendas","execucao",emendaId],
  queryFn:async()=>{
   const [a,b,c,d]=await Promise.all([
    supabase.from("emenda_competencias").select("*").eq("emenda_id",emendaId).order("competencia",{ascending:false}),
    supabase.from("emenda_solicitacoes").select("*").eq("emenda_id",emendaId).order("created_at",{ascending:false}),
    supabase.from("emenda_competencias_filhas").select("*").eq("emenda_id",emendaId).order("ordem"),
    supabase.from("emendas_resumo").select("*").eq("id",emendaId).single(),
   ]);
   for(const r of [a,b,c,d])if(r.error)throw r.error;
   return {competencias:a.data??[],notas:b.data??[],filhas:c.data??[],resumo:d.data};
  },
 });
 const [abrirComp,setAbrirComp]=useState(false);
 const [novaCompetencia,setNovaCompetencia]=useState("");
 const [competenciaSolicitar,setCompetenciaSolicitar]=useState<string|null>(null);
 const [periodicidade,setPeriodicidade]=useState<PeriodicidadeEmenda>("mensal");
 const [valorSolicitado,setValorSolicitado]=useState(0);
 const [numeroSEI,setNumeroSEI]=useState("");
 const [linkSEI,setLinkSEI]=useState("");
 const [chave,setChave]=useState<string>("");
 const [notaSelecionada,setNotaSelecionada]=useState<Solicitacao|null>(null);
 const [numeroNE,setNumeroNE]=useState("");
 const [exercicioNE,setExercicioNE]=useState(new Date().getFullYear());
 const [valorNE,setValorNE]=useState(0);
 const [numeroSEINE,setNumeroSEINE]=useState("");
 const [linkSEINE,setLinkSEINE]=useState("");
 const [cancelando,setCancelando]=useState<Solicitacao|null>(null);
 const [motivoCancelamento,setMotivoCancelamento]=useState("");
 const [aberta,setAberta]=useState<string|null>(null);
 const [erro,setErro]=useState("");
 const meses=dados.data?.competencias??[];
 const notas=dados.data?.notas??[];
 const filhas=dados.data?.filhas??[];
 const saldo=Number(dados.data?.resumo?.saldo_disponivel??0);
 const habilitado=podeEditar&&["cadastrada","ativa"].includes(statusEmenda);
 const mapas=new Map(meses.map(c=>[c.id,c]));
 const porNota=useMemo(()=>{
  const m=new Map<string,Filha[]>();
  for(const f of filhas)m.set(f.solicitacao_id,[...(m.get(f.solicitacao_id)??[]),f]);
  return m;
 },[filhas]);
 const atualizar=async()=>{
  await qc.invalidateQueries({queryKey:["emendas","execucao",emendaId]});
  await invalidarEmendas(qc);
 };
 const abrir=useMutation({
  mutationFn:async()=>{
   if(!competenciaValida(novaCompetencia))throw Error("Informe um mês válido no formato MM/AAAA.");
   const r=await supabase.rpc("emenda_abrir_competencia",{p_emenda:emendaId,p_competencia:novaCompetencia});
   if(r.error)throw r.error;
  },
  onSuccess:async()=>{await atualizar();setAbrirComp(false);toast.success("Competência aberta ou recuperada.");},
  onError:e=>setErro(e.message),
 });
 const formalizar=useMutation({
  mutationFn:async()=>{
   const errors=validarSolicitacao({competencia:competenciaSolicitar??"",periodicidade,valor:valorSolicitado,
    numeroSEI,linkSEI,saldo});
   if(errors.length)throw Error(errors.join(" "));
   const r=await supabase.rpc("emenda_formalizar_solicitacao",{
    p_emenda:emendaId,p_competencia:competenciaSolicitar!,p_periodicidade:periodicidade,
    p_valor:valorSolicitado,p_numero_sei:numeroSEI.trim(),p_link_sei:linkSEI.trim(),p_chave:chave,
   });
   if(r.error)throw r.error;
  },
  onSuccess:async()=>{
   await atualizar();setCompetenciaSolicitar(null);setChave("");
   toast.success(MESES[periodicidade]+" competência(s) vinculada(s) à solicitação; valor reservado.");
  },
  onError:e=>setErro(e.message),
 });
 const registrarNE=useMutation({
  mutationFn:async()=>{
   if(!notaSelecionada||!numeroNE.trim()||!numeroSEINE.trim()||!linkSEINE.trim()||!linkHttpsValido(linkSEINE)
    ||!Number.isFinite(valorNE)||valorNE<=0||exercicioNE<2000||exercicioNE>2100)
    throw Error("Informe número, exercício, valor e evidência SEI da NE.");
   const r=await supabase.rpc("emenda_registrar_ne",{
    p_solicitacao:notaSelecionada.id,p_numero_ne:numeroNE.trim(),p_exercicio:exercicioNE,
    p_valor:valorNE,p_numero_sei:numeroSEINE.trim(),p_link_sei:linkSEINE.trim(),
   });
   if(r.error)throw r.error;
  },
  onSuccess:async()=>{
   await atualizar();setNotaSelecionada(null);
   toast.success("Nota registrada: reserva convertida em empenhado, sem duplicidade.");
  },
  onError:e=>setErro(e.message),
 });
 const cancelar=useMutation({
  mutationFn:async()=>{
   if(!cancelando||motivoCancelamento.trim().length<10)throw Error("Justifique com ao menos 10 caracteres.");
   const r=await supabase.rpc("emenda_cancelar_solicitacao",{
    p_solicitacao:cancelando.id,p_justificativa:motivoCancelamento.trim(),
   });
   if(r.error)throw r.error;
  },
  onSuccess:async()=>{await atualizar();setCancelando(null);toast.success("Solicitação cancelada e reserva liberada.");},
  onError:e=>setErro(e.message),
 });
 const iniciarSolicitacao=(mes:string)=>{
  setCompetenciaSolicitar(mes);setPeriodicicidadeSeguro();
 };
 function setPeriodicicidadeSeguro(){
  setPeriodicidade("mensal");setValorSolicitado(0);setNumeroSEI("");setLinkSEI("");
  setChave(crypto.randomUUID());setErro("");
 }
 function selecionarNota(n:Solicitacao){
  setNotaSelecionada(n);setNumeroNE(n.numero_ne??"");setValorNE(Number(n.valor_solicitado));
  setExercicioNE(new Date().getFullYear());setNumeroSEINE("");setLinkSEINE("");setErro("");
 }
 function escolherCancelar(n:Solicitacao){
  setCancelando(n);setMotivoCancelamento("");setErro("");
 }
 function notaCard(n:Solicitacao) {
  const linked=porNota.get(n.id)??[];
  const expandida=aberta===n.id;
  return <div key={n.id} className="rounded-xl border bg-card">
   <div className="flex flex-wrap items-center justify-between gap-3 p-3">
    <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={()=>setAberta(expandida?null:n.id)}
      aria-expanded={expandida} aria-label={"Detalhar solicitação "+n.numero_sei_solicitacao}>
      {expandida?<ChevronDown className="mt-1 h-4 w-4 shrink-0"/>:<ChevronRight className="mt-1 h-4 w-4 shrink-0"/>}
      <span className="min-w-0"><strong className="block text-sm">{n.numero_ne?"NE "+n.numero_ne:"Solicitação SEI "+n.numero_sei_solicitacao}</strong>
       <span className="text-xs text-muted-foreground">{n.periodicidade} · {linked.length} competência(s) · {situacao[n.status]??n.status}</span>
      </span>
    </button>
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{n.status==="aguardando_ne"?"Reserva "+valor(Number(n.valor_solicitado)):n.status==="cancelada"?"Sem compromisso":valor(n.valor_ne)}</Badge>
      {n.status==="aguardando_ne"&&habilitado&&<Button size="sm" variant="outline" onClick={()=>selecionarNota(n)}>Registrar NE</Button>}
      {n.status==="aguardando_ne"&&habilitado&&<Button size="icon" variant="ghost" aria-label="Cancelar solicitação" onClick={()=>escolherCancelar(n)}><XCircle className="h-4 w-4 text-destructive"/></Button>}
    </div>
   </div>
   {expandida&&<div className="space-y-3 border-t p-3">
     <div className="flex flex-wrap items-center gap-2 text-xs"><span>Solicitação:</span><SeiButton href={n.link_sei_solicitacao} label={n.numero_sei_solicitacao}/>
       {n.link_sei_ne&&<><span>Nota:</span><SeiButton href={n.link_sei_ne} label={n.numero_sei_ne??"SEI NE"}/></>}
       <span className="text-muted-foreground">Valor solicitado {valor(Number(n.valor_solicitado))} · {n.numero_ne?"NE "+valor(n.valor_ne):"NE aguardando"}</span>
     </div>
     <div className="grid gap-2 md:grid-cols-3">
       {linked.sort((a,b)=>a.ordem-b.ordem).map(f=><div key={f.id} className="rounded-lg border bg-muted/20 p-2 text-xs">
         <strong>{mapas.get(f.competencia_id)?exibirCompetenciaISO(mapas.get(f.competencia_id)!.competencia):"Competência"}</strong>
         <p className="text-muted-foreground">{situacao[f.status]??f.status}</p>
         <p className="mt-1 text-[11px] text-muted-foreground">Sem rateio antecipado. Liberações serão independentes.</p>
       </div>)}
     </div>
     {n.motivo_cancelamento&&<p className="rounded-lg border p-2 text-xs">Cancelamento: {n.motivo_cancelamento}</p>}
   </div>}
  </div>;
 }
 return <div className="space-y-4">
  <Card>
   <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
    <div><CardTitle className="flex items-center gap-2 text-base"><ReceiptText className="h-4 w-4"/>Solicitações, notas e competências</CardTitle>
     <CardDescription>Solicitação formalizada reserva saldo. A NE registrada substitui a reserva; os meses não recebem rateio automático.</CardDescription>
    </div>
    {habilitado&&<Button size="sm" onClick={()=>{setNovaCompetencia("");setErro("");setAbrirComp(true);}}><Plus className="mr-1 h-4 w-4"/>Abrir competência</Button>}
   </CardHeader>
   <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    {[
      ["Limite vigente",dados.data?.resumo?.valor_autorizado_vigente],
      ["Reservado em solicitações",dados.data?.resumo?.valor_reservado],
      ["Notas de empenho registradas",dados.data?.resumo?.valor_empenhado],
      ["Disponível para novos empenhos",dados.data?.resumo?.saldo_disponivel],
    ].map(([label,value])=><div key={String(label)} className="rounded-lg border bg-muted/20 p-3">
     <p className="text-xs text-muted-foreground">{label}</p><strong className="text-lg tabular-nums">{valor(Number(value??0))}</strong>
    </div>)}
   </CardContent>
  </Card>
  <p className="rounded-md border bg-primary/5 p-3 text-xs text-muted-foreground">
   Controle interno: a formalização e a NE são informadas a partir de documentos SEI. As assinaturas e as etapas
   detalhadas virão na Fase 3; pagamentos, liberações e anulações não são executados nesta tela.
   Valores emitidos não são presumidos a partir da solicitação.
  </p>
  {dados.isPending?<p className="text-sm text-muted-foreground">Consultando competências e saldos...</p>:
   dados.isError?<p role="alert" className="text-sm text-destructive">Falha na consulta: {dados.error.message}. Confira a migration da Fase 2.</p>:
   <Tabs defaultValue="competencia">
    <TabsList className="mb-3"><TabsTrigger value="competencia">Por competência</TabsTrigger>
     <TabsTrigger value="nota">Por solicitação / nota</TabsTrigger></TabsList>
    <TabsContent value="competencia" className="space-y-3">
     {!meses.length?<p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhuma competência aberta. Abra o primeiro mês para registrar uma solicitação.</p>:
     meses.map(c=>{
      const conjunto=notas.filter(n=>(porNota.get(n.id)??[]).some(f=>f.competencia_id===c.id));
      return <Card key={c.id}>
       <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 py-3">
        <div><CardTitle className="text-base">{exibirCompetenciaISO(c.competencia)}</CardTitle>
         <CardDescription>{conjunto.length} solicitação(ões)/nota(s) vinculada(s); cada nota tem execução individual</CardDescription></div>
        {habilitado&&<Button size="sm" variant="outline" onClick={()=>iniciarSolicitacao(exibirCompetenciaISO(c.competencia))}>
         <FilePlus2 className="mr-1 h-4 w-4"/>Solicitar empenho</Button>}
       </CardHeader>
       <CardContent className="space-y-2">{!conjunto.length?<p className="text-xs text-muted-foreground">Competência sem solicitações.</p>:conjunto.map(notaCard)}</CardContent>
      </Card>;
     })}
    </TabsContent>
    <TabsContent value="nota" className="space-y-3">
     {!notas.length?<p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhuma solicitação formalizada.</p>:
      notas.map(notaCard)}
    </TabsContent>
   </Tabs>}
  <Dialog open={abrirComp} onOpenChange={setAbrirComp}>
   <DialogContent><DialogHeader><DialogTitle>Abrir competência da emenda</DialogTitle>
    <DialogDescription>A competência global é única por mês. Notas futuras serão agrupadas nela, sem duplicar o cadastro.</DialogDescription></DialogHeader>
    <Campo label="Competência (MM/AAAA)"><MesInput value={novaCompetencia} onChange={setNovaCompetencia}/></Campo>
    {erro&&<p role="alert" className="text-xs text-destructive">{erro}</p>}
    <DialogFooter><Button variant="outline" onClick={()=>setAbrirComp(false)}>Cancelar</Button>
     <Button disabled={abrir.isPending} onClick={()=>abrir.mutate()}>Abrir mês</Button></DialogFooter>
   </DialogContent>
  </Dialog>
  <Dialog open={competenciaSolicitar!==null} onOpenChange={v=>{if(!v)setCompetenciaSolicitar(null);}}>
   <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
    <DialogHeader><DialogTitle>Formalizar solicitação de empenho</DialogTitle>
     <DialogDescription>Competência inicial: {competenciaSolicitar}. Reserva imediata, com filhos previstos antes da emissão da NE.</DialogDescription></DialogHeader>
    <div className="space-y-3">
     <Campo label="Periodicidade desta solicitação"><Select value={periodicidade} onValueChange={v=>setPeriodicidade(v as PeriodicidadeEmenda)}>
      <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
       <SelectItem value="mensal">Mensal — 1 competência</SelectItem>
       <SelectItem value="trimestral">Trimestral — 3 competências</SelectItem>
       <SelectItem value="anual">Anual — 12 competências</SelectItem>
      </SelectContent></Select></Campo>
     <div className="rounded-lg border bg-muted/20 p-3 text-xs">Competências que serão vinculadas:
      <strong className="mt-1 block">{competenciaSolicitar?competenciasPrevistas(competenciaSolicitar,periodicidade).join(" · "):""}</strong></div>
     <Campo label="Valor total da solicitação *" info={"Disponível atualmente: "+valor(saldo)+". Não será dividido automaticamente entre as competências."}>
      <CurrencyInput value={valorSolicitado} onChange={setValorSolicitado}/></Campo>
     <Campo label="Número SEI da solicitação *"><Input name="sei-solicitacao-empenho" autoComplete="off" value={numeroSEI} onChange={e=>setNumeroSEI(e.target.value)}/></Campo>
     <Campo label="Link SEI da solicitação *"><Input autoComplete="off" value={linkSEI} onChange={e=>setLinkSEI(e.target.value)}/></Campo>
     {erro&&<p role="alert" className="text-xs text-destructive">{erro}</p>}
    </div>
    <DialogFooter><Button variant="outline" onClick={()=>setCompetenciaSolicitar(null)}>Cancelar</Button>
     <Button disabled={formalizar.isPending} onClick={()=>formalizar.mutate()}>Formalizar e reservar {valor(valorSolicitado)}</Button></DialogFooter>
   </DialogContent>
  </Dialog>
  <Dialog open={notaSelecionada!==null} onOpenChange={v=>{if(!v)setNotaSelecionada(null);}}>
   <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
    <DialogHeader><DialogTitle>Registrar Nota de Empenho emitida</DialogTitle>
     <DialogDescription>Não cria a nota na Fazenda. Registre somente após emissão, com número e documento SEI verificáveis.</DialogDescription></DialogHeader>
    <div className="space-y-3">
     <Campo label="Número da NE *"><Input autoComplete="off" value={numeroNE} onChange={e=>setNumeroNE(e.target.value)}/></Campo>
     <Campo label="Exercício da NE (não da emenda) *"><Input type="number" min={2000} max={2100} value={exercicioNE} onChange={e=>setExercicioNE(Number(e.target.value))}/></Campo>
     <Campo label="Valor efetivamente empenhado *" info="Se menor que o valor solicitado, a diferença da reserva é liberada; se maior, o saldo é validado novamente.">
      <CurrencyInput value={valorNE} onChange={setValorNE}/></Campo>
     <Campo label="Número SEI da NE *"><Input autoComplete="off" value={numeroSEINE} onChange={e=>setNumeroSEINE(e.target.value)}/></Campo>
     <Campo label="Link SEI da NE *"><Input autoComplete="off" value={linkSEINE} onChange={e=>setLinkSEINE(e.target.value)}/></Campo>
     {erro&&<p role="alert" className="text-xs text-destructive">{erro}</p>}
    </div>
    <DialogFooter><Button variant="outline" onClick={()=>setNotaSelecionada(null)}>Cancelar</Button>
      <Button disabled={registrarNE.isPending} onClick={()=>registrarNE.mutate()}>Registrar NE emitida</Button></DialogFooter>
   </DialogContent>
  </Dialog>
  <Dialog open={cancelando!==null} onOpenChange={v=>{if(!v)setCancelando(null);}}>
   <DialogContent><DialogHeader><DialogTitle>Cancelar solicitação sem NE</DialogTitle>
    <DialogDescription>A reserva volta ao saldo disponível; as competências vinculadas ficam com situação cancelada, sem apagar o histórico.</DialogDescription></DialogHeader>
    <Campo label="Justificativa obrigatória"><Textarea rows={3} value={motivoCancelamento} onChange={e=>setMotivoCancelamento(e.target.value)}/></Campo>
    {erro&&<p role="alert" className="text-xs text-destructive">{erro}</p>}
    <DialogFooter><Button variant="outline" onClick={()=>setCancelando(null)}>Voltar</Button>
     <Button variant="destructive" disabled={cancelar.isPending} onClick={()=>cancelar.mutate()}>Cancelar e liberar reserva</Button></DialogFooter>
   </DialogContent>
  </Dialog>
 </div>;
}
