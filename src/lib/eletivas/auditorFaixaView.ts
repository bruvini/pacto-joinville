import type {Tables} from "@/integrations/supabase/types";
import {classificacaoCIB,normaParaCompetencia} from
 "../../../supabase/functions/_shared/eletivas-normativas";

type Linha=Tables<"eletivas_itens">;
export type EstadoFaixa="ok"|"review"|"bad"|"fpo";
export type FilhoFaixa={
 proc:string;qt:number|null;classificacao:string;classificacaoFonte:string;
 original:string;unitario:number|null;fonte:string;linha:number|null;
 divergenciaNormativa:boolean;
};
export type CasoFaixa={
 id:string;aih:string;item:Linha;itens:Linha[];principal:string;
 faixa:string;natureza:string;estado:EstadoFaixa;motivo:string;
 norma:string;regra:string;origens:string[];filhos:FilhoFaixa[];
 comprovacao:string;completo:boolean;alertaDeMemoria:boolean;
};
const rec=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?
 x as Record<string,unknown>:{};
const txt=(x:unknown)=>String(x??"").trim();
const str=(x:unknown)=>txt(x)||"";
const num=(x:unknown):number|null=>
 x===null||x===undefined||x===""?null:Number.isFinite(Number(x))?Number(x):null;
const faixaNatureza=(s:string)=>s==="1"?"Estadual":s==="5"?"Federal":"não identificada";
const normalizarEstado=(s:unknown):EstadoFaixa=>
 s==="ok"||s==="bad"||s==="review"||s==="fpo"?s:"review";
const getAih=(v:unknown)=>/^\d{13}$/.test(str(v))?str(v):"";
const filhosPerfil=(p:Record<string,unknown>,d:Record<string,unknown>)=>{
 const vals=[p.componentes,p.filhos,d.filhos].find(v=>Array.isArray(v))??[];
 return (vals as unknown[]).map(rec);
};
export const LABELS_FAIXA:Record<EstadoFaixa,string>={
 ok:"Compatível",review:"Revisar",bad:"Incompatível",fpo:"Dependência FPO"
};
export const ORDEM_FAIXA:EstadoFaixa[]=["bad","review","fpo","ok"];
export function casosAuditorFaixa(itens:Linha[],competencia:string):CasoFaixa[]{
 const norma=normaParaCompetencia(competencia);
 const porAih=new Map<string,CasoFaixa>();
 for(const i of itens){
  if(i.categoria!=="faec_mult"&&i.categoria!=="mac_mult")continue;
  const d=rec(i.detalhe),p=rec(d.perfil);
  const profiles=Array.isArray(d.aihs)?(d.aihs as unknown[]).map(rec):[p];
  for(const original of profiles){
   const aih=getAih(original.aih)||getAih(i.aih)||getAih(d.aih);
   if(!aih)continue; // Nunca converter "mult" em AIH individual.
   const faixa=str(original.faixa)||str(d.faixa);
   const natureza=str(original.natureza)||faixaNatureza(faixa);
   const principal=str(original.principal)||str(d.principal)||str(i.procedimento);
   const origemClass=str(original.estado)||str(d.classificacao_auditor);
   const estado=normalizarEstado(origemClass);
   const raw=filhosPerfil(original,d);
   const filhos:FilhoFaixa[]=raw.map(f=>{
    const proc=str(f.proc||f.procedimento).replace(/\D/g,"");
    const matriz=classificacaoCIB(proc,competencia);
    const fonte=str(f.classification||f.natureza)||"Não localizado";
    const confirmavel=/^\d{9}$/.test(proc);
    return {
     proc,qt:num(f.qt),classificacao:confirmavel?matriz.classificacao:"Não localizado",
     classificacaoFonte:fonte,original:str(f.original||f.proc_original||proc),
     unitario:num(f.unitario),fonte:str(f.fonte||f.origem_aba)||"workbook AIH",
     linha:num(f.linha||f.origem_linha),
     divergenciaNormativa:confirmavel&&fonte!=="Não localizado"&&
       fonte!==matriz.classificacao
    };
   });
   const alerta=filhos.some(f=>f.divergenciaNormativa)||
    !!(d.regra_normativa&&norma&&d.regra_normativa!==norma.rotulo)||
    !raw.length||!origemClass||!norma;
   const caso:CasoFaixa={
    id:i.id+"|"+aih,aih,item:i,itens:[i],faixa,natureza,principal,
    estado:alerta?"review":estado,motivo:str(original.motivo)||str(d.justificativa)||
     "A memória importada não apresenta justificativa individual completa.",
    norma:norma?.rotulo??"Norma não identificada",
    regra:str(rec(original.norma).artigoFaixa)||str(d.regra_normativa)||
     "Conferir o enquadramento nos Anexos I e II",
    origens:[i.categoria],filhos,
    comprovacao:d.publicacao_independente===true?"Publicação independente indicada na memória":
      "Publicação financeira independente não comprovada nesta memória",
    completo:!!original.conferido&&raw.length>0,alertaDeMemoria:alerta,
   };
   const before=porAih.get(aih);
   if(!before){porAih.set(aih,caso);continue;}
   before.itens.push(i);
   if(!before.origens.includes(i.categoria))before.origens.push(i.categoria);
   // Preserva a trilha de fontes, mas nunca conta duas vezes a mesma AIH.
   // Perfis conflitantes impedem classificar como compatível.
   if(before.estado!==caso.estado||before.principal!==caso.principal||
      before.faixa!==caso.faixa){
     before.estado="review";before.alertaDeMemoria=true;
     before.motivo="Há memórias divergentes da mesma AIH entre as fontes da competência. "+
      "Confronte o workbook, a publicação da SES e os anexos vigentes.";
   }
   if(caso.filhos.length>before.filhos.length)before.filhos=caso.filhos;
  }
 }
 return [...porAih.values()].sort((a,b)=>
  ORDEM_FAIXA.indexOf(a.estado)-ORDEM_FAIXA.indexOf(b.estado)||
  a.aih.localeCompare(b.aih));
}
export function resumoAuditorFaixa(casos:CasoFaixa[]){
 return {all:casos.length,ok:casos.filter(c=>c.estado==="ok").length,
  review:casos.filter(c=>c.estado==="review").length,
  bad:casos.filter(c=>c.estado==="bad").length,
  fpo:casos.filter(c=>c.estado==="fpo").length};
}
