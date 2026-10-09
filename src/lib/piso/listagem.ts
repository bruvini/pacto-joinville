import { etapaAtualPiso } from "./etapas";
import { identidadeParcelaPiso } from "./parcelas";

export type ObrigacaoResumoPiso = {
  id: string;
  data_pagamento: string | null;
  valor_pago: number | null;
};

export type ParticipanteResumoPiso = {
  id: string;
  prestador_id: string;
  situacao: string;
  sem_elegiveis: boolean;
  valor_devido: number | null;
  data_retorno: string | null;
  piso_obrigacoes?: ObrigacaoResumoPiso[] | null;
};

export type ProcessoResumoPiso = {
  id: string;
  competencia: string;
  tipo_parcela?: "mensal" | "decimo_terceiro" | null;
  exercicio_referencia?: number | null;
  status: string;
  etapas_concluidas?: Record<string, boolean> | null;
  etapas_reconferir?: number[] | null;
  valor_homologado: number | null;
  valor_transferido: number | null;
  credito_fms_valor: number | null;
  justificativa_credito?: string | null;
  total_publicado_municipal?: number | null;
  investsus_auditoria?: { origem?: string | null; alertas?: unknown[] | null } | null;
  investsus_resumo?: { origem_calculo?: string | null; soma_valores_anexo?: number | string | null } | null;
  piso_participantes?: ParticipanteResumoPiso[] | null;
};

export type CodigoAtencaoPiso =
  | "reconferencia" | "sem_homologacao" | "transferencia_pendente"
  | "credito_pendente" | "credito_divergente"
  | "obrigacao_pendente" | "pagamento_pendente" | "pagamento_divergente"
  | "retorno_pendente" | "documentacao_historica" | "divergencia_portaria" | "nenhum";

export type ResumoListagemPiso = {
  grupo: number;
  historicoDocumental: boolean;
  diferencaPortaria: number | null;
  instituicoes: number;
  elegiveis: number;
  aguardamRetorno: number;
  pagamentosRegistrados: number;
  valorPago: number;
  valorPrevisto: number | null;
  codigoAtencao: CodigoAtencaoPiso;
  sinais: CodigoAtencaoPiso[];
  atencao: string;
  exigeAtencao: boolean;
};

/**
 * Importações históricas possuem documentos/valores transcritos do SEI,
 * mas NÃO representam comprovação das etapas 1/2, assinatura ou pagamento.
 * Exibição separada evita confundir dado documental com conclusão formal.
 */
export function possuiOrigemDocumentalPiso(c: ProcessoResumoPiso): boolean {
  return c.tipo_parcela !== "decimo_terceiro" && (
    c.investsus_auditoria?.origem === "migracao_documental_2026" ||
    c.investsus_resumo?.origem_calculo ===
      "importacao_documental_portaria_municipal_sem_investsus_original"
  );
}

export function historicoPendentePiso(c: ProcessoResumoPiso): boolean {
  return possuiOrigemDocumentalPiso(c) && grupoProcessoPiso(c) === 1;
}

/** Grupo 9 é encerramento em elaboração; 10 é processo de fato encerrado. */
export function grupoProcessoPiso(processo: Pick<ProcessoResumoPiso, "status" | "etapas_concluidas">): number {
  return processo.status === "encerrada" ? 10 : etapaAtualPiso(processo.etapas_concluidas, (processo as ProcessoResumoPiso).tipo_parcela);
}

export function resumoListagemPiso(c: ProcessoResumoPiso): ResumoListagemPiso {
  const grupo = grupoProcessoPiso(c);
  const historicoDocumental = historicoPendentePiso(c);
  const valorAnexo = c.investsus_resumo?.soma_valores_anexo;
  const diferencaPortaria =
    historicoDocumental && c.total_publicado_municipal != null &&
    valorAnexo != null && Number.isFinite(Number(valorAnexo))
      ? Math.round((Number(c.total_publicado_municipal) - Number(valorAnexo)) * 100) / 100
      : null;
  const partes = c.piso_participantes ?? [];
  const elegiveis = partes.filter(p => !p.sem_elegiveis);
  const aguardamRetorno = c.tipo_parcela === "decimo_terceiro" ? 0 :
    partes.filter(p => !p.sem_elegiveis && !p.data_retorno &&
      (p.situacao === "aguardando_envio" || p.situacao === "enviado")).length;
  const valoresInformados = elegiveis.every(p => p.valor_devido != null);
  const valorPrevisto = elegiveis.length > 0 && valoresInformados
    ? elegiveis.reduce((t, p) => t + Number(p.valor_devido ?? 0), 0) : null;

  let pagamentosRegistrados = 0;
  let valorPago = 0;
  let pagamentosDivergentes = 0;
  let semObrigacao = 0;
  for (const p of elegiveis) {
    const obrigacoes = p.piso_obrigacoes ?? [];
    if (!obrigacoes.length) semObrigacao++;
    const pagos = obrigacoes.filter(o => Boolean(o.data_pagamento) && o.valor_pago != null);
    if (pagos.length) {
      pagamentosRegistrados++;
      const pago = pagos.reduce((t, o) => t + Number(o.valor_pago ?? 0), 0);
      valorPago += pago;
      if (p.valor_devido != null && Math.abs(pago - Number(p.valor_devido)) > 0.02)
        pagamentosDivergentes++;
    }
  }

  const reconferir = c.etapas_reconferir?.length ?? 0;
  // Os filtros consideram todos os sinais do processo; a coluna apresenta
  // apenas o principal para permanecer legível.
  const sinais: CodigoAtencaoPiso[] = [];
  if (reconferir) sinais.push("reconferencia");
  if (grupo !== 10) {
    if (historicoDocumental) sinais.push("documentacao_historica");
    if (diferencaPortaria != null && Math.abs(diferencaPortaria) > 0.02)
      sinais.push("divergencia_portaria");
    if (grupo === 1 && aguardamRetorno > 0 && !historicoDocumental)
      sinais.push("retorno_pendente");
    if (grupo >= 2 && c.valor_homologado == null) sinais.push("sem_homologacao");
    if (grupo >= 3 && c.valor_transferido == null) sinais.push("transferencia_pendente");
    if (grupo >= 4 && c.valor_transferido != null && c.credito_fms_valor == null)
      sinais.push("credito_pendente");
    if (grupo >= 4 && c.credito_fms_valor != null && c.valor_transferido != null &&
      Math.abs(Number(c.credito_fms_valor) - Number(c.valor_transferido)) > 0.02 &&
      !c.justificativa_credito?.trim()) sinais.push("credito_divergente");
    if (grupo >= 5 && semObrigacao > 0) sinais.push("obrigacao_pendente");
    if (grupo >= 7 && pagamentosDivergentes > 0) sinais.push("pagamento_divergente");
    if (grupo >= 7 && elegiveis.length > pagamentosRegistrados) sinais.push("pagamento_pendente");
  }
  let codigoAtencao: CodigoAtencaoPiso = "nenhum";
  let atencao = "Conferir detalhes do processo";
  if (reconferir > 0) {
    codigoAtencao = "reconferencia";
    atencao = `${reconferir} etapa${reconferir === 1 ? "" : "s"} para reconferir`;
  } else if (grupo === 10) {
    atencao = "Processo encerrado";
  } else if (historicoDocumental && diferencaPortaria != null &&
    Math.abs(diferencaPortaria) > 0.02) {
    codigoAtencao = "divergencia_portaria";
    atencao = "Divergência entre total impresso e valores por CNES";
  } else if (historicoDocumental) {
    codigoAtencao = "documentacao_historica";
    atencao = "Conferir etapas 1 e 2; documentos financeiros importados";
  } else if (grupo === 1 && aguardamRetorno > 0) {
    codigoAtencao = "retorno_pendente";
    atencao = `${aguardamRetorno} instituição${aguardamRetorno === 1 ? "" : "ões"} sem retorno`;
  } else if (grupo >= 2 && c.valor_homologado == null) {
    codigoAtencao = "sem_homologacao";
    atencao = "Homologação não registrada";
  } else if (grupo >= 3 && c.valor_transferido == null) {
    codigoAtencao = "transferencia_pendente";
    atencao = "Transferência não registrada";
  } else if (grupo >= 4 && c.valor_transferido != null && c.credito_fms_valor == null) {
    codigoAtencao = "credito_pendente";
    atencao = "Crédito no FMS não registrado";
  } else if (grupo >= 4 && c.credito_fms_valor != null && c.valor_transferido != null &&
    Math.abs(Number(c.credito_fms_valor) - Number(c.valor_transferido)) > 0.02 &&
    !c.justificativa_credito?.trim()) {
    codigoAtencao = "credito_divergente";
    atencao = "Conferir divergência no crédito FMS";
  } else if (grupo >= 5 && semObrigacao > 0) {
    codigoAtencao = "obrigacao_pendente";
    atencao = `${semObrigacao} instituição${semObrigacao === 1 ? "" : "ões"} sem obrigação`;
  } else if (grupo >= 7 && pagamentosDivergentes > 0) {
    codigoAtencao = "pagamento_divergente";
    atencao = `${pagamentosDivergentes} pagamento${pagamentosDivergentes === 1 ? "" : "s"} com valor diferente`;
  } else if (grupo >= 7 && elegiveis.length > pagamentosRegistrados) {
    const falta = elegiveis.length - pagamentosRegistrados;
    codigoAtencao = "pagamento_pendente";
    atencao = `${falta} instituição${falta === 1 ? "" : "ões"} sem pagamento registrado`;
  }

  return {
    grupo, historicoDocumental, diferencaPortaria,
    instituicoes: partes.length, elegiveis: elegiveis.length,
    aguardamRetorno, pagamentosRegistrados, valorPago, valorPrevisto,
    codigoAtencao, sinais, atencao,
    exigeAtencao: sinais.length > 0,
  };
}

export type FiltrosListagemPiso = {
  texto: string;
  tipo: string;
  exercicio: string;
  etapa: string;
  prestador: string;
  atencao: string;
};

export function filtrarProcessosPiso<T extends ProcessoResumoPiso>(
  processos: T[],
  filtros: FiltrosListagemPiso,
  nomesPrestadores: Record<string, string> = {},
): T[] {
  const normalizar = (texto: string) => texto.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const busca = normalizar(filtros.texto.trim());
  return processos.filter(c => {
    const tipo = identidadeParcelaPiso({ ...c, tipo_parcela: c.tipo_parcela ?? undefined, exercicio_referencia: c.exercicio_referencia ?? undefined }).tipo_parcela;
    const resumo = resumoListagemPiso(c);
    if (filtros.tipo !== "todos" && filtros.tipo !== tipo) return false;
    if (filtros.exercicio !== "todos" &&
      String(c.exercicio_referencia ?? c.competencia.slice(-4)) !== filtros.exercicio) return false;
    if (filtros.etapa === "historico" && !resumo.historicoDocumental) return false;
    if (filtros.etapa !== "todos" && filtros.etapa !== "historico" &&
      String(resumo.grupo) !== filtros.etapa) return false;
    if (filtros.prestador !== "todos" &&
      !(c.piso_participantes ?? []).some(p => p.prestador_id === filtros.prestador)) return false;
    if (filtros.atencao === "reconferencia" && resumo.codigoAtencao !== "reconferencia") return false;
    if (filtros.atencao === "pendencias" && !resumo.exigeAtencao) return false;
    if (filtros.atencao === "sem_alerta" && resumo.exigeAtencao) return false;
    if (filtros.atencao === "pagamentos" &&
      !resumo.sinais.some(s => s === "pagamento_pendente" || s === "pagamento_divergente")) return false;
    if (filtros.atencao === "credito" &&
      !resumo.sinais.some(s => s === "credito_pendente" || s === "credito_divergente")) return false;
    if (busca && ![
      c.competencia,
      tipo === "decimo_terceiro" ? `13ª décimo terceiro ${c.exercicio_referencia}` : "mensal",
      ...(c.piso_participantes ?? []).map(p => nomesPrestadores[p.prestador_id] ?? ""),
    ].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(busca)) return false;
    return true;
  }).sort((a, b) => {
    // Históricos pendentes aparecem em bloco próprio, sem falsificar etapa.
    const ha = historicoPendentePiso(a), hb = historicoPendentePiso(b);
    if (ha !== hb) return ha ? -1 : 1;
    const ga = grupoProcessoPiso(a), gb = grupoProcessoPiso(b);
    if (ga !== gb) return ga - gb;
    // Reconferências no topo do grupo, depois processos mais recentes.
    const ar = (a.etapas_reconferir?.length ?? 0) > 0 ? 1 : 0;
    const br = (b.etapas_reconferir?.length ?? 0) > 0 ? 1 : 0;
    if (ar !== br) return br - ar;
    const ordem = (c: string) => {
      const [mes, ano] = c.split("/").map(Number);
      return ano * 12 + mes;
    };
    return ordem(b.competencia) - ordem(a.competencia);
  });
}
