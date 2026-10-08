export type PvhEtapa = {
  n: number;
  titulo: string;
  curto: string;
  objetivo: string;
  antesDeComecar: string[];
  passoAPasso: string[];
  evidencias: string[];
  concluirQuando: string[];
  atencao: string[];
  baseNormativa: string[];
};

export const PVH_ETAPAS: PvhEtapa[] = [
  {
    n: 1,
    titulo: "Portaria estadual e abertura",
    curto: "Portaria estadual",
    objetivo:
      "Abrir a competência com a fonte oficial do Estado, registrar a Portaria SES e conferir quanto cabe a cada instituição.",
    antesDeComecar: [
      "Confirme que as instituições participantes estão configuradas em PVH → Configurações.",
      "Use sempre a Portaria estadual oficial da competência; não reaproveite número ou valor do mês anterior.",
      "Confira se a base normativa aplicável à competência está correta.",
    ],
    passoAPasso: [
      "Localize a Portaria estadual de pagamento do PVH correspondente à competência.",
      "Registre número, data e link oficial da Portaria estadual.",
      "Transcreva o valor oficial de cada instituição exatamente como publicado.",
      "Confira se a soma dos valores das instituições corresponde ao total destinado a Joinville.",
      "Se a competência estiver sendo preparada antes da publicação, mantenha-a como Preparação e conclua a etapa somente quando a Portaria oficial estiver disponível.",
    ],
    evidencias: [
      "Portaria SES de pagamento da competência.",
      "Link oficial da publicação.",
      "Valores oficiais por instituição.",
    ],
    concluirQuando: [
      "A Portaria estadual está identificada e acessível.",
      "Todas as instituições participantes possuem valor estadual conferido.",
      "Não existe divergência não explicada entre a publicação e o cadastro.",
    ],
    atencao: [
      "A partir da competência 07/2026, a referência normativa vigente é a Deliberação 416/CIB/2026.",
      "Documentos históricos devem ser preservados como foram emitidos; o sistema não deve reescrever uma referência normativa antiga.",
    ],
    baseNormativa: [
      "Deliberação 416/CIB/2026 — revisão do Programa de Valorização dos Hospitais.",
      "Portaria SES mensal de pagamento do PVH.",
    ],
  },
  {
    n: 2,
    titulo: "Portaria municipal",
    curto: "Portaria municipal",
    objetivo:
      "Transformar a autorização estadual em ato municipal rastreável e, após a publicação, registrar o crédito efetivo do recurso no Fundo Municipal de Saúde.",
    antesDeComecar: [
      "A Etapa 1 deve estar concluída com Portaria SES, data, link oficial e valores por instituição.",
      "Confirme a deliberação vigente da competência.",
      "Tenha os CNES das instituições e os signatários institucionais cadastrados.",
    ],
    passoAPasso: [
      "Complete os dados próprios da Minuta e confira o texto-base gerado para copiar e colar no SEI.",
      "Registre na Minuta a assinatura de Gerente ou Coordenador e do Diretor de Serviços Complementares; Fiscal é opcional.",
      "Complete os dados próprios do Memorando; ele herda automaticamente Minuta, deliberação, Portaria SES e Portaria geral do PVH.",
      "Registre no Memorando a assinatura de um Fiscal e de um Gerente ou Coordenador.",
      "Confirme o encaminhamento do Memorando para SES.UAP e SES.UAP.APA.",
      "Após a publicação, registre número, data e Link SEI da Portaria Municipal.",
      "Quando a Portaria Municipal publicada estiver completa, registre no mesmo fluxo a data e o valor do crédito no FMS, com Número SEI e Link SEI.",
      "O valor municipal é sincronizado com o valor estadual da Etapa 1; não existe uma segunda digitação nem uma conciliação paralela.",
    ],
    evidencias: [
      "Minuta da Portaria Municipal com texto-base e assinaturas.",
      "Memorando de encaminhamento com texto-base, assinaturas e confirmações de envio.",
      "Portaria Municipal publicada no SEI.",
      "Número e Link SEI do registro do crédito no FMS, quando o recurso já tiver sido recebido.",
    ],
    concluirQuando: [
      "A Minuta está completa e assinada conforme a matriz da etapa.",
      "O Memorando está completo, assinado e encaminhado às duas unidades.",
      "A Portaria Municipal possui número, data e Link SEI válidos.",
    ],
    atencao: [
      "Os valores da Portaria Municipal devem reproduzir os valores oficiais já conferidos na Etapa 1.",
      "A base normativa é a deliberação selecionada na competência; não a redigite em cada documento.",
      "O prazo de cinco dias úteis para repasse nasce do crédito efetivo no FMS, e não da publicação da Portaria.",
      "Alterações posteriores em dados que sustentam etapas concluídas geram reconferência apenas onde houver impacto.",
    ],
    baseNormativa: [
      "Portaria municipal geral do PVH vigente.",
      "Portaria SES da competência.",
      "Deliberação CIB vigente na competência.",
    ],
  },
  {
    n: 3,
    titulo: "Empenhos e cobertura orçamentária",
    curto: "Empenhos",
    objetivo:
      "Formalizar a Solicitação de Nota de Empenho, registrar o envio à SEFAZ, receber a NE emitida e distribuir sua cobertura entre as competências.",
    antesDeComecar: [
      "A Etapa 1 deve estar concluída e os valores oficiais definidos.",
      "Consulte as NEs já emitidas para a instituição: uma NE pode ter saldo aproveitável em mais de uma competência.",
      "Quando for necessária uma nova NE, tenha Nº SEI, Link SEI, data, dotação e fonte da solicitação.",
    ],
    passoAPasso: [
      "Preencha Nº SEI, Link SEI, data, dotação e fonte da Solicitação de Nota de Empenho; o sistema registra a solicitação automaticamente.",
      "Confirme o encaminhamento da solicitação para SES.UFI.ACO.",
      "Registre as assinaturas do Coordenador de Orçamentos, Fiscal, Gerente ou Coordenador, Diretor de Serviços Complementares, membro da Comissão de Gestão e Controle de Despesa e Diretor Financeiro.",
      "A assinatura da Comissão é nominal e digitada manualmente, como no fluxo do Piso de Enfermagem.",
      "Depois das seis assinaturas, confirme o encaminhamento para SEFAZ.UCG.AEO.",
      "Após o retorno da SEFAZ, registre número da NE, valor total, Nº SEI e Link SEI da Nota de Empenho.",
      "Aloque à competência apenas a parcela da NE que efetivamente dará cobertura ao mês; o saldo restante continua disponível para outras competências.",
      "Se uma única NE não for suficiente, abra outra solicitação e distribua as alocações entre as NEs.",
    ],
    evidencias: [
      "Solicitação de Nota de Empenho com dados orçamentários.",
      "Confirmação de envio para SES.UFI.ACO.",
      "Seis assinaturas da solicitação, incluindo um membro da Comissão de Gestão e Controle de Despesa.",
      "Confirmação de envio à SEFAZ.UCG.AEO.",
      "Nota(s) de Empenho emitida(s) e respectivos documentos SEI.",
      "Mapa de alocação NE × competência.",
    ],
    concluirQuando: [
      "Toda NE utilizada possui Solicitação e Nota de Empenho rastreadas.",
      "Cada instituição possui cobertura de empenho integral.",
      "A soma das alocações é igual ao valor que será executado na competência.",
    ],
    atencao: [
      "A ordem operacional é Solicitação → SES.UFI.ACO → seis assinaturas → SEFAZ.UCG.AEO → Nota de Empenho. Ao registrar a NE, a cobertura da competência é vinculada automaticamente; eventual saldo permanece reutilizável em outras competências.",
      "NE não é 1:1 com competência: o saldo de uma mesma NE pode ser aproveitado em competências diferentes.",
    ],
    baseNormativa: [
      "Documentos de empenho e classificação orçamentária do Município.",
      "Portaria Municipal da competência.",
    ],
  },
  {
    n: 4,
    titulo: "Subempenho e liquidação",
    curto: "Subempenho",
    objetivo:
      "Executar, por instituição e por Nota de Empenho utilizada, a cadeia documental que transforma a cobertura orçamentária em subempenho pronto para pagamento.",
    antesDeComecar: [
      "A Etapa 3 deve possuir cobertura integral de empenho para cada instituição.",
      "O crédito efetivo no FMS deve estar registrado e conciliado dentro da Etapa 2.",
      "Quando a competência utilizar mais de uma NE, cada alocação mantém sua própria cadeia documental.",
    ],
    passoAPasso: [
      "Na Solicitação de Subempenho/Liquidação, registre Número SEI e Link SEI.",
      "Registre a assinatura do membro da Comissão de Gestão e Controle de Despesa; a assinatura do Fiscal é opcional.",
      "No Aviso de Movimento — Empenho em Liquidação, use o tutorial do e-Pública disponível dentro da própria cadeia da NE.",
      "No e-Pública, gere o Empenho em Liquidação, relacione o documento fiscal, transmita o Aviso de Movimento ao SEI na unidade SES.UCP.ACP e confira os dados antes do envio.",
      "Registre Número SEI e Link SEI do Aviso de Movimento — Empenho em Liquidação.",
      "Registre novamente a assinatura obrigatória do membro da Comissão; Fiscal é opcional.",
      "Depois da assinatura obrigatória, confirme o encaminhamento para SEFAZ.UAF.ADE.",
      "Somente após esse encaminhamento o sistema libera a subetapa Aviso de Movimento — Subempenho.",
      "No Aviso de Movimento — Subempenho, registre Número SEI, Link SEI e data do aviso.",
      "Repita a cadeia para todas as NEs/alocações usadas pelas instituições da competência.",
    ],
    evidencias: [
      "Solicitação de Subempenho/Liquidação no SEI.",
      "Assinatura obrigatória da Comissão na Solicitação.",
      "Aviso de Movimento — Empenho em Liquidação no SEI.",
      "Assinatura obrigatória da Comissão no Aviso de Movimento — Empenho em Liquidação.",
      "Registro de encaminhamento à SEFAZ.UAF.ADE.",
      "Aviso de Movimento — Subempenho no SEI, com a respectiva data.",
    ],
    concluirQuando: [
      "O crédito no FMS está registrado e conciliado na Etapa 2.",
      "Cada alocação de NE possui uma cadeia documental completa.",
      "As duas assinaturas obrigatórias da Comissão estão registradas em cada cadeia.",
      "O Aviso de Movimento — Empenho em Liquidação foi encaminhado à SEFAZ.UAF.ADE.",
      "O Aviso de Movimento — Subempenho possui Nº SEI, Link SEI e data.",
      "A soma dos subempenhos corresponde exatamente ao valor alocado de cada NE na competência.",
    ],
    atencao: [
      "Fiscal é opcional nos dois documentos assináveis; a Comissão é obrigatória.",
      "O nome do membro da Comissão é registrado manualmente, preservando quem efetivamente assinou o documento.",
      "Não una artificialmente NEs diferentes: a rastreabilidade deve permitir reconstruir qual cobertura originou cada subempenho.",
    ],
    baseNormativa: [
      "Fluxo municipal de execução orçamentária e financeira.",
      "Documentos SEI e Avisos de Movimento emitidos no e-Pública.",
    ],
  },
  {
    n: 5,
    titulo: "Pagamento",
    curto: "Pagamento",
    objetivo:
      "Registrar a programação e o repasse efetivo de cada instituição, preservando documentos, datas e valores de todas as parcelas.",
    antesDeComecar: [
      "A Etapa 4 deve estar concluída para todas as instituições.",
      "A cadeia de subempenho deve identificar integralmente o valor que seguirá para pagamento.",
    ],
    passoAPasso: [
      "Na Programação de Pagamento, registre Número SEI e Link SEI.",
      "No Comprovante de Pagamento, registre Número SEI e Link SEI.",
      "Informe a data da programação de pagamento.",
      "Informe a data efetiva do pagamento e o valor pago.",
      "Se o repasse ocorrer em mais de uma parcela, abra um novo registro; não sobrescreva o pagamento anterior.",
      "Confira se a soma das parcelas fecha exatamente o valor devido à instituição.",
    ],
    evidencias: [
      "Programação de Pagamento no SEI.",
      "Comprovante de Pagamento no SEI.",
      "Data da programação.",
      "Data efetiva e valor de cada pagamento.",
    ],
    concluirQuando: [
      "Todas as instituições possuem ao menos um registro de pagamento completo.",
      "A soma dos valores pagos corresponde ao valor devido de cada instituição.",
      "Cada parcela possui Programação de Pagamento e Comprovante de Pagamento rastreáveis no SEI.",
    ],
    atencao: [
      "Pagamento parcial não quita a instituição; registre as parcelas separadamente.",
      "A data efetiva do pagamento será usada no controle do prazo contado a partir do crédito no FMS.",
    ],
    baseNormativa: [
      "Portaria SES mensal de pagamento do PVH.",
      "Portaria Municipal da competência.",
      "Fluxo municipal de execução financeira.",
    ],
  },
  {
    n: 6,
    titulo: "Comunicação institucional",
    curto: "Comunicação",
    objetivo:
      "Registrar a comunicação do repasse somente para as instituições cuja configuração vigente exige notificação por e-mail.",
    antesDeComecar: [
      "A Etapa 5 deve estar concluída.",
      "Os e-mails institucionais devem estar cadastrados no cadastro mestre do prestador.",
      "A obrigação de comunicar vem do snapshot notificar_email da própria competência; não use o nome do hospital como regra.",
    ],
    passoAPasso: [
      "O sistema classifica automaticamente cada instituição como comunicação obrigatória ou Não aplicável.",
      "Quando obrigatória, selecione um ou mais e-mails do cadastro mestre do prestador; destinatários escolhidos por engano podem ser desmarcados antes do envio.",
      "Copie o assunto gerado: “Programa de Valorização dos Hospitais - PVH - [competência]”.",
      "Revise e copie o corpo gerado com competência, valor em BRL e por extenso, Nota(s) de Empenho, Portaria Municipal, referência ao Aviso de Movimento — Sub-empenho e nome do usuário logado.",
      "Após realizar o envio, registre Número SEI e Link SEI do e-mail enviado.",
      "Ao completar destinatários e rastreio SEI, o sistema registra automaticamente o envio e o responsável.",
    ],
    evidencias: [
      "Destinatários selecionados do cadastro mestre.",
      "Assunto e corpo gerados para a competência.",
      "Número SEI e Link SEI do e-mail enviado.",
      "Data e usuário responsável pelo registro do envio.",
    ],
    concluirQuando: [
      "Todas as instituições com notificar_email=true possuem comunicação enviada e rastreada no SEI.",
      "Instituições com notificar_email=false aparecem como Não aplicável e não bloqueiam a etapa.",
    ],
    atencao: [
      "Não presuma a obrigação de envio pelo prestador ou pela pasta histórica; a regra vem da configuração vigente capturada na competência.",
      "Depois de registrado como enviado, reabra formalmente o registro antes de alterar destinatários ou conteúdo.",
    ],
    baseNormativa: [
      "Rotina institucional de comunicação do PVH.",
      "Configuração institucional vigente da competência.",
    ],
  },
  {
    n: 7,
    titulo: "Encerramento e prestação de contas",
    curto: "Encerramento",
    objetivo:
      "Conferir o ciclo financeiro mensal e registrar o encerramento. A prestação de contas exigida por instituição permanece como obrigação posterior a acompanhar.",
    antesDeComecar: [
      "As Etapas 1 a 6 precisam estar concluídas e sem reconferências.",
      "Valores oficiais, municipais, alocados, subempenhados e pagos devem fechar.",
      "A obrigação de prestação de contas é definida na configuração de cada instituição.",
    ],
    passoAPasso: [
      "Confira a comparação consolidada entre Estado, Município, crédito FMS, alocações, subempenhos e pagamentos.",
      "Verifique a conciliação por instituição e as comunicações aplicáveis.",
      "Identifique quais instituições têm obrigação de prestação de contas, sem presumir recebimento ou aprovação.",
      "Marque a declaração de conferência e confirme o encerramento.",
      "Quando houver necessidade de correção, reabra com justificativa antes de alterar os lançamentos.",
    ],
    evidencias: [
      "Conciliação financeira estruturada.",
      "Registro de encerramento com responsável e data.",
      "Obrigações condicionais de prestação de contas identificadas.",
      "Relatório executivo independente, disponível no cabeçalho.",
    ],
    concluirQuando: [
      "Todas as etapas anteriores estão concluídas e sem reconferência.",
      "A conciliação financeira apresenta diferença zero por instituição.",
      "Um responsável ACP/Admin confirmou expressamente o encerramento.",
    ],
    atencao: [
      "Encerrar a competência não significa aprovar ou receber prestação de contas futura.",
      "Não confundir o painel de encerramento com o relatório executivo detalhado.",
      "A competência encerrada é somente leitura; reaberturas exigem justificativa.",
    ],
    baseNormativa: [
      "Portaria Municipal geral do PVH.",
      "Instrumento contratual aplicável à instituição.",
      "Regras municipais de prestação de contas.",
    ],
  },
];

const PRE_REQUISITOS: Record<number, number[]> = {
  1: [],
  2: [1],
  3: [1],
  4: [2, 3],
  5: [4],
  6: [5],
  7: [2, 3, 4, 5, 6],
};

export const STATUS_PVH: Record<string, string> = {
  preparacao: "Preparação",
  ativa: "Em andamento",
  encerrada: "Encerrada",
};

export function competenciaValidaPvh(valor: string) {
  return /^(0[1-9]|1[0-2])\/20\d{2}$/.test(valor);
}

export function etapaAtualPvh(
  concluidas: Record<string, boolean> | null | undefined,
  status?: string | null,
) {
  if (status === "encerrada") return 7;
  for (const etapa of PVH_ETAPAS) {
    if (!concluidas?.[String(etapa.n)]) return etapa.n;
  }
  return 7;
}

export function etapaPrincipalPvh(
  concluidas: Record<string, boolean> | null | undefined,
  status?: string | null,
  reconferir: number[] | null | undefined = [],
) {
  const primeiraReconferencia = [...new Set(reconferir ?? [])]
    .filter((n) => n >= 1 && n <= 7)
    .sort((a, b) => a - b)[0];

  return primeiraReconferencia ?? etapaAtualPvh(concluidas, status);
}

export function etapaNavegavelPvh(
  n: number,
  concluidas: Record<string, boolean> | null | undefined,
  reconferir: number[] | null | undefined = [],
  status?: string | null,
) {
  if (n < 1 || n > 7) return false;
  if (status === "encerrada") return true;
  return etapaLiberadaPvh(n, concluidas, reconferir);
}

export function etapaLiberadaPvh(
  n: number,
  concluidas: Record<string, boolean> | null | undefined,
  reconferir: number[] | null | undefined = [],
) {
  if (n < 1 || n > 7) return false;
  if (concluidas?.[String(n)] || (reconferir ?? []).includes(n)) return true;
  const bloqueios = new Set(reconferir ?? []);
  return (PRE_REQUISITOS[n] ?? []).every(
    (etapa) => concluidas?.[String(etapa)] === true && !bloqueios.has(etapa),
  );
}

export function prerequisitosEtapaPvh(n: number) {
  return [...(PRE_REQUISITOS[n] ?? [])];
}

export function ordemCompetenciaPvh(c: string) {
  const [mes, ano] = c.split("/").map(Number);
  return (ano || 0) * 100 + (mes || 0);
}
