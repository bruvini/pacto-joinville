import {useQuery} from "@tanstack/react-query";
import {supabase} from "@/integrations/supabase/client";
import type {Tables} from "@/integrations/supabase/types";
import {CATEGORIAS_ELETIVAS,resumoEncontro,reais,valorConciliadoCentavos,
 type ItemEC,type CorrecaoEC} from "@/lib/eletivas/financeiro";
import {indicadoresInvestigacaoEC,grupoFinanceiroEC} from "@/lib/eletivas/investigacao";

type Linha=Tables<"eletivas_itens">;
const cent=(v:number)=>Math.round((Number(v)||0)*100);
type Grupo="FAEC"|"MAC"|"SIA";
const R:Record<string,string>=Object.fromEntries(CATEGORIAS_ELETIVAS);
const N=(v:unknown)=>Number(v??0);
export function PainelScEletivas({id,itens,onNavigate}:{
 id:string;itens:Linha[];onNavigate:(v:"fila"|"pagos"|"correcoes")=>void;
}){
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
 const r=resumoEncontro(itens as unknown as ItemEC[],
   (correcao.data??[]) as CorrecaoEC[]);
 const indicadores=indicadoresInvestigacaoEC(itens as unknown as ItemEC[],
   (correcao.data??[]) as CorrecaoEC[]);
 const grupos=["FAEC","MAC","SIA"] as const;
 const valores=[
  ["SES publicado",r.publicado,""],
  ["Memória esperada",r.esperado,""],
  ["Incontroverso · EC-base",r.encontro,"green"],
  ["Correções aprovadas",r.correcoes,""],
  ["A cobrar por ofício",r.oficio,"red"],
  ["Atesto preliminar",r.total,"green"]
 ] as const;
 return <div className="ec-sections space-y-4">
  <div className="ec-kpis" aria-label="Consolidado financeiro da competência">
   {valores.map(([rotulo,v,tom])=><div key={rotulo} className="ec-kpi"
     data-tone={tom||"neutral"}>
    <div className="ec-k-label">{rotulo}</div>
    <div className="ec-k-value">{reais(v)}</div>
   </div>)}
  </div>
  <div className="ec-paper">
   <div className="ec-actions justify-between">
    <div>
     <h3 className="text-lg font-semibold">Painel da conciliação</h3>
     <p className="ec-footnote">Produção publicada × memória esperada × valor
      fiscalmente admitido. Fontes e situações preservadas por componente.</p>
    </div>
    <div className="ec-actions">
     <button type="button" className="ec-action alt" onClick={()=>onNavigate("pagos")}>
      Itens conciliados</button>
     <button type="button" className="ec-action" onClick={()=>onNavigate("fila")}>
      Fila de auditoria · {indicadores.fila}</button>
    </div>
   </div>
  </div>
  {grupos.map((g,idx)=>{
   const lista=itens.filter(i=>grupoFinanceiroEC(i.categoria)===g);
   const conjunto=[...new Set(lista.map(i=>i.categoria))];
   return <section key={g} className="ec-ledger" aria-label={"Quadro "+g}>
    <div className="ec-ledger-head"><div>
     <h3><span className="ec-number">0{idx+1}</span> {g}</h3>
     <p>{lista.length} item(ns) · dados agrupados por componente do Encontro de Contas</p>
    </div><span className="ec-stamp" data-variant={lista.some(i=>["div","nc","pendente","fora"].includes(i.situacao))?"warning":"neutral"}>
     {lista.length?"Em conferência":"Sem publicação"}</span></div>
    <div className="ec-table-scroll"><table>
     <thead><tr><th>Componente</th><th>Itens</th><th>Publicado SES</th>
      <th>Esperado</th><th>Admitido</th></tr></thead>
     <tbody>
      {conjunto.map(cat=>{
       const x=lista.filter(i=>i.categoria===cat);
       const ctrl=cat==="faec_fxmac";
       const pub=x.reduce((n,i)=>n+cent(i.valor_publicado),0);
       const exp=x.reduce((n,i)=>n+cent(i.valor_esperado),0);
       const total=x.reduce((n,i)=>n+valorConciliadoCentavos(i as ItemEC),0);
       return <tr key={cat}><td><strong>{R[cat]??cat}</strong>
        {ctrl&&<span className="ml-2 text-xs text-muted-foreground">
         Controle não somado</span>}</td>
        <td>{x.length}</td><td className="ec-number-cell">
         {ctrl?"Controle":reais(pub)}</td>
        <td className="ec-number-cell">{ctrl?"—":reais(exp)}</td>
        <td className="ec-number-cell">{ctrl?"R$ 0,00":reais(total)}</td>
       </tr>;
      })}
      {!conjunto.length&&<tr><td colSpan={5} className="ec-footnote">
       Nenhum item deste grupo foi identificado nas fontes da competência.</td></tr>}
      <tr className="font-semibold bg-[#f9fbf6]">
       <td>Total {g}</td><td>{indicadores.grupos[g].itens}</td>
       <td className="ec-number-cell">{reais(indicadores.grupos[g].publicado)}</td>
       <td className="ec-number-cell">{reais(indicadores.grupos[g].esperado)}</td>
       <td className="ec-number-cell">{reais(indicadores.grupos[g].admitido)}</td>
      </tr>
     </tbody></table></div>
   </section>;
  })}
  <section className="ec-ledger">
   <div className="ec-ledger-head"><div><h3>
    <span className="ec-number">04</span> Correções recebidas</h3>
    <p>Competência de origem, valor recebido e decisão fiscal</p></div>
    <button className="ec-action alt" type="button"
     onClick={()=>onNavigate("correcoes")}>Abrir correções</button>
   </div>
   <div className="ec-table-scroll"><table>
    <thead><tr><th>Competência origem</th><th>SEI</th><th>Situação</th><th>Valor</th></tr></thead>
    <tbody>
     {(correcao.data??[]).map(c=><tr key={c.id}>
      <td>{c.competencia_origem}</td><td>{c.documento_sei}</td>
      <td>{c.status.replaceAll("_"," ")}</td>
      <td className="ec-number-cell">{reais(cent(c.valor))}</td></tr>)}
     {!correcao.data?.length&&<tr><td colSpan={4}>
      Nenhuma correção fiscal registrada nesta competência.</td></tr>}
     <tr className="font-semibold"><td colSpan={3}>Total aprovado, sem duplicidade</td>
      <td className="ec-number-cell">{reais(r.correcoes)}</td></tr>
    </tbody></table></div>
  </section>
  <section className="ec-ledger">
   <div className="ec-ledger-head"><div><h3>
    <span className="ec-number">05</span> Consolidado financeiro</h3>
    <p>Separação entre valores publicados, esperados, incontroversos e a cobrar</p>
   </div><span className="ec-stamp" data-variant={sql.isError?"danger":sql.isLoading?"warning":"neutral"}>
    {sql.isError?"Banco indisponível":sql.isLoading?"Conferindo":"Memória do banco"}</span></div>
   <div className="ec-table-scroll"><table><tbody>
    {valores.map(([rotulo,n])=><tr key={rotulo}>
     <td>{rotulo}</td><td className="ec-number-cell">{reais(n)}</td>
    </tr>)}
    <tr><td>FAEC faixa MAC · controle excluído da soma</td>
     <td className="ec-number-cell">{reais(r.controleFaecFxMac)}</td></tr>
   </tbody></table></div>
   {sql.data&&<p className="ec-footnote p-4">
    {cent(N(sql.data.total_com_correcoes))===r.total?
      "Conferência React × PostgreSQL: total preliminar coincidente em centavos.":
      "ATENÇÃO: divergência entre React e PostgreSQL; bloqueie o atesto e investigue as origens."}
   </p>}
   {(sql.isError||correcao.isError)&&<p role="alert" className="ec-footnote p-4 text-red-700">
    Não foi possível consultar todos os valores. Não homologue o atesto.</p>}
   <p className="ec-footnote px-4 pb-4">Os valores preliminares não substituem
    publicação estadual, decisão fiscal, documentos SEI ou comparação com o HTML.</p>
  </section>
 </div>;
}
