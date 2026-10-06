import { brl } from "@/lib/format";
import { PISO_ETAPAS, STATUS_COMPETENCIA } from "@/lib/piso/etapas";

const esc = (v: unknown) =>
  String(v ?? "—").replace(
    /[&<>\"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[c] ?? c,
  );

export function gerarRelatorioExecutivoPiso(
  comp: any,
  participantes: any[],
  obrigacoes: any[],
  documentos: any[],
  logs: any[],
  emissor?: string,
) {
  const pago = obrigacoes.reduce((s, o) => s + Number(o.valor_pago ?? 0), 0);
  const devido = participantes.reduce((s, p) => s + Number(p.valor_devido ?? 0), 0);
  const etapas = PISO_ETAPAS.map(
    (e) =>
      `<tr><td>${e.n}. ${esc(e.titulo)}</td><td>${comp.etapas_concluidas?.[String(e.n)] ? '<b class="ok">Concluída</b>' : "Pendente"}</td><td>${documentos.filter((d) => d.tipo && Number(d.tipo_etapa ?? 0) === e.n).length}</td></tr>`,
  ).join("");
  const instituicoes = participantes
    .map(
      (p) =>
        `<tr><td>${esc(p.prestadores?.nome_instituicao)}</td><td>${esc(p.prestadores?.cnpj)}</td><td>${esc(p.situacao)}</td><td class="num">${brl(p.valor_devido)}</td></tr>`,
    )
    .join("");
  const timeline = logs
    .slice(0, 30)
    .map(
      (l) =>
        `<li><b>${esc(new Date(l.data_hora).toLocaleString("pt-BR"))}</b> · ${esc(l.acao)}${l.usuario_nome ? ` · ${esc(l.usuario_nome)}` : ""}</li>`,
    )
    .join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório Executivo - Piso da Enfermagem ${esc(comp.competencia)}</title><style>
  *{box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;color:#182334;margin:14mm;font-size:11px}.head{border-bottom:3px solid #003b69;padding:0 0 12px}.head h1{margin:0;color:#003b69;font-size:19px}.head p{margin:4px 0;color:#5f6b7a}h2{border-left:4px solid #2d9ed1;padding-left:8px;color:#003b69;font-size:13px;margin:20px 0 8px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.card{border:1px solid #d9e1ea;border-radius:8px;padding:10px}.card small{display:block;text-transform:uppercase;color:#687586}.card b{display:block;margin-top:4px;font-size:15px;color:#003b69}table{width:100%;border-collapse:collapse}th{background:#003b69;color:white;text-align:left;padding:7px}td{border-bottom:1px solid #dfe5ec;padding:7px}.num{text-align:right}.ok{color:#159447}ul{padding-left:18px}li{margin:5px 0}.footer{margin-top:28px;color:#687586;font-size:9px}@media print{body{margin:12mm}.no-print{display:none}}</style></head><body onload="window.focus();window.print()">
  <header class="head"><h1>Secretaria Municipal de Saúde de Joinville</h1><p>Área de Convênios e Parcerias (ACP) · Relatório Executivo do Piso da Enfermagem</p></header>
  <h2>Identificação</h2><table><tr><td>Competência</td><td><b>${esc(comp.competencia)}</b></td></tr><tr><td>Status</td><td>${esc(STATUS_COMPETENCIA[comp.status] ?? comp.status)}</td></tr><tr><td>Processo SEI</td><td>${esc(comp.processo_sei)}</td></tr></table>
  <h2>Resumo executivo</h2><div class="cards"><div class="card"><small>Instituições</small><b>${participantes.length}</b></div><div class="card"><small>Valor homologado</small><b>${brl(comp.valor_homologado)}</b></div><div class="card"><small>Total devido</small><b>${brl(devido)}</b></div><div class="card"><small>Total pago</small><b>${brl(pago)}</b></div></div>
  <h2>Instituições participantes</h2><table><thead><tr><th>Instituição</th><th>CNPJ</th><th>Situação</th><th>Valor devido</th></tr></thead><tbody>${instituicoes || '<tr><td colspan="4">Nenhuma instituição.</td></tr>'}</tbody></table>
  <h2>Esteira e documentação</h2><table><thead><tr><th>Etapa</th><th>Status</th><th>Documentos</th></tr></thead><tbody>${etapas}</tbody></table>
  <h2>Prestação de contas</h2><table><tr><td>Status</td><td>${esc(comp.prestacao_status ?? "Não iniciada")}</td></tr><tr><td>Prazo</td><td>${esc(comp.prestacao_prazo ? new Date(comp.prestacao_prazo + "T12:00").toLocaleDateString("pt-BR") : "—")}</td></tr><tr><td>Observação</td><td>${esc(comp.prestacao_observacao)}</td></tr></table>
  <h2>Linha do tempo</h2><ul>${timeline || "<li>Sem registros.</li>"}</ul><p class="footer">Emitido em ${new Date().toLocaleString("pt-BR")}${emissor ? ` por ${esc(emissor)}` : ""}. Documento gerado automaticamente pelo sistema.</p></body></html>`;
  const w = window.open("", "_blank", "width=1000,height=900");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
