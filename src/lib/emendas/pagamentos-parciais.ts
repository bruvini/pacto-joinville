/** Projeção em centavos para conferência de UX; o PostgreSQL é a autoridade de gravação. */
export type ParcelaFinanceiraEmenda={
 programadoAtual:number;
 pagoBruto:number;
 devolvido:number;
 estornado:number;
};
const centavos=(x:number)=>Math.round(x*100);
const moeda=(x:number)=>x/100;

/** Programação não é pagamento; ajustes reduzem apenas o valor pago líquido. */
export function resumoFinanceiroParcelasEmenda(
 valorSubempenhado:number,parcelas:ParcelaFinanceiraEmenda[],
){
 const programado=parcelas.reduce((n,p)=>n+centavos(p.programadoAtual),0);
 const bruto=parcelas.reduce((n,p)=>n+centavos(p.pagoBruto),0);
 const devolvido=parcelas.reduce((n,p)=>n+centavos(p.devolvido),0);
 const estornado=parcelas.reduce((n,p)=>n+centavos(p.estornado),0);
 const liquido=bruto-devolvido-estornado;
 const valor=centavos(valorSubempenhado);
 return {
  programado:moeda(programado),
  pagoBruto:moeda(bruto),
  devolvido:moeda(devolvido),
  estornado:moeda(estornado),
  pagoLiquido:moeda(liquido),
  saldoAProgramar:moeda(valor-programado),
  saldoAPagar:moeda(valor-liquido),
  saldoZerado:liquido===valor,
 };
}
