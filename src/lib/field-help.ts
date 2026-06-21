/** Textos de ajuda (tooltips) por campo — reduzem erro humano no preenchimento. */
export const HELP = {
  // ACP
  descricao: "Identificação do repasse (ex.: POA, Termo de Colaboração, Piso da Enfermagem).",
  termo_aditivo: "Número do termo aditivo vigente, se houver (ex.: 4º TA). Cada aditivo tem seu próprio teto.",
  parcela: "Número da parcela do repasse no ano (ex.: 46).",
  competencia: "Mês/ano a que o repasse se refere (MM/AAAA, ex.: 05/2026). Use 'Adicionar mês' quando o empenho cobrir mais de uma competência.",
  mes_pagamento_previsto: "Mês em que o pagamento está previsto para ocorrer.",
  valor_solicitado: "Valor que a ACP solicita o empenho. É o teto: nenhum valor empenhado pode ultrapassá-lo.",
  link_solicitacao_sei: "Link do processo de SOLICITAÇÃO de empenho no SEI.",
  valor_atestado: "Valor efetivamente atestado (executado). Usado para calcular o valor a anular.",
  link_solicitacao_anulacao: "Link do processo de SOLICITAÇÃO de anulação de empenho no SEI.",
  // ACO
  dotacao_orcamentaria: "Código da dotação orçamentária que custeia a despesa.",
  fonte_pagamento: "Fonte de recurso que financia o pagamento (ex.: 1600).",
  status_aco: "Situação orçamentária atual do empenho.",
  numero_empenho: "Número da Nota de Empenho emitida pelo Financeiro (ex.: 2455/2026).",
  link_empenho_sei: "Link da NOTA DE EMPENHO no SEI.",
  valor_empenho_liquido: "Valor líquido efetivamente empenhado. NUNCA pode exceder o valor solicitado pela ACP.",
  link_anulacao_sei: "Link da NOTA DE ANULAÇÃO emitida pelo Financeiro no SEI.",
  // calculado
  valor_anulado: "Calculado automaticamente: Valor Solicitado − Valor Atestado. Representa o recurso devolvido ao orçamento.",
} as const;
