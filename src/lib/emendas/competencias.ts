import { linkHttpsValido } from "./cadastro";
export type PeriodicidadeEmenda = "mensal"|"trimestral"|"anual";
export const MESES:Record<PeriodicidadeEmenda,number>={mensal:1,trimestral:3,anual:12};
export function competenciaValida(v:string) {
 return /^(0[1-9]|1[0-2])\/20\d{2}$/.test(v);
}
export function competenciasPrevistas(inicial:string,periodicidade:PeriodicidadeEmenda):string[]{
 if(!competenciaValida(inicial))throw Error("Competência inicial inválida (MM/AAAA).");
 const [mes,ano]=inicial.split("/").map(Number);
 return Array.from({length:MESES[periodicidade]},(_,i)=>{
  const data=new Date(Date.UTC(ano,mes-1+i,1));
  return String(data.getUTCMonth()+1).padStart(2,"0")+"/"+data.getUTCFullYear();
 });
}
export function exibirCompetenciaISO(iso:string){
 const [ano,mes]=iso.split("-");
 return mes+"/"+ano;
}
export function resumoSolicitacao(valor:number,valorNE:number|null,status:string){
 return status==="aguardando_ne" ? {reservado:valor,empenhado:0} :
  status==="emitida"||status==="encerrada" ? {reservado:0,empenhado:valorNE??0} :
  {reservado:0,empenhado:0};
}
export function validarSolicitacao(d:{
 competencia:string;periodicidade:PeriodicidadeEmenda;valor:number;
 numeroSEI:string;linkSEI:string;saldo:number;
}):string[]{
 const erros:string[]=[];
 if(!competenciaValida(d.competencia))erros.push("Informe competência MM/AAAA.");
 if(!Number.isFinite(d.valor)||d.valor<=0||Math.round(d.valor*100)/100!==d.valor)
  erros.push("Valor solicitado inválido.");
 if(d.valor>d.saldo+0.001)erros.push("Valor maior que o saldo disponível.");
 if(!d.numeroSEI.trim()||!d.linkSEI.trim()||!linkHttpsValido(d.linkSEI))
  erros.push("Informe número e link HTTPS do SEI da solicitação.");
 return erros;
}
