import {proc9,type RegistroSIH} from "./motor";
import type {FonteEscolhida} from "./manifesto";

export const LIMITE_FONTE_BYTES=50*1024*1024;
export const LIMITE_TOTAL_BYTES=240*1024*1024;
export const LIMITE_FONTES=18;
export const TEMPO_DOWNLOAD_MS=45000;

/** Erros técnicos para o fiscal, sem nomes/cadastro de pacientes e sem console. */
export function diagnosticoReduzido(erro:unknown):string{
 if(!(erro instanceof Error))return "Falha técnica não identificada.";
 return erro.name==="AbortError"?"Operação cancelada.":erro.message
  .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,"[CPF omitido]")
  .replace(/\b\d{11}\b/g,"[identificador omitido]")
  .replace(/\b\d{13}\b/g,"[AIH omitida]")
  .replace(/\b\d{15}\b/g,"[CNS omitido]")
  .slice(0,360);
}
/** Mesma AIH com procedimentos distintos é LEGÍTIMA; duplicação
 * idêntica de AIH+procedimento na mesma tabulação é um bloqueio. */
export function verificarAihsOrigem(registros:RegistroSIH[],origem:string){
 const pares=new Set<string>();
 for(const row of registros){
  const aih=String(row.aih??"").trim();
  const codigo=proc9(row.proc);
  if(!/^\d{13}$/.test(aih))throw Error(
   "Tabulação "+origem+": AIH ausente ou não tem 13 dígitos.");
  if(!codigo)throw Error("Tabulação "+origem+": procedimento SIGTAP ausente.");
  if(row.qt_procedimento!==undefined&&
   (!Number.isInteger(row.qt_procedimento)||row.qt_procedimento<1))
   throw Error("Tabulação "+origem+": QT interno não é inteiro positivo.");
  const par=aih+"|"+codigo;
  if(pares.has(par))throw Error(
   "Tabulação "+origem+": AIH/procedimento duplicados (AIH final "+aih.slice(-4)+"). "+
   "Revise a exportação para evitar dupla contabilização.");
  pares.add(par);
 }
}
/** Quantidade dentro da AIH nunca aumenta o número físico de AIHs. */
export const quantidadeSeparada=(rows:RegistroSIH[])=>({
 aihs:new Set(rows.map(r=>r.aih)).size,
 quantidadeInterna:rows.reduce((a,r)=>a+(r.qt_procedimento??1),0),
});
export function verificarLote(arquivos:FonteEscolhida[]){
 if(arquivos.length>LIMITE_FONTES)
  throw Error("Limite de "+LIMITE_FONTES+" fontes por conciliação excedido.");
 const soma=arquivos.reduce((a,b)=>a+b.tamanho,0);
 if(soma>LIMITE_TOTAL_BYTES)
  throw Error("Lote excede 240 MB: divida as fontes ou solicite análise técnica.");
 if(arquivos.some(a=>a.tamanho<=0||a.tamanho>LIMITE_FONTE_BYTES))
  throw Error("Há arquivo vazio ou maior que 50 MB.");
}
export async function comPrazo<T>(promessa:Promise<T>,ms:number,etapa:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([
   promessa,
   new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>reject(new Error("Tempo limite de "+etapa+
       ". A gravação não foi iniciada; confira conexão e tamanho dos arquivos.")),ms);
   }),
  ]);
 }finally{if(timer!==undefined)clearTimeout(timer);}
}
