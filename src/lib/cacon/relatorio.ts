import { brl, dateTime } from "@/lib/format";

const esc = (v: unknown) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const link = (href?: string | null, label = "Abrir no SEI") => {
  if (!href) return '<span class="muted">—</span>';
  const destino = /^https?:\/\//i.test(href) ? href : `https://${href}`;
  return `<a class="sei-link" href="${esc(destino)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
};

const n = (v: unknown) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR");

const data = (v?: string | null) => {
  if (!v) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString("pt-BR");
};

export function gerarRelatorioExecutivoCacon(
  competencia: any,
  arquivos: any[],
  assinaturas: any[],
  logs: any[],
  geradoPor?: string | null,
) {
  const relatorioArquivo = arquivos.find((a) => a.categoria === "relatorio_cacon");
  const fiscal = assinaturas.filter((a) => a.slot === "fiscal");
  const prestador = Array.isArray(competencia.prestadores)
    ? competencia.prestadores[0]?.nome_instituicao
    : competencia.prestadores?.nome_instituicao;
  const criticas = Number(competencia.auditoria?.criticas ?? 0);
  const alertas = Number(competencia.auditoria?.alertas ?? 0);
  const ocorrencias = Array.isArray(competencia.auditoria?.ocorrencias)
    ? competencia.auditoria.ocorrencias
    : [];
  const concluida = competencia.status === "concluida";
  const statusLabel = concluida ? "Concluída" : "Em andamento";
  const statusClass = concluida ? "badge success" : "badge info";

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Relatório Executivo · Dieta CACON · ${esc(competencia.competencia)}</title>
<style>
@page{size:A4;margin:14mm 13mm 16mm}
*{box-sizing:border-box}
body{font-family:Inter,Arial,Helvetica,sans-serif;color:#172033;background:#fff;margin:0;font-size:12px;line-height:1.45}
.header{border-radius:16px;background:linear-gradient(120deg,#003b68 0%,#075985 70%,#0c4a6e 100%);color:#fff;padding:24px 26px;margin-bottom:18px;position:relative;overflow:hidden}
.header:after{content:"";position:absolute;width:210px;height:210px;border-radius:50%;background:rgba(255,255,255,.07);right:-70px;top:-95px}
.eyebrow{font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;opacity:.85}
h1{font-size:25px;margin:5px 0 4px;line-height:1.1}
.subtitle{margin:0;opacity:.88;font-size:11px}
.header-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;border:1px solid transparent}
.badge.success{color:#065f46;background:#d1fae5;border-color:#a7f3d0}
.badge.info{color:#075985;background:#e0f2fe;border-color:#bae6fd}
.badge.warn{color:#9a3412;background:#ffedd5;border-color:#fed7aa}
.badge.danger{color:#991b1b;background:#fee2e2;border-color:#fecaca}
.header .badge{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.24);color:#fff}
.section{margin-top:18px;page-break-inside:avoid}
.section-title{display:flex;align-items:center;gap:8px;color:#003b68;margin:0 0 9px;font-size:15px;font-weight:800}
.section-num{display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:#e0f2fe;color:#075985;font-size:11px}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 4px}
.metric{border:1px solid #dbe4ee;border-radius:10px;padding:11px 12px;background:#fbfdff;min-height:66px}
.metric .label{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:700}
.metric .value{font-size:16px;font-weight:800;color:#0f2740;margin-top:3px;line-height:1.15}
.metric.primary{background:#eff8ff;border-color:#bfdbfe}.metric.primary .value{color:#003b68}
.panel{border:1px solid #dbe4ee;border-radius:12px;overflow:hidden;background:#fff}
table{width:100%;border-collapse:collapse}
th,td{padding:8px 10px;border-bottom:1px solid #e5eaf0;text-align:left;vertical-align:top}
tr:last-child th,tr:last-child td{border-bottom:0}
th{background:#f7f9fb;color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:.035em;font-weight:750}
td strong{color:#0f2740}
.sei-link{display:inline-block;text-decoration:none;color:#005a9c;font-weight:700;border:1px solid #bfdbfe;background:#eff8ff;border-radius:6px;padding:3px 7px}
.sei-link:hover{text-decoration:underline}
.audit-box{display:flex;align-items:center;gap:10px;border-radius:10px;padding:10px 12px;margin-top:9px;border:1px solid #bbf7d0;background:#f0fdf4}
.audit-box.issue{border-color:#fed7aa;background:#fff7ed}
.audit-title{font-weight:800;color:#0f2740}
.audit-list{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:6px}
.audit-list li{border:1px solid #e5eaf0;border-radius:8px;padding:7px 9px;background:#fff}
.timeline{list-style:none;margin:0;padding:0 0 0 18px;border-left:2px solid #dbeafe}
.timeline li{position:relative;margin:0 0 10px;padding:0 0 0 8px;page-break-inside:avoid}
.timeline li:before{content:"";position:absolute;left:-24px;top:4px;width:9px;height:9px;border-radius:50%;background:#fff;border:2px solid #0369a1}
.timeline b{color:#0f2740}
.timeline .meta{font-size:10px;color:#64748b}
.note{border-left:3px solid #0ea5e9;background:#f0f9ff;border-radius:0 8px 8px 0;padding:9px 11px;color:#475569}
.muted{color:#64748b}
.footer{margin-top:20px;padding-top:10px;border-top:1px solid #dbe4ee;color:#64748b;font-size:9px;display:flex;justify-content:space-between;gap:10px}
.keep{page-break-inside:avoid}
@media(max-width:800px){.summary{grid-template-columns:repeat(2,1fr)}}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .section{break-inside:avoid}
  .timeline-section{break-inside:auto}
  a{color:#005a9c!important}
}
</style>
</head>
<body>
<header class="header">
  <div class="eyebrow">Secretaria Municipal da Saúde · Joinville</div>
  <h1>Dieta CACON · ${esc(competencia.competencia)}</h1>
  <p class="subtitle">Relatório executivo do acompanhamento mensal da produção nutricional oncológica.</p>
  <div class="header-meta">
    <span class="badge">${esc(prestador ?? "Prestador não identificado")}</span>
    <span class="badge">${statusLabel}</span>
    <span class="badge">Recebimento: ${data(competencia.data_recebimento)}</span>
  </div>
</header>

<section class="section keep">
  <h2 class="section-title"><span class="section-num">1</span>Resumo executivo</h2>
  <div class="summary">
    <div class="metric primary"><div class="label">Valor produzido</div><div class="value">${competencia.valor_fornecido == null ? "—" : brl(competencia.valor_fornecido)}</div></div>
    <div class="metric"><div class="label">Unidades fornecidas</div><div class="value">${n(competencia.total_unidades)}</div></div>
    <div class="metric"><div class="label">Auditoria</div><div class="value">${criticas} crítica(s)</div></div>
    <div class="metric"><div class="label">Situação</div><div class="value">${statusLabel}</div></div>
  </div>
</section>

<section class="section keep">
  <h2 class="section-title"><span class="section-num">2</span>Evidências recebidas do HMSJ</h2>
  <div class="panel">
    <table>
      <thead><tr><th>Documento</th><th>Nº SEI</th><th>Acesso</th></tr></thead>
      <tbody>
        <tr><td><strong>Memorando HMSJ</strong></td><td>${esc(competencia.hmsj_memorando_numero ?? "—")}</td><td>${link(competencia.hmsj_memorando_link)}</td></tr>
        <tr><td><strong>Anexo / Boletim CACON</strong></td><td>${esc(competencia.hmsj_anexo_numero ?? "—")}</td><td>${link(competencia.hmsj_anexo_link)}</td></tr>
      </tbody>
    </table>
  </div>
</section>

<section class="section">
  <h2 class="section-title"><span class="section-num">3</span>Produção extraída e auditoria</h2>
  <div class="summary">
    <div class="metric"><div class="label">Unidades fornecidas</div><div class="value">${n(competencia.total_unidades)}</div></div>
    <div class="metric"><div class="label">Valor médio unitário</div><div class="value">${competencia.valor_medio_unitario == null ? "—" : brl(competencia.valor_medio_unitario)}</div></div>
    <div class="metric"><div class="label">Valor médio/dia</div><div class="value">${competencia.valor_medio_dia == null ? "—" : brl(competencia.valor_medio_dia)}</div></div>
    <div class="metric primary"><div class="label">Valor fornecido</div><div class="value">${competencia.valor_fornecido == null ? "—" : brl(competencia.valor_fornecido)}</div></div>
    <div class="metric"><div class="label">Pacientes · via oral</div><div class="value">${n(competencia.pacientes_oral)}</div></div>
    <div class="metric"><div class="label">Dias · via oral</div><div class="value">${n(competencia.dias_oral)}</div></div>
    <div class="metric"><div class="label">Pacientes · via enteral</div><div class="value">${n(competencia.pacientes_enteral)}</div></div>
    <div class="metric"><div class="label">Dias · via enteral</div><div class="value">${n(competencia.dias_enteral)}</div></div>
  </div>

  <div class="audit-box ${criticas || alertas ? "issue" : ""}">
    <span class="${criticas ? "badge danger" : alertas ? "badge warn" : "badge success"}">${criticas ? "Requer ação" : alertas ? "Conferir" : "Conforme"}</span>
    <div>
      <div class="audit-title">Resultado da auditoria automática</div>
      <div class="muted">${criticas} crítica(s) · ${alertas} alerta(s)</div>
    </div>
  </div>
  ${ocorrencias.filter((o: any) => o.severidade !== "info").length ? `
    <ul class="audit-list">
      ${ocorrencias
        .filter((o: any) => o.severidade !== "info")
        .map((o: any) => `<li><span class="${o.severidade === "critica" ? "badge danger" : "badge warn"}">${o.severidade === "critica" ? "Crítica" : "Alerta"}</span> ${esc(o.descricao)}</li>`)
        .join("")}
    </ul>` : ""}

  <p class="muted" style="font-size:10px;margin-top:8px">
    Evidência processada: ${esc(relatorioArquivo?.nome_original ?? "—")} · SHA-256
    <span style="word-break:break-all">${esc(relatorioArquivo?.sha256 ?? "—")}</span>
  </p>
</section>

<section class="section keep">
  <h2 class="section-title"><span class="section-num">4</span>Memorando da SMS</h2>
  <div class="panel">
    <table>
      <tbody>
        <tr><th>Memorando SMS</th><td><strong>${esc(competencia.sms_memorando_numero ?? "—")}</strong></td><th>Data</th><td>${data(competencia.sms_memorando_data)}</td></tr>
        <tr><th>Link SEI</th><td colspan="3">${link(competencia.sms_memorando_link)}</td></tr>
        <tr><th>Base normativa</th><td>${esc(competencia.portaria_referencia ?? "—")}</td><th>SEI da norma</th><td>${esc(competencia.portaria_sei_numero ?? "—")} ${link(competencia.portaria_sei_link, "Abrir")}</td></tr>
      </tbody>
    </table>
  </div>
</section>

<section class="section keep">
  <h2 class="section-title"><span class="section-num">5</span>Assinatura e encaminhamento</h2>
  <div class="panel">
    <table>
      <tbody>
        <tr><th>Fiscal(is)</th><td>${fiscal.length ? fiscal.map((a) => `${esc(a.servidor_nome)} · ${esc(a.cargo)}`).join("<br>") : "—"}</td></tr>
        <tr><th>Encaminhamento à SES.UFI</th><td>${competencia.encaminhado_ses_ufi_em ? `<span class="badge success">Concluído</span> ${esc(dateTime(competencia.encaminhado_ses_ufi_em))} · ${esc(competencia.encaminhado_por_nome ?? "—")}` : '<span class="badge info">Pendente</span>'}</td></tr>
      </tbody>
    </table>
  </div>
</section>

<section class="section timeline-section">
  <h2 class="section-title"><span class="section-num">6</span>Linha do tempo</h2>
  <ol class="timeline">
    ${logs.map((l) => `<li><b>${esc(l.acao)}</b><div class="meta">${esc(dateTime(l.ocorrido_em))} · ${esc(l.usuario_nome ?? "Sistema")}</div>${l.detalhes?.descricao ? `<div>${esc(l.detalhes.descricao)}</div>` : ""}</li>`).join("") || "<li><b>Sem registros.</b></li>"}
  </ol>
</section>

<section class="section keep">
  <h2 class="section-title"><span class="section-num">7</span>Privacidade e rastreabilidade</h2>
  <div class="note">
    Este relatório apresenta somente informações gerenciais e agregadas. A relação individual de pacientes
    utilizada no documento-fonte não é replicada na base estruturada do sistema. O hash SHA-256 preserva a
    rastreabilidade da evidência utilizada na auditoria.
  </div>
</section>

<footer class="footer">
  <span>Gestão de Convênios e Parcerias · SMS Joinville</span>
  <span>Gerado em ${esc(dateTime(new Date().toISOString()))}${geradoPor ? ` · ${esc(geradoPor)}` : ""}</span>
</footer>

<script>window.onload=()=>window.print()</script>
</body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const janela = window.open(url, "_blank");
  if (!janela) {
    URL.revokeObjectURL(url);
    return false;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
