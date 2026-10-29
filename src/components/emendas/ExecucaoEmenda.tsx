import { useMemo, useState } from "react";
import {Link,useNavigate} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
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


const statusLabel:Record<string,string>={rascunho:"Em preparação",formalizado:"Solicitação formalizada",emitido:"NE emitida",cancelado:"Cancelado"};
const periodoLabel:Record<string,string>={mensal:"Mensal",trimestral:"Trimestral",anual:"Anual"};
function Linha({titulo,children}:{titulo:string;children:React.ReactNode}) {
 return <div className="space-y-1"><Label className="text-xs">{titulo}</Label>{children}</div>;
}
export function ExecucaoEmenda({emendaId,convenioId,podeEditar,statusEmenda}:{
 emendaId:string;convenioId:string|null;podeEditar:boolean;statusEmenda:string;
}){
 const qc=useQueryClient();
 const navigate=useNavigate();
 const dados=useQuery({
  queryKey:["emendas","lancamentos-fase3",emendaId],
  queryFn:async()=>{
   const [a,b,c,d,e,f,g,h,i,j,k,p,conc]=await Promise.all([
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
    supabase.from("emenda_pareceres_financeiros").select("*").eq("emenda_id",emendaId).order("ocorrido_em",{ascending:false}),
    supabase.from("emenda_conciliacoes_ne").select("*").eq("emenda_id",emendaId),
   ]);
   for(const r of [a,b,c,d,e,f,g,h,i,j,k,p,conc])if(r.error)throw r.error;
   return {lancamentos:a.data??[],meses:b.data??[],competencias:c.data??[],
    etapas:d.data??[],assinaturas:e.data??[],solicitacoes:f.data??[],historico:g.data??[],
    comprovantes:h.data??[],liberacoes:i.data??[],pagamentos:j.data??[],encerramentos:k.data??[],
    pareceres:p.data??[],conciliacoes:conc.data??[]};
  },
 });
 const [open,setOpen]=useState(false);
 const [competencia,setCompetencia]=useState("");
 const [periodicidade,setPeriodicidade]=useState<PeriodicidadeEmenda>("mensal");
 const [parcela,setParcela]=useState("");
 const [chave,setChave]=useState("");
 const [erro,setErro]=useState("");
 const [editando,setEditando]=useState<string|null>(null);
 const [excluindo,setExcluindo]=useState<string|null>(null);
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
  if(l.status==="cancelado"||l.excluido_em)return "Cancelados";
  if((dados.data?.conciliacoes??[]).some(c=>c.lancamento_id===l.id))return "Conciliados e encerrados";
  if(l.status==="emitido"){
   const filhos=meses.filter(m=>m.lancamento_id===l.id);
   const encerrados=filhos.filter(m=>(dados.data?.encerramentos??[]).some(e=>e.lancamento_id===l.id&&e.competencia_id===m.competencia_id));
   return filhos.length>0&&encerrados.length===filhos.length?"Encerrados sem execução":"Liberações e pagamentos";
  }
  if(l.status==="formalizado")return "Aguardando emissão da NE";
  const registros=etapas.filter(e=>e.lancamento_id===l.id);
  if(!registros.some(e=>e.etapa==="dotacao"&&e.coord_orcamentos_confirmada))return "1 · Dotação e fonte";
  const parecer=(dados.data?.pareceres??[]).find(p=>p.lancamento_id===l.id);
  const dot=registros.find(e=>e.etapa==="dotacao");
  if(parecer?.desfecho!=="aprovado"||!dot?.conferido_em||parecer.ocorrido_em<dot.conferido_em)
   return "2 · Autorização financeira";
  if(!registros.some(e=>e.etapa==="solicitacao"))return "3 · Solicitação de empenho";
  if(assinaturas.filter(a=>a.lancamento_id===l.id&&["orcamentos","fiscal","gerencia_acp","diretor_servicos","diretoria_financeira"].includes(a.papel)).length<5)return "4 · Assinaturas";
  return "5 · Envio à SEFAZ";
 };

 const filtrados=useMemo(()=>lancamentos.filter(l=>{
  if(l.excluido_em)return false;
  if(filtroStatus!=="todos"&&l.status!==filtroStatus)return false;
  if(filtroPeriodicidade!=="todos"&&l.periodicidade!==filtroPeriodicidade)return false;
  const identificador=[l.competencia_inicial,l.parcela_inicial,l.periodicidade,
   mapaNota.get(l.solicitacao_id??"")?.numero_ne].join(" ").toLowerCase();
  return identificador.includes(busca.trim().toLowerCase());
 }),[lancamentos,filtroStatus,filtroPeriodicidade,busca,solicitacoes]);
 const ordemEtapas=["1 · Dotação e fonte","2 · Autorização financeira","3 · Solicitação de empenho",
  "4 · Assinaturas","5 · Envio à SEFAZ","Aguardando emissão da NE",
  "Liberações e pagamentos","Encerrados sem execução","Conciliados e encerrados","Cancelados"];
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
  onSuccess:async id=>{await atualizar();setOpen(false);setEditando(null);
    toast.success("Lançamento criado sem reserva de saldo.");
    await navigate({to:"/emendas/$id/lancamentos/$lancamentoId",params:{id:emendaId,lancamentoId:id}});
   },
  onError:(e:Error)=>{setErro(e.message);toast.error(e.message);},
 });
 const podeMexer=(l:(typeof lancamentos)[number])=>podeEditar&&l.status==="rascunho"&&!l.excluido_em
  &&!etapas.some(e=>e.lancamento_id===l.id)
  &&!(dados.data?.pareceres??[]).some(p=>p.lancamento_id===l.id);
 const atualizarRascunho=useMutation({
  mutationFn:async()=>{
   if(!editando)throw Error("Selecione o lançamento.");
   planejarLancamento(competencia,periodicidade,Number(parcela));
   const r=await supabase.rpc("emenda_editar_lancamento",{
    p_lancamento:editando,p_competencia:competencia,p_periodicidade:periodicidade,p_parcela:Number(parcela)});
   if(r.error)throw r.error;
  },
  onSuccess:async()=>{await atualizar();setOpen(false);setEditando(null);toast.success("Lançamento atualizado, com auditoria.");},
  onError:(e:Error)=>{setErro(e.message);toast.error(e.message);},
 });
 const excluirRascunho=useMutation({
  mutationFn:async()=>{
   if(!excluindo)throw Error("Selecione o lançamento.");
   const r=await supabase.rpc("emenda_excluir_lancamento",{p_lancamento:excluindo});
   if(r.error)throw r.error;
  },
  onSuccess:async()=>{await atualizar();setExcluindo(null);toast.success("Lançamento retirado da lista, com histórico preservado.");},
  onError:(e:Error)=>{toast.error(e.message);},
 });
 function editar(l:(typeof lancamentos)[number]){
  setEditando(l.id);setCompetencia(exibirCompetenciaISO(l.competencia_inicial));
  setPeriodicidade(l.periodicidade as PeriodicidadeEmenda);setParcela(String(l.parcela_inicial));
  setErro("");setOpen(true);
 }
 function iniciar(){
  setEditando(null);setCompetencia("");setParcela("");setPeriodicidade("mensal");setErro("");
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
      {!filtrados.length&&<p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">Nenhum lançamento encontrado.</p>}
      {grupos.map(grupo=><section key={grupo.etapa} className="overflow-hidden rounded-lg border">
       <header className="flex items-center justify-between bg-muted/40 px-3 py-2">
        <h4 className="text-sm font-semibold">{grupo.etapa}</h4><Badge variant="outline">{grupo.items.length}</Badge>
       </header>
       <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
         <thead className="border-y bg-muted/10 text-muted-foreground"><tr>
          <th className="p-3">Competência inicial</th><th className="p-3">Periodicidade</th>
          <th className="p-3">Parcelas</th><th className="p-3">Documento / NE</th>
          <th className="p-3">Andamento</th><th className="p-3 text-right">Ações</th>
         </tr></thead>
         <tbody className="divide-y">
          {grupo.items.map(l=>{
           const its=meses.filter(m=>m.lancamento_id===l.id);
           const nota=mapaNota.get(l.solicitacao_id??"");
           return <tr key={l.id} className="hover:bg-muted/20">
            <td className="p-3 font-medium text-primary">
             <Link to="/emendas/$id/lancamentos/$lancamentoId"
              params={{id:emendaId,lancamentoId:l.id}} className="underline-offset-4 hover:underline">
              {exibirCompetenciaISO(l.competencia_inicial)}</Link></td>
            <td className="p-3">{periodoLabel[l.periodicidade]}</td>
            <td className="p-3">{l.parcela_inicial}–{l.parcela_inicial+its.length-1}</td>
            <td className="p-3">{nota?.numero_ne?"NE "+nota.numero_ne:nota?.numero_sei_solicitacao?"SEI "+nota.numero_sei_solicitacao:"Em preparação"}</td>
            <td className="p-3"><Badge variant="secondary">{statusLabel[l.status]??l.status}</Badge></td>
            <td className="p-3 text-right whitespace-nowrap">
             <Button asChild size="sm" variant="outline"><Link to="/emendas/$id/lancamentos/$lancamentoId"
              params={{id:emendaId,lancamentoId:l.id}}>Gerenciar</Link></Button>
             {podeMexer(l)&&<>
              <Button size="icon" variant="ghost" aria-label="Editar lançamento" onClick={()=>editar(l)}>
               <Pencil className="h-4 w-4"/></Button>
              <Button size="icon" variant="ghost" aria-label="Excluir lançamento" onClick={()=>setExcluindo(l.id)}>
               <Trash2 className="h-4 w-4 text-destructive"/></Button>
             </>}
            </td>
           </tr>;
          })}
         </tbody>
        </table>
       </div>
      </section>)}
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
    <DialogHeader><DialogTitle>{editando?"Editar lançamento em preparação":"Abrir lançamento de emenda"}</DialogTitle>
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
     <Button disabled={abrir.isPending||atualizarRascunho.isPending||!previstos.length}
      onClick={()=>editando?atualizarRascunho.mutate():abrir.mutate()}>
      <FilePlus2 className="mr-2 h-4 w-4"/>{editando?"Salvar alterações":"Criar lançamento"}</Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
  <Dialog open={!!excluindo} onOpenChange={v=>{if(!v)setExcluindo(null);}}>
   <DialogContent><DialogHeader><DialogTitle>Excluir lançamento em preparação?</DialogTitle>
    <DialogDescription>A exclusão é lógica e auditada; o lançamento desaparece da lista operacional.
     Não é permitida quando já existem decisões ou documentos registrados.</DialogDescription>
   </DialogHeader>
   <DialogFooter><Button variant="outline" onClick={()=>setExcluindo(null)}>Cancelar</Button>
    <Button variant="destructive" disabled={excluirRascunho.isPending} onClick={()=>excluirRascunho.mutate()}>Confirmar exclusão</Button></DialogFooter>
  </Dialog>
 </div>;
}
