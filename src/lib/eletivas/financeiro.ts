/** Contrato financeiro HTML v2.42.2, calculado em centavos.
 * Produção e complemento/SIA chegam normalizados pelo motor de fontes. */
export const CATEGORIAS_ELETIVAS=[
 ["faec_prod","Produção FAEC SIH"],["faec_compl","Complemento FAEC SIH"],
 ["faec_mult","Múltiplas e sequenciais FAEC"],
 ["faec_fxmac","FAEC faixa MAC (somente controle, não soma)"],
 ["mac_compl","Complemento MAC"],["mac_mult","Múltiplas e sequenciais MAC"],
 ["mac_fxfaec","MAC faixa FAEC"],["mac_prod","Produção MAC"],
 ["mac_fxfed","MAC faixa Federal"],["sia_faec","SIA FAEC"],
 ["sia_mac","SIA MAC"],
] as const;
export type CategoriaEletivas=typeof CATEGORIAS_ELETIVAS[number][0];
export type ItemEC={
 id?:string;chave:string;categoria:CategoriaEletivas;descricao:string;
 procedimento?:string|null;aih?:string|null;
 valor_publicado:number;valor_esperado:number;
 situacao:"ok"|"info"|"div"|"nc"|"fora"|"pendente";
 decisao?:"aceito"|"oficio"|"erro"|"analise"|null;
 justificativa?:string|null;detalhe?:unknown;
};
export type CorrecaoEC={
 competencia_origem:string;valor:number;documento_sei:string;motivo:string;
 status?:string;aihs?:string[];fonte_origem?:string;referencia_origem?:string;
};
const cent=(v:number)=>Math.round((Number(v)||0)*100);
export const reais=(n:number)=>(n/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export const valorPublicadoCentavos=(i:ItemEC)=>cent(i.valor_publicado);
export const valorEsperadoCentavos=(i:ItemEC)=>cent(i.valor_esperado);
const TOL=2; // R$ 0,02 do HTML
/** countedPayValue() antes da exclusão do recorte de controle. */
export function valorIncontroversoCentavos(i:ItemEC){
 const pub=valorPublicadoCentavos(i),exp=valorEsperadoCentavos(i);
 if(i.situacao==="ok"||i.situacao==="info")return pub;
 if(i.decisao==="aceito")return pub;
 if(i.decisao==="erro")return 0;
 if(pub<=TOL)return 0;
 // Análise, ofício e ausência de decisão conservam somente a parcela sustentada.
 return exp>TOL?Math.min(pub,exp):pub;
}
export function valorConciliadoCentavos(i:ItemEC){
 return i.categoria==="faec_fxmac"?0:valorIncontroversoCentavos(i);
}
const envelopes=new Set(["041501001","041502003","041502004",
 "041502005","041502006","041502007"]);
const proc9=(raw:string|null|undefined)=>{
 const x=String(raw??"").replace(/\D/g,"");
 return x.length>=10?x.slice(0,9):x.length===8?"0"+x:x;
};
export const envelopeAuditoria=(i:ItemEC)=>envelopes.has(proc9(i.procedimento));
export function diferencaACobrarCentavos(i:ItemEC){
 return envelopeAuditoria(i)?0:Math.max(0,valorEsperadoCentavos(i)-valorPublicadoCentavos(i));
}
export function resumoEncontro(itens:ItemEC[],correcoes:CorrecaoEC[]=[]){
 const zerar=()=>Object.fromEntries(CATEGORIAS_ELETIVAS.map(([id])=>[id,0]))
   as Record<CategoriaEletivas,number>;
 const componentes=zerar(),publicados=zerar(),esperados=zerar();
 let controleFaecFxMac=0,oficio=0,esperadoNaoPago=0,pendenteVal=0;
 for(const i of itens){
  if(!Object.prototype.hasOwnProperty.call(componentes,i.categoria))
   throw Error("Categoria financeira não reconhecida: "+i.categoria);
  publicados[i.categoria]+=valorPublicadoCentavos(i);
  esperados[i.categoria]+=valorEsperadoCentavos(i);
  componentes[i.categoria]+=valorConciliadoCentavos(i);
  if(i.categoria==="faec_fxmac"){
   controleFaecFxMac+=valorIncontroversoCentavos(i);continue;
  }
  const diff=diferencaACobrarCentavos(i);
  if(i.decisao==="oficio")oficio+=diff;
  if(i.situacao!=="ok"&&i.situacao!=="info")esperadoNaoPago+=diff;
  if(["div","nc","fora"].includes(i.situacao)&&!i.decisao&&!envelopeAuditoria(i))
   pendenteVal+=diff;
 }
 const soma=(m:Record<CategoriaEletivas,number>,ids:CategoriaEletivas[])=>
  ids.reduce((n,k)=>n+m[k],0);
 const faec=soma(componentes,["faec_prod","faec_compl","faec_mult"]);
 const mac=soma(componentes,["mac_compl","mac_mult","mac_fxfaec","mac_prod","mac_fxfed"]);
 const sia=soma(componentes,["sia_faec","sia_mac"]);
 const todos=CATEGORIAS_ELETIVAS.map(([id])=>id).filter(id=>id!=="faec_fxmac");
 const publicado=soma(publicados,todos),esperado=soma(esperados,todos);
 const correcoesCentavos=correcoes.filter(c=>!c.status||c.status==="aprovada")
  .reduce((n,c)=>n+cent(c.valor),0);
 const encontro=faec+mac+sia;
 const pendencias=itens.filter(i=>i.decisao==="analise"||
  (["div","nc","fora","pendente"].includes(i.situacao)&&!i.decisao));
 return {componentes,publicados,esperados,faec,mac,sia,publicado,esperado,
  fiscalmenteAdmitido:encontro,controleFaecFxMac,oficio,esperadoNaoPago,
  pendenteVal,correcoes:correcoesCentavos,encontro,
  total:encontro+correcoesCentavos,pendencias,itens:itens.length};
}
