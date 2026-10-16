import type {Tables} from "@/integrations/supabase/types";
import {competenciaNumero} from "../../../supabase/functions/_shared/eletivas-normativas";
type Item=Pick<Tables<"eletivas_itens">,
 "id"|"categoria"|"procedimento"|"descricao"|"detalhe">;
const objeto=(v:unknown):Record<string,unknown>=>
 v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const valido=(v:unknown):number|null=>{
 if(v===undefined||v===null||v==="")return null;
 const x=Number(v);return Number.isFinite(x)&&x>=0?x:null;
};
const BRL=(v:number|null)=>v===null?"—":
 (Math.round(v*100)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export {BRL as formatoFpoBRL};
const FPO_NOTA5=["040701003","041304002","040901018"] as const;
export const CODIGOS_NOTA5=FPO_NOTA5;

export type LinhaFpoEC={
 procedimento:string;nome:string;qtd:number|null;
 sigtap:number|null;federal:number;cib:number|null;residual:number|null;
 ec:number|null;federalTotal:number|null;residualTotal:number|null;
 pct:string;nota5:boolean;estado:"coerente"|"revisar"|"sem comparação";
 fonteLocal:string;
};

/** A tabela financeira/atesto não é escrita por esta memória informativa.
 * Quantidades usadas apenas quando existem no dado local primário.
 * As categorias de complemento não são uma segunda produção a somar. */
export function memoriaFpoOficialEC(itens:Item[],competencia:string){
 const postNota=competenciaNumero(competencia)>=202608;
 const buckets=new Map<string,Item[]>();
 for(const it of itens){
  const codigo=String(it.procedimento??"").replace(/\D/g,"");
  if(!/^\d{9}$/.test(codigo))continue;
  const det=objeto(it.detalhe);
  if(!Object.keys(objeto(det.fpo_oficial)).length)continue;
  const arr=buckets.get(codigo)??[];arr.push(it);buckets.set(codigo,arr);
 }
 const all=[...buckets.entries()].map(([procedimento,entries])=>{
  const ref=objeto(objeto(entries[0].detalhe).fpo_oficial);
  const federal=valido(ref.federal)??0;
  const cib=valido(ref.cib_complemento);
  const sigtap=valido(ref.sigtap);
  const ec=entries.reduce<number|null>((out,it)=>{
   if(out!==null)return out;
   const d=objeto(it.detalhe);
   return valido(d.unitario_delib);
  },null);
  // É um controle de quantidade física tabulada, nunca inferência de
  // valor publicado ou de complementos. Usar produção SIH FAEC/MAC.
  const sourceCounts=["faec_prod","mac_prod"].map(cat=>{
   const values=entries.filter(x=>x.categoria===cat)
    .map(x=>valido(objeto(x.detalhe).qt_procedimentos))
    .filter((x):x is number=>x!==null);
   return {cat,count:values.length?Math.max(...values):null};
  });
  const available=sourceCounts.filter(x=>x.count!==null);
  const qtd=available.length&&available.length===
   sourceCounts.filter(x=>entries.some(i=>i.categoria===x.cat)).length?
   available.reduce((sum,x)=>sum+Number(x.count),0):null;
  const residual=cib===null||cib<=0?null:Math.max(0,cib-federal);
  const state:LinhaFpoEC["estado"]=postNota&&qtd!==null&&ec!==null&&ec>0&&residual!==null?
   (Math.abs(Math.round(ec*100)-Math.round(residual*100))<=2?"coerente":"revisar")
   :"sem comparação";
  return {
   procedimento,nome:String(ref.nome??entries[0].descricao??""),
   qtd,sigtap,federal,cib,residual,ec,
   federalTotal:qtd===null?null:Math.round(qtd*federal*100)/100,
   residualTotal:qtd===null||residual===null?null:Math.round(qtd*residual*100)/100,
   pct:String(ref.pct??""),nota5:ref.nota5===true,
   estado:state,fonteLocal:entries.map(x=>x.categoria).join(", "),
   eletiva:String(ref.eletiva??"").toUpperCase()
  };
 });
 const rows:LinhaFpoEC[]=all.filter(r=>r.eletiva==="S"&&r.federal>0)
  .map(({eletiva,...r})=>r)
  .sort((a,b)=>(b.federalTotal??0)-(a.federalTotal??0));
 const changed=FPO_NOTA5.map(proc=>({
  procedimento:proc,linha:rows.find(r=>r.procedimento===proc)??null,
  referencia:all.find(r=>r.procedimento===proc)??null
 }));
 const complete=rows.length>0&&rows.every(r=>r.federalTotal!==null);
 const totalFederal=complete?
  rows.reduce((s,r)=>s+Number(r.federalTotal),0):null;
 const residualRows=rows.filter(r=>r.residualTotal!==null);
 const totalResidual=rows.length>0&&residualRows.length===rows.length?
  residualRows.reduce((s,r)=>s+Number(r.residualTotal),0):null;
 return {postNota,rows,changed,available:all.length>0,totalOficialConhecidos:all.length,
  complete,totalFederal,totalResidual,
  reviews:rows.filter(r=>r.estado==="revisar").length};
}
