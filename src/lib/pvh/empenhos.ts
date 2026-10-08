import { linkValido } from "@/lib/sei";

export type SlotSolicitacaoEmpenhoPvh = {
  key: string;
  label: string;
  cargos: string[];
  manual?: boolean;
  cargoManual?: string;
};

export const SLOTS_SOLICITACAO_EMPENHO_PVH: SlotSolicitacaoEmpenhoPvh[] = [
  {
    key: "coord_orc",
    label: "Coordenador de Orçamentos",
    cargos: ["Coordenador de Orçamentos"],
  },
  {
    key: "fiscal",
    label: "Fiscal",
    cargos: ["Fiscal"],
  },
  {
    key: "gestao",
    label: "Gerente ou Coordenador",
    cargos: ["Gerente", "Coordenador ACP", "Coordenador"],
  },
  {
    key: "diretor_servicos_complementares",
    label: "Diretor de Serviços Complementares",
    cargos: ["Diretor de Serviços Complementares"],
  },
  {
    key: "comissao",
    label: "Membro da Comissão de Gestão e Controle de Despesa",
    cargos: [],
    manual: true,
    cargoManual: "Membro da Comissão de Gestão e Controle de Despesa",
  },
  {
    key: "diretor_financeiro",
    label: "Diretor Financeiro",
    cargos: ["Diretor Financeiro", "Diretoria Financeira"],
  },
];

export function normalizarNumeroNePvh(valor: string, ano: number) {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return "";

  const jaFormatado = bruto.match(/(\d{1,8})\s*\/\s*(\d{4})/);
  if (jaFormatado) return `${jaFormatado[1]}/${jaFormatado[2]}`;

  const somenteNumero = bruto.replace(/\D/g, "");
  if (!somenteNumero) return bruto;
  return `${somenteNumero}/${ano}`;
}

export function numeroNeValidoPvh(valor: string, ano?: number) {
  const match = String(valor ?? "").trim().match(/^(\d{1,8})\/(\d{4})$/);
  if (!match) return false;
  return ano ? Number(match[2]) === ano : true;
}

export function solicitacaoEmpenhoProntaPvh(dados: {
  solicitacao_sei_numero?: string | null;
  solicitacao_sei_link?: string | null;
  solicitacao_data?: string | null;
  cr_dotacao?: string | null;
  fonte_recurso?: string | null;
}) {
  return Boolean(
    dados.solicitacao_sei_numero?.trim() &&
      dados.solicitacao_data &&
      dados.cr_dotacao?.trim() &&
      dados.fonte_recurso?.trim() &&
      linkValido(dados.solicitacao_sei_link),
  );
}

export function assinaturasSolicitacaoEmpenhoCompletasPvh(
  assinaturas: Array<{
    slot?: string | null;
    revogado_em?: string | null;
  }>,
) {
  return SLOTS_SOLICITACAO_EMPENHO_PVH.every((slot) =>
    assinaturas.some(
      (assinatura) =>
        assinatura.slot === slot.key &&
        !assinatura.revogado_em,
    ),
  );
}

export function notaEmpenhoProntaPvh(
  dados: {
    numero_ne?: string | null;
    valor_total?: number | null;
    nota_empenho_sei_numero?: string | null;
    nota_empenho_sei_link?: string | null;
  },
  ano?: number,
) {
  return Boolean(
    numeroNeValidoPvh(String(dados.numero_ne ?? ""), ano) &&
      Number(dados.valor_total ?? 0) > 0 &&
      dados.nota_empenho_sei_numero?.trim() &&
      linkValido(dados.nota_empenho_sei_link),
  );
}


export type EmpenhoComAlocacoesPvh = {
  id: string;
  prestador_id?: string | null;
  solicitacao_competencia_id?: string | null;
  status?: string | null;
  numero_ne?: string | null;
  valor_total?: number | null;
  pvh_empenho_alocacoes?: Array<{
    id?: string;
    participante_id?: string | null;
    valor_alocado?: number | null;
  }> | null;
};

export function totalAlocadoEmpenhoPvh(empenho: EmpenhoComAlocacoesPvh) {
  return (empenho.pvh_empenho_alocacoes ?? []).reduce(
    (soma, alocacao) => soma + Number(alocacao.valor_alocado ?? 0),
    0,
  );
}

export function saldoDisponivelEmpenhoPvh(empenho: EmpenhoComAlocacoesPvh) {
  return Math.max(
    0,
    Number(empenho.valor_total ?? 0) - totalAlocadoEmpenhoPvh(empenho),
  );
}

/**
 * Um empenho pertence visualmente à competência quando:
 * - a Solicitação de NE nasceu nela; ou
 * - a NE, criada em competência anterior, foi efetivamente alocada ao participante atual.
 *
 * Isso evita exibir NEs globais do mesmo prestador como se já tivessem sido
 * lançadas na competência que o usuário acabou de abrir.
 */
export function empenhoRelacionadoCompetenciaPvh(
  empenho: EmpenhoComAlocacoesPvh,
  competenciaId: string,
  participanteId: string,
) {
  return (
    empenho.solicitacao_competencia_id === competenciaId ||
    (empenho.pvh_empenho_alocacoes ?? []).some(
      (alocacao) => alocacao.participante_id === participanteId,
    )
  );
}

export function empenhoDisponivelParaReaproveitamentoPvh(
  empenho: EmpenhoComAlocacoesPvh,
  competenciaId: string,
  participanteId: string,
) {
  return (
    !empenhoRelacionadoCompetenciaPvh(
      empenho,
      competenciaId,
      participanteId,
    ) &&
    empenho.status === "ativo" &&
    Boolean(empenho.numero_ne) &&
    Number(empenho.valor_total ?? 0) > 0 &&
    saldoDisponivelEmpenhoPvh(empenho) > 0.009
  );
}

export function empenhoOrfaoSemUsoPvh(empenho: EmpenhoComAlocacoesPvh) {
  return (
    !empenho.solicitacao_competencia_id &&
    (empenho.pvh_empenho_alocacoes ?? []).length === 0
  );
}
