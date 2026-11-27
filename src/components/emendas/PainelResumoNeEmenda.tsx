import {useQuery} from "@tanstack/react-query";
import {AlertTriangle,FileText,Landmark} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {brl} from "@/lib/format";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {competenciaISO} from "@/lib/emendas/gerencial";
type Ne=Tables<"emenda_f_ne_painel">;
type Resumo=Tables<"emendas_resumo">;
type Solicitacao=Tables<"emenda_solicitacoes">;
type Comp=Tables<"emenda_f_competencias_painel">;
const b=(v:number|null|undefined)=>v===null||v===undefined?"—":brl(Number(v));
export function PainelResumoNeEmenda({
 lancamentoId,ne,solicitacao,resumo,competencias,periodicidade
}:{
 lancamentoId:string;ne?:Ne;solicitacao?:Solicitacao;resumo?:Resumo|null;
 competencias:Comp[];periodicidade:string;
}){
 const valores=useQuery({
  queryKey:["emendas","resumo-gerencial-ne",lancamentoId],
  queryFn:async()=>{
   const r=await supabase.from("emenda_pagamento_subempenhos_painel")
    .select("subempenho_id,valor_programado,valor_pago_liquido")
    .eq("lancamento_id",lancamentoId).limit(1001);
   if(r.error)throw r.error;
   if((r.data?.length??0)>1000)
    throw new Error("Mais de 1.000 subempenhos na NE. É necessária apuração paginada.");
   return {
    programado:(r.data??[]).reduce((total,p)=>total+Math.round(Number(p.valor_programado??0)*100),0)/100
   };
  }
 });
 const cards=[
  {rotulo:"Autorizado vigente",valor:resumo?.valor_autorizado_vigente,
   detalhe:"Limite da emenda · cadastro vigente"},
  {rotulo:"Reservado",valor:resumo?.valor_reservado,
   detalhe:"Solicitações de NE · emenda"},
  {rotulo:"Empenhado",valor:ne?.valor_ne_emitida,
   detalhe:"Nota de Empenho atual · valor emitido"},
  {rotulo:"Subempenhado",valor:ne?.subempenhos_confirmados_valor,
   detalhe:"Avisos de subempenho confirmados · esta NE"},
  {rotulo:"Programado",valor:valores.data?.programado,
   detalhe:"Última programação por parcela · esta NE"},
  {rotulo:"Pago líquido",valor:ne?Number(ne.liberacoes_legadas??0)>0?
   ne.pago_legado:ne.pago_liquido_novo:null,
   detalhe:"Comprovantes efetivos, líquidos de ajustes · esta NE"},
 ];
 return <section id="visao-geral-ne" className="scroll-mt-24 space-y-4 rounded-lg border bg-card p-4"
  aria-label="Visão gerencial da Nota de Empenho">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="space-y-1">
    <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
     <Landmark className="h-5 w-5"/>
     {solicitacao?.numero_ne?"NE "+solicitacao.numero_ne+
      (solicitacao.exercicio_ne?"/"+solicitacao.exercicio_ne:""):"NE em preparação"}
    </h2>
    <p className="text-xs text-muted-foreground">
     {periodicidade} · {competencias.length} competência(s) ·
     {ne?.modelo_financeiro==="modelo_legado"?"execução legada":
      ne?.modelo_financeiro==="novo_subempenho"?"execução por subempenhos":
      "sem movimentação financeira identificada"}
    </p>
    {solicitacao?.numero_sei_ne&&solicitacao.link_sei_ne&&
     <a href={solicitacao.link_sei_ne} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary underline">
      <FileText className="h-3.5 w-3.5"/>Nota de Empenho no SEI · {solicitacao.numero_sei_ne}
     </a>}
   </div>
   <Badge variant={ne?.conciliada?"default":"outline"}>
    {ne?.conciliada?"Conciliada e encerrada":
     ne?.pronta_conciliar?"Pronta para conciliar":
     solicitacao?.numero_ne?"NE em execução":"Aguardando NE"}
   </Badge>
  </div>
  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
   {cards.map(c=><div key={c.rotulo} className="rounded-md border bg-muted/10 p-3">
    <p className="text-[11px] font-medium text-muted-foreground">{c.rotulo}</p>
    <p className="mt-1 text-base font-semibold tabular-nums">{b(c.valor)}</p>
    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{c.detalhe}</p>
   </div>)}
  </div>
  {valores.error&&<p className="text-xs text-destructive" role="alert">
   Programação indisponível: {valores.error.message}. Não foi assumido valor zero.
  </p>}
  {ne&&<div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3 text-xs">
   <span>NE líquida: <strong>{b(ne.ne_liquida)}</strong></span>
   <span>Compromissos ainda não pagos: <strong>{b(ne.saldo_de_pagamentos_pendentes)}</strong></span>
   <span>Saldo livre para anulação: <strong>{b(ne.saldo_disponivel_anular)}</strong></span>
  </div>}
  {ne&&Number(ne.saldo_a_anular_fechamento??0)>Number(ne.saldo_disponivel_anular??0)&&
   <p className="flex gap-2 rounded border border-amber-400/40 p-3 text-xs text-amber-900">
    <AlertTriangle className="h-4 w-4 shrink-0"/>
    A distribuição não comprometida precisa ser revista antes da anulação residual.
   </p>}
  <nav aria-label="Navegação pelo lançamento" className="flex flex-wrap gap-2 border-t pt-3">
   {[
    ["#formalizacao-ne","Formalização da NE"],
    ["#competencias-subempenhos","Subempenhos e pagamentos"],
    ["#fechamento-ne","Anulação e conciliação"]
   ].map(([href,rotulo])=><Button key={href} size="sm" variant="outline" asChild>
    <a href={href}>{rotulo}</a>
   </Button>)}
  </nav>
  <div className="flex flex-wrap gap-2">
   {competencias.map(c=><a key={c.competencia_id} href={"#competencia-"+c.competencia_id}
    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-muted">
    <span className="font-semibold">{competenciaISO(c.competencia)}</span>
    <span className="text-muted-foreground">
     {c.situacao_competencia==="sem_execucao"?"Sem execução":
      c.situacao_competencia==="executada_novo"?"Conciliada":
      c.situacao_competencia==="executada_legado"?"Executada (legado)":
      c.situacao_competencia==="inconsistente"?"Inconsistente":"Pendente"}
    </span>
   </a>)}
  </div>
  <p className="text-[11px] text-muted-foreground">
   Indicadores não são aditivos entre si. Autorização e reserva se referem à emenda;
   empenho, subempenho, programação e pagamento se referem à NE selecionada.
   O PACTO registra evidências de execução, não realiza transferências bancárias.
  </p>
 </section>;
}
