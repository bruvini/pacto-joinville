import { competenciasPrevistas, competenciaValida, type PeriodicidadeEmenda } from "./competencias";

/** Máscara MM/AAAA aplicada durante a digitação sem transformar o número em cartão. */
export function mascararCompetencia(input:string) {
 const digits=input.replace(/\D/g,"").slice(0,6);
 return digits.length>2?digits.slice(0,2)+"/"+digits.slice(2):digits;
}
export function planejarLancamento(inicial:string, periodicidade:PeriodicidadeEmenda, parcela:number) {
 if(!competenciaValida(inicial))throw Error("Informe uma competência válida (MM/AAAA).");
 if(!Number.isInteger(parcela)||parcela<1||parcela>9999)
  throw Error("Informe o número da primeira parcela do convênio.");
 const meses=competenciasPrevistas(inicial,periodicidade);
 if(parcela+meses.length-1>9999)throw Error("O intervalo de parcelas ultrapassa o limite permitido.");
 return meses.map((competencia,indice)=>({
  competencia,parcela:parcela+indice,liberacoesPrevistasMinimas:1,
 }));
}
export const ROTULOS_ETAPA={
 dotacao:"1. Dotação e fonte",
 autorizacao:"2. Autorização financeira",
 solicitacao:"3. Solicitação de empenho",
 assinaturas:"4. Assinaturas conferidas",
 ne:"5. Nota de empenho emitida",
} as const;

/** Exibe uma única parcela sem intervalo; não cria faixas para sequências com lacunas. */
export function formatarParcelas(vinculadas:number[]):string {
 const valores=[...new Set(vinculadas.filter(n=>Number.isInteger(n)&&n>0))].sort((a,b)=>a-b);
 if(!valores.length)return "—";
 if(valores.length===1)return String(valores[0]);
 if(valores.every((n,i)=>i===0||n===valores[i-1]+1))
  return valores[0]+" a "+valores[valores.length-1];
 return valores.join(", ");
}
