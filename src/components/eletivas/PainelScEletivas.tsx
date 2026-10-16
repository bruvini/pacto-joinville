import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {resumoEncontro,reais,diferencaACobrarCentavos,
 valorConciliadoCentavos,type ItemEC,type CorrecaoEC} from "@/lib/eletivas/financeiro";
import {indicadoresInvestigacaoEC,precisaDecisaoEC} from "@/lib/eletivas/investigacao";
import {normaParaCompetencia} from "../../../supabase/functions/_shared/eletivas-normativas";
import {consolidadoDoManifestoEC} from "@/lib/eletivas/fase7Exportacao";
import "@/styles/eletivas-reference-painel.css";

type Linha=Tables<"eletivas_itens">;
type View="arquivos"|"fila"|"pagos"|"correcoes"|"fpo"|"faixas"|"comunicacoes";
const money=(n:number)=>reais(n);
const qtd=(itens:Linha[],categoria:string)=>{
 const relevantes=itens.filter(x=>x.categoria===categoria&&
  valorConciliadoCentavos(x as ItemEC)>0);
 if(!relevantes.length)return "0";
 let count=0;
 for(const i of relevantes){
  const d=i.detalhe&&typeof i.detalhe==="object"&&!Array.isArray(i.detalhe)?
   i.detalhe as Record<string,unknown>:{};
  const v=d.qt_procedimentos??d.qt_ses;
  if(v===null||v===undefined||!Number.isFinite(Number(v))||Number(v)<0)
   return "—";
  count+=Number(v);
 }
 return String(count);
};
type LinhaPainel={nome:string;valor:number|string;tipo?:"qt"|"sub"|"memo"|"tot"|"corr"|"tot3"|"tot2"};
export function linhasConsolidadoHtml2422(r:ReturnType<typeof resumoEncontro>,itens:Linha[]):LinhaPainel[]{
 const c=r.componentes;
 const fisMac=qtd(itens,"mac_compl"),fisMacMult=qtd(itens,"mac_mult");
 const fisTotal=fisMac==="—"||fisMacMult==="—"?"—":String(Number(fisMac)+Number(fisMacMult));
 const totalQtd=(cat:string)=>qtd(itens,cat);
 const ncf=itens.filter(i=>i.situacao==="nc"&&i.categoria.startsWith("faec_")&&i.categoria!=="faec_fxmac")
  .reduce((acc,i)=>acc+Math.max(0,Math.max(Math.round(i.valor_esperado*100),Math.round(i.valor_publicado*100))),0);
 const ncm=itens.filter(i=>i.situacao==="nc"&&i.categoria.startsWith("mac_"))
  .reduce((acc,i)=>acc+Math.max(0,Math.max(Math.round(i.valor_esperado*100),Math.round(i.valor_publicado*100))),0);
 return [
  {nome:"Físico MAC",valor:fisTotal,tipo:"qt"},
  {nome:"MAC Complemento",valor:c.mac_compl},
  {nome:"MAC Múltiplas e Sequenciais",valor:c.mac_mult},
  {nome:"MAC faixa FAEC",valor:c.mac_fxfaec},
  {nome:"MAC faixa Federal",valor:c.mac_fxfed},
  {nome:"MAC Produção (Financeiro MC)",valor:c.mac_prod},
  {nome:"Subtotal MAC",valor:r.mac,tipo:"sub"},
  {nome:"Físico FAEC",valor:totalQtd("faec_prod"),tipo:"qt"},
  {nome:"FAEC Produção",valor:c.faec_prod},
  {nome:"FAEC Complemento",valor:c.faec_compl},
  {nome:"FAEC Múltiplas e Sequenciais (Complemento)",valor:c.faec_mult},
  {nome:"FAEC faixa MAC — controle / não soma",valor:r.controleFaecFxMac,tipo:"memo"},
  {nome:"Subtotal FAEC",valor:r.faec,tipo:"sub"},
  {nome:"Físico SIA FAEC",valor:totalQtd("sia_faec"),tipo:"qt"},
  {nome:"SIA FAEC",valor:c.sia_faec},
  {nome:"Físico SIA MAC",valor:totalQtd("sia_mac"),tipo:"qt"},
  {nome:"SIA MAC",valor:c.sia_mac},
  {nome:"Subtotal SIA",valor:r.sia,tipo:"sub"},
  {nome:"Não contemplado MS FAEC",valor:ncf,tipo:"memo"},
  {nome:"Não contemplado MS MAC",valor:ncm,tipo:"memo"},
  {nome:"A receber EC — competência atual",valor:r.encontro,tipo:"tot"},
  {nome:"Correções recebidas — competências anteriores",valor:r.correcoes,tipo:"corr"},
  {nome:"Valor total do atesto",valor:r.total,tipo:"tot3"},
  {nome:"A receber via Ofício",valor:r.oficio,tipo:"tot2"}
 ];
}
/** Espelho de renderPainel() HTML 2.42.2; cálculo vem do motor existente e SQL. */
export function PainelScEletivas({id,itens,competencia,cnes,fontesSnapshot,onNavigate}:{
 id:string;itens:Linha[];competencia:string;cnes:string;fontesSnapshot:unknown;
 onNavigate:(v:View)=>void;
}){
 const [alertasAbertos,setAlertasAbertos]=useState(true);
 const correcao=useQuery({queryKey:["ec-correcoes",id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_correcoes")
   .select("*").eq("competencia_id",id).order("criado_em",{ascending:false});
  if(error)throw error;return data??[];
 }});
 const sql=useQuery({queryKey:["ec-financeiro-sql",id],queryFn:async()=>{
  const {data,error}=await supabase.rpc("ec_resumo_financeiro",{p_comp:id});
  if(error)throw error;return data&&typeof data==="object"&&!Array.isArray(data)?
   data as Record<string,unknown>:null;
 }});
 const fluxos=useQuery({queryKey:["ec-fpo-fluxos",id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_fpo_fluxos")
   .select("id,situacao").eq("competencia_id",id);
  if(error)throw error;return data??[];
 }});
 const correcoes=(correcao.data??[]) as CorrecaoEC[];
 const r=resumoEncontro(itens as ItemEC[],correcoes);
 const inv=indicadoresInvestigacaoEC(itens as ItemEC[],correcoes);
 const norma=normaParaCompetencia(competencia);
 const pend=itens.filter(i=>precisaDecisaoEC(i as ItemEC)||i.decisao==="analise");
 const nOk=itens.filter(i=>i.situacao==="ok").length;
 const diver=itens.filter(i=>(i.situacao==="div"||i.situacao==="nc")&&!i.procedimento?.startsWith("04150")).length;
 const deOficio=itens.filter(i=>i.decisao==="oficio"&&diferencaACobrarCentavos(i as ItemEC)>0);
 const faixa=itens.filter(i=>["faec_mult","mac_mult"].includes(i.categoria));
 const incompat=faixa.filter(i=>String((i.detalhe&&typeof i.detalhe==="object"&&!Array.isArray(i.detalhe)?
  (i.detalhe as Record<string,unknown>).classificacao_auditor:""))==="bad");
 const revisar=faixa.filter(i=>String((i.detalhe&&typeof i.detalhe==="object"&&!Array.isArray(i.detalhe)?
  (i.detalhe as Record<string,unknown>).classificacao_auditor:""))==="review");
 const ativas=(fluxos.data??[]).filter(f=>!["concluido","cancelado","encerrado"].includes(f.situacao));
 const painelLinhas=linhasConsolidadoHtml2422(r,itens);
 const consolidado=consolidadoDoManifestoEC(fontesSnapshot,cnes,competencia);
 const comprovado=!!consolidado&&consolidado.total!==null&&consolidado.publicacao!==null&&
  consolidado.ajustes!==null;
 const memoriaSql=sql.data?.total_com_correcoes;
 const sqlConfere=sql.isSuccess&&sql.data&&Number.isFinite(Number(memoriaSql))&&
  Math.round(Number(memoriaSql)*100)===r.total;
 const resultadoConfiavel=sql.isSuccess&&correcao.isSuccess&&sqlConfere;
 const actionCards=[
  {tipo:"reg",titulo:"Regularização FPO",q:ativas.length,
   detalhe:ativas.length+" fluxo(s) de regularização registrados",view:"fpo" as View},
  {tipo:"faixa",titulo:"Faixa / composição",q:incompat.length,
   detalhe:incompat.length+" incompatível(is)"+(revisar.length?" · "+revisar.length+" para revisar":""),view:"faixas" as View},
  {tipo:"corr",titulo:"Correções reconhecidas",q:correcoes.filter(c=>c.status==="aprovada").length,
   detalhe:correcoes.filter(c=>c.status==="aprovada").length?money(r.correcoes)+" compondo o atesto":"nenhuma nesta competência",
   view:"correcoes" as View},
  {tipo:"oficio",titulo:"Cobranças via ofício",q:deOficio.length,
   detalhe:deOficio.length?money(r.oficio)+" para encaminhamento":"nenhuma cobrança pronta",
   view:"comunicacoes" as View},
  {tipo:"fila",titulo:"Decisões pendentes",q:pend.length,
   detalhe:pend.length?"itens ainda sem destino na fila":"fila de auditoria zerada",view:"fila" as View}
 ];
 const alertas=[
  ...(!resultadoConfiavel?[{rotulo:"Conferência financeira incompleta",
   motivo:sql.isError||correcao.isError?"Erro ao consultar valores institucionais":
    sql.isLoading||correcao.isLoading?"Aguardando comparação React × PostgreSQL":
    "Há divergência entre o total do React e o banco",grupo:"Crítico",
   destino:"fila" as View}]:[]),
  ...pend.slice(0,6).map(i=>({rotulo:i.descricao||i.procedimento||"Pendência fiscal",
   motivo:i.justificativa||"Item sem decisão fiscal conclusiva",
   grupo:"Ação necessária",destino:"fila" as View}))
 ];
 const kpis=[
  {rotulo:"Valor considerado no atesto",valor:money(r.total),
   nota:"EC da competência + correções recebidas",classe:"k-verde"},
  {rotulo:"Não pago / divergente",valor:money(r.esperadoNaoPago),
   nota:diver+" itens a auditar",classe:"k-glosa"},
  {rotulo:"Pendentes de decisão",valor:String(pend.length),
   nota:"na fila de auditoria",classe:"k-pend"},
  {rotulo:"Conciliados",valor:String(nOk),
   nota:"de "+itens.length+" itens verificados",classe:""},
  {rotulo:"A receber via Ofício",valor:money(r.oficio),
   nota:"decididos p/ cobrança",classe:"k-info"}
 ];
 return <div className="ec-painel-ref" aria-label="Painel da conciliação — estrutura HTML v2.42.2">
  <div className="kpis" id="painelKpis">
   {kpis.map(k=><div key={k.rotulo} className={"kpi "+k.classe}>
    <div className="kl">{k.rotulo}</div>
    <div className="kv">{k.valor}</div>
    <div className="ks">{k.nota}</div>
   </div>)}
  </div>
  <div id="painelBody">
   <div className="norm-banner">
    <div><div className="nb-k">BASE NORMATIVA DA COMPETÊNCIA</div>
     <div className="nb-t">{norma?"Deliberação "+norma.rotulo:"Competência sem matriz normativa incorporada"}</div>
     <div className="nb-s">{norma?"Vigência "+norma.inicio+" a "+norma.fim+
      " · classificação pelos Anexos I (Federal) e II (Estadual). Procedimentos em ambos os anexos são classificados como Ambos.":
      "Não há atribuição automática de norma para esta competência."}</div>
    </div><span className="norm-pill">{norma?"✓ selecionada por competência":"revisão manual necessária"}</span>
   </div>
   <section className="ops-strip">
    <div className="ops-strip-head"><div><h3>Pendências que exigem ação</h3>
     <p>Resumo operacional vivo — clique em qualquer cartão para abrir os itens correspondentes.</p></div></div>
    <div className="ops-grid">
     {actionCards.map(k=><button key={k.tipo} type="button"
      className={"ops-card "+k.tipo+(k.q===0?" zero":"")}
      onClick={()=>onNavigate(k.view)}>
      <div className="oc-k">{k.titulo}</div><div className="oc-v">{k.q}</div>
      <div className="oc-s">{k.detalhe}</div>
     </button>)}
    </div>
   </section>
   <section className={"alert-center"+(alertasAbertos?"":" collapsed")} id="panelAlertCenter">
    <div className="alert-center-head">
     <div className="alert-center-head-main">
      <button type="button" className="alert-center-toggle" aria-expanded={alertasAbertos}
       onClick={()=>setAlertasAbertos(x=>!x)}>
       <span className="chev">⌄</span>{alertasAbertos?"recolher":"expandir"}</button>
      <div className="alert-center-copy"><h4>Centro de Alertas da Auditoria</h4>
       <p>Cada alerta explica o problema, a fonte, o impacto e a providência.
        Os alertas são recalculados conforme você resolve o fluxo.</p></div>
     </div>
     <div className="alert-center-tools"><div className="alert-sev-chips">
      <span className="alert-sev-chip critical">Crítico · {alertas.filter(a=>a.grupo==="Crítico").length}</span>
      <span className="alert-sev-chip action">Ação necessária · {alertas.filter(a=>a.grupo==="Ação necessária").length}</span>
      <span className="alert-sev-chip attention">Atenção · {revisar.length}</span>
      <span className="alert-sev-chip info">Informativo · {comprovado?0:1}</span>
     </div></div>
    </div>
    {alertasAbertos&&<div className="alert-center-body">
     {faixa.length>0&&<div className="alert-faixa-inline">
      <div className="alert-faixa-inline-head">
       <div><h5>Faixa / composição · auditor integrado</h5>
        <p>{faixa.length} registro(s) de múltiplas/sequenciais. A memória individual está no Auditor.</p></div>
       <button type="button" className="alert-faixa-open" onClick={()=>onNavigate("faixas")}>
        abrir auditor completo →</button>
      </div>
      <div className="alert-faixa-inline-grid">
       <div className="alert-faixa-stat ok"><span>Compatíveis</span><b>{faixa.length-incompat.length-revisar.length}</b></div>
       <div className="alert-faixa-stat review"><span>Revisar</span><b>{revisar.length}</b></div>
       <div className="alert-faixa-stat bad"><span>Incompatíveis</span><b>{incompat.length}</b></div>
       <div className="alert-faixa-stat fpo"><span>Dependência FPO</span><b>{faixa.filter(i=>i.detalhe&&typeof i.detalhe==="object"&&!Array.isArray(i.detalhe)&&
        (i.detalhe as Record<string,unknown>).classificacao_auditor==="fpo").length}</b></div>
      </div></div>}
     {alertas.length?<div className="alert-list">
      {alertas.map((a,index)=><button className="alert-row" key={index}
       type="button" onClick={()=>onNavigate(a.destino)}>
       <span className={"alert-badge "+(a.grupo==="Crítico"?"critical":"action")}>{a.grupo}</span>
       <span><b className="ar-title">{a.rotulo}</b><span className="ar-why">{a.motivo}</span></span>
       <span className="ar-go">›</span>
      </button>)}
      {pend.length>6&&<p className="alert-more">Mais {pend.length-6} pendência(s) na fila de auditoria.</p>}
     </div>:<div className="alert-empty"><b>Sem alertas ativos.</b>
      <p>Nenhuma pendência identificada nesta competência.</p></div>}
    </div>}
   </section>
   {!comprovado?<div className="checkmate-missing">
    <div><b>Checkmate final ainda não disponível.</b><br/>
     {consolidado?.observacao??"Importe o Consolidado geral SES/SC em Fontes da competência → Fontes de apoio. Esta conferência externa não altera o cálculo do atesto."}
    </div><button type="button" className="fx-btn" onClick={()=>onNavigate("arquivos")}>
     importar consolidado →</button>
   </div>:<section className={"checkmate"+(
    Math.round(Number(consolidado.total)*100)===r.total?" ok":" bad")}>
    <div className="checkmate-head"><div>
     <div className="checkmate-k">CONFERÊNCIA EXTERNA · CONSOLIDADO GERAL SES/SC</div>
     <div className="checkmate-title">Checkmate final do valor do hospital</div>
     <div className="checkmate-sub">{consolidado.arquivo} · {competencia} · CNES {cnes}</div></div>
     <span className="checkmate-badge">{Math.round(Number(consolidado.total)*100)===r.total?"✓ FECHOU":"⚠ REVISAR"}</span>
    </div>
    <div className="checkmate-grid">
     {["Conferência","Auditoria","Consolidado SES","Diferença","Resultado"].map((a,i)=>
      <div key={a} className={"checkmate-cell h"+(i>0?" num":"")}>{a}</div>)}
     {([
      ["EC da competência",r.encontro,Number(consolidado.publicacao)],
      ["Ajustes/correções representados",r.correcoes,Number(consolidado.ajustes)],
      ["Total final do estabelecimento",r.total,Number(consolidado.total)]
     ] as [string,number,number][]).flatMap(([titulo,a,b])=>{
      const ok=a===Math.round(b*100);
      return [
       <div className="checkmate-cell" key={titulo+"l"}><b>{titulo}</b></div>,
       <div className="checkmate-cell num" key={titulo+"a"}>{money(a)}</div>,
       <div className="checkmate-cell num" key={titulo+"b"}>{money(Math.round(b*100))}</div>,
       <div className="checkmate-cell num" key={titulo+"d"}>{money(a-Math.round(b*100))}</div>,
       <div className={"checkmate-cell status "+(ok?"ok":"bad")} key={titulo+"s"}>{ok?"confere":"diverge"}</div>,
      ];
     })}
    </div>
    <div className="checkmate-adjust"><h5>O que o consolidado acrescentou ao EC-base</h5>
     <p>Valor e rubrica são memória da SES. A identificação documental permanece em Correções recebidas;
      o sistema não atribui AIHs ou competências de origem não comprovadas.</p>
    </div>
   </section>}
   <h3 className="sec">Consolidado da competência
    <span className="n">— valores que compõem o EC; linhas de controle são exibidas sem nova soma</span>
   </h3>
   <div className="ledger panel-consolidated">
    <table className="led"><tbody>
     {painelLinhas.map((l,i)=><tr key={i} className={l.tipo??""}>
      <td className="txt">{l.nome}
       {l.tipo==="memo"&&<span className="dim"> (memo — não soma)</span>}</td>
      <td className="num">{l.tipo==="qt"?l.valor:money(Number(l.valor))}</td>
     </tr>)}
    </tbody></table>
   </div>
   {r.pendencias.length?<div className="pendwarn">
    <span>⚠ <b>{r.pendencias.length} item(ns) aguardando decisão</b> na fila de auditoria.
     O consolidado e o atesto só ficam definitivos depois de zerar a fila.</span>
    <button type="button" className="btn btn-sm btn-ink" onClick={()=>onNavigate("fila")}>abrir fila →</button>
   </div>:<div className="pendwarn clear">
    ✔ Fila de decisão zerada — a conferência documental e fiscal ainda é obrigatória.</div>}
   <p className={"ec-panel-database "+(resultadoConfiavel?"ok":"warn")} role="status">
    {resultadoConfiavel?"Memória React × PostgreSQL coincide em centavos. A validação fiscal permanece obrigatória.":
     "A comparação com a memória do PostgreSQL ainda não está confirmada. Não homologue o atesto."}
   </p>
  </div>
 </div>;
}
