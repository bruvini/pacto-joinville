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
};

const OCULTOS = new Set(["created_by", "prestador_id", "convenio_id", "termo_aditivo_id", "updated_at", "created_at", "valor_anulado", "data_limite", "parcelas_competencia"]);

export const rotuloCampo = (c: string) => LABELS[c] ?? c;

export function formatarValor(campo: string, v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (campo.startsWith("valor_")) return brl(Number(v));
  if (campo.endsWith("_em")) return dateTime(v);
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (campo === "status_aco") return statusAcoLabel[v] ?? String(v);
  if (campo === "responsavel_atual") return String(v).toUpperCase();
  const s = String(v);
  if (campo.startsWith("link_")) return s.length > 44 ? s.slice(0, 44) + "…" : s;
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
