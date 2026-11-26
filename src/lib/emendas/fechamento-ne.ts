/** Prévia em centavos do fechamento da NE. A validação definitiva é no PostgreSQL. */
export type DiagnosticoFechamentoNe = {
 valorNe: number;
 anulacoes: number;
 liberacoesLegadas: number;
 compromissosNovos: number;
 distribuido: number;
 pagoLegado: number;
 pagoNovo: number;
 totalCompetencias: number;
 competenciasPendentes: number;
 documentosPendentes: number;
 subempenhosPendentes: number;
 subempenhosNaoConciliados: number;
};

const c=(n:number)=>Math.round(n*100);
const reais=(n:number)=>n/100;
export function diagnosticoFechamentoNe(input:DiagnosticoFechamentoNe){
 const ne=c(input.valorNe);
 const anulado=c(input.anulacoes);
 const lib=c(input.liberacoesLegadas);
 const compromissosNovos=c(input.compromissosNovos);
 const distribuido=c(input.distribuido);
 const conflito=lib>0&&compromissosNovos>0;
 const comprometido=lib>0?lib:compromissosNovos;
 const pago=lib>0?c(input.pagoLegado):c(input.pagoNovo);
 const saldoAnulavel=ne-anulado-Math.max(distribuido,lib,compromissosNovos);
 const saldoParaAnular=ne-anulado-comprometido;
 const saldoPagamentos=comprometido-pago;
 const prontaConciliar=!conflito&&input.totalCompetencias>0&&
  input.competenciasPendentes===0&&input.documentosPendentes===0&&
  input.subempenhosPendentes===0&&input.subempenhosNaoConciliados===0&&
  saldoParaAnular===0&&saldoPagamentos===0&&distribuido<=comprometido;
 return {
  conflito,
  comprometido:reais(comprometido),
  pagoLiquido:reais(pago),
  saldoDisponivelAnular:reais(saldoAnulavel),
  saldoParaAnularNoFechamento:reais(saldoParaAnular),
  saldoPagamentosPendente:reais(saldoPagamentos),
  precisaReduzirDistribuicao:saldoParaAnular>saldoAnulavel,
  prontaConciliar,
 };
}

/** Uma emenda não fica conciliada apenas porque uma de suas NEs encerrou. */
export function consolidarSituacaoEmenda(
 nes:{conciliada:boolean;saldoParaAnular:number;saldoPagar:number}[],
 lancamentosSemNe=0,
){
 const total=nes.length;
 const encerradas=nes.filter(n=>n.conciliada).length;
 return {
  totalNes:total,
  nesConciliadas:encerradas,
  nesPendentes:total-encerradas,
  lancamentosSemNe,
  totalmenteConciliada:total>0&&encerradas===total&&lancamentosSemNe===0,
  saldoParaAnular:reais(nes.reduce((a,n)=>a+c(n.saldoParaAnular),0)),
  saldoPagamentos:reais(nes.reduce((a,n)=>a+c(n.saldoPagar),0)),
 };
}
