import {createFileRoute,Link} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {ArrowLeft,History,Landmark,LockKeyhole,CheckCircle2} from "lucide-react";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {useAuth,hasRole} from "@/hooks/useAuth";
import {useDetalheEmenda,invalidarEmendas} from "@/hooks/useEmendas";
import {EtapasLancamento} from "@/components/emendas/EtapasLancamento";
import {Fase4Emenda} from "@/components/emendas/Fase4Emenda";
import {Fase5Emenda} from "@/components/emendas/Fase5Emenda";
import {exibirCompetenciaISO} from "@/lib/emendas/competencias";
import {brl} from "@/lib/format";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
export const Route=createFileRoute("/_authenticated/emendas/$id_/lancamentos/$lancamentoId")({
 head:()=>({meta:[{title:"Lançamento de Emenda | PACTO Joinville"}]}),
 component:PaginaLancamento,
});
function PaginaLancamento(){
 const {id,lancamentoId}=Route.useParams();
 const {roles}=useAuth();const podeEditar=hasRole(roles,"acp");
 const [historicoAberto,setHistoricoAberto]=useState(false);
 const [filtroHistorico,setFiltroHistorico]=useState("todos");
 const qc=useQueryClient();
 const detalhe=useDetalheEmenda(id);
 const q=useQuery({
  queryKey:["emendas","pagina-lancamento",lancamentoId],
  queryFn:async()=>{
   const [l,m,c,e,a,s,p,env,comp,lib,pag,enc,anul,conc,h]=await Promise.all([
    supabase.from("emenda_lancamentos").select("*").eq("id",lancamentoId).eq("emenda_id",id).single(),
    supabase.from("emenda_lancamento_meses").select("*").eq("lancamento_id",lancamentoId).order("ordem"),
    supabase.from("emenda_competencias").select("*").eq("emenda_id",id),
    supabase.from("emenda_etapas_documentais").select("*").eq("lancamento_id",lancamentoId),
    supabase.from("emenda_assinaturas_conferidas").select("*").eq("lancamento_id",lancamentoId),
    supabase.from("emenda_solicitacoes").select("*").eq("emenda_id",id),
    supabase.from("emenda_pareceres_financeiros").select("*").eq("lancamento_id",lancamentoId).order("ocorrido_em",{ascending:false}),
    supabase.from("emenda_envios_sefaz").select("*").eq("lancamento_id",lancamentoId).maybeSingle(),
    supabase.from("emenda_comprovantes").select("*").eq("lancamento_id",lancamentoId),
    supabase.from("emenda_liberacoes").select("*").eq("lancamento_id",lancamentoId),
    supabase.from("emenda_blocos_pagamento").select("*").eq("lancamento_id",lancamentoId),
    supabase.from("emenda_encerramentos_sem_execucao").select("*").eq("lancamento_id",lancamentoId),
    supabase.from("emenda_anulacoes").select("*").eq("lancamento_id",lancamentoId),
    supabase.from("emenda_conciliacoes_ne").select("*").eq("lancamento_id",lancamentoId).maybeSingle(),
    supabase.from("emenda_historico").select("*").eq("emenda_id",id).order("ocorrido_em",{ascending:false}).limit(500),
   ]);
   for(const x of [l,m,c,e,a,s,p,env,comp,lib,pag,enc,anul,conc,h])if(x.error)throw x.error;
   return {lan:l.data,meses:m.data??[],competencias:c.data??[],etapas:e.data??[],
    assinaturas:a.data??[],notas:s.data??[],pareceres:p.data??[],envio:env.data??undefined,
    comprovantes:comp.data??[],liberacoes:lib.data??[],pagamentos:pag.data??[],
    encerramentos:enc.data??[],anulacoes:anul.data??[],conciliacao:conc.data??undefined,historico:h.data??[]};
  },
 });
 const refresh=async()=>{
  await qc.invalidateQueries({queryKey:["emendas","pagina-lancamento",lancamentoId]});
  await qc.invalidateQueries({queryKey:["emendas","lancamentos-fase3",id]});
  await invalidarEmendas(qc);
 };
 const lan=q.data?.lan,emenda=detalhe.data?.emenda;
 const nota=q.data?.notas.find(n=>n.id===lan?.solicitacao_id);
 const map=new Map((q.data?.competencias??[]).map(c=>[c.id,c.competencia]));
 const ids=new Set([lan?.id,...(q.data?.meses??[]).map(x=>x.id),
  ...(q.data?.etapas??[]).map(x=>x.id),...(q.data?.pareceres??[]).map(x=>x.id),
  ...(q.data?.assinaturas??[]).map(x=>x.id),...(q.data?.liberacoes??[]).map(x=>x.id),
  ...(q.data?.pagamentos??[]).map(x=>x.id),...(q.data?.anulacoes??[]).map(x=>x.id),
  ...(q.data?.comprovantes??[]).map(x=>x.id),...(q.data?.encerramentos??[]).map(x=>x.id),
  lan?.solicitacao_id,q.data?.envio?.id,q.data?.conciliacao?.id]);
 const logs=(q.data?.historico??[]).filter(h=>{
  const antes=h.anterior&&typeof h.anterior==="object"&&!Array.isArray(h.anterior)?h.anterior:null;
  const depois=h.novo&&typeof h.novo==="object"&&!Array.isArray(h.novo)?h.novo:null;
  return ids.has(h.registro_id)||antes?.lancamento_id===lancamentoId||
   depois?.lancamento_id===lancamentoId||h.registro_id===lancamentoId;
 });
 const autores=useQuery({
  queryKey:["emendas","autores-historico",id,logs.map(h=>h.usuario_id).filter(Boolean).sort().join(",")],
  enabled:logs.some(h=>h.usuario_id),
  queryFn:async()=>{
   const idsUsuarios=[...new Set(logs.map(h=>h.usuario_id).filter((v):v is string=>!!v))];
   const r=await supabase.from("profiles").select("id,nome").in("id",idsUsuarios);
   if(r.error)throw r.error;
   return new Map((r.data??[]).map(p=>[p.id,p.nome]));
  },staleTime:300000,
 });
 const detalhar=(h:(typeof logs)[number])=>{
  const fonte=h.acao==="DELETE"?h.anterior:h.novo;
  if(!fonte||typeof fonte!=="object"||Array.isArray(fonte))return "";
  const campos=["etapa","papel","nome_signatario","cargo_signatario","desfecho",
    "status","numero_sei","numero_ne","tipo","valor_solicitado","valor","motivo","parcela_convenio","dotacao","fonte"];
  return campos.filter(c=>fonte[c]!==undefined&&fonte[c]!==null&&String(fonte[c]).length>0)
   .slice(0,4).map(c=>c.replaceAll("_"," ")+": "+String(fonte[c]).slice(0,115)).join(" · ");
 };
 const tabelasFinanceiras=["emenda_liberacoes","emenda_blocos_pagamento","emenda_anulacoes",
  "emenda_conciliacoes_ne","emenda_encerramentos_sem_execucao","emenda_solicitacoes"];
 const labelsHistorico:Record<string,string>={
  emenda_lancamentos:"Cadastro e andamento",emenda_lancamento_meses:"Parcelas previstas",
  emenda_etapas_documentais:"Etapa documental",emenda_assinaturas_conferidas:"Conferência de assinatura",
  emenda_pareceres_financeiros:"Parecer financeiro",emenda_envios_sefaz:"Envio à SEFAZ",
  emenda_solicitacoes:"Solicitação / NE",emenda_comprovantes:"Documento comprobatório",
  emenda_liberacoes:"Liberação de recurso",emenda_blocos_pagamento:"Bloco de pagamento",
  emenda_anulacoes:"Anulação residual",emenda_conciliacoes_ne:"Conciliação da NE",
  emenda_encerramentos_sem_execucao:"Encerramento sem execução",
 };
 const logsFiltrados=logs.filter(h=>filtroHistorico==="todos"||
  (filtroHistorico==="financeiro"?tabelasFinanceiras.includes(h.tabela):
   !tabelasFinanceiras.includes(h.tabela)));
 if(q.isPending||detalhe.isPending)return <div className="p-6 text-sm text-muted-foreground">Carregando lançamento...</div>;
 if(q.error||detalhe.error)return <div role="alert" className="rounded-lg border border-destructive p-4 text-sm text-destructive">
  Não foi possível carregar a gestão do lançamento. Verifique se as migrations das Fases 4 e 5 foram aplicadas no banco: {String(q.error?.message??detalhe.error?.message)}</div>;
 if(!lan||!emenda||lan.excluido_em)return <p className="p-5">Lançamento indisponível ou excluído.</p>;
 return <div className="space-y-4">
  <Link to="/emendas/$id" params={{id}} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
   <ArrowLeft className="h-4 w-4"/>Voltar à emenda {emenda.numero}</Link>
  <div className="flex flex-wrap items-start justify-between gap-2">
   <div><h1 className="flex items-center gap-2 text-xl font-bold text-primary">
    <Landmark className="h-5 w-5"/>Lançamento {exibirCompetenciaISO(lan.competencia_inicial)}</h1>
    <p className="text-sm text-muted-foreground">
     Emenda {emenda.numero} · {lan.periodicidade} · parcela inicial {lan.parcela_inicial}</p>
   </div>
   <div className="flex flex-wrap items-center gap-2">
    <Button size="sm" variant="outline" onClick={()=>setHistoricoAberto(true)}>
     <History className="mr-2 h-4 w-4"/>Linha do tempo <span className="ml-2 text-muted-foreground">({logs.length})</span>
    </Button>
    <Badge variant="secondary">{q.data.conciliacao?"Conciliado e encerrado":lan.status==="rascunho"?"Em preparação":lan.status==="formalizado"?"Aguardando NE":"NE registrada"}</Badge>
   </div>
  </div>
  <div className="grid gap-2 sm:grid-cols-3">
   <div className="rounded-lg border p-3 text-xs"><p className="text-muted-foreground">Valor solicitado</p>
    <strong className="text-lg">{brl(Number(nota?.valor_solicitado??q.data.etapas.find(e=>e.etapa==="solicitacao")?.valor_solicitado??0))}</strong></div>
   <div className="rounded-lg border p-3 text-xs"><p className="text-muted-foreground">NE emitida</p>
    <strong className="text-lg">{brl(Number(nota?.valor_ne??0))}</strong></div>
   <div className="rounded-lg border p-3 text-xs"><p className="text-muted-foreground">Disponível na emenda</p>
    <strong className="text-lg">{brl(Number(detalhe.data?.resumo?.saldo_disponivel??0))}</strong></div>
  </div>
  <section className="rounded-lg border p-3">
   <h2 className="mb-2 text-sm font-semibold">Competências e parcelas vinculadas</h2>
   <div className="flex flex-wrap gap-2">
    {q.data.meses.map(m=><div key={m.id} className="rounded-md border bg-muted/10 px-3 py-2 text-xs">
     {exibirCompetenciaISO(map.get(m.competencia_id)??"")} · <strong>Parcela {m.parcela_convenio}</strong></div>)}
   </div>
  </section>
  <EtapasLancamento lancamento={lan} etapas={q.data.etapas}
   assinaturas={q.data.assinaturas} nota={nota} pareceres={q.data.pareceres}
   envio={q.data.envio} saldoDisponivel={Number(detalhe.data?.resumo?.saldo_disponivel??0)}
   podeEditar={podeEditar} onAtualizar={refresh}/>
  <section className="rounded-lg border">
   <div className="flex items-center gap-3 px-4 py-3">
    <span className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold "+
     (lan.status==="emitido"?"bg-primary text-primary-foreground":"bg-muted text-muted-foreground")}>4</span>
    <div className="flex-1">
     <h3 className="text-sm font-semibold">Liberações de recursos, comprovantes e pagamentos</h3>
     <p className="text-xs text-muted-foreground">
      {lan.status==="emitido"?"Etapa disponível":"Aguardando a Nota de Empenho emitida"}
     </p>
    </div>
    {lan.status!=="emitido"&&<LockKeyhole className="h-4 w-4 text-muted-foreground"/>}
   </div>
   {lan.status==="emitido"&&<div className="border-t p-4">
    <Fase4Emenda lancamentoId={lan.id} meses={q.data.meses} competencias={map}
     comprovantes={q.data.comprovantes} liberacoes={q.data.liberacoes}
     pagamentos={q.data.pagamentos} encerramentos={q.data.encerramentos}
     podeEditar={podeEditar&&!q.data.conciliacao} onAtualizar={refresh}/>
   </div>}
  </section>
  {lan.status==="emitido"&&<>
   <Fase5Emenda lancamentoId={lan.id} nota={nota} anulacoes={q.data.anulacoes}
    conciliacao={q.data.conciliacao} liberacoes={q.data.liberacoes} pagamentos={q.data.pagamentos}
    competencias={q.data.meses.length} podeEditar={podeEditar} onAtualizar={refresh}/>
  </>}
  <Dialog open={historicoAberto} onOpenChange={setHistoricoAberto}>
   <DialogContent className="flex max-h-[90vh] w-[min(95vw,850px)] max-w-4xl flex-col overflow-hidden">
    <DialogHeader><DialogTitle className="flex items-center gap-2">
     <History className="h-5 w-5"/>Linha do tempo do lançamento
    </DialogTitle><DialogDescription>
     Histórico cronológico de operações, decisões, conferências e movimentações do lançamento.
     Retiradas e correções permanecem registradas como eventos de auditoria.
    </DialogDescription></DialogHeader>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
     <span className="text-xs text-muted-foreground">
      {logs.length} eventos encontrados
      {q.data.historico.length>=500?" · somente os 500 registros mais recentes da emenda":""}
     </span>
     <select className="h-9 rounded-md border bg-background px-3 text-xs"
      value={filtroHistorico} onChange={e=>setFiltroHistorico(e.target.value)}
      aria-label="Filtrar linha do tempo">
      <option value="todos">Todos</option>
      <option value="documental">Documentais</option>
      <option value="financeiro">Financeiros</option>
     </select>
    </div>
    <ol className="min-h-0 flex-1 space-y-0 overflow-y-auto border-l-2 border-muted px-5">
     {[...logsFiltrados].reverse().map(h=><li key={h.id}
      className="relative border-b border-dashed py-3 last:border-0">
      <span className="absolute -left-[26px] top-4 flex h-3 w-3 items-center justify-center rounded-full border-2 border-primary bg-background"/>
      <div className="flex flex-wrap items-center justify-between gap-2">
       <p className="flex items-center gap-2 text-xs font-semibold">
        {h.acao==="DELETE"?<LockKeyhole className="h-3.5 w-3.5 text-destructive"/>:
         <CheckCircle2 className="h-3.5 w-3.5 text-primary"/>}
        {labelsHistorico[h.tabela]??h.tabela}
       </p>
       <time className="text-[11px] text-muted-foreground">
        {new Date(h.ocorrido_em).toLocaleString("pt-BR")}
       </time>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
       {h.acao==="INSERT"?"Registro criado":h.acao==="UPDATE"?"Registro atualizado":
        h.acao==="DELETE"?"Registro retirado":h.acao}
       {" · "}{h.usuario_id?(autores.data?.get(h.usuario_id)??"Usuário "+h.usuario_id.slice(0,8)+"…"):"Autor não identificado"}
      </p>
      {detalhar(h)&&<p className="mt-2 break-words rounded-md bg-muted/30 px-3 py-2 text-xs">
       {detalhar(h)}</p>}
     </li>)}
     {logsFiltrados.length===0&&<li className="p-4 text-sm text-muted-foreground">
      Nenhum evento encontrado para o filtro.</li>}
    </ol>
   </DialogContent>
  </Dialog>
 </div>;
}
