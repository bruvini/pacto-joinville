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
};

const entidadesFemininas = new Set([
  "piso_competencias",
  "piso_participantes",
  "piso_obrigacoes",
  "piso_documento_assinaturas",
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

  if (operacao === "criado") {
    const tipo = typeof detalhes.tipo === "string" ? (valores[detalhes.tipo] ?? detalhes.tipo) : "";
    const arquivo = typeof detalhes.arquivo === "string" ? detalhes.arquivo : "";
    const destino = typeof detalhes.destino === "string" ? detalhes.destino : "";
    const titulo =
      tabela === "piso_competencias"
        ? "Competência criada"
        : tabela === "piso_participantes"
          ? "Instituição adicionada à competência"
          : tabela === "piso_arquivos"
            ? "Arquivo adicionado à competência"
            : `${entidade} adicionad${sufixo}`;
    return {
      titulo,
      linhas: [arquivo, tipo && `Tipo: ${tipo}`, destino && `Destino: ${destino}`].filter(
        Boolean,
      ) as string[],
    };
  }

  if (operacao === "removido") {
    return { titulo: `${entidade} removid${sufixo}`, linhas: [] };
  }

  const linhas = Object.entries(detalhes).flatMap(([campo, mudanca]) => {
    if (!(campo in campos)) return [];
    const alteracao = objeto(mudanca);
    if (!("para" in alteracao)) return [];
    const anterior = formatarValor(campo, alteracao.de);
    const atual = formatarValor(campo, alteracao.para);
    return [`${campos[campo]}: ${anterior} → ${atual}`];
  });

  if (tabela === "piso_participantes" && objeto(detalhes.situacao).para === "retornado") {
    return { titulo: "Retorno da instituição registrado", linhas };
  }

  return { titulo: `${entidade} atualizad${sufixo}`, linhas };
}

export function formatarDataHoraEvento(valor: string): string {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Data não informada";
  return `${data.toLocaleDateString("pt-BR")} às ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
