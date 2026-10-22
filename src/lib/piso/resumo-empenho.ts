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
  participante_id: string;
  valor_empenhado?: number | null;
};
const cents=(n:number|null|undefined)=>Math.round(Number(n??0)*100);
export function resumoEmpenhoPiso(
  valorHomologado: number | null | undefined,
  participantes: ParticipanteResumoEmpenho[],
  obrigacoes: ObrigacaoResumoEmpenho[],
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
    const empenhado = obrigacoes.filter(o=>o.participante_id===p.id)
      .map(o=>o.valor_empenhado);
    const valorEmpenhado = empenhado.length===1 && empenhado[0]!=null
      ? Number(empenhado[0]) : null;
    const valorNecessario = p.valor_devido==null ? null : Number(p.valor_devido);
    const excedentePrevisto = valorEmpenhado!=null && valorNecessario!=null &&
      Number.isFinite(valorEmpenhado) && Number.isFinite(valorNecessario)
      ? Math.max(0,cents(valorEmpenhado)-cents(valorNecessario))/100 : null;
    return { participanteId:p.id,valorEmpenhado,valorNecessario,excedentePrevisto,
      valorConfirmado: totalConfere ? valorNecessario : null };
  });
  return { totalInvestsus, valorHomologado:homologadoDisponivel ? Number(valorHomologado) : null,
    valoresCompletos, totalConfere, porInstituicao,
    totalPrevisto:porInstituicao.some(p=>p.excedentePrevisto==null)
      ? null : porInstituicao.reduce((s,p)=>s+cents(p.excedentePrevisto),0)/100 };
}
