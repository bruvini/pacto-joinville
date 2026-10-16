import {useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {Dialog,DialogContent,DialogTitle} from "@/components/ui/dialog";
import {DossieFiscalEletivas} from "./DossieFiscalEletivas";
import {casosAuditorFaixa,resumoAuditorFaixa,LABELS_FAIXA,
 type EstadoFaixa,type CasoFaixa} from "@/lib/eletivas/auditorFaixaView";
import {normaParaCompetencia} from
 "../../../supabase/functions/_shared/eletivas-normativas";
import "@/styles/eletivas-reference-faixas.css";
type Linha=Tables<"eletivas_itens">;
type Filtro="all"|EstadoFaixa;
const lista:Filtro[]=["all","ok","review","bad","fpo"];
const titulo:Record<Filtro,string>={
 all:"AIHs auditadas",ok:"Compatíveis",review:"Revisar",
 bad:"Incompatíveis",fpo:"Dependência FPO"
};
const msg:Record<EstadoFaixa,string>={
 ok:"Confronto normativo compatível. Confirmar os documentos, sem dispensar a fiscalização.",
 review:"Composição incompleta, mista ou não confirmada. Rever a faixa e as fontes antes da decisão.",
 bad:"Faixa informada incompatível com os procedimentos-filhos segundo o motor de auditoria.",
 fpo:"Composição federal: verificar a programação FPO efetiva antes de atribuir cobrança à SES."
};
export function AuditorFaixaEletivas({
 itens,competencia,busca="",id,onAbrirFila,onAbrirComunicacoes,onAbrirFpo
}:{
 itens:Linha[];competencia:string;busca?:string;id:string;
 onAbrirFila:(itemId?:string)=>void;
 onAbrirComunicacoes:(aih:string,itemId:string)=>void;
 onAbrirFpo:(aih:string,itemId:string)=>void;
}){
 const [filtro,setFiltro]=useState<Filtro>("all");
 const [aberto,setAberto]=useState<{id:string;tipo:"diagnostico"|"memoria"}|null>(null);
 const norma=normaParaCompetencia(competencia);
 const casos=useMemo(()=>casosAuditorFaixa(itens,competencia),[itens,competencia]);
 const c=resumoAuditorFaixa(casos);
 const term=busca.toLocaleLowerCase("pt-BR").trim();
 const mostrados=casos.filter(a=>(filtro==="all"||a.estado===filtro)&&
  (!term||[a.aih,a.principal,a.item.descricao,a.faixa,a.natureza,
    a.origens.join(" ")].join(" ").toLocaleLowerCase("pt-BR").includes(term)));
 const escolhido=casos.find(x=>x.id===aberto?.id)??null;
 const comunicacoesQ=useQuery({
  queryKey:["ec-comunicacoes-faixa",id],
  queryFn:async()=>{
   const {data,error}=await supabase.from("eletivas_comunicacoes")
    .select("tipo,referencia,destino,situacao,protocolo,enviada_em")
    .eq("competencia_id",id);
   if(error)throw error;return data??[];
  }
 });
 const currentComm=(a:CasoFaixa)=>{
  const refs=new Set(a.itens.map(i=>i.id+"|"+a.aih));
  return (comunicacoesQ.data??[]).find(x=>x.tipo==="aih"&&refs.has(x.referencia));
 };
 const numero:Record<Filtro,number>={
  all:c.all,ok:c.ok,review:c.review,bad:c.bad,fpo:c.fpo
 };
 return <div className="ec-faixas-ref" id="v-faixas">
  <div className="fx-hero">
   <div className="fx-eyebrow">FASE 2 · AUDITORIA PREVENTIVA</div>
   <h3>Auditor de faixa e composição da AIH</h3>
   <p>Para cada AIH múltipla/sequencial relevante ao Encontro de Contas, o sistema abre
    a composição do workbook, identifica a faixa recebida e confronta os procedimentos
    com os Anexos I e II da <b>Deliberação vigente na competência</b>.
    A cor resume a providência — a memória completa continua disponível em
    “Como concluiu?”.</p>
  </div>
  {!casos.length?<><div className="fx-contact-grid">
   <div className="fx-contact"><div><div className="fc-k">DISTRIBUIÇÃO DE FAIXAS</div>
    <div className="fc-t">Central de Regulação · Cirurgias Eletivas</div>
    <div className="fc-s">Dúvidas sobre distribuição e adequação das faixas</div></div>
    <div className="fc-links"><a href="tel:36647231">☎ 3664-7231</a>
     <a href="mailto:sur.coorsceletivas@saude.sc.gov.br">✉ Central de Regulação</a></div>
   </div><div className="fx-contact"><div><div className="fc-k">REVISÃO / OFÍCIO</div>
    <div className="fc-t">GEMAS · Gerência de Monitoramento e Avaliação em Saúde</div>
    <div className="fc-s">Ofícios, revisão e regularização do Encontro de Contas</div></div>
    <div className="fc-links"><a href="mailto:gemas@saude.sc.gov.br">✉ GEMAS</a></div>
   </div>
  </div>
  <div className="fx-empty"><b>Workbook de AIH ou composição individual indisponível.</b>
   <p>Importe o workbook em Fontes da competência e analise novamente. Nenhuma
    classificação individual será presumida sem evidência recuperável.</p></div>
  </>:<>
   <div className="norm-banner">
    <div><div className="nb-k">BASE NORMATIVA DA COMPETÊNCIA</div>
     <div className="nb-t">{norma?norma.rotulo:"Norma não identificada"}</div>
     <div className="nb-s">{norma?
      "Classificação de filhos pelos Anexos I (Federal) e II (Estadual). "+
      "Os que aparecem em ambos permanecem como Ambos; não provam pagamento.":
      "Não há matriz congelada aplicável. Todas as AIHs exigem revisão."}</div></div>
    <span className="norm-pill">{norma?"✓ selecionada por competência":"revisão necessária"}</span>
   </div>
   <div className="fx-contact-grid">
    <div className="fx-contact">
     <div><div className="fc-k">DISTRIBUIÇÃO DE FAIXAS</div>
      <div className="fc-t">Central de Regulação · Cirurgias Eletivas</div>
      <div className="fc-s">Dúvidas sobre distribuição e adequação das faixas</div></div>
     <div className="fc-links"><a href="tel:36647231">☎ 3664-7231</a>
      <a href="mailto:sur.coorsceletivas@saude.sc.gov.br">✉ sur.coorsceletivas@saude.sc.gov.br</a></div>
    </div>
    <div className="fx-contact">
     <div><div className="fc-k">REVISÃO / OFÍCIO</div>
      <div className="fc-t">GEMAS · Gerência de Monitoramento e Avaliação em Saúde</div>
      <div className="fc-s">Ofícios, revisão e regularização do Encontro de Contas</div></div>
     <div className="fc-links"><a href="mailto:gemas@saude.sc.gov.br">
      ✉ gemas@saude.sc.gov.br</a></div>
    </div>
   </div>
   <div className="fx-kpis" role="group" aria-label="Filtrar situação das AIHs">
    {lista.map(x=><button type="button" key={x}
     className={"fx-kpi "+x+(filtro===x?" on":"")}
     aria-pressed={filtro===x} onClick={()=>setFiltro(x)}>
     <div className="fk">{titulo[x]}</div>
     <div className="fv">{numero[x]}</div>
    </button>)}
   </div>
   <div className="fx-filter-note">
    Exibindo {mostrados.length} de {c.all} AIHs múltiplas/sequenciais identificadas
    nas fontes desta competência.{term?" · Pesquisa contextual: "+busca:""}
   </div>
   <div className="fx-list">
    {mostrados.map(a=>{
     const contato=currentComm(a);
     return <article className="fx-card" key={a.id}>
      <div className="fx-card-head">
       <div className="fx-card-main">
        <div className="fx-aih">AIH {a.aih}</div>
        <div className="fx-proc">Procedimento envelope:
         <span className="mono"> {a.principal||"—"}</span>
         {" · "}{a.item.descricao||"procedimento múltiplo/sequencial"}
        </div>
       </div>
       <span className={"fx-status "+a.estado}>
        {a.estado==="ok"?"✓":a.estado==="bad"?"!":a.estado==="fpo"?"ƒ":"?"}
        {" "}{LABELS_FAIXA[a.estado]}
       </span>
      </div>
      <div className="fx-body">
       <div className="fx-facts">
        <div className="fx-fact"><div className="k">Faixa recebida</div>
         <div className="v">{a.natureza} {a.faixa?"· código "+a.faixa:""}</div></div>
        <div className="fx-fact"><div className="k">Norma aplicada</div>
         <div className="v">{a.norma}</div></div>
        <div className="fx-fact"><div className="k">Origem no EC</div>
         <div className="v">{a.origens.join(" · ")}</div></div>
       </div>
       <div className="fx-components">
        {a.filhos.length?a.filhos.map((f,i)=><span
         key={f.proc+"-"+i} className={"fx-comp "+(
          f.classificacao==="Federal"?"fed":f.classificacao==="Estadual"?"est":
          f.classificacao==="Ambos"?"both":"none")}>
         {f.proc||"—"} · {f.classificacao}
        </span>):
        <span className="fx-comp none">sem componentes classificados</span>}
       </div>
       <div className={"fx-action-mini "+a.estado}>
        <b>{LABELS_FAIXA[a.estado]}.</b> {a.motivo}
        {a.alertaDeMemoria&&<p className="fx-integridade">
         Memória normativa incompleta ou divergente — reavaliar antes de reconhecer valores.
        </p>}
       </div>
       <div className={"now-box "+a.estado}>
        <div className="now-title">O que fazer agora</div>
        <p>{msg[a.estado]}</p>
        <p>Para decisões financeiras, confirme a publicação estadual independente,
         a composição da AIH e a competência aplicável. A classificação isolada não gera crédito.</p>
        {a.estado==="fpo"&&<div className="now-contacts">
         <a href="mailto:gemas@saude.sc.gov.br">GEMAS · referência</a>
        </div>}
       </div>
       <div className="fx-comunicacao">
        <b>Comunicação:</b> {contato?
         <span>{contato.destino} · {contato.situacao}
          {contato.protocolo?" · protocolo "+contato.protocolo:""}</span>:
         <span>sem encaminhamento registrado para esta AIH</span>}
        <button type="button" className="fx-comm-link"
         onClick={()=>onAbrirComunicacoes(a.aih,a.item.id)}>
         {contato?"abrir comunicação":"definir destino"} →</button>
       </div>
       <div className="fx-actions">
        <button type="button" className="fx-btn primary"
         onClick={()=>setAberto({id:a.id,tipo:"diagnostico"})}>
         Ver diagnóstico e ação</button>
        <button type="button" className="fx-btn"
         onClick={()=>setAberto({id:a.id,tipo:"memoria"})}>
         ⌕ Como concluiu?</button>
        {a.estado==="fpo"&&<button type="button" className="fx-btn"
         onClick={()=>onAbrirFpo(a.aih,a.item.id)}>↻ Regularizar FPO</button>}
       </div>
      </div>
     </article>;
    })}
    {!mostrados.length&&<div className="fx-empty">Nenhuma AIH neste filtro.</div>}
   </div>
  </>}
  <Dialog open={!!escolhido} onOpenChange={v=>{if(!v)setAberto(null)}}>
   <DialogContent className="ec-faixas-dialog max-w-4xl max-h-[90vh] overflow-y-auto">
    <DialogTitle className="fx-dialog-title">
     {aberto?.tipo==="memoria"?"Como concluiu?":"Ver diagnóstico e ação"}
     {" · AIH "}{escolhido?.aih}
    </DialogTitle>
    {escolhido&&<div className="fx-dialog-content">
     <div className="fx-dialog-meta">
      <div><b>Norma da competência</b><span>{escolhido.norma}</span></div>
      <div><b>Faixa da AIH</b><span>{escolhido.natureza} · {escolhido.faixa||"não informada"}</span></div>
      <div><b>Resultado</b><span>{LABELS_FAIXA[escolhido.estado]}</span></div>
     </div>
     {aberto?.tipo==="memoria"?<>
      <p>A classificação confronta cada procedimento-filho com os Anexos I e II da
       Deliberação vigente em {competencia}. Não usa a natureza informada
       no workbook como substituta da matriz normativa.</p>
      <div className="fx-dossier-scroll"><table className="fx-dossier-table">
       <thead><tr><th>Procedimento-filho</th><th>QT</th><th>Anexos da CIB</th>
        <th>Memória importada</th><th>Fonte</th></tr></thead>
       <tbody>{escolhido.filhos.map((f,i)=><tr key={i}>
        <td>{f.proc||"Não identificado"}</td><td>{f.qt??"—"}</td>
        <td>{f.classificacao}</td><td>{f.classificacaoFonte}
         {f.divergenciaNormativa&&" · divergência"}</td>
        <td>{f.fonte}{f.linha?" · linha "+f.linha:""}</td>
       </tr>)}</tbody>
      </table></div>
      {escolhido.filhos.some(f=>f.divergenciaNormativa)&&
       <p role="alert" className="fx-integridade">A classificação congelada na origem
        não coincide com a matriz desta competência. Investigue a fonte antes
        de confirmar o enquadramento.</p>}
      <p><b>Memória do motor:</b> {escolhido.motivo}</p>
      <p><b>Comprovação:</b> {escolhido.comprovacao}</p>
     </>:<>
      <p>{escolhido.motivo}</p>
      <div className="fx-dossie-financeiro">
       <DossieFiscalEletivas item={escolhido.item}/>
      </div>
      <div className="fx-actions">
       <button className="fx-btn primary" type="button" onClick={()=>{
        setAberto(null);onAbrirFila(escolhido.item.id);}}>
        Abrir item na fila de auditoria →</button>
       {escolhido.estado==="fpo"&&<button className="fx-btn" type="button" onClick={()=>{
        setAberto(null);onAbrirFpo(escolhido.aih,escolhido.item.id);}}>
        Regularizar FPO →</button>}
      </div>
     </>}
    </div>}
   </DialogContent>
  </Dialog>
 </div>;
}
