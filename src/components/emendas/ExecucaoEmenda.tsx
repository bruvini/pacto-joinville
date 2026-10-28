import { Fragment, useMemo, useState } from "react";
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
import { Fase4Emenda } from "./Fase4Emenda";

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
   const [a,b,c,d,e,f,g,h,i,j,k]=await Promise.all([
    supabase.from("emenda_lancamentos").select("*").eq("emenda_id",emendaId).order("created_at",{ascending:false}),
    supabase.from("emenda_lancamento_meses").select("*").eq("emenda_id",emendaId).order("ordem"),
    supabase.from("emenda_competencias").select("*").eq("emenda_id",emendaId),
    supabase.from("emenda_etapas_documentais").select("*").eq("emenda_id",emendaId),
    supabase.from("emenda_assinaturas_conferidas").select("*").eq("emenda_id",emendaId),
    supabase.from("emenda_solicitacoes").select("*").eq("emenda_id",emendaId),
    supabase.from("emenda_historico").select("id,tabela,registro_id,acao,ocorrido_em,usuario_id,anterior,novo").eq("emenda_id",emendaId).order("ocorrido_em",{ascending:false}).limit(400),
    supabase.from("emenda_comprovantes").select("*").eq("emenda_id",emendaId),
    supabase.from("emenda_liberacoes").select("*").eq("emenda_id",emendaId).order("registrado_em"),
    supabase.from("emenda_blocos_pagamento").select("*").eq("emenda_id",emendaId).order("registrado_em"),
    supabase.from("emenda_encerramentos_sem_execucao").select("*").eq("emenda_id",emendaId),
   ]);
   for(const r of [a,b,c,d,e,f,g,h,i,j,k])if(r.error)throw r.error;
   return {lancamentos:a.data??[],meses:b.data??[],competencias:c.data??[],
    etapas:d.data??[],assinaturas:e.data??[],solicitacoes:f.data??[],historico:g.data??[],
    comprovantes:h.data??[],liberacoes:i.data??[],pagamentos:j.data??[],encerramentos:k.data??[]};
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
 const etapaDe=(l:(typeof lancamentos)[number])=>{
  if(l.status==="cancelado")return "Cancelados";
  if(l.status==="emitido"){
   const filhos=meses.filter(m=>m.lancamento_id===l.id);
   const encerrados=filhos.filter(m=>(dados.data?.encerramentos??[]).some(e=>e.lancamento_id===l.id&&e.competencia_id===m.competencia_id));
   return filhos.length>0&&encerrados.length===filhos.length?"Encerrados sem execução":"Liberações e pagamentos";
  }
  if(l.status==="formalizado")return "Aguardando emissão da NE";
  const registros=etapas.filter(e=>e.lancamento_id===l.id);
  if(!registros.some(e=>e.etapa==="dotacao"&&e.coord_orcamentos_confirmada))return "1 · Dotação e fonte";
  if(!registros.some(e=>e.etapa==="autorizacao"))return "2 · Autorização financeira";
  if(!registros.some(e=>e.etapa==="solicitacao"))return "3 · Solicitação de empenho";
  if(assinaturas.filter(a=>a.lancamento_id===l.id).length<3)return "4 · Assinaturas";
  return "5 · Formalização da solicitação";
 };

 const filtrados=useMemo(()=>lancamentos.filter(l=>{
  if(filtroStatus!=="todos"&&l.status!==filtroStatus)return false;
  if(filtroPeriodicidade!=="todos"&&l.periodicidade!==filtroPeriodicidade)return false;
  const identificador=[l.competencia_inicial,l.parcela_inicial,l.periodicidade,
   mapaNota.get(l.solicitacao_id??"")?.numero_ne].join(" ").toLowerCase();
  return identificador.includes(busca.trim().toLowerCase());
 }),[lancamentos,filtroStatus,filtroPeriodicidade,busca,solicitacoes]);
 const ordemEtapas=["1 · Dotação e fonte","2 · Autorização financeira","3 · Solicitação de empenho",
  "4 · Assinaturas","5 · Formalização da solicitação","Aguardando emissão da NE",
  "Liberações e pagamentos","Encerrados sem execução","Cancelados"];
 const grupos=ordemEtapas.map(etapa=>({etapa,items:filtrados.filter(l=>etapaDe(l)===etapa)}))
  .filter(x=>x.items.length>0);
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
     <div className="space-y-3">
      {!filtrados.length&&<p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhum lançamento para os filtros selecionados.</p>}
      {grupos.map(grupo=><section key={grupo.etapa} className="overflow-hidden rounded-lg border">
       <header className="flex items-center justify-between bg-muted/40 px-3 py-2">
        <h4 className="text-sm font-semibold">{grupo.etapa}</h4>
        <Badge variant="outline">{grupo.items.length}</Badge>
       </header>
       <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
        <thead><tr className="border-y bg-muted/10 text-muted-foreground">
         <th className="p-3">Competência</th><th className="p-3">Periodicidade</th>
         <th className="p-3">Parcelas</th><th className="p-3">Documento / NE</th>
         <th className="p-3">Situação</th><th className="p-3 text-right">Ações</th>
        </tr></thead>
        <tbody className="divide-y">{grupo.items.map(l=>{
         const isOpen=selecionado===l.id;
         const items=meses.filter(m=>m.lancamento_id===l.id).sort((a,b)=>a.ordem-b.ordem);
         const n=mapaNota.get(l.solicitacao_id??"");
         const es=etapas.filter(e=>e.lancamento_id===l.id);
         const ass=assinaturas.filter(a=>a.lancamento_id===l.id);
         const cs=(dados.data?.comprovantes??[]).filter(c=>c.lancamento_id===l.id);
         const ls=(dados.data?.liberacoes??[]).filter(c=>c.lancamento_id===l.id);
         const ps=(dados.data?.pagamentos??[]).filter(c=>c.lancamento_id===l.id);
         const enc=(dados.data?.encerramentos??[]).filter(c=>c.lancamento_id===l.id);
         const ids=new Set([l.id,...items.map(m=>m.id),...es.map(e=>e.id),...ass.map(a=>a.id),
          ...cs.map(c=>c.id),...ls.map(x=>x.id),...ps.map(x=>x.id),...enc.map(x=>x.id)]);
         const logs=(dados.data?.historico??[]).filter(h=>ids.has(h.registro_id));
         return <Fragment key={l.id}>
          <tr className="hover:bg-muted/20">
           <td className="p-3 font-semibold">{exibirCompetenciaISO(l.competencia_inicial)}</td>
           <td className="p-3">{periodoLabel[l.periodicidade]}</td>
           <td className="p-3">{l.parcela_inicial}–{l.parcela_inicial+items.length-1}</td>
           <td className="p-3">{n?.numero_ne?"NE "+n.numero_ne:n?.numero_sei_solicitacao?"SEI "+n.numero_sei_solicitacao:"Em preparação"}</td>
           <td className="p-3"><Badge variant="secondary">{statusLabel[l.status]??l.status}</Badge></td>
           <td className="p-3 text-right whitespace-nowrap">
            <Button size="sm" variant="ghost" aria-expanded={isOpen} onClick={()=>{setSelecionado(isOpen?null:l.id);setLinhaTempo(null);}}>
             {isOpen?<ChevronDown className="mr-1 h-4 w-4"/>:<ChevronRight className="mr-1 h-4 w-4"/>}Detalhar</Button>
            <Button size="icon" variant="ghost" aria-label="Linha do tempo" onClick={()=>{setSelecionado(l.id);setLinhaTempo(linhaTempo===l.id?null:l.id);}}>
             <History className="h-4 w-4"/></Button>
           </td>
          </tr>
          {isOpen&&<tr><td colSpan={6} className="space-y-4 bg-muted/10 p-4">
           <div className="flex flex-wrap gap-2">
            {items.map(m=><div key={m.id} className="rounded-md border bg-card px-3 py-2 text-xs">
             <strong>{exibirCompetenciaISO(mapaMes.get(m.competencia_id)??"")}</strong> · Parcela {m.parcela_convenio}</div>)}
           </div>
           {linhaTempo===l.id&&<div className="rounded-lg border bg-card p-3">
            <h4 className="mb-2 font-semibold">Linha do tempo do lançamento</h4>
            {!logs.length?<p className="text-muted-foreground">Nenhum evento registrado.</p>:logs.map(h=><p key={h.id} className="border-b py-2 last:border-0">
             {new Date(h.ocorrido_em).toLocaleString("pt-BR")} · {h.acao} · {h.tabela}
             {h.usuario_id&&<span className="text-muted-foreground"> · usuário {h.usuario_id.slice(0,8)}…</span>}
             {h.acao==="UPDATE"&&h.anterior&&h.novo&&<span className="text-muted-foreground">
              {" · Campos: "+Object.keys(h.novo as Record<string,unknown>)
               .filter(k=>JSON.stringify((h.anterior as Record<string,unknown>)[k])!==JSON.stringify((h.novo as Record<string,unknown>)[k]))
               .filter(k=>!["updated_at","conferido_em"].includes(k)).join(", ")}</span>}
            </p>)}
           </div>}
           <EtapasLancamento lancamento={l} etapas={es} assinaturas={ass} nota={n}
            podeEditar={podeEditar} onAtualizar={atualizar}/>
           {l.status==="emitido"&&<Fase4Emenda lancamentoId={l.id} meses={items}
            competencias={mapaMes} comprovantes={cs} liberacoes={ls} pagamentos={ps}
            encerramentos={enc} podeEditar={podeEditar} onAtualizar={atualizar}/>}
          </td></tr>}
         </Fragment>;
        })}</tbody>
       </table></div>
      </section>)}
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
      <p className="mt-2 text-xs text-muted-foreground">Cada competência terá acompanhamento individual de liberações e pagamentos. Nenhum valor é rateado automaticamente.</p>
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
