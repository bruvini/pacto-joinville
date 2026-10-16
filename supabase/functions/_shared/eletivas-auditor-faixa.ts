import {classificacaoCIB,normaParaCompetencia} from "./eletivas-normativas.ts";
export const AGRUPADORES_CIRURGIAS=new Set([
 "041501001","041502003","041502004","041502005","041502006","041502007"
]);
type LinhaAih={aih:string;proc:string;qt:number;faixa:string;principal:string;
 proc_original?:string;origem_aba?:string;origem_linha?:number};
type MatrizAih={rows:LinhaAih[];cib:Record<string,{nature:string;compl:number;nome:string}>};
export function auditarAihNormativa(aih:string,competencia:string,wb?:MatrizAih){
 const rows=wb?.rows.filter(r=>r.aih===aih)??[];
 const norma=normaParaCompetencia(competencia);
 const faixa=String(rows.find(r=>r.faixa)?.faixa??"");
 const natureza=faixa==="1"?"Estadual":faixa==="5"?"Federal":"";
 const principal=String(rows.find(r=>r.principal)?.principal??"");
 const componentes=rows.filter(r=>r.proc!==principal&&!AGRUPADORES_CIRURGIAS.has(r.proc))
  .map(r=>{
   const norm=classificacaoCIB(r.proc,competencia);
   const local=wb?.cib[r.proc];
   return {proc:r.proc,original:r.proc_original??r.proc,qt:r.qt,
    natureza:norm.classificacao,classification:norm.classificacao,
    naturezaWorkbook:local?.nature??"",unitario:local?.compl??null,
    fonte:r.origem_aba??"workbook AIH",linha:r.origem_linha??null,
    norma:norma?.rotulo??null,
    compativel:norm.classificacao===natureza||norm.classificacao==="Ambos"};
  });
 const localizados=componentes.filter(c=>c.classification!=="Não localizado");
 const compativeis=localizados.filter(c=>c.compativel);
 const opostos=localizados.filter(c=>!c.compativel);
 const ambos=localizados.filter(c=>c.classification==="Ambos");
 const naoLocalizados=componentes.filter(c=>c.classification==="Não localizado");
 const completo=!!norma&&!!natureza&&componentes.length>0;
 const elegivel=completo&&compativeis.length>0;
 const memoriaCibCompleta=compativeis.length>0&&
   compativeis.every(c=>c.unitario!==null&&Number.isFinite(c.unitario)&&c.qt>0);
 const complemento=memoriaCibCompleta?
   compativeis.reduce((s,c)=>s+(c.unitario??0)*c.qt,0):0;
 let estado:"review"|"bad"|"fpo"|"ok"="review";
 if(completo&&localizados.length>0){
  if(!compativeis.length&&opostos.length)estado="bad";
  else if(opostos.length||ambos.length||naoLocalizados.length)estado="review";
  else estado=natureza==="Federal"?"fpo":"ok";
 }
 const motivo=!norma?"Competência sem Anexos I e II versionados.":
  !natureza?"Faixa AIH não identificada; esperado 1 (Estadual) ou 5 (Federal).":
  !componentes.length?"Sem procedimentos-filhos para confronto com os Anexos.":
  !localizados.length?"Nenhum filho localizado na matriz normativa vigente.":
  estado==="bad"?"Incompatibilidade entre faixa da AIH e procedimentos-filhos da CIB.":
  estado==="review"?"Composição mista, Ambos ou procedimentos fora do rol: revisão obrigatória.":
  estado==="fpo"?"Composição federal: conferir programação FPO efetiva antes de atribuir cobrança à SES.":
  !memoriaCibCompleta?"Enquadramento compatível, mas unitário/quantidade da memória CIB não comprovados.":
  "Faixa estadual e composição normativa compatíveis.";
 return {aih,faixa,natureza,principal,conferido:completo&&memoriaCibCompleta,
  enquadramentoConferido:completo,elegivel,estado,motivo,
  complemento,componentes,filhos:componentes,compativeis:compativeis.length,
  opostos:opostos.length,ambos:ambos.length,naoLocalizados:naoLocalizados.length,
  fonteValores:"workbook AIH, sem substituir os Anexos oficiais",
  norma:norma?{id:norma.id,rotulo:norma.rotulo,retificacao:norma.retificacao,
   vigencia:[norma.inicio,norma.fim],artigoFaixa:norma.artigoFaixa,
   artigoMultiplas:norma.artigoMultiplas,artigoFPO:norma.artigoFPO}:null,
  programacaoFpoEfetivaComprovada:false,
  creditoReconhecidoAutomatico:false};
}
