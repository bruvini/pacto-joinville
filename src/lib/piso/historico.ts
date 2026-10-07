import { SITUACAO_PARTICIPANTE, STATUS_COMPETENCIA } from "./etapas";

type LogPiso = {
  acao?: string | null;
  detalhes?: unknown;
};

export type EventoPisoFormatado = {
  titulo: string;
  linhas: string[];
};

const entidades: Record<string, string> = {
  piso_competencias: "Competência",
  piso_participantes: "Instituição participante",
  piso_participante_cnes: "CNES da instituição",
  piso_obrigacoes: "Obrigação financeira",
  piso_documentos: "Documento",
  piso_documento_assinaturas: "Assinatura do documento",
  piso_encaminhamentos: "Encaminhamento",
  piso_arquivos: "Arquivo",
  piso_notificacoes_email: "Notificação por e-mail",
};

const entidadesFemininas = new Set([
  "piso_competencias",
  "piso_participantes",
  "piso_obrigacoes",
  "piso_documento_assinaturas",
  "piso_notificacoes_email",
]);

const campos: Record<string, string> = {
  competencia: "Competência",
  status: "Situação da competência",
  situacao: "Situação da instituição",
  data_envio: "Data de envio",
  data_retorno: "Data de retorno",
  valor_devido: "Valor devido",
  valor_recurso_atual: "Recurso atual",
  valor_saldo_afc: "Saldo AFC",
  valor_pago: "Valor pago",
  data_pagamento: "Data de pagamento",
  data_programacao: "Data da programação",
  valor_homologado: "Valor homologado",
  valor_apurado_investsus: "Valor apurado no InvestSUS",
  credito_fms_valor: "Crédito no FMS",
  credito_fms_data: "Data do crédito no FMS",
  total_publicado_municipal: "Total publicado na portaria municipal",
  processo_sei: "Processo SEI",
  link_processo_sei: "Link do processo SEI",
  tipo: "Tipo de documento",
  numero_sei: "Número SEI",
  slot: "Responsável pela assinatura",
  servidor_nome: "Responsável",
  destino: "Destino",
  acao: "Ação",
  etapas_concluidas: "Andamento das etapas",
  destinatarios: "Destinatários",
  assunto: "Assunto",
  enviado_em: "Envio registrado em",
  enviado_por_nome: "Responsável pelo envio",
  processo_sei_numero: "Processo SEI do e-mail",
  processo_sei_link: "Link do processo SEI do e-mail",
};

const valores: Record<string, string> = {
  ...STATUS_COMPETENCIA,
  ...SITUACAO_PARTICIPANTE,
  encaminhado: "Encaminhado",
  revertido: "Encaminhamento revertido",
  minuta: "Minuta",
  memorando: "Memorando",
  portaria_municipal: "Portaria municipal",
  solicitacao_ne: "Solicitação de nota de empenho",
  nota_empenho: "Nota de empenho",
  subempenho_liquidacao: "Subempenho / liquidação",
  aviso_movimento: "Aviso de movimento",
  programacao_pagamento: "Programação de pagamento",
  comprovante_pagamento: "Comprovante de pagamento",
};

const camposMonetarios = new Set([
  "valor_devido",
  "valor_recurso_atual",
  "valor_saldo_afc",
  "valor_pago",
  "valor_homologado",
  "valor_apurado_investsus",
  "credito_fms_valor",
  "total_publicado_municipal",
  "saldo_afc_anterior",
  "desconto_saldo",
  "acerto_contas",
  "valor_transferido",
]);

const camposData = new Set([
  "data_envio",
  "data_retorno",
  "data_pagamento",
  "credito_fms_data",
  "investsus_carga_em",
  "investsus_confirmacao_em",
  "portaria_gm_data_publicacao",
  "data_programacao",
]);

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function formatarValor(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "não informado";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (camposMonetarios.has(campo) && !Number.isNaN(Number(valor))) {
    return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (camposData.has(campo) && typeof valor === "string") {
    const data = new Date(`${valor.slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(data.getTime())) return data.toLocaleDateString("pt-BR");
  }
  if (campo === "enviado_em" && typeof valor === "string") {
    const data = new Date(valor);
    if (!Number.isNaN(data.getTime())) return data.toLocaleString("pt-BR");
  }
  if (Array.isArray(valor)) return valor.join(", ");
  if (typeof valor === "string") return valores[valor] ?? valor;
  if (typeof valor === "number") return valor.toLocaleString("pt-BR");
  return "Atualizado";
}

export function formatarEventoPiso(log: LogPiso): EventoPisoFormatado {
  const correspondencia = log.acao?.match(/^Piso · (criado|atualizado|removido): (.+)$/);
  if (!correspondencia) return { titulo: "Atividade registrada na competência", linhas: [] };

  const [, operacao, tabela] = correspondencia;
  const entidade = entidades[tabela] ?? "Item da competência";
  const sufixo = entidadesFemininas.has(tabela) ? "a" : "o";
  const detalhes = objeto(log.detalhes);
  const instituicao =
    typeof detalhes.instituicao_nome === "string" ? detalhes.instituicao_nome : "";

  if (operacao === "criado") {
    const tipo = typeof detalhes.tipo === "string" ? (valores[detalhes.tipo] ?? detalhes.tipo) : "";
    const arquivo = typeof detalhes.arquivo === "string" ? detalhes.arquivo : "";
    const destino = typeof detalhes.destino === "string" ? detalhes.destino : "";
    const categoria = typeof detalhes.categoria === "string" ? detalhes.categoria : "";
    const competencia = typeof detalhes.competencia === "string" ? detalhes.competencia : "";
    const titulo =
      tabela === "piso_competencias"
        ? competencia
          ? `Competência ${competencia} criada`
          : "Competência criada"
        : tabela === "piso_participantes"
          ? instituicao
            ? `${instituicao} adicionada à competência`
            : "Instituição adicionada à competência"
          : tabela === "piso_arquivos"
            ? categoria === "planilha_carga"
              ? `Planilha de Carga anexada${instituicao ? ` — ${instituicao}` : ""}`
              : categoria === "investsus"
                ? "Planilha de Resultado do InvestSUS importada"
                : categoria === "portaria_gm"
                  ? "Portaria GM/MS importada"
                  : `Arquivo adicionado à competência${instituicao ? ` — ${instituicao}` : ""}`
            : tabela === "piso_obrigacoes" && instituicao
              ? `Obrigação financeira registrada — ${instituicao}`
              : tabela === "piso_notificacoes_email"
                ? `Notificação por e-mail preparada${instituicao ? ` — ${instituicao}` : ""}`
              : tabela === "piso_documentos" && tipo === "Minuta"
                ? "Minuta registrada"
                : tabela === "piso_documentos" && tipo === "Memorando"
                  ? "Memorando registrado"
                  : tabela === "piso_documentos" && tipo === "Portaria municipal"
                    ? "Portaria municipal publicada"
                    : tabela === "piso_documentos" && tipo === "Nota de empenho"
                      ? `Nota de Empenho registrada${instituicao ? ` — ${instituicao}` : ""}`
                      : `${entidade} adicionad${sufixo}`;
    return {
      titulo,
      linhas: [
        tabela === "piso_participantes" && !instituicao
          ? "Identificação da instituição não registrada neste evento histórico."
          : "",
        arquivo,
        tipo && `Tipo: ${tipo}`,
        destino && `Destino: ${destino}`,
      ].filter(Boolean) as string[],
    };
  }

  if (operacao === "removido") {
    return {
      titulo: `${instituicao || entidade} removid${instituicao ? "a" : sufixo}`,
      linhas: [],
    };
  }

  const linhas = Object.entries(detalhes).flatMap(([campo, mudanca]) => {
    if (!(campo in campos)) return [];
    const alteracao = objeto(mudanca);
    if (!("para" in alteracao)) return [];
    const anterior = formatarValor(campo, alteracao.de);
    const atual = formatarValor(campo, alteracao.para);
    return [`${campos[campo]}: ${anterior} → ${atual}`];
  });

  if (tabela === "piso_participantes") {
    const envio = objeto(detalhes.data_envio).para;
    const retorno = objeto(detalhes.data_retorno).para;
    const semElegiveis = objeto(detalhes.sem_elegiveis).para;
    const auditoria = objeto(detalhes.auditoria_planilha);
    if (envio)
      return {
        titulo: `Envio registrado${instituicao ? ` — ${instituicao}` : ""}`,
        linhas: [formatarValor("data_envio", envio)],
      };
    if (retorno)
      return {
        titulo: `Retorno registrado${instituicao ? ` — ${instituicao}` : ""}`,
        linhas: [formatarValor("data_retorno", retorno)],
      };
    if (semElegiveis === true)
      return {
        titulo: `${instituicao || "Instituição"} informou não possuir profissionais elegíveis`,
        linhas: [],
      };
    if (Object.keys(auditoria).length)
      return {
        titulo: `Planilha de Carga auditada${instituicao ? ` — ${instituicao}` : ""}`,
        linhas: [
          `${Number(auditoria.linhas ?? 0)} registros · ${Number(auditoria.ocorrencias ?? 0)} ocorrência(s)`,
        ],
      };
  }
  if (tabela === "piso_competencias") {
    const portaria = objeto(detalhes.portaria_gm_numero).para;
    const conciliacao = objeto(detalhes.conciliacao_auditoria);
    if (portaria)
      return {
        titulo: `Portaria GM/MS nº ${formatarValor("portaria_gm_numero", portaria)} importada`,
        linhas,
      };
    if (Object.keys(conciliacao).length)
      return {
        titulo:
          Number(conciliacao.criticas ?? 0) === 0
            ? "Conciliação concluída sem críticas bloqueantes"
            : "Conciliação concluída com críticas bloqueantes",
        linhas: [
          `${Number(conciliacao.criticas ?? 0)} crítica(s) · ${Number(conciliacao.alertas ?? 0)} alerta(s)`,
        ],
      };
    const carga = objeto(detalhes.investsus_carga_em).para;
    const confirmacao = objeto(detalhes.investsus_confirmacao_em).para;
    if (carga)
      return {
        titulo: "Competência atualizada no InvestSUS",
        linhas: [formatarValor("investsus_carga_em", carga)],
      };
    if (confirmacao)
      return {
        titulo: "Confirmação final do InvestSUS registrada",
        linhas: [formatarValor("investsus_confirmacao_em", confirmacao)],
      };
    if (objeto(detalhes.credito_fms_data).para || objeto(detalhes.credito_fms_valor).para)
      return { titulo: "Crédito no FMS confirmado", linhas };
  }
  if (tabela === "piso_obrigacoes" && objeto(detalhes.data_pagamento).para) {
    return { titulo: `Pagamento registrado${instituicao ? ` — ${instituicao}` : ""}`, linhas };
  }
  if (tabela === "piso_notificacoes_email" && objeto(detalhes.enviado_em).para) {
    return {
      titulo: `E-mail de pagamento registrado${instituicao ? ` — ${instituicao}` : ""}`,
      linhas,
    };
  }
  if (tabela === "piso_obrigacoes" && objeto(detalhes.movimento_transmitido).para === true) {
    return {
      titulo: `Movimento em liquidação transmitido${instituicao ? ` — ${instituicao}` : ""}`,
      linhas,
    };
  }

  return { titulo: `${entidade} atualizad${sufixo}`, linhas };
}

export function formatarDataHoraEvento(valor: string): string {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Data não informada";
  return `${data.toLocaleDateString("pt-BR")} às ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
