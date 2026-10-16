import {useMemo,useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {resumoEncontro,reais,type ItemEC,type CorrecaoEC} from "@/lib/eletivas/financeiro";
import {consolidadoDoManifestoEC} from "@/lib/eletivas/fase7Exportacao";
import {normalizarAihsCorrecao,validarEntradaCorrecaoEC,
 type EntradaCorrecaoEC} from "@/lib/eletivas/correcoesFormulario";
import "@/styles/eletivas-reference-correcoes.css";

type Comp=Tables<"eletivas_competencias">;
type Item=Tables<"eletivas_itens">;
type Correcao=Tables<"eletivas_correcoes">;
const initial=():EntradaCorrecaoEC=>({
 competencia_origem:"",aihs:"",valor:"",fonte_origem:"SES/SC",
 referencia_origem:"",documento_sei:"",motivo:""
});
const isPending=(s:string)=>s==="em_analise"||s==="duplicada";
const statusLabel=(s:string)=>({
 em_analise:"Aguardando revisão",duplicada:"Possível duplicidade",
 aprovada:"Aprovada",rejeitada:"Rejeitada"
} as Record<string,string>)[s]??s.replaceAll("_"," ");
const cent=(n:number)=>Math.round((Number(n)||0)*100);

/** Espelho visual de renderCorrections(), com RPCs institucionais e trilha fiscal. */
export function CorrecoesRecebidasEletivas({comp,itens,podeEditar,onRefresh,onNavigate}:{
 comp:Comp;itens:Item[];podeEditar:boolean;
 onRefresh:()=>void|Promise<void>;
 onNavigate:(v:"arquivos"|"fpo")=>void;
}){
 const qc=useQueryClient();
 const [form,setForm]=useState<EntradaCorrecaoEC>(initial);
 const [revisao,setRevisao]=useState<Record<string,string>>({});
 const [aberta,setAberta]=useState<string|null>(null);
 const [erro,setErro]=useState("");
 const [filtrar,setFiltrar]=useState<"todas"|"pendentes"|"aprovadas">("todas");
 const correcoesQ=useQuery({queryKey:["ec-correcoes",comp.id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_correcoes")
   .select("*").eq("competencia_id",comp.id)
   .order("criado_em",{ascending:false});
  if(error)throw error;return data??[];
 }});
 const registros=correcoesQ.data??[];
 // Vínculo informativo com competências anteriores: jamais pressupõe recebimento.
 // Não grava relação fictícia em campo documental nem encerra fluxo FPO automaticamente.
 const origensQ=useQuery({queryKey:["ec-correcoes-origens",comp.prestador_id],queryFn:async()=>{
  const {data,error}=await supabase.from("eletivas_competencias")
   .select("id,competencia").eq("prestador_id",comp.prestador_id);
  if(error)throw error;return data??[];
 }});
 const fpoQ=useQuery({queryKey:["ec-correcoes-fpo-origem",comp.prestador_id,
  origensQ.data?.length],enabled:!!origensQ.data?.length,queryFn:async()=>{
  const ids=(origensQ.data??[]).map(x=>x.id);
  if(!ids.length)return [] as Tables<"eletivas_fpo_fluxos">[];
  const {data,error}=await supabase.from("eletivas_fpo_fluxos")
   .select("*").in("competencia_id",ids)
   .order("atualizado_em",{ascending:false}).limit(1000);
  if(error)throw error;return data??[];
 }});
 const origemId=origensQ.data?.find(x=>x.competencia===form.competencia_origem)?.id;
 const inputAihs=useMemo(()=>normalizarAihsCorrecao(form.aihs).validas,[form.aihs]);
 const candidatos=(fpoQ.data??[]).filter(x=>x.competencia_id===origemId&&
  inputAihs.includes(x.aih));
 const aprovadas=registros.filter(x=>x.status==="aprovada");
 const totalAprovado=aprovadas.reduce((v,x)=>v+cent(x.valor),0);
 const soma=(registros as CorrecaoEC[]).map(x=>({
  competencia_origem:x.competencia_origem,valor:x.valor,
  documento_sei:x.documento_sei,motivo:x.motivo,status:x.status,
  aihs:x.aihs,fonte_origem:x.fonte_origem,referencia_origem:x.referencia_origem
 }));
 const financeiro=resumoEncontro(itens as ItemEC[],soma);
 const totalAihs=new Set(registros.flatMap(r=>r.aihs)).size;
 const comps=new Set(registros.map(r=>r.competencia_origem)).size;
 const consol=consolidadoDoManifestoEC(comp.ec_fontes_snapshot,comp.cnes,comp.competencia);
 const diffConsol=consol?.ajustes==null?null:Math.round(consol.ajustes*100)-totalAprovado;
 const recarregar=async()=>{
  await Promise.all([
   qc.invalidateQueries({queryKey:["ec-correcoes",comp.id]}),
   qc.invalidateQueries({queryKey:["ec-financeiro-sql",comp.id]}),
   qc.invalidateQueries({queryKey:["ec-correcoes-resumo",comp.id]}),
  ]);
  await onRefresh();
 };
 const incluir=useMutation({mutationFn:async()=>{
  if(!podeEditar)throw Error("Somente ACP/Admin podem registrar correções em competência aberta.");
  const v=validarEntradaCorrecaoEC(form,comp.competencia);
  if(!v.ok)throw Error(v.erro);
  const {error}=await supabase.rpc("ec_incluir_correcao",{
   p_comp:comp.id,p_origem:v.origem,p_aihs:v.aihs,p_valor:v.valor,
   p_fonte:v.fonte,p_referencia:v.referencia,p_sei:v.sei,p_motivo:v.motivo
  });
  if(error)throw error;
 },onSuccess:async()=>{
  setErro("");setForm(initial());
  await recarregar();
  toast.success("Correção registrada para revisão fiscal. Ainda não entra no atesto.");
 },onError:(e:Error)=>{setErro(e.message);toast.error(e.message);}});
 const revisar=useMutation({mutationFn:async({
  id,status}:{id:string;status:"aprovada"|"rejeitada"})=>{
  if(!podeEditar)throw Error("Revisão fiscal exige competência aberta e ACP/Admin.");
  const text=(revisao[id]??"").trim();
  if(text.length<15)throw Error("Justifique a decisão com pelo menos 15 caracteres.");
  const {error}=await supabase.rpc("ec_revisar_correcao",{
   p_id:id,p_status:status,p_justificativa:text
  });
  if(error)throw error;
 },onSuccess:async()=>{
  setAberta(null);setErro("");await recarregar();
  toast.success("Revisão fiscal registrada no histórico.");
 },onError:(e:Error)=>{setErro(e.message);toast.error(e.message);}});
 const visiveis=registros.filter(x=>filtrar==="todas"||
  filtrar==="pendentes"&&isPending(x.status)||
  filtrar==="aprovadas"&&x.status==="aprovada");
 const pendentes=registros.filter(x=>isPending(x.status)).length;
 const busy=incluir.isPending||revisar.isPending;
 return <div className="ec-correcoes-ref" id="v-correcoes">
  <div className="corr-hero">
   <div className="corr-eyebrow">VALORES RECEBIDOS · COMPETÊNCIAS ANTERIORES</div>
   <h3>Correções monetárias recebidas</h3>
   <p>Registre aqui valores que a SES reconheceu e pagou nesta competência, mas que se referem
    a AIHs de competências anteriores. Esses valores <b>compõem o total do atesto atual</b>,
    sem alterar a produção da competência que está sendo auditada.</p>
  </div>
  <div className="corr-summary" aria-label="Indicadores de correções">
   <div className="corr-kpi"><div className="ck">Total de correções</div>
    <div className="cv">{correcoesQ.isLoading?"…":reais(totalAprovado)}</div>
    <small>aprovadas para o atesto</small></div>
   <div className="corr-kpi"><div className="ck">Registros lançados</div>
    <div className="cv">{registros.length}</div>
    <small>{pendentes} aguardando revisão</small></div>
   <div className="corr-kpi"><div className="ck">AIHs relacionadas</div>
    <div className="cv">{totalAihs}</div>
    <small>{comps} competência(s) de origem</small></div>
  </div>
  {consol?.ajustes!=null&&<section className="corr-consolidated">
   <h5>Referência do Consolidado geral SES/SC</h5>
   <p>O Consolidado informa valores de ajustes, mas não comprova por si só a origem
    das AIHs. Essa conferência não cria uma correção nem altera o atesto.</p>
   <div className="cc-values">
    <div className="ccv"><span>Consolidado SES</span><b>{reais(Math.round(consol.ajustes*100))}</b></div>
    <div className="ccv"><span>Registrado e aprovado aqui</span><b>{reais(totalAprovado)}</b></div>
    <div className="ccv"><span>Diferença</span><b>{reais(diffConsol??0)}</b></div>
   </div>
   <p>Arquivo: {consol.arquivo}. {diffConsol===0?
    "Valores reconciliados; confira ainda as evidências por AIH e competência.":
    "Revise a origem das diferenças com o Consolidado e as evidências fiscais."}</p>
  </section>}
  <div className="corr-layout">
   <section className="corr-form" aria-label="Adicionar correção recebida">
    <h4>Adicionar correção recebida</h4>
    <label className="corr-field">
     <span>Competência de origem</span>
     <input value={form.competencia_origem} inputMode="numeric" autoComplete="off"
      maxLength={7} placeholder="MM/AAAA" disabled={!podeEditar||busy}
      onChange={e=>setForm(x=>({...x,competencia_origem:e.target.value}))}/>
     <div className="corr-help">Informe a competência à qual as AIHs corrigidas originalmente pertencem.</div>
    </label>
    <label className="corr-field">
     <span>AIHs relacionadas</span>
     <textarea value={form.aihs} disabled={!podeEditar||busy}
      placeholder={"Cole uma ou mais AIHs\nEx.:\n4226500312287\n4226500329403"}
      onChange={e=>setForm(x=>({...x,aihs:e.target.value}))}/>
     <div className="corr-help">Pode colar uma por linha ou separar por espaço, vírgula ou ponto e vírgula. Duplicidades são removidas automaticamente.</div>
    </label>
    <label className="corr-field">
     <span>Valor recebido</span>
     <input value={form.valor} inputMode="decimal" autoComplete="off"
      placeholder="R$ 0,00" disabled={!podeEditar||busy}
      onChange={e=>setForm(x=>({...x,valor:e.target.value}))}/>
     <div className="corr-help">Informe o valor total recebido para o conjunto de AIHs acima.
      Ele só entra no atesto após aprovação fiscal.</div>
    </label>
    <div className="corr-link-box">
     <div className="cl-title">Rastreabilidade da origem · institucional</div>
     <label className="corr-field">
      <span>Fonte oficial da correção</span>
      <input value={form.fonte_origem} disabled={!podeEditar||busy}
       placeholder="Ex.: SES/SC"
       onChange={e=>setForm(x=>({...x,fonte_origem:e.target.value}))}/>
     </label>
     <label className="corr-field">
      <span>Referência única do ajuste</span>
      <input value={form.referencia_origem} disabled={!podeEditar||busy}
       placeholder="Código ou identificação única no documento oficial"
       onChange={e=>setForm(x=>({...x,referencia_origem:e.target.value}))}/>
      <div className="corr-help">A referência é conferida entre competências para impedir lançamentos duplicados.</div>
     </label>
     <label className="corr-field">
      <span>Documento SEI / comprovante oficial</span>
      <input value={form.documento_sei} disabled={!podeEditar||busy}
       placeholder="Número do documento que comprova o recebimento"
       onChange={e=>setForm(x=>({...x,documento_sei:e.target.value}))}/>
     </label>
     <label className="corr-field">
      <span>Motivo / memória da correção</span>
      <textarea className="corr-motivo" value={form.motivo} disabled={!podeEditar||busy}
       placeholder="Informe o motivo e a base documental do ajuste"
       onChange={e=>setForm(x=>({...x,motivo:e.target.value}))}/>
     </label>
     <div className="cl-title">Regularização FPO / reprocessamento de origem</div>
     <div className="corr-linked-note">
      {origensQ.isLoading||fpoQ.isLoading?
       "Localizando fluxos relacionados nas competências anteriores…":
       origensQ.isError||fpoQ.isError?
       "Não foi possível consultar os fluxos FPO. A correção pode ser registrada com sua referência documental.":
       candidatos.length?
       candidatos.map(f=><p key={f.id}>
        AIH {f.aih} · etapa {f.etapa} · {f.situacao} · estimado {reais(cent(f.valor_estimado))}
       </p>):
       "Nenhuma regularização da origem corresponde às AIHs informadas."}
      <p>Consulta informativa: o vínculo formal e o encerramento do fluxo não são automáticos.
       Para conferir ou atualizar um fluxo, utilize a página FPO.</p>
      <button className="corr-fpo-link" type="button"
       onClick={()=>onNavigate("fpo")}>Abrir regularizações FPO →</button>
     </div>
    </div>
    {erro&&<p role="alert" className="corr-error">{erro}</p>}
    <div className="corr-actions">
     <button type="button" className="btn btn-primary" disabled={!podeEditar||busy||correcoesQ.isError}
      onClick={()=>incluir.mutate()}>{incluir.isPending?"Registrando…":"Adicionar correção"}</button>
     <span className="corr-msg">{podeEditar?
      "Aguardará revisão fiscal antes de compor o atesto.":
      "Somente leitura · registro restrito a ACP/Admin."}</span>
    </div>
    <div className="corr-note"><b>Como o valor é usado:</b> somente correções
     <b> aprovadas</b> são somadas ao valor do Encontro de Contas da competência atual,
     sem alterar a produção da competência original. A origem e suas AIHs ficam preservadas
     no Relatório de Análise.</div>
   </section>
   <section className="corr-list-card" aria-label="Correções já registradas">
    <div className="corr-list-head"><h4>Correções já registradas</h4>
     <div className="corr-filters" role="group" aria-label="Filtrar correções">
      {(["todas","pendentes","aprovadas"] as const).map(v=>
       <button type="button" key={v} aria-pressed={filtrar===v}
        className={filtrar===v?"on":""} onClick={()=>setFiltrar(v)}>
        {v==="todas"?"Todas":v==="pendentes"?"Pendentes":"Aprovadas"}</button>)}
     </div>
    </div>
    {correcoesQ.isError&&<p role="alert" className="corr-error">
     Não foi possível consultar as correções. Confirme suas permissões e tente novamente.</p>}
    {correcoesQ.isLoading&&<p className="corr-empty">Consultando correções registradas…</p>}
    {!correcoesQ.isLoading&&!correcoesQ.isError&&!visiveis.length&&
     <div className="corr-empty">{filtrar==="todas"?
      "Nenhuma correção recebida foi lançada para a competência "+comp.competencia+".":
      "Nenhuma correção neste filtro."}</div>}
    {visiveis.map((r,index)=><article className="corr-entry" key={r.id}>
     <div className="corr-entry-top">
      <div><div className="corr-entry-title">{index+1}. Competência {r.competencia_origem}</div>
       <div className="corr-entry-meta">{r.aihs.length} AIH{r.aihs.length===1?"":"s"} relacionada{r.aihs.length===1?"":"s"}
        <span className={"trace-chip "+(r.status==="aprovada"?"closed":"open")}>
         {statusLabel(r.status)}</span></div></div>
      <div className="corr-entry-val">{reais(cent(r.valor))}</div>
     </div>
     <div className="corr-aihs">
      {r.aihs.map(a=><span className="corr-aih" key={a}>{a}</span>)}
     </div>
     <div className="corr-linked-note">
      <b>Origem:</b> {r.fonte_origem} · {r.referencia_origem} · SEI {r.documento_sei}
      <p>{r.motivo}</p>
      {r.justificativa_revisao&&<p><b>Revisão:</b> {r.justificativa_revisao}</p>}
     </div>
     {isPending(r.status)&&podeEditar&&<>
      <div className="corr-entry-actions">
       <button className="corr-edit" type="button"
        aria-expanded={aberta===r.id} onClick={()=>setAberta(v=>v===r.id?null:r.id)}>
        {aberta===r.id?"Ocultar revisão":"Revisar correção"}</button>
      </div>
      {aberta===r.id&&<div className="corr-review">
       <label className="corr-field"><span>Fundamentação da revisão fiscal · mínimo de 15 caracteres</span>
        <textarea value={revisao[r.id]??""} disabled={busy}
         onChange={e=>setRevisao(x=>({...x,[r.id]:e.target.value}))}
         placeholder="Confira a publicação, a origem das AIHs e a possibilidade de duplicidade…"/></label>
       <div className="corr-entry-actions">
        <button type="button" className="corr-edit" disabled={busy||
         (revisao[r.id]??"").trim().length<15}
         onClick={()=>revisar.mutate({id:r.id,status:"aprovada"})}>
         Aprovar correção</button>
        <button type="button" className="corr-del" disabled={busy||
         (revisao[r.id]??"").trim().length<15}
         onClick={()=>revisar.mutate({id:r.id,status:"rejeitada"})}>
         Rejeitar / reconhecer duplicidade</button>
       </div>
      </div>}
     </>}
    </article>)}
    {pendentes>0&&<div className="corr-note">
     <b>{pendentes} correção(ões) aguardando revisão.</b>
     O encerramento ficará bloqueado até que sejam tratadas.</div>}
    {!correcoesQ.isError&&<p className="corr-list-foot">
     Valores aprovados: {reais(financeiro.correcoes)} · nenhum registro pode ser
     excluído silenciosamente após entrar na auditoria.</p>}
   </section>
  </div>
 </div>;
}
