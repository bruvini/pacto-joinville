import { brl, dateTime } from "@/lib/format";
import { STATUS_PVH } from "@/lib/pvh/etapas";

export type ContextoHistoricoPvh = {
  competencia?: any;
  participantes?: any[];
};

export type EventoHistoricoPvhFormatado = {
  titulo: string;
  detalhes: string[];
};

const TABELAS: Record<string, string> = {
  pvh_competencias: "Competência PVH",
  pvh_participantes: "Instituição participante",
  pvh_documentos: "Documento municipal",
  pvh_documento_assinaturas: "Assinatura de documento",
  pvh_processos_anuais: "Processo anual",
  pvh_empenhos: "Nota de Empenho",
  pvh_empenho_alocacoes: "Alocação de empenho",
  pvh_empenho_solicitacao_assinaturas: "Assinatura da solicitação de empenho",
  pvh_subempenhos: "Subempenho e liquidação",
  pvh_subempenho_assinaturas: "Assinatura de subempenho",
  pvh_pagamentos: "Pagamento",
  pvh_notificacoes_email: "Comunicação institucional",
  pvh_normativas: "Base normativa",
  pvh_prestador_config: "Configuração da instituição",
};

const CAMPOS: Record<string, string> = {
  competencia: "Competência",
  status: "Situação",
  observacao: "Observação",
  portaria_estadual_numero: "Portaria estadual",
  portaria_estadual_data: "Data da Portaria estadual",
  portaria_estadual_url: "Link oficial da Portaria estadual",
  portaria_municipal_numero: "Portaria Municipal",
  portaria_municipal_data: "Data da Portaria Municipal",
  portaria_municipal_link: "Link da Portaria Municipal",
  minuta_municipal_numero: "Nº SEI da Minuta",
  minuta_municipal_link: "Link SEI da Minuta",
  memorando_municipal_numero: "Nº SEI do Memorando",
  memorando_municipal_link: "Link SEI do Memorando",
  recurso_fms_data: "Data do crédito no FMS",
  recurso_fms_valor: "Valor creditado no FMS",
  recurso_fms_referencia: "Referência do crédito no FMS",
  recurso_fms_link: "Comprovante/link do crédito no FMS",
  valor_estadual: "Valor publicado pelo Estado",
  valor_municipal: "Valor municipal",
  valor_pago: "Valor pago",
  notificar_email: "Notificação por e-mail",
  exige_prestacao_contas: "Prestação de contas obrigatória",
  prazo_prestacao_contas_dias: "Prazo da prestação de contas",
  cr_dotacao: "CR / dotação",
  natureza_despesa: "Natureza da despesa",
  fonte_recurso: "Fonte de recurso",
  processo_empenho_sei: "Processo SEI de empenho",
  processo_subempenho_sei: "Processo SEI de subempenho",
  tipo_codigo: "Tipo de documento",
  numero: "Número",
  numero_sei: "Nº SEI",
  link_documento: "Link do documento",
  data_documento: "Data do documento",
  numero_ne: "Número da NE",
  valor_total: "Valor total",
  solicitacao_data: "Data da solicitação",
  solicitacao_sei_numero: "Nº SEI da solicitação",
  solicitacao_sei_link: "Link SEI da solicitação",
  solicitacao_enviada_sefaz: "Solicitação encaminhada à SEFAZ",
  solicitacao_enviada_aco: "Solicitação encaminhada à UFI",
  data_emissao: "Data de emissão",
  nota_empenho_sei_numero: "Nº SEI da Nota de Empenho",
  nota_empenho_sei_link: "Link SEI da Nota de Empenho",
  valor_alocado: "Valor alocado",
  numero_subempenho: "Número do subempenho",
  valor: "Valor",
  movimento_subempenho_data: "Data do subempenho",
  movimento_subempenho_sei_numero: "Nº SEI do subempenho",
  movimento_liquidacao_data: "Data da liquidação",
  movimento_liquidacao_sei_numero: "Nº SEI da liquidação",
  programacao_pagamento_data: "Data da programação de pagamento",
  programacao_pagamento_sei_numero: "Nº SEI da programação de pagamento",
  data_programacao: "Data da programação",
  data_pagamento: "Data do pagamento",
  comprovante_sei_numero: "Nº SEI do comprovante",
  comprovante_sei_link: "Link do comprovante",
  destinatarios: "Destinatários",
  enviado_em: "Enviado em",
  enviado_por_nome: "Enviado por",
  processo_sei_numero: "Nº do processo SEI",
  processo_sei_link: "Link do processo SEI",
  assinante_nome: "Signatário",
  servidor_nome: "Signatário",
  cargo: "Cargo",
  papel_funcao: "Função na assinatura",
  slot: "Papel de assinatura",
  documento_tipo: "Documento assinado",
  codigo_sei: "Código SEI",
  assinado_em: "Assinado em",
  revogado_em: "Assinatura revogada em",
  motivo_revogacao: "Motivo da revogação",
  etapas_concluidas: "Etapas concluídas",
  etapas_reconferir: "Etapas para reconferência",
};

const OCULTOS = new Set([
  "id",
  "competencia_id",
  "prestador_id",
  "normativa_id",
  "config_origem_id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "updated_by_nome",
  "usuario_id",
  "registrado_por",
  "revogado_por",
  "assinado_por",
  "empenho_id",
  "alocacao_id",
  "participante_id",
  "processo_anual_id",
  "solicitacao_competencia_id",
  "normativa_referenciada_id",
  "pvh_competencia_id_original",
]);

const CAMPOS_MOEDA = new Set([
  "valor",
  "valor_estadual",
  "valor_municipal",
  "valor_pago",
  "valor_total",
  "valor_alocado",
  "recurso_fms_valor",
]);

const CAMPOS_DATA = new Set([
  "portaria_estadual_data",
  "portaria_municipal_data",
  "recurso_fms_data",
  "data_documento",
  "solicitacao_data",
  "data_emissao",
  "movimento_subempenho_data",
  "movimento_liquidacao_data",
  "programacao_pagamento_data",
  "data_programacao",
  "data_pagamento",
]);

const CAMPOS_LINK = new Set([
  "portaria_estadual_url",
  "portaria_municipal_link",
  "minuta_municipal_link",
  "memorando_municipal_link",
  "recurso_fms_link",
  "link_documento",
  "solicitacao_sei_link",
  "nota_empenho_sei_link",
  "comprovante_sei_link",
  "processo_sei_link",
]);

const TIPOS_DOCUMENTO: Record<string, string> = {
  minuta_portaria_municipal: "Minuta da Portaria Municipal",
  memorando_portaria_municipal: "Memorando de encaminhamento",
  portaria_municipal_publicada: "Portaria Municipal publicada",
};

const objeto = (valor: unknown): Record<string, any> =>
  valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, any>)
    : {};

const vazio = (valor: unknown) =>
  valor === null ||
  valor === undefined ||
  valor === "" ||
  (Array.isArray(valor) && valor.length === 0);

const humanizarIdentificador = (valor: string) => {
  const limpo = valor.replace(/^pvh_/, "").replaceAll("_", " ").trim();
  return limpo ? limpo.charAt(0).toUpperCase() + limpo.slice(1) : valor;
};

export function rotuloTipoDocumentoPvh(tipo?: string | null) {
  if (!tipo) return "Documento municipal";
  return TIPOS_DOCUMENTO[tipo] ?? humanizarIdentificador(tipo);
}

const nomePrestador = (
  registro: Record<string, any>,
  participantes: any[] = [],
): string | null => {
  const participante =
    participantes.find((item) => item.id === registro.participante_id) ??
    participantes.find((item) => item.id === registro.id) ??
    participantes.find((item) => item.prestador_id === registro.prestador_id);

  const prestador = Array.isArray(participante?.prestadores)
    ? participante.prestadores[0]
    : participante?.prestadores;

  return prestador?.nome_instituicao ?? null;
};

const etapasMarcadas = (valor: unknown) => {
  if (Array.isArray(valor)) {
    const itens = valor.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    return itens.length ? itens.map((n) => `Etapa ${n}`).join(", ") : "Nenhuma";
  }

  const mapa = objeto(valor);
  const itens = Object.entries(mapa)
    .filter(([, ativo]) => ativo === true)
    .map(([n]) => Number(n))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  return itens.length ? itens.map((n) => `Etapa ${n}`).join(", ") : "Nenhuma";
};

const formatarData = (valor: unknown) => {
  if (!valor) return "—";
  const texto = String(valor);
  const somenteData = /^\d{4}-\d{2}-\d{2}$/.test(texto);
  const data = new Date(somenteData ? `${texto}T12:00:00` : texto);
  if (Number.isNaN(data.getTime())) return texto;
  return somenteData ? data.toLocaleDateString("pt-BR") : dateTime(data.toISOString());
};

const formatarValor = (campo: string, valor: unknown) => {
  if (vazio(valor)) return "—";
  if (CAMPOS_MOEDA.has(campo)) return brl(Number(valor));
  if (CAMPOS_DATA.has(campo)) return formatarData(valor);
  if (campo.endsWith("_em")) return formatarData(valor);
  if (CAMPOS_LINK.has(campo)) return "Link registrado";
  if (campo === "tipo_codigo") return rotuloTipoDocumentoPvh(String(valor));
  if (campo === "status") return STATUS_PVH[String(valor)] ?? humanizarIdentificador(String(valor));
  if (campo === "etapas_concluidas" || campo === "etapas_reconferir")
    return etapasMarcadas(valor);
  if (campo === "dados") return "Dados complementares atualizados";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (Array.isArray(valor)) {
    return valor
      .map((item) =>
        typeof item === "object"
          ? [item?.unidade, item?.nome, item?.cargo].filter(Boolean).join(" · ") ||
            JSON.stringify(item)
          : String(item),
      )
      .join("; ");
  }
  if (typeof valor === "object") return "Dados estruturados atualizados";
  return String(valor);
};

const rotuloCampo = (campo: string) =>
  CAMPOS[campo] ?? humanizarIdentificador(campo);

const camposVisiveis = (registro: Record<string, any>) =>
  Object.keys(registro).filter(
    (campo) =>
      !OCULTOS.has(campo) &&
      !campo.endsWith("_id") &&
      campo !== "dados" &&
      !vazio(registro[campo]),
  );

const detalhesInclusao = (registro: Record<string, any>) =>
  camposVisiveis(registro).map(
    (campo) => `${rotuloCampo(campo)}: ${formatarValor(campo, registro[campo])}`,
  );

const detalhesAlteracao = (
  antes: Record<string, any>,
  depois: Record<string, any>,
) => {
  const campos = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  const detalhes: string[] = [];

  for (const campo of campos) {
    if (OCULTOS.has(campo) || campo.endsWith("_id") || campo === "dados") continue;
    if (JSON.stringify(antes[campo]) === JSON.stringify(depois[campo])) continue;

    const anterior = formatarValor(campo, antes[campo]);
    const atual = formatarValor(campo, depois[campo]);
    detalhes.push(
      vazio(antes[campo])
        ? `${rotuloCampo(campo)}: ${atual}`
        : vazio(depois[campo])
          ? `${rotuloCampo(campo)}: removido`
          : `${rotuloCampo(campo)}: ${anterior} → ${atual}`,
    );
  }

  if (
    JSON.stringify(antes.dados) !== JSON.stringify(depois.dados) &&
    (!vazio(antes.dados) || !vazio(depois.dados))
  ) {
    detalhes.push("Dados complementares do registro foram atualizados.");
  }

  return detalhes;
};

const tituloGenerico = (
  tabela: string,
  operacao: "insert" | "update" | "delete",
) => {
  const entidade = TABELAS[tabela] ?? humanizarIdentificador(tabela);
  const verbo =
    operacao === "insert"
      ? "registrado"
      : operacao === "update"
        ? "atualizado"
        : "removido";
  return `${entidade} ${verbo}`;
};

const tituloEvento = (
  tabela: string,
  operacao: "insert" | "update" | "delete",
  registro: Record<string, any>,
  contexto: ContextoHistoricoPvh,
) => {
  const instituicao = nomePrestador(registro, contexto.participantes);

  if (tabela === "pvh_competencias") {
    const comp = registro.competencia ?? contexto.competencia?.competencia;
    if (operacao === "insert") return `Competência PVH criada${comp ? ` · ${comp}` : ""}`;
    if (operacao === "delete") return `Competência PVH excluída${comp ? ` · ${comp}` : ""}`;
    return `Competência PVH atualizada${comp ? ` · ${comp}` : ""}`;
  }

  if (tabela === "pvh_participantes") {
    const sufixo = instituicao ? ` · ${instituicao}` : "";
    if (operacao === "insert") return `Instituição incluída na competência${sufixo}`;
    if (operacao === "delete") return `Instituição removida da competência${sufixo}`;
    return `Dados da instituição atualizados${sufixo}`;
  }

  if (tabela === "pvh_documentos") {
    const tipo = rotuloTipoDocumentoPvh(registro.tipo_codigo);
    if (operacao === "insert") return `${tipo} registrado`;
    if (operacao === "delete") return `${tipo} removido`;
    return `${tipo} atualizado`;
  }

  if (
    tabela === "pvh_documento_assinaturas" ||
    tabela === "pvh_empenho_solicitacao_assinaturas" ||
    tabela === "pvh_subempenho_assinaturas"
  ) {
    const pessoa = registro.assinante_nome ?? registro.servidor_nome;
    const sufixo = pessoa ? ` · ${pessoa}` : "";
    if (operacao === "insert") return `Assinatura registrada${sufixo}`;
    if (operacao === "delete") return `Assinatura removida${sufixo}`;
    return `Assinatura atualizada${sufixo}`;
  }

  if (tabela === "pvh_empenhos") {
    const ne = registro.numero_ne ? ` · NE ${registro.numero_ne}` : "";
    if (operacao === "insert") return `Nota de Empenho cadastrada${ne}`;
    if (operacao === "delete") return `Nota de Empenho removida${ne}`;
    return `Nota de Empenho atualizada${ne}`;
  }

  if (tabela === "pvh_empenho_alocacoes") {
    const sufixo = instituicao ? ` · ${instituicao}` : "";
    if (operacao === "insert") return `Empenho alocado à competência${sufixo}`;
    if (operacao === "delete") return `Alocação de empenho removida${sufixo}`;
    return `Alocação de empenho atualizada${sufixo}`;
  }

  if (tabela === "pvh_subempenhos") {
    const numero = registro.numero_subempenho
      ? ` · ${registro.numero_subempenho}`
      : "";
    if (operacao === "insert") return `Subempenho registrado${numero}`;
    if (operacao === "delete") return `Subempenho removido${numero}`;
    return `Subempenho/liquidação atualizado${numero}`;
  }

  if (tabela === "pvh_pagamentos") {
    const sufixo = instituicao ? ` · ${instituicao}` : "";
    if (operacao === "insert") return `Pagamento registrado${sufixo}`;
    if (operacao === "delete") return `Pagamento removido${sufixo}`;
    return `Pagamento atualizado${sufixo}`;
  }

  if (tabela === "pvh_notificacoes_email") {
    const sufixo = instituicao ? ` · ${instituicao}` : "";
    if (operacao === "insert") return `Comunicação institucional registrada${sufixo}`;
    if (operacao === "delete") return `Comunicação institucional removida${sufixo}`;
    return `Comunicação institucional atualizada${sufixo}`;
  }

  return tituloGenerico(tabela, operacao);
};

export function formatarEventoHistoricoPvh(
  log: any,
  contexto: ContextoHistoricoPvh = {},
): EventoHistoricoPvhFormatado {
  const acao = String(log?.acao ?? "Evento do PVH");
  const match = acao.match(
    /^PVH\s*·\s*(insert|update|delete)\s*:\s*([a-z0-9_]+)$/i,
  );

  if (!match) {
    const titulo = acao
      .replace(/\binsert\b/gi, "inclusão")
      .replace(/\bupdate\b/gi, "atualização")
      .replace(/\bdelete\b/gi, "exclusão")
      .replace(/pvh_[a-z0-9_]+/gi, (item) => TABELAS[item] ?? humanizarIdentificador(item))
      .replaceAll("_", " ");
    return { titulo, detalhes: [] };
  }

  const operacao = match[1].toLowerCase() as "insert" | "update" | "delete";
  const tabela = match[2];
  const detalhes = objeto(log?.detalhes);
  const antes = objeto(detalhes.antes);
  const depois = objeto(detalhes.depois);
  const registro = operacao === "delete" ? antes : depois;

  return {
    titulo: tituloEvento(tabela, operacao, registro, contexto),
    detalhes:
      operacao === "update"
        ? detalhesAlteracao(antes, depois)
        : detalhesInclusao(registro),
  };
}

export function ordenarHistoricoPvh(logs: any[]) {
  const prioridadeEntidade = (acao: string) => {
    const tabela = acao.match(/:\s*([a-z0-9_]+)$/i)?.[1] ?? "";
    if (tabela === "pvh_competencias") return 0;
    if (tabela === "pvh_participantes") return 10;
    if (tabela === "pvh_documentos") return 20;
    if (tabela.includes("assinaturas")) return 30;
    if (tabela === "pvh_empenhos") return 40;
    if (tabela === "pvh_empenho_alocacoes") return 50;
    if (tabela === "pvh_subempenhos") return 60;
    if (tabela === "pvh_pagamentos") return 70;
    if (tabela === "pvh_notificacoes_email") return 80;
    return 90;
  };

  return [...logs].sort((a, b) => {
    const ta = new Date(a?.data_hora ?? 0).getTime();
    const tb = new Date(b?.data_hora ?? 0).getTime();
    if (ta !== tb) return ta - tb;
    return prioridadeEntidade(String(a?.acao ?? "")) - prioridadeEntidade(String(b?.acao ?? ""));
  });
}
