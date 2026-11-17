/** Quadro financeiro da Etapa 5.
 * Valores do InvestSUS por instituição são preliminares até a conciliação
 * com o valor homologado oficialmente pela Portaria da competência.
 * A anulação estimada NÃO é um aviso de anulação executado.
 */
export type ParticipanteResumoEmpenho = {
  id: string;
  sem_elegiveis?: boolean | null;
  valor_devido?: number | null;
};
export type ObrigacaoResumoEmpenho = {
  id?: string;
  participante_id: string;
  valor_empenhado?: number | null;
  valor_a_liquidar?: number | null;
  valor_aplicado?: number | null;
  alocacao_manual?: boolean;
};
const cents=(n:number|null|undefined)=>Math.round(Number(n??0)*100);
export function resumoEmpenhoPiso(
  valorHomologado: number | null | undefined,
  participantes: ParticipanteResumoEmpenho[],
  obrigacoes: ObrigacaoResumoEmpenho[],
  notasEmitidas?: string[],
  subempenhos?: Array<{obrigacao_id:string;valor?:number|null}>,
) {
  const elegiveis = participantes.filter(p=>!p.sem_elegiveis);
  const valoresCompletos = elegiveis.length>0 &&
    elegiveis.every(p=>p.valor_devido!=null && Number.isFinite(Number(p.valor_devido)));
  const totalInvestsus = valoresCompletos
    ? elegiveis.reduce((s,p)=>s+cents(p.valor_devido),0)/100 : null;
  const homologadoDisponivel = valorHomologado!=null &&
    Number.isFinite(Number(valorHomologado));
  const totalConfere = homologadoDisponivel && totalInvestsus!=null &&
    Math.abs(cents(valorHomologado)-cents(totalInvestsus))<=2;
  const porInstituicao = elegiveis.map(p=>{
    const os = obrigacoes.filter(o=>o.participante_id===p.id);
    const ambiguas = subempenhos === undefined && os.length>1 && os.some(o=>!o.alocacao_manual);
    const emitidas = notasEmitidas ? os.filter(o=>notasEmitidas.includes(o.id ?? "") && o.valor_empenhado != null) : os;
    const empenhado = emitidas
      .map(o=>o.valor_empenhado);
    const valorEmpenhado = !ambiguas && empenhado.some(v=>v!=null)
      ? empenhado.reduce<number>((s,v)=>s+cents(v),0)/100 : null;
    const valorNecessario = p.valor_devido==null ? null : Number(p.valor_devido);
    const explicitas = os.some(o=>o.alocacao_manual) || os.length>1;
    const aplicado = (o: ObrigacaoResumoEmpenho) => {
      const valor = o.alocacao_manual ? o.valor_aplicado : (o.valor_a_liquidar ?? valorNecessario);
      return valor == null || o.valor_empenhado == null ? valor : Math.min(cents(valor), cents(o.valor_empenhado))/100;
    };
    const totalAplicado = !ambiguas && emitidas.some(o=>aplicado(o)!=null) ? emitidas.reduce((s,o)=>s+cents(aplicado(o)),0)/100 : null;
    const saldoAEmpenhar = valorNecessario==null ? null : Math.max(0,cents(valorNecessario)-cents(totalAplicado))/100;
    const totalPlanejado = !ambiguas && os.some(o=>aplicado(o)!=null) ? os.reduce((s,o)=>s+cents(aplicado(o)),0)/100 : null;
    const divergenciaPlanejada = totalPlanejado == null || valorNecessario == null ? null : (cents(totalPlanejado)-cents(valorNecessario))/100;
    const excedentePrevisto = ambiguas || (explicitas && divergenciaPlanejada !== 0) ? null : explicitas ? (emitidas.length && emitidas.every(o=>o.valor_empenhado!=null && aplicado(o)!=null) ? emitidas.reduce((s,o)=>s+Math.max(0,cents(o.valor_empenhado)-cents(aplicado(o))),0)/100 : null) : valorEmpenhado!=null && valorNecessario!=null &&
      Number.isFinite(valorEmpenhado) && Number.isFinite(valorNecessario)
      ? Math.max(0,cents(valorEmpenhado)-cents(valorNecessario))/100 : null;
    if (subempenhos !== undefined) {
      const ids = new Set(emitidas.map(o=>o.id));
      const executado = subempenhos.filter(s=>ids.has(s.obrigacao_id)).reduce((t,s)=>t+cents(s.valor),0)/100;
      return { participanteId:p.id, valorEmpenhado, valorNecessario, excedentePrevisto:null, totalAplicado:executado, saldoAEmpenhar:valorNecessario==null?null:Math.max(0,cents(valorNecessario)-cents(executado))/100, totalPlanejado:null, divergenciaPlanejada:null, valorConfirmado:totalConfere?valorNecessario:null };
    }
    return { participanteId:p.id,valorEmpenhado,valorNecessario,excedentePrevisto,totalAplicado,saldoAEmpenhar,totalPlanejado,divergenciaPlanejada,
      valorConfirmado: totalConfere ? valorNecessario : null };
  });
  return { totalInvestsus, valorHomologado:homologadoDisponivel ? Number(valorHomologado) : null,
    valoresCompletos, totalConfere, porInstituicao,
    totalPrevisto:porInstituicao.some(p=>p.excedentePrevisto==null)
      ? null : porInstituicao.reduce((s,p)=>s+cents(p.excedentePrevisto),0)/100 };
}
