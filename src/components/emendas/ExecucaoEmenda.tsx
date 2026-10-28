import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FilePlus2, History, Layers, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl } from "@/lib/format";
import { planejarLancamento, mascararCompetencia } from "@/lib/emendas/lancamentos";
import { exibirCompetenciaISO, type PeriodicidadeEmenda } from "@/lib/emendas/competencias";
import { invalidarEmendas } from "@/hooks/useEmendas";
import { EtapasLancamento } from "./EtapasLancamento";

const statusLabel:Record<string,string>={rascunho:"Em preparação",formalizado:"Solicitação formalizada",emitido:"NE emitida",cancelado:"Cancelado"};
const periodoLabel:Record<string,string>={mensal:"Mensal",trimestral:"Trimestral",anual:"Anual"};
function Linha({titulo,children}:{titulo:string;children:React.ReactNode}) {
 return <div className="space-y-1"><Label className="text-xs">{titulo}</Label>{children}</div>;
}
export function ExecucaoEmenda({emendaId,convenioId,podeEditar,statusEmenda}:{
 emendaId:string;convenioId:string|null;podeEditar:boolean;statusEmenda:string;
}){
 const qc=useQueryClient();
 const dados=useQuery({
  queryKey:["emendas","lancamentos-fase3",emendaId],
  queryFn:async()=>{
   const [a,b,c,d,e,f,g]=await Promise.all([
    supabase.from("emenda_lancamentos").select("*").eq("emenda_id",emendaId).order("created_at",{ascending:false}),
    supabase.from("emenda_lancamento_meses").select("*").eq("emenda_id",emendaId).order("ordem"),
    supabase.from("emenda_competencias").select("*").eq("emenda_id",emendaId),
    supabase.from("emenda_etapas_documentais").select("*").eq("emenda_id",emendaId),
    supabase.from("emenda_assinaturas_conferidas").select("*").eq("emenda_id",emendaId),
    supabase.from("emenda_solicitacoes").select("*").eq("emenda_id",emendaId),
    supabase.from("emenda_historico").select("id,tabela,registro_id,acao,ocorrido_em,usuario_id,anterior,novo").eq("emenda_id",emendaId).order("ocorrido_em",{ascending:false}).limit(400),
   ]);
   for(const r of [a,b,c,d,e,f,g])if(r.error)throw r.error;
   return {lancamentos:a.data??[],meses:b.data??[],competencias:c.data??[],
    etapas:d.data??[],assinaturas:e.data??[],solicitacoes:f.data??[],historico:g.data??[]};
  },
 });
 const [open,setOpen]=useState(false);
 const [competencia,setCompetencia]=useState("");
 const [periodicidade,setPeriodicidade]=useState<PeriodicidadeEmenda>("mensal");
 const [parcela,setParcela]=useState("");
 const [chave,setChave]=useState("");
 const [erro,setErro]=useState("");
 const [selecionado,setSelecionado]=useState<string|null>(null);
 const [linhaTempo,setLinhaTempo]=useState<string|null>(null);
 const [filtroStatus,setFiltroStatus]=useState("todos");
 const [filtroPeriodicidade,setFiltroPeriodicidade]=useState("todos");
 const [busca,setBusca]=useState("");
 const podeAbrir=podeEditar&&["cadastrada","ativa"].includes(statusEmenda)&&!!convenioId;
 const previstos=useMemo(()=>{
  try{return planejarLancamento(competencia,periodicidade,Number(parcela));}catch{return [];}
 },[competencia,periodicidade,parcela]);
 const lancamentos=dados.data?.lancamentos??[];
 const meses=dados.data?.meses??[];
 const competencias=dados.data?.competencias??[];
 const etapas=dados.data?.etapas??[];
 const assinaturas=dados.data?.assinaturas??[];
 const solicitacoes=dados.data?.solicitacoes??[];
 const mapaMes=new Map(competencias.map(c=>[c.id,c.competencia]));
 const mapaNota=new Map(solicitacoes.map(s=>[s.id,s]));
 const filtrados=useMemo(()=>lancamentos.filter(l=>{
  if(filtroStatus!=="todos"&&l.status!==filtroStatus)return false;
  if(filtroPeriodicidade!=="todos"&&l.periodicidade!==filtroPeriodicidade)return false;
  const identificador=[l.competencia_inicial,l.parcela_inicial,l.periodicidade,
   mapaNota.get(l.solicitacao_id??"")?.numero_ne].join(" ").toLowerCase();
  return identificador.includes(busca.trim().toLowerCase());
 }),[lancamentos,filtroStatus,filtroPeriodicidade,busca,solicitacoes]);
 const atualizar=async()=>{
  await qc.invalidateQueries({queryKey:["emendas","lancamentos-fase3",emendaId]});
  await invalidarEmendas(qc);
 };
 const abrir=useMutation({
  mutationFn:async()=>{
   if(!convenioId)throw Error("Vincule um convênio no cadastro da emenda antes de abrir lançamentos.");
   planejarLancamento(competencia,periodicidade,Number(parcela));
   const r=await supabase.rpc("emenda_iniciar_lancamento",{
    p_emenda:emendaId,p_competencia:competencia,p_periodicidade:periodicidade,
    p_parcela:Number(parcela),p_chave:chave,
   });
   if(r.error)throw r.error;
   return r.data;
  },
  onSuccess:async id=>{await atualizar();setOpen(false);setSelecionado(id);toast.success("Lançamento e competências previstas criados. Nenhum saldo reservado.");},
  onError:(e:Error)=>{setErro(e.message);toast.error(e.message);},
 });
 function iniciar(){
  setCompetencia("");setParcela("");setPeriodicidade("mensal");setErro("");
  setChave(crypto.randomUUID());setOpen(true);
 }
 return <div className="space-y-4">
  <Card>
   <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
    <div><CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4"/>Lançamentos da emenda</CardTitle>
     <CardDescription>Uma solicitação/NE pode atender a 1, 3 ou 12 parcelas; etapas e documentos ficam dentro de cada lançamento.</CardDescription></div>
    {podeAbrir&&<Button onClick={iniciar}><Plus className="mr-2 h-4 w-4"/>Novo lançamento</Button>}
   </CardHeader>
   <CardContent className="space-y-3">
    {!convenioId&&<p role="note" className="rounded-md border border-amber-400/30 bg-amber-50 p-3 text-xs text-amber-900">
      Vincule o convênio no Cadastro para informar a parcela correspondente a cada competência.
    </p>}
    <div className="grid gap-2 sm:grid-cols-3">
     <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Lançamentos</p><strong className="text-xl">{lancamentos.length}</strong></div>
     <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Em preparação</p><strong className="text-xl">{lancamentos.filter(l=>l.status==="rascunho").length}</strong></div>
     <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">NEs registradas</p><strong className="text-xl">{lancamentos.filter(l=>l.status==="emitido").length}</strong></div>
    </div>
    <div className="grid gap-2 sm:grid-cols-[1fr_180px_180px]">
     <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-8" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Competência, parcela, número da NE..."/></div>
     <Select value={filtroStatus} onValueChange={setFiltroStatus}><SelectTrigger aria-label="Filtrar andamento"><SelectValue/></SelectTrigger><SelectContent>
      <SelectItem value="todos">Todas as situações</SelectItem>{Object.entries(statusLabel).map(([k,v])=><SelectItem key={k} value={k}>{v}</SelectItem>)}
     </SelectContent></Select>
     <Select value={filtroPeriodicidade} onValueChange={setFiltroPeriodicidade}><SelectTrigger aria-label="Filtrar periodicidade"><SelectValue/></SelectTrigger><SelectContent>
      <SelectItem value="todos">Todas as periodicidades</SelectItem>{Object.entries(periodoLabel).map(([k,v])=><SelectItem key={k} value={k}>{v}</SelectItem>)}
     </SelectContent></Select>
    </div>
    {dados.isPending?<p className="p-3 text-sm text-muted-foreground">Consultando lançamentos...</p>:
     dados.error?<p role="alert" className="p-3 text-sm text-destructive">Erro: {dados.error.message}. Verifique se a migration da Fase 3 foi aplicada.</p>:
     <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[800px] text-left text-sm">
       <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
        <th className="p-3">Competência inicial</th><th className="p-3">Período</th>
        <th className="p-3">Parcelas</th><th className="p-3">Documento / NE</th>
        <th className="p-3">Andamento</th><th className="p-3 text-right">Ações</th>
       </tr></thead>
       <tbody className="divide-y">
        {!filtrados.length&&<tr><td colSpan={6} className="p-5 text-center text-muted-foreground">Nenhum lançamento encontrado.</td></tr>}
        {filtrados.map(l=>{
         const isOpen=selecionado===l.id;
         const items=meses.filter(m=>m.lancamento_id===l.id).sort((a,b)=>a.ordem-b.ordem);
         const n=mapaNota.get(l.solicitacao_id??"");
         const es=etapas.filter(e=>e.lancamento_id===l.id);
         const ass=assinaturas.filter(a=>a.lancamento_id===l.id);
         const historicoIds=new Set([l.id,...items.map(m=>m.id),...es.map(e=>e.id),...ass.map(a=>a.id)]);
         const logs=(dados.data?.historico??[]).filter(h=>historicoIds.has(h.registro_id));
         return <tr key={l.id}>
          <td colSpan={6} className="p-0">
           <div className="grid grid-cols-[1fr_1fr_1fr_1.3fr_1.2fr_1fr] items-center gap-2 px-3 py-3">
            <strong>{exibirCompetenciaISO(l.competencia_inicial)}</strong>
            <span>{periodoLabel[l.periodicidade]}</span>
            <span>{l.parcela_inicial}–{l.parcela_inicial+items.length-1}</span>
            <span className="truncate">{n?.numero_ne?"NE "+n.numero_ne:n?.numero_sei_solicitacao?"SEI "+n.numero_sei_solicitacao:"Em preparação"}</span>
            <Badge variant={l.status==="emitido"?"default":"secondary"} className="w-fit">{statusLabel[l.status]??l.status}</Badge>
            <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={()=>{setSelecionado(isOpen?null:l.id);setLinhaTempo(null);}}>
              {isOpen?<ChevronDown className="mr-1 h-4 w-4"/>:<ChevronRight className="mr-1 h-4 w-4"/>}Ver</Button>
             <Button size="icon" variant="outline" aria-label="Linha do tempo" onClick={()=>{setSelecionado(l.id);setLinhaTempo(linhaTempo===l.id?null:l.id);}}><History className="h-4 w-4"/></Button></div>
           </div>
           {isOpen&&<div className="space-y-4 border-t bg-muted/10 px-4 py-4">
            <div>
             <h4 className="mb-2 text-sm font-semibold">Competências e parcelas vinculadas</h4>
             <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(m=><div className="rounded-lg border bg-card p-3 text-xs" key={m.id}>
               <strong>{mapaMes.get(m.competencia_id)?exibirCompetenciaISO(mapaMes.get(m.competencia_id)!):"Competência"}</strong>
               <p className="mt-1">Parcela {m.parcela_convenio}</p>
               <p className="text-muted-foreground">Previsão: ao menos {m.liberacoes_minimas} liberação(ões) · ainda não lançadas</p>
              </div>)}
             </div>
            </div>
            {linhaTempo===l.id&&<div className="rounded-lg border bg-card p-3">
             <h4 className="mb-2 text-sm font-semibold">Linha do tempo do lançamento</h4>
             {!logs.length?<p className="text-xs text-muted-foreground">Sem eventos registrados.</p>:logs.map(h=><p key={h.id} className="border-b py-1.5 text-xs last:border-0">
              {new Date(h.ocorrido_em).toLocaleString("pt-BR")} · {h.acao} · {h.tabela}
              {h.usuario_id&&<span className="text-muted-foreground"> · por {h.usuario_id.slice(0,8)}…</span>}
              {h.acao==="UPDATE"&&h.anterior&&h.novo&&
               <span className="ml-2 text-muted-foreground">
                · Campos: {Object.keys(h.novo as Record<string,unknown>)
                   .filter(k=>JSON.stringify((h.anterior as Record<string,unknown>)[k])!==JSON.stringify((h.novo as Record<string,unknown>)[k]))
                   .filter(k=>!["updated_at","conferido_em"].includes(k)).join(", ")||"metadados"}
               </span>}</p>)}
             <p className="mt-2 text-xs text-muted-foreground">O histórico completo de cadastro e acessos fica na trilha de logs do sistema.</p>
            </div>}
            <EtapasLancamento lancamento={l} etapas={es} assinaturas={ass} nota={n}
              podeEditar={podeEditar} onAtualizar={atualizar}/>
           </div>}
          </td>
         </tr>;
        })}
       </tbody>
      </table>
     </div>}
   </CardContent>
  </Card>
  <Dialog open={open} onOpenChange={setOpen}>
   <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
    <DialogHeader><DialogTitle>Abrir lançamento de emenda</DialogTitle>
     <DialogDescription>Defina o período e a parcela inicial do convênio. A abertura cria previsões, não empenha e não reserva valores.</DialogDescription></DialogHeader>
    <div className="space-y-3">
     <Linha titulo="Tempo de execução">
      <Select value={periodicidade} onValueChange={v=>setPeriodicidade(v as PeriodicidadeEmenda)}>
       <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
        <SelectItem value="mensal">Mensal · 1 competência</SelectItem><SelectItem value="trimestral">Trimestral · 3 competências</SelectItem>
        <SelectItem value="anual">Anual · 12 competências</SelectItem>
       </SelectContent>
      </Select>
     </Linha>
     <Linha titulo="Mês e ano inicial (MM/AAAA)">
      <Input type="text" inputMode="numeric" maxLength={7} autoComplete="off" name="competencia-inicial"
       data-lpignore="true" data-1p-ignore="true" value={competencia}
       onChange={e=>setCompetencia(mascararCompetencia(e.target.value))} placeholder="10/2026"/>
     </Linha>
     <Linha titulo="Parcela inicial vinculada ao convênio">
      <Input type="number" min={1} max={9999} autoComplete="off" value={parcela} onChange={e=>setParcela(e.target.value)} placeholder="15"/>
     </Linha>
     {previstos.length>0&&<div className="rounded-lg border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-semibold">Previsão automática</p>
      <div className="grid grid-cols-2 gap-2">
       {previstos.map(x=><div className="rounded border bg-card p-2 text-xs" key={x.competencia}>
        {x.competencia} · Parcela <strong>{x.parcela}</strong>
       </div>)}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Cada competência aguardará ao menos uma liberação quando a Fase 4 estiver disponível. Nenhum valor é rateado.</p>
     </div>}
     {erro&&<p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
    <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button>
     <Button disabled={abrir.isPending||!previstos.length} onClick={()=>abrir.mutate()}>
      <FilePlus2 className="mr-2 h-4 w-4"/>Criar lançamento</Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 </div>;
}
