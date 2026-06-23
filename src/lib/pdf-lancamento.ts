import { brl, dateTime, statusAcoLabel } from "@/lib/format";
import { hrefSei, linkValido } from "@/lib/sei";

const esc = (s: any) =>
  String(s ?? "—").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const BLOCO_LABEL: Record<string, string> = {
  etapa1: "Etapa 1 — Solicitação de Empenho",
  rel_tecnico: "Relatório Técnico de Monitoramento",
  rel_analise: "Relatório de Análise",
  etapa4: "Etapa 4 — Liberação de Recurso",
  etapa5: "Etapa 5 — Anulação de Empenho",
};

const linha = (rotulo: string, valor: string) => `<tr><td class="r">${esc(rotulo)}</td><td>${valor}</td></tr>`;
const linkCell = (u: any) => (linkValido(u) ? `<a href="${esc(hrefSei(u))}">${esc(u)}</a>` : "—");

export function gerarPdfLancamento({ lanc, ass, logs, convenio, termo, logoUrl, emissor }: {
  lanc: any; ass: any[]; logs: any[]; convenio: any; termo: any; logoUrl?: string; emissor?: string;
}) {
  const solic = Number(lanc.valor_solicitado ?? 0);
  const atest = Number(lanc.valor_atestado ?? 0);
  const anulado = atest > 0 ? Math.max(0, solic - atest) : 0;
  const emissao = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const assinaturasHtml = ["etapa1", "rel_tecnico", "rel_analise", "etapa4", "etapa5"]
    .map((b) => {
      const itens = ass.filter((a) => a.bloco === b);
      if (itens.length === 0) return "";
      const lis = itens.map((a) => `<li>${esc(a.servidor_nome)} <span class="muted">· ${esc(a.cargo)} · ${a.assinado_em ? dateTime(a.assinado_em) : "—"}</span></li>`).join("");
      return `<h4>${esc(BLOCO_LABEL[b] ?? b)}</h4><ul>${lis}</ul>`;
    })
    .join("");

  const timelineHtml = (logs ?? [])
    .map((l) => `<li><span class="muted">${dateTime(l.data_hora)} · ${esc(l.usuario_nome ?? "Sistema")}</span><br/>${esc(l.acao)}</li>`)
    .join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>Lançamento — ${esc(lanc.prestadores?.nome_instituicao ?? "")}</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,"Segoe UI",Arial,sans-serif;color:#1a2230;margin:32px;font-size:12px}
  .header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #003866;padding-bottom:14px}
  .header img{height:54px} .header h1{font-size:16px;margin:0;color:#003866} .header p{margin:2px 0 0;font-size:11px;color:#5b6472}
  h3{color:#003866;font-size:13px;border-left:4px solid #3399cc;padding-left:8px;margin:20px 0 8px}
  h4{font-size:12px;margin:12px 0 4px;color:#003866}
  table{width:100%;border-collapse:collapse;margin-top:4px} td{padding:5px 8px;border-bottom:1px solid #e6eaf0;vertical-align:top}
  td.r{width:38%;color:#5b6472} a{color:#1c6fb5;word-break:break-all}
  .resumo{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:6px}
  .card{border:1px solid #dde3ea;border-radius:8px;padding:10px} .card .l{font-size:10px;text-transform:uppercase;color:#5b6472} .card .v{font-size:15px;font-weight:700;color:#003866;margin-top:3px}
  ul{margin:4px 0;padding-left:18px} li{margin:2px 0} .muted{color:#5b6472;font-size:10px}
  .footer{margin-top:40px;display:flex;justify-content:space-between;align-items:flex-end}
  .ass{text-align:center} .ass .linha{border-top:1px solid #1a2230;width:240px;margin-top:40px;padding-top:4px}
  @media print{body{margin:14mm}}
</style></head>
<body onload="window.focus();window.print();">
  <div class="header">
    ${logoUrl ? `<img src="${esc(logoUrl)}" alt="Joinville" />` : ""}
    <div><h1>Secretaria Municipal de Saúde de Joinville</h1>
      <p>Área de Convênios e Parcerias (ACP) · Histórico do Processo de Empenho</p></div>
  </div>

  <h3>Identificação</h3>
  <table>
    ${linha("Prestador", esc(lanc.prestadores?.nome_instituicao))}
    ${linha("Objeto / Descrição", esc(lanc.descricao))}
    ${linha("Convênio (Processo SEI)", linkCell(convenio?.link_processo_sei))}
    ${linha("Termo Aditivo", esc(termo?.identificador))}
    ${linha("Competência(s)", esc(lanc.competencia))}
    ${linha("Parcela", esc(lanc.parcela))}
    ${linha("Status do Orçamento", esc(statusAcoLabel[lanc.status_aco] ?? lanc.status_aco))}
    ${linha("Situação", lanc.concluido ? '<b style="color:#1f9d57">Concluído</b>' : "Em andamento")}
  </table>

  <h3>Resumo financeiro</h3>
  <div class="resumo">
    <div class="card"><div class="l">Solicitado / Empenhado</div><div class="v">${brl(solic)}</div></div>
    <div class="card"><div class="l">Atestado</div><div class="v">${brl(atest)}</div></div>
    <div class="card"><div class="l">Anulado</div><div class="v">${brl(anulado)}</div></div>
  </div>

  <h3>Etapas e documentos (SEI)</h3>
  <table>
    ${linha("Solicitação de Empenho", linkCell(lanc.link_solicitacao_sei))}
    ${linha("Dotação / Fonte", `${esc(lanc.dotacao_orcamentaria)} / ${esc(lanc.fonte_pagamento)}`)}
    ${linha("Nota de Empenho", `${esc(lanc.numero_empenho)} — ${linkCell(lanc.link_empenho_sei)}`)}
    ${linha("Relatório Técnico", linkCell(lanc.link_relatorio_tecnico_sei))}
    ${linha("Relatório de Análise", linkCell(lanc.link_relatorio_analise_sei))}
    ${linha("Certidões Negativas", linkCell(lanc.link_certidoes_sei))}
    ${linha("Solicitação de Liberação", linkCell(lanc.link_solicitacao_liberacao_sei))}
    ${linha("Subempenho", linkCell(lanc.link_subempenho_sei))}
    ${linha("Programação de Pagamento", linkCell(lanc.link_programacao_pagamento_sei))}
    ${linha("Comprovante de Pagamento", linkCell(lanc.link_comprovante_pagamento_sei))}
    ${linha("Solicitação de Anulação", linkCell(lanc.link_solicitacao_anulacao))}
    ${linha("Anulação (Aviso de Movimento)", linkCell(lanc.link_anulacao_sei))}
    ${linha("Envio SEFAZ — Solicitação", lanc.sefaz_etapa1_em ? dateTime(lanc.sefaz_etapa1_em) : "—")}
    ${linha("Envio SEFAZ — Liberação", lanc.sefaz_etapa4_em ? dateTime(lanc.sefaz_etapa4_em) : "—")}
    ${linha("Envio SEFAZ — Anulação", lanc.sefaz_etapa5_em ? dateTime(lanc.sefaz_etapa5_em) : "—")}
  </table>

  <h3>Assinaturas</h3>
  ${assinaturasHtml || '<p class="muted">Nenhuma assinatura registrada.</p>'}

  <h3>Linha do tempo</h3>
  <ul>${timelineHtml || '<li class="muted">Sem registros.</li>'}</ul>

  <div class="footer">
    <div class="muted">Emitido em ${esc(emissao)}${emissor ? ` por ${esc(emissor)}` : ""}.<br/>Documento gerado automaticamente.</div>
    <div class="ass"><div class="linha">Assinatura da Auditoria</div></div>
  </div>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
