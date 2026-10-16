/** Valida os dados informados pelo fiscal antes da RPC transacional.
 * Este módulo NÃO altera o valor do atesto: a aprovação é exclusiva do banco. */
export function normalizarAihsCorrecao(raw:string){
 const tokens=raw.trim().split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);
 const invalidas=[...new Set(tokens.filter(x=>!/^\d{13}$/.test(x)))];
 const validas=[...new Set(tokens.filter(x=>/^\d{13}$/.test(x)))];
 return {validas,invalidas};
}
export function normalizarValorCorrecao(raw:string){
 const s=raw.trim().replace(/R\$/gi,"").replace(/\s/g,"");
 if(!s||!/^[0-9.,]+$/.test(s))return null;
 let decimal:string;
 if(s.includes(",")){
  if(!/^\d{1,3}(?:\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(s))return null;
  decimal=s.replace(/\./g,"").replace(",",".");
 }else{
  if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
  decimal=s;
 }
 const n=Number(decimal),centavos=Math.round(n*100);
 if(!Number.isSafeInteger(centavos)||centavos<=0)return null;
 return centavos/100;
}
export type EntradaCorrecaoEC={
 competencia_origem:string;aihs:string;valor:string;
 fonte_origem:string;referencia_origem:string;documento_sei:string;motivo:string;
};
export function validarEntradaCorrecaoEC(x:EntradaCorrecaoEC,competenciaAtual:string){
 const origem=x.competencia_origem.trim();
 const m=/^(0[1-9]|1[0-2])\/(\d{4})$/.exec(origem);
 if(!m)return {ok:false as const,erro:"Informe a competência de origem no formato MM/AAAA."};
 const current=/^(0[1-9]|1[0-2])\/(\d{4})$/.exec(competenciaAtual);
 const ref=Number(m[2])*100+Number(m[1]);
 if(current&&ref>=Number(current[2])*100+Number(current[1]))
  return {ok:false as const,erro:"A origem deve ser anterior à competência em que a correção foi recebida."};
 const ai=normalizarAihsCorrecao(x.aihs);
 if(ai.invalidas.length)return {ok:false as const,erro:"AIH inválida: "+
   ai.invalidas.join(", ")+". Cada AIH deve ter exatamente 13 dígitos."};
 if(!ai.validas.length)return {ok:false as const,erro:"Informe ao menos uma AIH válida com 13 dígitos."};
 const valor=normalizarValorCorrecao(x.valor);
 if(valor===null)return {ok:false as const,erro:"Informe um valor positivo em reais, com no máximo dois decimais."};
 if(x.fonte_origem.trim().length<3)return {ok:false as const,erro:"Identifique a fonte oficial da correção."};
 if(x.referencia_origem.trim().length<5)return {ok:false as const,erro:"Informe a referência única da correção para evitar duplicidade."};
 if(x.documento_sei.trim().length<5)return {ok:false as const,erro:"Informe o documento SEI ou referência documental oficial."};
 if(x.motivo.trim().length<10)return {ok:false as const,erro:"Descreva o motivo da correção (mínimo de 10 caracteres)."};
 return {ok:true as const,origem,aihs:ai.validas,valor,
  fonte:x.fonte_origem.trim(),referencia:x.referencia_origem.trim(),
  sei:x.documento_sei.trim(),motivo:x.motivo.trim()};
}
