import {createFileRoute,Link} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {ArrowLeft,History,Landmark} from "lucide-react";
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
    supabase.from("emenda_historico").select("id,tabela,registro_id,acao,ocorrido_em,usuario_id").eq("emenda_id",id).order("ocorrido_em",{ascending:false}).limit(500),
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
 const logs=(q.data?.historico??[]).filter(h=>ids.has(h.registro_id));
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
   <Badge variant="secondary">{q.data.conciliacao?"Conciliado e encerrado":lan.status==="rascunho"?"Em preparação":lan.status==="formalizado"?"Aguardando NE":"NE registrada"}</Badge>
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
  {lan.status==="emitido"&&<>
   <Fase4Emenda lancamentoId={lan.id} meses={q.data.meses} competencias={map}
    comprovantes={q.data.comprovantes} liberacoes={q.data.liberacoes}
    pagamentos={q.data.pagamentos} encerramentos={q.data.encerramentos}
    podeEditar={podeEditar&&!q.data.conciliacao} onAtualizar={refresh}/>
   <Fase5Emenda lancamentoId={lan.id} nota={nota} anulacoes={q.data.anulacoes}
    conciliacao={q.data.conciliacao} liberacoes={q.data.liberacoes} pagamentos={q.data.pagamentos}
    competencias={q.data.meses.length} podeEditar={podeEditar} onAtualizar={refresh}/>
  </>}
  <section className="rounded-lg border">
   <Button className="w-full justify-between" variant="ghost" onClick={()=>setHistoricoAberto(!historicoAberto)}
    aria-expanded={historicoAberto}><span className="flex items-center gap-2"><History className="h-4 w-4"/>Linha do tempo e rastreabilidade</span>
     <span className="text-xs text-muted-foreground">{logs.length} eventos</span></Button>
   {historicoAberto&&<div className="space-y-3 border-t p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <p className="text-xs text-muted-foreground">{logs.length} eventos vinculados ao lançamento.
      {q.data.historico.length>=500?" Exibindo apenas os últimos 500 eventos da emenda.":""}</p>
     <select className="h-9 rounded-md border bg-background px-3 text-xs" value={filtroHistorico}
      onChange={e=>setFiltroHistorico(e.target.value)} aria-label="Filtrar linha do tempo">
      <option value="todos">Todos os eventos</option><option value="documental">Documentais</option>
      <option value="financeiro">Financeiros</option>
     </select>
    </div>
    <ol className="max-h-[420px] space-y-0 overflow-y-auto border-l pl-4">
     {logsFiltrados.length?logsFiltrados.map(h=><li key={h.id} className="relative border-b py-3 text-xs last:border-0">
      <span className="absolute -left-[21px] top-4 h-2 w-2 rounded-full border border-primary bg-background"/>
      <p className="font-semibold">{labelsHistorico[h.tabela]??h.tabela}</p>
      <p className="mt-0.5 text-muted-foreground">{new Date(h.ocorrido_em).toLocaleString("pt-BR")}
       {" · "+h.acao}{h.usuario_id?" · usuário "+h.usuario_id.slice(0,8)+"…":""}</p>
     </li>):<li className="py-3 text-xs text-muted-foreground">Nenhum evento neste filtro.</li>}
    </ol>
   </div>}
  </section>
 </div>;
}
