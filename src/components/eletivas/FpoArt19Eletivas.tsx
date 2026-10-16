import {useMemo,useState} from "react";
import {Link} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {ProgramacaoFpoEletivas} from "./ProgramacaoFpoEletivas";
import {memoriaFpoOficialEC,formatoFpoBRL} from "@/lib/eletivas/memoriaFpoHtml";
import {normaNotaFpo,normaParaCompetencia} from
 "../../../supabase/functions/_shared/eletivas-normativas";
import "@/styles/eletivas-reference-fpo.css";

type Item=Tables<"eletivas_itens">;
type Comp=Tables<"eletivas_competencias">;
type Fluxo=Tables<"eletivas_fpo_fluxos">;
const isClosed=(f:Fluxo)=>f.etapa>=8||["concluido","encerrado","correcao_recebida"].includes(f.situacao);
const isCancelled=(f:Fluxo)=>["cancelado","cancelada"].includes(f.situacao);
const key=(s:string)=>{const [m,y]=s.split("/");return Number(y)*100+Number(m);};
const valor=(n:number)=>formatoFpoBRL(n);
const num=(n:number|null)=>n===null?"—":n.toLocaleString("pt-BR");

export function FpoArt19Eletivas({comp,itens,podeEditar,onNavigate}:{
 comp:Comp;itens:Item[];podeEditar:boolean;
 onNavigate:(v:"arquivos"|"comunicacoes")=>void;
}){
 const [grupo,setGrupo]=useState<string|null>(null);
 const [mostrarDocumentos,setMostrarDocumentos]=useState(false);
 const memoria=useMemo(()=>memoriaFpoOficialEC(itens,comp.competencia),
  [itens,comp.competencia]);
 const nota=normaNotaFpo(comp.competencia);
 const norma=normaParaCompetencia(comp.competencia);
 const arquivosQ=useQuery({queryKey:["ec-fpo-fontes",comp.id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_arquivos")
   .select("categoria,nome_original,sha256")
   .eq("competencia_id",comp.id).eq("categoria","fpo_official");
  if(error)throw error;return data??[];
 }});
 const fonte=arquivosQ.data?.[0]??null;
 const origensQ=useQuery({queryKey:["ec-fpo-origens-prestador",comp.prestador_id],
  queryFn:async()=>{
   const {data,error}=await supabase.from("eletivas_competencias")
    .select("id,competencia").eq("prestador_id",comp.prestador_id);
   if(error)throw error;return data??[];
  }});
 const ids=origensQ.data?.map(c=>c.id)??[];
 const fluxosQ=useQuery({queryKey:["ec-fpo-fluxos-prestador",comp.prestador_id,ids.join(",")],
  enabled:ids.length>0,queryFn:async()=>{
   const {data,error}=await supabase.from("eletivas_fpo_fluxos")
    .select("*").in("competencia_id",ids).order("atualizado_em",{ascending:false}).limit(1000);
   if(error)throw error;return data??[];
  }});
 const grupos=useMemo(()=>{
  const dict=new Map<string,{id:string;competencia:string;fluxos:Fluxo[]}>();
  const byId=new Map((origensQ.data??[]).map(c=>[c.id,c.competencia]));
  for(const flow of fluxosQ.data??[]){
   if(isCancelled(flow))continue;
   const compOrig=byId.get(flow.competencia_id);
   if(!compOrig)continue;
   let entry=dict.get(flow.competencia_id);
   if(!entry){entry={id:flow.competencia_id,competencia:compOrig,fluxos:[]};
    dict.set(flow.competencia_id,entry);}
   entry.fluxos.push(flow);
  }
  return [...dict.values()].sort((a,b)=>key(b.competencia)-key(a.competencia));
 },[origensQ.data,fluxosQ.data]);
 const active=grupos.flatMap(g=>g.fluxos).filter(f=>!isClosed(f)).length;
 const closed=grupos.flatMap(g=>g.fluxos).filter(isClosed).length;
 const sourceKnown=!!fonte;
 // A existência de XLSX/ODS no Storage não certifica cruzamento com produção.
 const referenciaDisponivel=sourceKnown&&memoria.available;
 const missingQuantity=memoria.rows.some(r=>r.qtd===null);
 const fpoProgQ=useQuery({queryKey:["eletivas-fpo-programacoes",comp.id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_fpo_programacoes")
   .select("id,procedimento,competencia_programacao,valor_federal_unitario,documento_sei,vigencia_inicio,vigencia_fim")
   .eq("competencia_id",comp.id).limit(1000);
  if(error)throw error;return data??[];
 }});
 const normStatus=norma?"Matriz "+norma.rotulo:"Matriz normativa não identificada";
 const programacoes=fpoProgQ.data??[];
 const localSignals=itens.filter(i=>{
  const d=i.detalhe;
  if(!d||typeof d!=="object"||Array.isArray(d))return false;
  const obj=d as Record<string,unknown>;
  return obj.fpo_local!==undefined||obj.fpo_legado!==undefined;
 });
 return <div className="ec-fpo-ref" aria-label="FPO — programação · Art. 19">
  <div className="fpo-hero">
   <div className="fpo-eyebrow">PROGRAMAÇÃO ORÇAMENTÁRIA · ART. 19</div>
   <h3>FPO é controle de programação — não é uma linha do atesto.</h3>
   <p>Esta página separa a parcela federal que deve estar programada na FPO
    do prestador da parcela residual eventualmente paga pela SES no Encontro de Contas.
    Os valores aqui são <b>controle operacional</b> e não alteram automaticamente o
    “A receber EC”.</p>
  </div>

  <div className="fx-contact-grid">
   <div className="fx-contact">
    <div><div className="fc-k">DISTRIBUIÇÃO DE FAIXAS</div>
     <div className="fc-t">Central de Regulação · Cirurgias Eletivas</div>
     <div className="fc-s">Dúvidas sobre distribuição e adequação das faixas</div></div>
    <div className="fc-links">
     <a href="tel:36647231">☎ 3664-7231</a>
     <a href="mailto:sur.coorsceletivas@saude.sc.gov.br">✉ sur.coorsceletivas@saude.sc.gov.br</a>
    </div>
   </div>
   <div className="fx-contact">
    <div><div className="fc-k">REVISÃO / OFÍCIO</div>
     <div className="fc-t">GEMAS · Gerência de Monitoramento e Avaliação em Saúde</div>
     <div className="fc-s">Ofícios, revisão e regularização do Encontro de Contas</div></div>
    <div className="fc-links"><a href="mailto:gemas@saude.sc.gov.br">✉ gemas@saude.sc.gov.br</a></div>
   </div>
  </div>

  <div className="reg-group-panel">
   <div className="reg-group-head">
    <div><h4>Regularizações FPO / reprocessamento</h4>
     <p>Fluxos recuperáveis que ainda não constituem, por si só, cobrança líquida à GEMAS.</p>
    </div>
    <span className="reg-status-pill">{active} em acompanhamento
     {closed>0?" · "+closed+" encerrado(s)":""}</span>
   </div>
   {(origensQ.isLoading||fluxosQ.isLoading)&&
    <p className="fpo-loading">Consultando os fluxos do prestador…</p>}
   {(origensQ.isError||fluxosQ.isError)&&<p className="fpo-alert" role="alert">
    Não foi possível consultar todos os fluxos institucionais da FPO.</p>}
   <div className="reg-group-list">
    {grupos.map(g=>{
     const done=g.fluxos.every(isClosed);
     const aihs=new Set(g.fluxos.map(f=>f.aih).filter(Boolean));
     const estimado=g.fluxos.reduce((n,f)=>n+Math.round(Number(f.valor_estimado||0)*100),0);
     return <div key={g.id} className="fpo-reg-wrapper">
      <button type="button" className="reg-group-card"
       aria-expanded={grupo===g.id} onClick={()=>setGrupo(x=>x===g.id?null:g.id)}>
       <span className="rg-comp">{g.competencia}</span>
       <span className="rg-main">
        <b>{aihs.size} AIH{aihs.size===1?"":"s"} · {valor(estimado/100)} estimados</b>
        <br/>{g.fluxos.length} fluxo{g.fluxos.length===1?"":"s"} registrado{g.fluxos.length===1?"":"s"} nesta competência.
       </span>
       <span className={"reg-status-pill"+(done?" done":"")}>
        {done?"Concluído":g.fluxos.length===1?"Etapa "+g.fluxos[0].etapa:g.fluxos.length+" fluxos"}
       </span>
      </button>
      {grupo===g.id&&<div className="fpo-reg-detail">
       {g.fluxos.map(flow=><div key={flow.id} className="fpo-reg-line">
        <span>AIH <b>{flow.aih}</b> · Etapa {flow.etapa} · {flow.situacao}</span>
        <span>{valor(Number(flow.valor_estimado)||0)} estimados
         {flow.documento_sei?" · SEI "+flow.documento_sei:""}</span>
       </div>)}
       {g.id===comp.id?<button className="fpo-inline-link" type="button"
         onClick={()=>onNavigate("comunicacoes")}>Acompanhar comunicações desta competência →</button>:
        <Link to="/eletivas/$id" params={{id:g.id}} className="fpo-inline-link">
         Abrir competência {g.competencia} →</Link>}
      </div>}
     </div>;
    })}
    {!grupos.length&&!origensQ.isLoading&&!fluxosQ.isLoading&&
     <div className="fx-empty">Nenhuma regularização FPO/reprocessamento foi iniciada para este prestador.</div>}
   </div>
  </div>
  <div className="playbook">
   <b>Quando houver correção/reprocessamento:</b> a orientação recebida da GEMAS
   foi corrigir a programação, reprocessar, aguardar a aprovação e, na sequência,
   formalizar eventual pedido de revisão por <b>Ofício destinado à GEMAS</b>.
   O acompanhamento por etapas será tratado no fluxo próprio de regularização;
   esta página mantém a evidência normativa e a conferência da FPO.
  </div>
  <div className="fpo-rule">
   <div className="fpo-rule-card"><div className="n">1</div>
    <b>Tabela Catarinense</b>
    <span>Define o complemento total do procedimento no Anexo I da Deliberação vigente.</span>
   </div>
   <div className="fpo-rule-card"><div className="n">2</div>
    <b>FPO federal</b>
    <span>É a parcela de incremento que deve ser programada para o Ministério da Saúde ressarcir.</span>
   </div>
   <div className="fpo-rule-card"><div className="n">3</div>
    <b>Residual SES</b>
    <span>A SES paga somente a diferença quando o complemento catarinense for
     superior ao valor federal programado.</span>
   </div>
  </div>
  <div className="fpo-formula">
   <strong>Complemento Tabela Catarinense</strong><span className="op">=</span>
   <strong>parcela federal programada na FPO</strong><span className="op">+</span>
   <strong>residual SES</strong>
  </div>

  {memoria.postNota&&!arquivosQ.isLoading&&!sourceKnown&&<div className="pendwarn">
   ⚠ <div><b>Competência {comp.competencia}: falta a FPO oficial.</b>
    <p>A Nota Informativa nº 05/2026 orienta a utilização da FPO atualizada já no
     processamento de agosto/2026. Importe o arquivo ODS/XLSX em Fontes da competência
     → Fontes de apoio para completar este controle.</p>
   </div>
   <button className="btn btn-sm btn-ink" type="button"
    onClick={()=>onNavigate("arquivos")}>importar →</button>
  </div>}
  {memoria.postNota&&sourceKnown&&!memoria.available&&<div className="pendwarn">
   ⚠ <div><b>FPO oficial registrada, porém sem cruzamento recuperável na memória.</b>
    <p>O arquivo {fonte?.nome_original} está no inventário institucional.
     Confira o conteúdo, a competência e o processamento antes de considerar os parâmetros válidos.</p>
   </div><button className="btn btn-sm btn-ink" type="button"
    onClick={()=>onNavigate("arquivos")}>conferir fonte →</button>
  </div>}
  {!memoria.postNota&&<div className="playbook">
   <b>Competência anterior à mudança de 08/2026.</b> A FPO distribuída pela
   Nota Informativa nº 05/2026 é referência a partir do processamento de agosto/2026
   e não recalcula retroativamente {comp.competencia}. O quadro local do workbook,
   quando disponível, permanece abaixo apenas como memória de apoio.
  </div>}

  {arquivosQ.isLoading&&<p className="fpo-loading">Verificando a fonte FPO oficial da competência…</p>}
  {sourceKnown&&<div className="fpo-note5">
   <b>Fonte oficial carregada: {fonte?.nome_original}</b>
   <p>{memoria.totalOficialConhecidos} procedimentos com referência persistida
    nos itens · {memoria.rows.length} procedimento(s) locais com referência cruzada
    · vigência operacional considerada: a partir de 08/2026.
    {referenciaDisponivel&&memoria.postNota?
     " Os valores a seguir são parâmetros de programação, não comprovação do cadastro FPO.":
     " Dados exibidos apenas como referência ou pendentes de conferência."}</p>
   <p>{normStatus}. Hash da fonte: {fonte?.sha256.slice(0,12)}…</p>
  </div>}

  {referenciaDisponivel&&memoria.postNota&&<>
   <div className="kpis">
    <div className="kpi k-info"><div className="kl">Procedimentos locais com FPO federal</div>
     <div className="kv">{memoria.rows.length}</div>
     <div className="ks">produzidos e encontrados no arquivo oficial</div></div>
    <div className="kpi"><div className="kl">Parcela federal estimada</div>
     <div className="kv">{formatoFpoBRL(memoria.totalFederal)}</div>
     <div className="ks">{missingQuantity?"quantidade local incompleta — sem total estimado":
      "quantidade produzida × FPO federal unitária"}</div></div>
    <div className="kpi k-verde"><div className="kl">Residual SES estimado</div>
     <div className="kv">{formatoFpoBRL(memoria.totalResidual)}</div>
     <div className="ks">quando há complemento CIB disponível</div></div>
    <div className={"kpi "+(memoria.reviews?"k-pend":"k-verde")}>
     <div className="kl">Cruzamentos com EC</div>
     <div className="kv">{memoria.reviews}</div>
     <div className="ks">{memoria.reviews?
      "diferença(s) para revisar":"sem incompatibilidade unitária detectada nos dados disponíveis"}</div>
    </div>
   </div>
   {memoria.rows.length>0&&<>
    <h3 className="sec">Produção da competência × FPO oficial
     <span className="n"> — memória de programação</span></h3>
    <p className="lead">A quantidade vem das tabulações locais. “FPO federal”
     é o parâmetro do arquivo oficial; “Complemento CIB” vem do workbook de AIH
     quando disponível. O residual é apenas a diferença matemática entre essas
     duas parcelas e serve para conferir a lógica do Encontro de Contas.</p>
    <div className="ledger"><div className="scrollwrap"><table className="led">
     <thead><tr><th>Procedimento</th><th className="num">Qtd</th>
      <th className="num">SIGTAP</th><th className="num">FPO federal / un.</th>
      <th className="num">Federal estimado</th><th className="num">Compl. CIB / un.</th>
      <th className="num">Residual SES / un.</th><th className="num">Un. usada no EC</th>
      <th>Conferência</th></tr></thead>
     <tbody>{memoria.rows.map(r=><tr key={r.procedimento}>
      <td>{r.procedimento}<span className="procname">{r.nome}</span></td>
      <td className="num">{num(r.qtd)}</td>
      <td className="num">{formatoFpoBRL(r.sigtap)}</td>
      <td className="num">{valor(r.federal)}</td>
      <td className="num">{formatoFpoBRL(r.federalTotal)}</td>
      <td className="num">{formatoFpoBRL(r.cib)}</td>
      <td className="num">{formatoFpoBRL(r.residual)}</td>
      <td className="num">{formatoFpoBRL(r.ec)}</td>
      <td><span className={"fpo-status "+(r.estado==="coerente"?"ok":
       r.estado==="revisar"?"warn":"info")}>{r.estado}</span></td>
     </tr>)}</tbody>
    </table></div></div>
   </>}
  </>}

  {sourceKnown&&<section className="fpo-note-section">
   <h3 className="sec">Nota Informativa nº 05/2026
    <span className="n"> — parâmetros alterados para agosto/2026</span></h3>
   <p className="lead">O sistema destaca os três códigos expressamente alterados
    na nota para facilitar a conferência da programação.
    A ausência de valores significa que o parâmetro não está recuperável na
    memória desta competência, não que o procedimento inexista no arquivo oficial.</p>
   <div className="ledger"><div className="scrollwrap"><table className="led">
    <thead><tr><th>Procedimento</th><th className="num">SIGTAP</th>
     <th className="num">Novo FPO federal</th><th className="num">% Máximo</th>
     <th>Produção local</th></tr></thead>
    <tbody>{memoria.changed.map(({procedimento,referencia,linha})=><tr key={procedimento}>
     <td>{procedimento}<span className="procname">{referencia?.nome??"parâmetro não recuperado"}</span></td>
     <td className="num">{formatoFpoBRL(referencia?.sigtap??null)}</td>
     <td className="num">{formatoFpoBRL(referencia?.federal??null)}</td>
     <td className="num">{referencia?.pct?referencia.pct+"%":"—"}</td>
     <td>{linha&&linha.qtd!==null?
      <span className="fpo-status ok">{linha.qtd} procedimento(s)</span>:
      <span className="fpo-status info">não identificado na produção</span>}</td>
    </tr>)}</tbody>
   </table></div></div>
  </section>}

  <h3 className="sec">Situação da programação local
   <span className="n"> — evidência separada da tabela oficial</span></h3>
  {localSignals.length>0?<div className="playbook">
   <b>Importante:</b> há {localSignals.length} item(ns) com sinal local de FPO.
   O campo no workbook continua sendo tratado como <b>sinal local/legado</b>;
   ele não substitui a FPO oficial distribuída pela SES nem comprova sozinho
   o cadastro vigente no prestador.</div>:
   <div className="empty"><div className="big">ƒ</div>
    <div className="et">Nenhum alerta local de FPO disponível</div>
    <p>Isso pode significar que o workbook de AIH não foi importado ou que
     ele não trouxe diferenças no campo FPO. Para confirmar a programação
     efetiva do prestador, utilize a FPO vigente do hospital como fonte administrativa.</p>
   </div>}
  {programacoes.length>0&&<div className="fpo-comprovadas" aria-label="Evidências efetivas registradas">
   <b>{programacoes.length} comprovação(ões) documentais de programação efetiva</b>
   {programacoes.map(p=><div className="fpo-proof" key={p.id}>
    SIGTAP {p.procedimento} · {p.competencia_programacao} · {valor(Number(p.valor_federal_unitario))}
    /un. · vigência {p.vigencia_inicio} a {p.vigencia_fim} · SEI {p.documento_sei}
   </div>)}
  </div>}
  {fpoProgQ.isError&&<p role="alert" className="fpo-alert">
   Não foi possível consultar os documentos de programação efetiva.</p>}
  <details className="fpo-institutional"
   onToggle={e=>setMostrarDocumentos(e.currentTarget.open)}>
   <summary>Comprovação institucional da FPO · documentos e registros</summary>
   <div className="fpo-institutional-body">
    {mostrarDocumentos&&<ProgramacaoFpoEletivas id={comp.id} competencia={comp.competencia}
     podeEditar={podeEditar}/>}
   </div>
  </details>
  <div className="fpo-source"><b>Regra operacional:</b> a FPO oficial informa
   quanto deve ser programado; o cadastro efetivo do prestador é uma evidência
   distinta. Esta página não soma valores ao atesto nem cria cobrança automática
   contra a SES. {nota?" Nota Informativa 05/2026 aplicável.":""}</div>
 </div>;
}
