import {valorConciliadoCentavos,type ItemEC,type CorrecaoEC} from "./financeiro";

export type InvestigavelEC=ItemEC&{
  aih?:string|null;procedimento?:string|null;conferido_em?:string|null;
  detalhe?:unknown;origem?:string;
};
export type VistaEC="todos"|"conciliados"|"fila"|"pendencias";
export type FiltroEC={
  busca:string;vista:VistaEC;categoria:string;situacao:string;
  decisao:string;conferencia:"todos"|"conferido"|"nao_conferido";
};
export const filtrosIniciaisEC:FiltroEC={
  busca:"",vista:"todos",categoria:"todos",situacao:"todos",
  decisao:"todos",conferencia:"todos",
};
export const grupoFinanceiroEC=(cat:string):"FAEC"|"MAC"|"SIA"=>
  cat.startsWith("faec_")?"FAEC":cat.startsWith("mac_")?"MAC":"SIA";
export const precisaDecisaoEC=(i:InvestigavelEC)=>
  ["div","nc","fora","pendente"].includes(i.situacao)&&!i.decisao;
export const emFilaEC=(i:InvestigavelEC)=>
  !i.conferido_em||precisaDecisaoEC(i)||i.decisao==="analise"||
  i.decisao==="oficio"||i.situacao==="pendente";
export function filtrarInvestigacaoEC(itens:InvestigavelEC[],f:FiltroEC){
 const q=f.busca.trim().toLocaleLowerCase("pt-BR");
 return itens.filter(i=>{
  if(f.vista==="conciliados"&&!(i.situacao==="ok"&&!!i.conferido_em&&
       i.decisao!=="erro"&&i.decisao!=="analise"))return false;
  if(f.vista==="fila"&&!emFilaEC(i))return false;
  if(f.vista==="pendencias"&&!(precisaDecisaoEC(i)||
    i.decisao==="analise"||i.situacao==="pendente"))return false;
  if(f.categoria!=="todos"&&i.categoria!==f.categoria)return false;
  if(f.situacao!=="todos"&&i.situacao!==f.situacao)return false;
  if(f.decisao!=="todos"&&(f.decisao==="sem_decisao"?!i.decisao:
    i.decisao!==f.decisao))return false;
  if(f.conferencia==="conferido"&&!i.conferido_em)return false;
  if(f.conferencia==="nao_conferido"&&!!i.conferido_em)return false;
  return !q||[i.descricao,i.procedimento,i.aih,i.categoria,i.situacao]
    .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(q);
 });
}
const cents=(n:number)=>Math.round((Number(n)||0)*100);
export function indicadoresInvestigacaoEC(itens:InvestigavelEC[],correcoes:CorrecaoEC[]=[]){
 const grupos={"FAEC":{itens:0,publicado:0,esperado:0,admitido:0},
  "MAC":{itens:0,publicado:0,esperado:0,admitido:0},
  "SIA":{itens:0,publicado:0,esperado:0,admitido:0}};
 let publicado=0,esperado=0,admitido=0,incontroverso=0,pendente=0,discussao=0;
 for(const item of itens){
  const g=grupos[grupoFinanceiroEC(item.categoria)];g.itens++;
  if(item.categoria==="faec_fxmac")continue; // Controle: não recontar.
  const pub=cents(item.valor_publicado),exp=cents(item.valor_esperado),
    valor=valorConciliadoCentavos(item);
  publicado+=pub;esperado+=exp;admitido+=valor;
  g.publicado+=pub;g.esperado+=exp;g.admitido+=valor;
  if(!!item.conferido_em&&(item.situacao==="ok"||item.decisao==="aceito")&&
      item.decisao!=="erro"&&item.decisao!=="analise")incontroverso+=valor;
  if(item.situacao==="pendente"||item.decisao==="analise")pendente+=exp;
  if(item.decisao==="oficio"||(item.situacao==="div"&&!item.decisao))
    discussao+=Math.max(0,exp-pub);
 }
 const corrigido=correcoes.filter(x=>!x.status||x.status==="aprovada")
   .reduce((a,x)=>a+cents(x.valor),0);
 return {grupos,publicado,esperado,admitido,incontroverso,
   corrigido,pendente,discussao,total:admitido+corrigido,
   fila:itens.filter(emFilaEC).length,pendencias:itens.filter(i=>
    precisaDecisaoEC(i)||i.decisao==="analise").length};
}
