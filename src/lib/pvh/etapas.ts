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
      "Transformar a autorização estadual em ato municipal rastreável, gerando Minuta e Memorando a partir dos dados já conferidos na competência e registrando a publicação final no SEI.",
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
      "Quando a Portaria Municipal publicada estiver completa, o próprio bloco da Etapa 2 libera o registro do recebimento efetivo no Fundo Municipal de Saúde.",
      "Ao concluir, o valor municipal é sincronizado com o valor estadual da Etapa 1; não há uma segunda digitação nem uma conciliação paralela.",
    ],
    evidencias: [
      "Minuta da Portaria Municipal com texto-base e assinaturas.",
      "Memorando de encaminhamento com texto-base, assinaturas e confirmações de envio.",
      "Portaria Municipal publicada no SEI.",
    ],
    concluirQuando: [
      "A Minuta está completa e assinada conforme a matriz da etapa.",
      "O Memorando está completo, assinado e encaminhado às duas unidades.",
      "A Portaria Municipal possui número, data e Link SEI válidos.",
    ],
    atencao: [
      "Os valores da Portaria Municipal devem reproduzir os valores oficiais já conferidos na Etapa 1.",
      "A base normativa é a deliberação selecionada na competência; não a redigite em cada documento.",
      "Alterações posteriores em etapas já concluídas geram reconferência somente nas etapas concluídas que possam ter sido impactadas.",
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
      "Formalizar a Solicitação de Nota de Empenho, registrar o envio à SEFAZ, receber a NE emitida e só então distribuir sua cobertura entre as competências.",
    antesDeComecar: [
      "A Etapa 2 deve estar concluída e o valor municipal da instituição definido.",
      "Consulte as NEs já emitidas para a instituição: uma NE pode ter saldo aproveitável em mais de uma competência.",
      "Quando for necessária uma nova NE, tenha Nº SEI, Link SEI, data, dotação e fonte da solicitação.",
    ],
    passoAPasso: [
      "Crie a Solicitação de Nota de Empenho para a instituição.",
      "Registre as assinaturas do Coordenador de Orçamentos, Fiscal, Gerente ou Coordenador, Diretor de Serviços Complementares e Diretor Financeiro.",
      "Confirme o encaminhamento da solicitação para a SEFAZ.UCG.AEO.",
      "Após o retorno da SEFAZ, registre número da NE, valor total, Nº SEI e Link SEI da Nota de Empenho.",
      "Aloque à competência apenas a parcela da NE que efetivamente dará cobertura ao mês; o saldo restante continua disponível para outras competências.",
      "Se uma única NE não for suficiente, abra outra solicitação e distribua as alocações entre as NEs.",
    ],
    evidencias: [
      "Solicitação de Nota de Empenho com dados orçamentários.",
      "Cinco assinaturas da solicitação.",
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
      "A Nota de Empenho só fica disponível para alocação depois do fluxo de solicitação e envio.",
      "NE não é 1:1 com competência: o saldo de uma mesma NE pode ser aproveitado em competências diferentes.",
    ],
    baseNormativa: [
      "Documentos de empenho e classificação orçamentária do Município.",
      "Portaria Municipal da competência.",
    ],
  },
  {
    n: 4,
    titulo: "Recebimento do recurso no FMS",
    curto: "Recurso no FMS",
    objetivo:
      "Registrar o crédito efetivo do recurso estadual no Fundo Municipal de Saúde e iniciar a contagem do prazo legal de repasse.",
    antesDeComecar: [
      "A Portaria estadual da competência deve estar registrada.",
      "Tenha a referência bancária ou SEI que demonstre o recebimento no FMS.",
    ],
    passoAPasso: [
      "Registre a data em que o recurso efetivamente entrou na conta do FMS.",
      "Registre o valor creditado e a referência do crédito.",
      "Registre o Número SEI e o Link SEI que documentam o recebimento.",
      "Compare o valor recebido com o total oficial da competência.",
      "O sistema passa a contar automaticamente o prazo de cinco dias úteis para repasse aos hospitais.",
    ],
    evidencias: [
      "Número e Link SEI do registro do crédito no FMS.",
      "Data efetiva do recebimento.",
      "Valor efetivamente recebido.",
    ],
    concluirQuando: [
      "Data, valor e referência do crédito estão registrados.",
      "Qualquer divergência entre valor esperado e recebido está identificada.",
    ],
    atencao: [
      "O prazo de cinco dias úteis nasce do depósito no FMS, não da data da Portaria estadual.",
    ],
    baseNormativa: [
      "Portaria SES mensal de pagamento — regra de transferência às unidades hospitalares após o depósito no FMS.",
    ],
  },
  {
    n: 5,
    titulo: "Subempenho, liquidação e programação",
    curto: "Subempenho",
    objetivo:
      "Executar a cadeia financeira que transforma a cobertura do empenho em valor programado para pagamento.",
    antesDeComecar: [
      "A cobertura de empenho da instituição deve ser suficiente.",
      "O recebimento do recurso no FMS deve estar registrado.",
    ],
    passoAPasso: [
      "Emita a Solicitação de Subempenho/Liquidação para a instituição.",
      "Registre o Aviso de Movimento — Empenho em Liquidação.",
      "Registre o Aviso de Movimento — Subempenho.",
      "Se a Programação de Pagamento já existir, registre-a na mesma cadeia; ela não substitui os três registros obrigatórios anteriores.",
      "Quando houver mais de uma NE na competência, mantenha os itens separados e identifique de qual alocação/NE cada subempenho se origina.",
      "Confira se a soma dos subempenhos corresponde ao valor que será pago.",
    ],
    evidencias: [
      "Solicitação de Subempenho/Liquidação.",
      "Aviso de Movimento — Empenho em Liquidação.",
      "Aviso de Movimento — Subempenho.",
      "Programação de Pagamento, quando já emitida.",
    ],
    concluirQuando: [
      "Cada alocação possui Solicitação de Subempenho/Liquidação, movimento de Empenho em Liquidação e movimento de Subempenho.",
      "A soma dos subempenhos fecha exatamente com o valor de cada alocação de empenho.",
    ],
    atencao: [
      "Uma competência pode ter múltiplos subempenhos quando utiliza mais de uma NE.",
    ],
    baseNormativa: [
      "Fluxo de execução orçamentária e financeira municipal.",
      "Documentos SEI dos processos anuais de subempenho.",
    ],
  },
  {
    n: 6,
    titulo: "Pagamento",
    curto: "Pagamento",
    objetivo:
      "Registrar o repasse efetivo a cada hospital e controlar automaticamente o prazo iniciado com o crédito no FMS.",
    antesDeComecar: [
      "Portaria Municipal publicada.",
      "Subempenho/liquidação e programação concluídos.",
      "Recurso recebido no FMS.",
    ],
    passoAPasso: [
      "Registre cada pagamento realizado, com data e valor.",
      "Vincule o comprovante de pagamento.",
      "Se houver pagamento fracionado, registre cada parcela sem sobrescrever as anteriores.",
      "Confira valor pago × valor municipal da instituição.",
      "Observe o indicador de prazo: no prazo, vence em breve ou atrasado.",
    ],
    evidencias: [
      "Comprovante de pagamento.",
      "Data efetiva do pagamento.",
      "Valor efetivamente pago.",
    ],
    concluirQuando: [
      "O valor pago acumulado corresponde ao valor municipal devido à instituição.",
      "Todos os comprovantes estão vinculados.",
    ],
    atencao: [
      "O prazo de cinco dias úteis é calculado a partir do recebimento no FMS.",
      "Pagamento parcial não deve marcar a instituição como quitada.",
    ],
    baseNormativa: [
      "Portaria SES mensal de pagamento do PVH.",
      "Portaria Municipal da competência.",
    ],
  },
  {
    n: 7,
    titulo: "Comunicação institucional",
    curto: "Comunicação",
    objetivo:
      "Comunicar o pagamento apenas às instituições configuradas para receber notificação, preservando o e-mail e o processo SEI do envio.",
    antesDeComecar: [
      "O pagamento da instituição deve estar confirmado.",
      "Os e-mails institucionais devem estar cadastrados no cadastro mestre do prestador.",
      "A configuração PVH deve indicar se aquela instituição exige comunicação.",
    ],
    passoAPasso: [
      "O sistema identifica automaticamente quais instituições exigem e-mail.",
      "Selecione um ou mais destinatários cadastrados para a instituição.",
      "Revise o assunto e o corpo gerados com a competência correta.",
      "Registre o envio realizado via SEI.",
      "Informe número e link do processo SEI em que o e-mail ficou registrado.",
      "Instituições com comunicação desabilitada aparecem como Não aplicável e não bloqueiam o encerramento.",
    ],
    evidencias: [
      "Destinatários utilizados.",
      "Assunto e corpo da comunicação.",
      "Data/responsável pelo envio.",
      "Número e link do processo SEI do e-mail.",
    ],
    concluirQuando: [
      "Todas as instituições com notificação obrigatória foram comunicadas.",
      "Instituições sem obrigação estão explicitamente classificadas como Não aplicável.",
    ],
    atencao: [
      "Não presuma a obrigação de envio pelo tipo de hospital; a regra vem da configuração vigente da instituição.",
    ],
    baseNormativa: [
      "Rotina institucional de comunicação e registros históricos do PVH.",
    ],
  },
  {
    n: 8,
    titulo: "Encerramento e prestação de contas",
    curto: "Encerramento",
    objetivo:
      "Fechar a competência somente depois da conciliação integral e encaminhar a prestação de contas para as instituições que possuem essa obrigação.",
    antesDeComecar: [
      "Todas as etapas financeiras obrigatórias devem estar concluídas.",
      "As comunicações obrigatórias devem estar realizadas.",
      "A configuração de cada instituição define se há prestação de contas.",
    ],
    passoAPasso: [
      "Confira Estado × Município × empenhado/alocado × subempenhado × pago.",
      "Confirme que não existem pendências de documentos ou reconferência.",
      "Para instituições com prestação de contas, abra/vincule o acompanhamento correspondente.",
      "Registre relatório de aplicação e extrato bancário quando exigidos pelo instrumento.",
      "Gere o relatório executivo da competência.",
      "Registre o encerramento e o responsável.",
    ],
    evidencias: [
      "Conciliação financeira final.",
      "Prestação de contas, quando aplicável.",
      "Relatório executivo da competência.",
      "Registro de encerramento.",
    ],
    concluirQuando: [
      "Não existe saldo financeiro inexplicado.",
      "Todas as obrigações condicionais estão concluídas ou formalmente não aplicáveis.",
      "A competência possui rastreabilidade suficiente para reconstrução futura do processo.",
    ],
    atencao: [
      "A prestação de contas é configurável por instituição; não use o nome do hospital como regra no código.",
      "O encerramento financeiro não deve apagar nem alterar o histórico dos documentos.",
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
  4: [1],
  5: [3, 4],
  6: [2, 5],
  7: [6],
  8: [2, 3, 4, 5, 6, 7],
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
  if (status === "encerrada") return 8;
  for (const etapa of PVH_ETAPAS) {
    if (!concluidas?.[String(etapa.n)]) return etapa.n;
  }
  return 8;
}

export function etapaPrincipalPvh(
  concluidas: Record<string, boolean> | null | undefined,
  status?: string | null,
  reconferir: number[] | null | undefined = [],
) {
  const primeiraReconferencia = [...new Set(reconferir ?? [])]
    .filter((n) => n >= 1 && n <= 8)
    .sort((a, b) => a - b)[0];

  return primeiraReconferencia ?? etapaAtualPvh(concluidas, status);
}

export function etapaNavegavelPvh(
  n: number,
  concluidas: Record<string, boolean> | null | undefined,
  reconferir: number[] | null | undefined = [],
  status?: string | null,
) {
  if (n < 1 || n > 8) return false;
  if (status === "encerrada") return true;
  return etapaLiberadaPvh(n, concluidas, reconferir);
}

export function etapaLiberadaPvh(
  n: number,
  concluidas: Record<string, boolean> | null | undefined,
  reconferir: number[] | null | undefined = [],
) {
  if (n < 1 || n > 8) return false;
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
