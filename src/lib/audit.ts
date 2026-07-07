import { brl, dateTime, statusAcoLabel } from "@/lib/format";

const LABELS: Record<string, string> = {
  parcela: "Parcela",
  competencia: "Competência",
  mes_pagamento_previsto: "Mês de Pagamento",
  valor_solicitado: "Valor Solicitado",
  link_solicitacao_sei: "Link Solicitação SEI",
  em_bloco_revisao: "Em bloco p/ revisão",
  revisao_aprovada: "Revisão aprovada",
  revisao_obs: "Observações da revisão",
  sefaz_etapa1_em: "Envio à SEFAZ (Solicitação)",
  dotacao_orcamentaria: "Dotação Orçamentária",
  fonte_pagamento: "Fonte de Pagamento",
  status_aco: "Status do Orçamento",
  numero_empenho: "Nº da Nota de Empenho",
  link_empenho_sei: "Link Nota de Empenho",
  valor_atestado: "Valor Atestado",
  link_relatorio_tecnico_sei: "Link Relatório Técnico",
  link_relatorio_analise_sei: "Link Relatório de Análise",
  link_certidoes_sei: "Link Certidões",
  link_solicitacao_liberacao_sei: "Link Solicitação de Liberação",
  link_subempenho_sei: "Link Subempenho",
  link_programacao_pagamento_sei: "Link Programação de Pagamento",
  link_comprovante_pagamento_sei: "Link Comprovante de Pagamento",
  sefaz_etapa4_em: "Envio à SEFAZ (Liberação)",
  link_solicitacao_anulacao: "Link Solicitação de Anulação",
  link_anulacao_sei: "Link Anulação",
  sefaz_etapa5_em: "Envio à SEFAZ (Anulação)",
  concluido: "Processo concluído",
  responsavel_atual: "Responsável",
  parcelas_competencia: "Parcelas por competência",
  // Prestação de contas (a trilha grava os campos com prefixo pc_)
  pc_status: "PC · Situação",
  pc_data_recebimento: "PC · Data de recebimento",
  pc_link_prestacao_sei: "PC · Link da prestação (SEI)",
  pc_numero_processo_pc: "PC · Nº do processo (SEI)",
  pc_responsavel_id: "PC · Responsável",
  pc_redistribuir: "PC · Em fila de redistribuição",
  pc_observacao: "PC · Observação",
  pc_link_relatorio_analise_sei: "PC · Relatório de Análise/Ofício (SEI)",
  pc_data_envio_entidade: "PC · Envio à Entidade",
  pc_data_retorno_entidade: "PC · Retorno da Entidade",
  pc_link_parecer_ses_sei: "PC · Parecer Técnico SES (SEI)",
  pc_data_parecer_ses: "PC · Data do Parecer SES",
  pc_data_enc_cgm: "PC · Encaminhamento à CGM",
  pc_data_retorno_cgm: "PC · Retorno da CGM",
  pc_link_manifestacao_cgm_sei: "PC · Manifestação CGM (SEI)",
  pc_status_cgm: "PC · Status CGM",
  pc_data_baixa_contabil: "PC · Baixa contábil",
  pc_situacao_baixa: "PC · Situação da baixa",
  pc_exercicio_baixa: "PC · Exercício da baixa",
  pc_valor_aprovado: "PC · Valor aprovado",
  pc_valor_glosado: "PC · Valor glosado",
  pc_parecer: "PC · Parecer da análise",
  pc_decidido_por: "PC · Decidido por",
  pc_decidido_em: "PC · Decidido em",
};

const OCULTOS = new Set(["created_by", "prestador_id", "convenio_id", "termo_aditivo_id", "updated_at", "created_at", "valor_anulado", "data_limite", "parcelas_competencia", "parent_id"]);

export const rotuloCampo = (c: string) => LABELS[c] ?? c;

export function formatarValor(campo: string, v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  // Campos de prestação de contas chegam com prefixo pc_ — usa a mesma heurística.
  const base = campo.startsWith("pc_") ? campo.slice(3) : campo;
  if (base.startsWith("valor_")) return brl(Number(v));
  if (base.endsWith("_em")) return dateTime(v);
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (campo === "status_aco") return statusAcoLabel[v] ?? String(v);
  if (campo === "responsavel_atual") return String(v).toUpperCase();
  const s = String(v);
  if (base.startsWith("link_")) return s.length > 44 ? s.slice(0, 44) + "…" : s;
  return s;
}

/** Diffs visíveis de um log (ignora campos técnicos). */
export function mudancasVisiveis(detalhes: any): [string, any][] {
  if (!detalhes || typeof detalhes !== "object") return [];
  return Object.entries(detalhes).filter(([k]) => !OCULTOS.has(k));
}

/** Agrupa autosaves "Campos atualizados" do mesmo minuto/usuário num só registro. */
export function agruparLogs(logs: any[]): any[] {
  const out: any[] = [];
  for (const l of logs) {
    const min = String(l.data_hora ?? "").slice(0, 16);
    const last = out[out.length - 1];
    if (last && l.acao === "Campos atualizados" && last.acao === "Campos atualizados" && last._min === min && last.usuario_nome === l.usuario_nome) {
      last.detalhes = { ...(l.detalhes || {}), ...(last.detalhes || {}) }; // mantém o valor mais novo
    } else {
      out.push({ ...l, _min: min });
    }
  }
  return out;
}
