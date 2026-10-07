import { linkValido } from "./sei";

/** Status do orçamento (UFI) efetivo — derivado dos dados, com bumps automáticos. Campo legado: status_aco. */
export function statusAcoEfetivo(l: any): string {
  if (l.numero_empenho && linkValido(l.link_empenho_sei)) return "empenhado";
  if (l.dotacao_orcamentaria && l.fonte_pagamento) return "orcamento_disponivel";
  return l.status_aco || "aguardando_indicacao";
}

/** Rótulo da etapa atual, derivado dos dados (coarse, para listas/dashboard).
 *  Retorna a ÚLTIMA etapa que possui pelo menos um dado preenchido —
 *  funciona também no Modo Retroativo, sem depender da sequência estar completa.
 *
 *  Precedência Etapa 6 × Etapa 7: só saltamos para "Anulação de Empenho"
 *  quando todos os subpassos observáveis da Etapa 6 (relatório técnico,
 *  certidões, atestado, solicitação de liberação, envio à SEFAZ e
 *  acompanhamento com data de pagamento) estiverem preenchidos. Enquanto
 *  qualquer subpasso da 6 estiver pendente, o processo permanece rotulado
 *  como "Liberação de Recurso" — mesmo que o operador já tenha adiantado
 *  o link da Solicitação de Anulação. */
export function etapaCorrenteLabel(l: any): string {
  if (l.concluido) return "Concluído";

  // Fluxo 2 (Liquidação Direta): sem etapa de anulação. A Etapa 6 é a
  // "Liquidação de Despesa" e é a última fase antes da conclusão.
  const fluxo2 = l.convenios?.modelo_fluxo === "fluxo_2" || l.modelo_fluxo === "fluxo_2";
  if (fluxo2) {
    if (
      linkValido(l.link_minuta_sei) || linkValido(l.link_memorando_sei) ||
      linkValido(l.link_portaria_sei) || linkValido(l.link_solicitacao_liquidacao_sei) ||
      Number(l.valor_liquidado ?? 0) > 0 || linkValido(l.link_aviso_liquidacao_sei) ||
      linkValido(l.link_subempenho_sei) || linkValido(l.link_programacao_pagamento_sei) ||
      linkValido(l.link_comprovante_pagamento_sei) || l.data_pagamento
    ) return "Liquidação de Despesa";
    if (l.numero_empenho || linkValido(l.link_empenho_sei)) return "Liberação de Orçamento";
    if (l.sefaz_etapa1_em) return "Assinaturas e Envio";
    if (l.dotacao_orcamentaria || l.fonte_pagamento) return "Análise de Orçamento";
    return "Solicitação de Empenho";
  }

  const etapa6Completa =
    linkValido(l.link_relatorio_tecnico_sei) &&
    linkValido(l.link_certidoes_sei) &&
    Number(l.valor_atestado ?? 0) > 0 &&
    linkValido(l.link_solicitacao_liberacao_sei) &&
    !!l.sefaz_etapa4_em &&
    linkValido(l.link_subempenho_sei) &&
    linkValido(l.link_programacao_pagamento_sei) &&
    linkValido(l.link_comprovante_pagamento_sei) &&
    !!l.data_pagamento;

  if (etapa6Completa && (l.link_solicitacao_anulacao || l.link_anulacao_sei || l.sefaz_etapa5_em)) {
    return "Anulação de Empenho";
  }
  if (
    Number(l.valor_atestado ?? 0) > 0 ||
    l.sefaz_etapa4_em ||
    l.link_relatorio_tecnico_sei ||
    l.link_relatorio_analise_sei ||
    l.link_certidoes_sei ||
    l.link_solicitacao_liberacao_sei ||
    l.link_subempenho_sei ||
    l.link_programacao_pagamento_sei ||
    l.link_comprovante_pagamento_sei ||
    l.data_pagamento ||
    l.link_solicitacao_anulacao ||
    l.link_anulacao_sei ||
    l.sefaz_etapa5_em
  ) return "Liberação de Recurso";
  if (l.numero_empenho || linkValido(l.link_empenho_sei)) return "Liberação de Orçamento";
  if (l.sefaz_etapa1_em) return "Assinaturas e Envio";
  if (l.dotacao_orcamentaria || l.fonte_pagamento) return "Análise de Orçamento";
  return "Solicitação de Empenho";
}

/** Versão explícita para uso no Modo Retroativo — hoje idêntica à `etapaCorrenteLabel`,
 *  mantida como API estável para chamadas condicionadas a `sistema_config.modo_retroativo`. */
export function etapaCorrenteLabelRetro(l: any): string {
  return etapaCorrenteLabel(l);
}

export const ETAPA_LABELS = [
  "Solicitação de Empenho",
  "Análise de Orçamento",
  "Assinaturas e Envio",
  "Liberação de Orçamento",
  "Liberação de Recurso",
  "Anulação de Empenho",
  "Concluído",
];

/** Ordem canônica das colunas da Esteira do Processo (Dashboard). */
export const ETAPA_PIPELINE: { slug: string; label: string; curto: string }[] = [
  { slug: "solicitacao",       label: "Solicitação de Empenho",   curto: "Solicitação" },
  { slug: "analise_orcamento", label: "Análise de Orçamento",     curto: "Análise" },
  { slug: "assinaturas",       label: "Assinaturas e Envio",      curto: "Assinaturas" },
  { slug: "liberacao_orc",     label: "Liberação de Orçamento",   curto: "Lib. Orçamento" },
  { slug: "liberacao_rec",     label: "Liberação de Recurso",     curto: "Lib. Recurso" },
  { slug: "anulacao",          label: "Anulação de Empenho",      curto: "Anulação" },
  { slug: "concluido",         label: "Concluído",                curto: "Concluídos" },
];


// =====================================================================
// AGRUPAMENTO POR ETAPA (usado na tabela de Lançamentos E na Esteira do
// Painel — fonte única de verdade para as contagens por etapa).
// =====================================================================
export const ETAPAS_AGRUPAMENTO = [
  "Análise de Orçamento",
  "Solicitação",
  "Revisão",
  "Liberação de Orçamento",
  "Liberação de Recurso",
  "Anulação",
  "Concluídos",
] as const;
export type GrupoEtapa = typeof ETAPAS_AGRUPAMENTO[number];

/**
 * Grupo de etapa de um lançamento, classificado pela PRÓXIMA etapa a executar
 * (o processo aparece no grupo da etapa que ele está prestes a fazer).
 * A Etapa 4 (Assinaturas e Envio) não tem grupo próprio — pertence à Etapa Mãe
 * "Solicitação". A Anulação (Etapa 7) nunca se aplica a competência filha.
 */
export function getEtapaAgrupamento(l: any): GrupoEtapa {
  if (l.concluido) return "Concluídos";
  const solic = Number(l.valor_solicitado ?? 0);
  const atest = Number(l.valor_atestado ?? 0);

  // Revisão negada volta para correção, mas é exibida no grupo "Revisão"
  // (é o desfecho a tratar antes de reenviar a solicitação).
  if (l.revisao_status === "negado") return "Revisão";

  // Marcos de CONCLUSÃO de cada etapa (a próxima etapa é o 1º marco não atingido).
  const e1 = !!l.dotacao_orcamentaria && !!l.fonte_pagamento;       // 1 · Análise de Orçamento
  const e2 = !!l.em_bloco_revisao;                                  // 2 · Solicitação (posta em bloco)
  const e3 = l.revisao_status === "aprovado";                      // 3 · Revisão aprovada
  const e4 = !!l.sefaz_etapa1_em;                                  // 4 · Assinaturas e envio à SEFAZ
  const e5 = !!l.numero_empenho || linkValido(l.link_empenho_sei); // 5 · Empenho gerado
  const e6 = !!l.data_pagamento || linkValido(l.link_comprovante_pagamento_sei); // 6 · Pagamento efetuado

  if (!e1) return "Análise de Orçamento";   // executando a Etapa 1
  if (!e2) return "Solicitação";            // executando a Etapa 2
  if (!e3) return "Revisão";                // executando a Etapa 3 (em revisão)
  if (!e4) return "Solicitação";            // executando a Etapa 4 (Assinaturas — dentro de Solicitação)
  if (!e5) return "Liberação de Orçamento"; // executando a Etapa 5
  if (!e6) return "Liberação de Recurso";   // executando a Etapa 6

  // Etapa 6 concluída (pago): se sobrou saldo a anular, próxima é a Etapa 7
  // (Anulação) — só para avulso/pai; filhos nunca anulam individualmente.
  if (!l.parent_id && atest > 0 && solic > atest) return "Anulação";
  return "Liberação de Recurso"; // pago, sem saldo a anular — aguardando conclusão
}

/**
 * Grupos de etapa "efetivos" de um processo, na visão da tabela/esteira:
 *  - avulso (sem filhos): o próprio grupo.
 *  - pai (com filhos): um grupo por competência filha (distribuição), pois o pai
 *    aparece em cada grupo onde tenha ≥1 filho.
 */
export function gruposEtapaProcesso(l: any, todos: any[]): GrupoEtapa[] {
  if (l.parent_id) return []; // filhos não contam como processo próprio
  const kids = todos.filter((c) => c.parent_id === l.id);
  if (kids.length === 0) return [getEtapaAgrupamento(l)];
  return Array.from(new Set(kids.map((c) => getEtapaAgrupamento(c))));
}

/** Primeira competência (MM/AAAA) do lançamento como {mes, ano}. */
export function primeiraCompetencia(comp: string | null): { mes: number; ano: number } | null {
  const m = (comp ?? "").split(",")[0].trim().match(/(\d{2})\/(\d{4})/);
  return m ? { mes: Number(m[1]), ano: Number(m[2]) } : null;
}

// =====================================================================
// CRONÔMETROS DESACOPLADOS POR FASE
//
// Regra temporal parametrizada pelo convênio:
//   prazo_atesto_meses = 1 (padrão)
//     M-1 abre/prepara → M fecha empenho → M+1 atesta/envia à SEFAZ
//     → M+2 item 7 até o 5º dia útil e anulação até o fim do mês.
//
//   prazo_atesto_meses = 2 (prazo diferenciado / encontro de contas)
//     M-1 abre/prepara → M+1 fecha empenho → M+2 atesta/envia à SEFAZ
//     → M+3 item 7 até o 5º dia útil e anulação até o fim do mês.
//
// A defasagem pertence ao cadastro do convênio. Nenhuma regra depende do nome
// do objeto (ex.: "Cirurgias Eletivas"), evitando exceções escondidas.
// =====================================================================

const empenhoConcluido = (l: any) =>
  !!l.numero_empenho && linkValido(l.link_empenho_sei);

const envioSefazEtapa6Concluido = (l: any) => !!l.sefaz_etapa4_em;

const acompanhamentoEtapa6Concluido = (l: any) =>
  linkValido(l.link_subempenho_sei) &&
  linkValido(l.link_programacao_pagamento_sei) &&
  linkValido(l.link_comprovante_pagamento_sei) &&
  !!l.data_pagamento;

const etapa6Concluida = (l: any) =>
  !!l.concluido || acompanhamentoEtapa6Concluido(l);

const precisaAnular = (l: any) =>
  Number(l.valor_solicitado ?? 0) > 0 &&
  Number(l.valor_atestado ?? 0) > 0 &&
  Number(l.valor_solicitado) > Number(l.valor_atestado);

const anulacaoConcluida = (l: any) => linkValido(l.link_anulacao_sei);

const soData = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

const diasCorridos = (de: Date, ate: Date) =>
  Math.floor((soData(ate).getTime() - soData(de).getTime()) / 86400000);

const fimDoMes = (ano: number, mes: number) => new Date(ano, mes, 0);
const idxMes = (ano: number, mes: number) => ano * 12 + (mes - 1);
const nomeMesAno = (ano: number, mes: number) =>
  `${String(mes).padStart(2, "0")}/${ano}`;

const mesDoIndice = (indice: number) => ({
  ano: Math.floor(indice / 12),
  mes: (indice % 12) + 1,
});

const fimDoMesIndice = (indice: number) => {
  const { ano, mes } = mesDoIndice(indice);
  return fimDoMes(ano, mes);
};

const primeiroDiaMesIndice = (indice: number) => {
  const { ano, mes } = mesDoIndice(indice);
  return new Date(ano, mes - 1, 1);
};

/**
 * Quantos meses após a competência a produção pode ser atestada.
 * 1 = fluxo padrão (M+1); 2 = fluxo diferenciado (M+2).
 *
 * O banco aceita valores futuros até 6 meses, mas a interface atual expõe
 * somente as modalidades M+1 e M+2.
 */
export function prazoAtestoMeses(convenio: any): number {
  const valor = Number(convenio?.prazo_atesto_meses ?? 1);
  if (!Number.isInteger(valor) || valor < 1 || valor > 6) return 1;
  return valor;
}

export type CalendarioPrazoCompetencia = {
  competencia: string;
  defasagemAtesto: number;
  mesAbertura: string;
  mesPreparacaoFinal: string;
  mesAtesto: string;
  mesAcompanhamento: string;
  prazoPreparacao: Date;
  prazoEnvioSefaz: Date;
  prazoAcompanhamento: Date;
  prazoAnulacao: Date;
};

/** Calendário derivado da competência + regra de prazo do convênio. */
export function calendarioPrazoCompetencia(
  competencia: string | null,
  convenio: any,
): CalendarioPrazoCompetencia | null {
  const c = primeiraCompetencia(competencia);
  if (!c) return null;

  const base = idxMes(c.ano, c.mes);
  const defasagem = prazoAtestoMeses(convenio);
  const idxAbertura = base - 1;
  const idxPreparacao = base + defasagem - 1;
  const idxAtesto = base + defasagem;
  const idxAcompanhamento = idxAtesto + 1;

  const abertura = mesDoIndice(idxAbertura);
  const preparacao = mesDoIndice(idxPreparacao);
  const atesto = mesDoIndice(idxAtesto);
  const acompanhamento = mesDoIndice(idxAcompanhamento);

  return {
    competencia: nomeMesAno(c.ano, c.mes),
    defasagemAtesto: defasagem,
    mesAbertura: nomeMesAno(abertura.ano, abertura.mes),
    mesPreparacaoFinal: nomeMesAno(preparacao.ano, preparacao.mes),
    mesAtesto: nomeMesAno(atesto.ano, atesto.mes),
    mesAcompanhamento: nomeMesAno(acompanhamento.ano, acompanhamento.mes),
    prazoPreparacao: fimDoMesIndice(idxPreparacao),
    prazoEnvioSefaz: fimDoMesIndice(idxAtesto),
    prazoAcompanhamento: nthDiaUtil(
      acompanhamento.ano,
      acompanhamento.mes,
      5,
    ),
    prazoAnulacao: fimDoMesIndice(idxAcompanhamento),
  };
}

/** N-ésimo dia útil (segunda a sexta; sem feriados) de um mês (mes 1-12). */
export function nthDiaUtil(ano: number, mes: number, n: number): Date {
  const d = new Date(ano, mes - 1, 1);
  let uteis = 0;
  while (d.getMonth() === mes - 1) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) {
      uteis += 1;
      if (uteis === n) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }
  return fimDoMes(ano, mes);
}

/** Etapa vigente (1–5) da fase de empenho + rótulo, derivada dos campos. */
export function etapaEmpenhoAtual(l: any): { num: number; nome: string } {
  if (!l.dotacao_orcamentaria || !l.fonte_pagamento)
    return { num: 1, nome: "Análise de Orçamento" };
  if (
    !(Number(l.valor_solicitado ?? 0) > 0) ||
    !linkValido(l.link_solicitacao_sei) ||
    !l.em_bloco_revisao
  )
    return { num: 2, nome: "Solicitação de Empenho" };
  if (l.revisao_status !== "aprovado")
    return { num: 3, nome: "Revisão da Coordenação" };
  if (!l.sefaz_etapa1_em)
    return { num: 4, nome: "Assinaturas e Envio" };
  return { num: 5, nome: "Liberação de Orçamento (Empenho)" };
}

export type FasePrazo = "empenho" | "pagamento" | "anulacao" | "concluido";
export type NivelPrazo =
  | "ok"
  | "preventivo"
  | "alerta"
  | "critico"
  | "neutro";

export type StatusPrazo = {
  fase: FasePrazo;
  nivel: NivelPrazo;
  prazo: Date | null;
  dias: number | null;
  motivo: string;
};

function statusPorFimDeMes({
  fase,
  hoje,
  indiceMesPrazo,
  motivoPreventivo,
  motivoAlerta,
  motivoCritico,
}: {
  fase: FasePrazo;
  hoje: Date;
  indiceMesPrazo: number;
  motivoPreventivo: string;
  motivoAlerta: string;
  motivoCritico: string;
}): StatusPrazo {
  const prazo = fimDoMesIndice(indiceMesPrazo);
  const mHoje = idxMes(hoje.getFullYear(), hoje.getMonth() + 1);
  const dias = diasCorridos(hoje, prazo);

  if (mHoje > indiceMesPrazo)
    return { fase, nivel: "critico", prazo, dias, motivo: motivoCritico };
  if (mHoje === indiceMesPrazo && dias <= 3)
    return { fase, nivel: "alerta", prazo, dias, motivo: motivoAlerta };
  return { fase, nivel: "preventivo", prazo, dias, motivo: motivoPreventivo };
}

/**
 * Motor de prazos por fase.
 *
 * O relógio muda conforme o marco realmente pendente:
 *  A) Etapas 1–5: preparar/empenhar.
 *  B1) Etapa 6, itens 1–6: atestar e enviar à SEFAZ no mês de atesto.
 *  B2) Etapa 6, item 7: acompanhamento até o 5º dia útil do mês seguinte.
 *  C) Etapa 7: anulação, quando necessária, até o último dia desse mesmo mês.
 */
export function statusPrazoLancamento(
  l: any,
  convenio: any,
  hoje: Date = new Date(),
): StatusPrazo {
  if (l.concluido)
    return {
      fase: "concluido",
      nivel: "ok",
      prazo: null,
      dias: null,
      motivo: "Processo concluído",
    };

  const c = primeiraCompetencia(l.competencia);

  if (convenio?.pagamento_pontual || !c) {
    const fase: FasePrazo = !empenhoConcluido(l)
      ? "empenho"
      : !etapa6Concluida(l)
        ? "pagamento"
        : "concluido";
    return {
      fase,
      nivel: "neutro",
      prazo: null,
      dias: null,
      motivo: "Pagamento complementar — sem prazo cronológico",
    };
  }

  const compRef = nomeMesAno(c.ano, c.mes);
  const mHoje = idxMes(hoje.getFullYear(), hoje.getMonth() + 1);
  const mComp = idxMes(c.ano, c.mes);
  const defasagem = prazoAtestoMeses(convenio);
  const idxPreparacao = mComp + defasagem - 1;
  const idxAtesto = mComp + defasagem;
  const idxAcompanhamento = idxAtesto + 1;
  const mesPreparacao = mesDoIndice(idxPreparacao);
  const mesAtesto = mesDoIndice(idxAtesto);
  const mesAcompanhamento = mesDoIndice(idxAcompanhamento);
  const refPreparacao = nomeMesAno(mesPreparacao.ano, mesPreparacao.mes);
  const refAtesto = nomeMesAno(mesAtesto.ano, mesAtesto.mes);
  const refAcompanhamento = nomeMesAno(
    mesAcompanhamento.ano,
    mesAcompanhamento.mes,
  );

  // ---- CRONÔMETRO A · Etapas 1–5 / preparação do processo ----
  if (!empenhoConcluido(l)) {
    const etapa = etapaEmpenhoAtual(l);
    const prazoFinal = fimDoMesIndice(idxPreparacao);
    const diasFinal = diasCorridos(hoje, prazoFinal);

    if (mHoje > idxPreparacao) {
      return {
        fase: "empenho",
        nivel: "critico",
        prazo: prazoFinal,
        dias: diasFinal,
        motivo: `Etapas 1–5 da competência ${compRef} em atraso — deveriam estar concluídas até o fim de ${refPreparacao}; pendente Etapa ${etapa.num} (${etapa.nome})`,
      };
    }

    if (mHoje === idxPreparacao) {
      const diaMeta = Number(convenio?.dia_fim_execucao ?? 0);
      const ultimoDia = prazoFinal.getDate();
      const diaSeguro =
        diaMeta > 0 ? Math.min(Math.max(1, diaMeta), ultimoDia) : 0;

      if (diaSeguro && hoje.getDate() > diaSeguro) {
        return {
          fase: "empenho",
          nivel: "alerta",
          prazo: prazoFinal,
          dias: diasFinal,
          motivo: `Etapas 1–5 da competência ${compRef} passaram da meta interna do dia ${diaSeguro}; prazo final no fechamento de ${refPreparacao} — pendente Etapa ${etapa.num} (${etapa.nome})`,
        };
      }

      if (diasFinal <= 3) {
        return {
          fase: "empenho",
          nivel: "alerta",
          prazo: prazoFinal,
          dias: diasFinal,
          motivo: `Etapas 1–5 da competência ${compRef} devem fechar em ${refPreparacao} — pendente Etapa ${etapa.num} (${etapa.nome})`,
        };
      }

      return {
        fase: "empenho",
        nivel: "preventivo",
        prazo: prazoFinal,
        dias: diasFinal,
        motivo: `Preparar a competência ${compRef}: concluir a Etapa 5 e deixar a Etapa 6 pronta até o fechamento de ${refPreparacao}`,
      };
    }

    const diaInicio = Number(convenio?.dia_inicio_execucao ?? 1);
    if (mHoje === mComp - 1 && hoje.getDate() >= diaInicio) {
      return {
        fase: "empenho",
        nivel: "preventivo",
        prazo: prazoFinal,
        dias: diasFinal,
        motivo: `Competência ${compRef} aberta para preparação — concluir Etapas 1–5 até ${refPreparacao}`,
      };
    }

    if (mHoje >= mComp - 1 && mHoje < idxPreparacao) {
      return {
        fase: "empenho",
        nivel: "preventivo",
        prazo: prazoFinal,
        dias: diasFinal,
        motivo: `Preparação da competência ${compRef} em andamento — Etapa ${etapa.num} (${etapa.nome}); prazo final ${refPreparacao}`,
      };
    }

    return {
      fase: "empenho",
      nivel: "ok",
      prazo: prazoFinal,
      dias: diasFinal,
      motivo: `Preparação da competência ${compRef} ainda não entrou na janela operacional`,
    };
  }

  // ---- CRONÔMETRO B1 · Etapa 6, itens 1–6 / atesto e envio à SEFAZ ----
  if (!envioSefazEtapa6Concluido(l)) {
    const inicioAtesto = primeiroDiaMesIndice(idxAtesto);
    const prazo = fimDoMesIndice(idxAtesto);

    if (soData(hoje) < soData(inicioAtesto)) {
      return {
        fase: "pagamento",
        nivel: "neutro",
        prazo,
        dias: diasCorridos(hoje, prazo),
        motivo: `Atesto da competência ${compRef} inicia em 01/${refAtesto}; Etapa 6 já deve permanecer preparada`,
      };
    }

    return statusPorFimDeMes({
      fase: "pagamento",
      hoje,
      indiceMesPrazo: idxAtesto,
      motivoPreventivo: `Atestar a competência ${compRef} e concluir a Etapa 6 até o item 6 — Envio à SEFAZ.UAF.ADE — durante ${refAtesto}`,
      motivoAlerta: `Etapa 6 da competência ${compRef} deve chegar ao item 6 — Envio à SEFAZ.UAF.ADE — até o fim de ${refAtesto}`,
      motivoCritico: `Atesto da competência ${compRef} em atraso — o item 6 da Etapa 6 (Envio à SEFAZ.UAF.ADE) deveria ter sido concluído em ${refAtesto}`,
    });
  }

  // ---- CRONÔMETRO B2 · Etapa 6, item 7 / acompanhamento financeiro ----
  if (!acompanhamentoEtapa6Concluido(l)) {
    const prazo = nthDiaUtil(
      mesAcompanhamento.ano,
      mesAcompanhamento.mes,
      5,
    );

    if (mHoje < idxAcompanhamento) {
      return {
        fase: "pagamento",
        nivel: "preventivo",
        prazo,
        dias: diasCorridos(hoje, prazo),
        motivo: `Item 6 concluído; o item 7 da Etapa 6 da competência ${compRef} vence no 5º dia útil de ${refAcompanhamento}`,
      };
    }

    const dias = diasCorridos(hoje, prazo);
    if (dias < 0) {
      return {
        fase: "pagamento",
        nivel: "critico",
        prazo,
        dias,
        motivo: `Item 7 da Etapa 6 da competência ${compRef} em atraso — passou do 5º dia útil de ${refAcompanhamento}`,
      };
    }
    if (dias <= 2) {
      return {
        fase: "pagamento",
        nivel: "alerta",
        prazo,
        dias,
        motivo: `Preencher o item 7 da Etapa 6 da competência ${compRef} até o 5º dia útil de ${refAcompanhamento}`,
      };
    }
    return {
      fase: "pagamento",
      nivel: "preventivo",
      prazo,
      dias,
      motivo: `Acompanhar subempenho, programação, comprovante e data de pagamento da competência ${compRef} até o 5º dia útil de ${refAcompanhamento}`,
    };
  }

  // ---- CRONÔMETRO C · Etapa 7 / anulação do saldo, quando aplicável ----
  if (precisaAnular(l) && !anulacaoConcluida(l)) {
    return statusPorFimDeMes({
      fase: "anulacao",
      hoje,
      indiceMesPrazo: idxAcompanhamento,
      motivoPreventivo: `Concluir a Etapa 7 — Anulação de Empenho — da competência ${compRef} até o fim de ${refAcompanhamento}`,
      motivoAlerta: `Anulação da competência ${compRef} deve ser concluída até o fechamento de ${refAcompanhamento}`,
      motivoCritico: `Anulação da competência ${compRef} em atraso — deveria ter sido concluída até o fim de ${refAcompanhamento}`,
    });
  }

  return {
    fase: "concluido",
    nivel: "ok",
    prazo: null,
    dias: null,
    motivo: "Etapas financeiras concluídas — aguardando conclusão formal",
  };
}

/**
 * Alerta sintético para uma competência que ainda nem foi criada.
 * A competência M deve começar a ser preparada em M-1, a partir do
 * dia_inicio_execucao configurado no convênio.
 */
export type AlertaAberturaCompetencia = {
  competencia: string;
  inicio: Date;
  diasDesdeInicio: number;
  motivo: string;
};

export function competenciaAberturaPendente(
  convenio: any,
  lancamentos: any[],
  hoje: Date = new Date(),
): AlertaAberturaCompetencia | null {
  if (!convenio || convenio.pagamento_pontual) return null;
  if (statusConvenioEfetivo(convenio, hoje) !== "ativo") return null;

  const diaInicio = Number(convenio.dia_inicio_execucao ?? 1);
  if (hoje.getDate() < diaInicio) return null;

  const atualIdx = idxMes(hoje.getFullYear(), hoje.getMonth() + 1);
  const alvoIdx = atualIdx + 1;
  const alvo = mesDoIndice(alvoIdx);
  const competencia = nomeMesAno(alvo.ano, alvo.mes);

  if (convenio.data_inicio_vigencia && Number(convenio.total_parcelas ?? 0) > 0) {
    const inicio = new Date(
      `${String(convenio.data_inicio_vigencia).slice(0, 10)}T12:00:00`,
    );
    const primeiroIdx = idxMes(inicio.getFullYear(), inicio.getMonth() + 1);
    const ultimoIdx = primeiroIdx + Number(convenio.total_parcelas) - 1;
    if (alvoIdx < primeiroIdx || alvoIdx > ultimoIdx) return null;
  }

  const jaExiste = lancamentos.some((l) => {
    if (l.convenio_id !== convenio.id) return false;
    return String(l.competencia ?? "")
      .split(",")
      .map((item) => item.trim())
      .includes(competencia);
  });
  if (jaExiste) return null;

  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const inicio = new Date(
    hoje.getFullYear(),
    hoje.getMonth(),
    Math.min(Math.max(1, diaInicio), ultimoDia),
  );

  return {
    competencia,
    inicio,
    diasDesdeInicio: Math.max(0, diasCorridos(inicio, hoje)),
    motivo: `Abrir a competência ${competencia} e iniciar a preparação das Etapas 1–5`,
  };
}

/** Motivo textual da pendência/atraso da fase ativa (para Aging/alertas). */
export function motivoPrazoLancamento(l: any, convenio: any, hoje: Date = new Date()): string {
  return statusPrazoLancamento(l, convenio, hoje).motivo;
}

/** Em atraso (crítico): o relógio da FASE ATIVA estourou. */
export function emAtraso(l: any, convenio: any, hoje: Date = new Date()): boolean {
  if (l.concluido) return false;
  // Pai com múltiplas competências e empenho já feito: o atraso é controlado nos filhos.
  const comps = (l.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  if (!l.parent_id && comps.length > 1 && empenhoConcluido(l)) return false;
  return statusPrazoLancamento(l, convenio, hoje).nivel === "critico";
}

/** Completude do contrato: parcelas esperadas até hoje (exclui o 1º mês) vs concluídas. */
export function completudeConvenio(conv: any, lancs: any[], hoje: Date = new Date()) {
  const total = Number(conv.total_parcelas ?? 0);
  // "T12:00:00" evita o deslize de fuso: data-só (YYYY-MM-DD) é parseada como UTC
  // e viraria o dia anterior no horário de Brasília (ex.: dia 1º contava no mês anterior).
  const vig = conv.data_inicio_vigencia ? new Date(`${String(conv.data_inicio_vigencia).slice(0, 10)}T12:00:00`) : null;
  const monthsDiff = vig ? Math.max(0, (hoje.getFullYear() - vig.getFullYear()) * 12 + (hoje.getMonth() - vig.getMonth())) : 0;
  const esperadas = Math.min(total, monthsDiff);
  const idsComFilhos = new Set(lancs.map(l => l.parent_id).filter(Boolean));
  const ls = lancs.filter((l) => l.convenio_id === conv.id && !idsComFilhos.has(l.id));
  const concluidas = ls.filter((l) => l.concluido && Number(l.parcela) >= 1 && Number(l.parcela) <= esperadas).length;
  const taxa = esperadas > 0 ? Math.round((concluidas / esperadas) * 100) : null;
  return { total, esperadas, concluidas, taxa };
}

/** Lista de parcelas (1..total) com status: sem | andamento | concluido. */
export function statusParcelas(conv: any, lancs: any[]) {
  const total = Number(conv.total_parcelas ?? 0);
  const idsComFilhos = new Set(lancs.map(l => l.parent_id).filter(Boolean));
  const ls = lancs.filter((l) => l.convenio_id === conv.id && !idsComFilhos.has(l.id));
  return Array.from({ length: total }, (_, i) => {
    const num = i + 1;
    const p = ls.filter((l) => {
      const parts = String(l.parcela ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return parts.includes(String(num));
    });
    if (p.length === 0) return { num, status: "sem" as const, etapa: "" };
    if (p.some((l) => l.concluido)) return { num, status: "concluido" as const, etapa: "" };
    return { num, status: "andamento" as const, etapa: etapaCorrenteLabel(p[0]) };
  });
}

/** Alerta de situação da competência atual por convênio (Fase 6). */
export function statusCompetencia(conv: any, lancs: any[], hoje: Date = new Date()): { nivel: "ok" | "info" | "alerta" | "grave"; titulo: string; msg: string } | null {
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const compAtual = `${mm}/${hoje.getFullYear()}`;
  const dia = hoje.getDate();
  const ini = Number(conv.dia_inicio_execucao ?? 0);
  const fim = Number(conv.dia_fim_execucao ?? 0);
  const titulo = `${conv._nome ?? "Convênio"}${conv.objeto ? ` · ${conv.objeto}` : ""}`;
  
  // Filtra fora os lançamentos pai que possuem filhos na lista (pois a análise de atraso/andamento de cada competência
  // individual deve ocorrer nos filhos).
  const idsComFilhos = new Set(lancs.map(l => l.parent_id).filter(Boolean));
  const lancsFiltrados = lancs.filter(l => !idsComFilhos.has(l.id));

  const doMes = lancsFiltrados.filter((l) => l.convenio_id === conv.id && (l.competencia ?? "").includes(compAtual));
  if (doMes.length > 0) {
    if (doMes.every((l) => l.concluido)) return { nivel: "ok", titulo, msg: `Processo de ${compAtual} concluído. Parabéns!` };
    if (fim && dia > fim) return { nivel: "grave", titulo, msg: `Processo de ${compAtual} pendente e fora do prazo (limite dia ${fim}).` };
    if (fim && dia >= ini) return { nivel: "alerta", titulo, msg: `Processo de ${compAtual} em andamento — faltam ${fim - dia} dia(s) para o prazo.` };
    return { nivel: "alerta", titulo, msg: `Processo de ${compAtual} em andamento.` };
  }
  // Sem lançamento na competência atual
  if (ini && dia < ini) {
    const faltam = ini - dia;
    if (faltam <= 7) return { nivel: "info", titulo, msg: `Faltam ${faltam} dia(s) para iniciar o processo de ${compAtual} (começa dia ${ini}). Comece com antecedência.` };
    return null;
  }
  if (fim && dia > fim) return { nivel: "grave", titulo, msg: `Nada lançado para ${compAtual} e já passou do prazo (limite dia ${fim}).` };
  if (ini && dia >= ini) return { nivel: "alerta", titulo, msg: `Já deveríamos estar realizando o processo de ${compAtual} (iniciou dia ${ini}).` };
  return null;
}

/** Vencendo em breve (alerta): o relógio da fase ativa está próximo do limite. */
export function vencendoEmBreve(l: any, convenio: any, hoje: Date = new Date()): boolean {
  if (l.concluido) return false;
  return statusPrazoLancamento(l, convenio, hoje).nivel === "alerta";
}

/** Status efetivo do convênio calculando expiração de vigência de forma dinâmica. */
export function statusConvenioEfetivo(c: any, hoje: Date = new Date()): "ativo" | "suspenso" | "encerrado" {
  if (!c) return "ativo";
  if (c.status_convenio === "encerrado" || c.status_convenio === "suspenso") {
    return c.status_convenio;
  }
  if (c.pagamento_pontual) {
    return "ativo";
  }
  if (c.data_inicio_vigencia && c.total_parcelas) {
    const inicio = new Date(c.data_inicio_vigencia + "T12:00:00");
    const fim = new Date(inicio);
    fim.setMonth(fim.getMonth() + Number(c.total_parcelas));
    if (hoje > fim) {
      return "encerrado";
    }
  }
  return "ativo";
}
