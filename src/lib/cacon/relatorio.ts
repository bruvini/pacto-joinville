import { brl, dateTime } from "@/lib/format";

const esc = (v: unknown) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const link = (href?: string | null, label = "Abrir no SEI") => {
  if (!href) return "—";
  const destino = /^https?:\/\//i.test(href) ? href : `https://${href}`;
  return `<a href="${esc(destino)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
};

const n = (v: unknown) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR"));

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
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Relatório Executivo · Dieta CACON · ${esc(competencia.competencia)}</title>
<style>
body{font:14px Arial,sans-serif;color:#172033;margin:34px}h1{color:#003b68;margin-bottom:4px}h2{color:#003b68;border-bottom:1px solid #cbd5e1;padding-bottom:6px;margin-top:28px}.muted{color:#64748b}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{border:1px solid #dbe4ee;border-radius:8px;padding:12px}.card b{display:block;font-size:17px;margin-top:4px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #dbe4ee;text-align:left;vertical-align:top}th{background:#f4f7fa}a{color:#005a9c}.ok{color:#087443;font-weight:bold}.warn{color:#a14d00;font-weight:bold}ul{padding-left:20px}@media print{body{margin:16mm}.no-print{display:none}}
</style>
</head>
<body>
<h1>Dieta CACON · ${esc(competencia.competencia)}</h1>
<p class="muted">Relatório executivo do acompanhamento mensal da produção nutricional oncológica.</p>

<h2>1. Identificação</h2>
<table>
<tr><th>Prestador</th><td>${esc(prestador ?? "—")}</td><th>Status</th><td>${competencia.status === "concluida" ? "Concluída" : "Em andamento"}</td></tr>
<tr><th>Competência</th><td>${esc(competencia.competencia)}</td><th>Recebimento</th><td>${esc(competencia.data_recebimento ?? "—")}</td></tr>
</table>

<h2>2. Evidências recebidas do HMSJ</h2>
<table>
<tr><th>Documento</th><th>Nº SEI</th><th>Link</th></tr>
<tr><td>Memorando HMSJ</td><td>${esc(competencia.hmsj_memorando_numero)}</td><td>${link(competencia.hmsj_memorando_link)}</td></tr>
<tr><td>Anexo / Boletim CACON</td><td>${esc(competencia.hmsj_anexo_numero)}</td><td>${link(competencia.hmsj_anexo_link)}</td></tr>
</table>

<h2>3. Extração e auditoria do relatório CACON</h2>
<div class="grid">
<div class="card">Unidades fornecidas<b>${n(competencia.total_unidades)}</b></div>
<div class="card">Valor médio unitário<b>${competencia.valor_medio_unitario == null ? "—" : brl(competencia.valor_medio_unitario)}</b></div>
<div class="card">Valor médio/dia<b>${competencia.valor_medio_dia == null ? "—" : brl(competencia.valor_medio_dia)}</b></div>
<div class="card">Valor fornecido<b>${competencia.valor_fornecido == null ? "—" : brl(competencia.valor_fornecido)}</b></div>
<div class="card">Pacientes · via oral<b>${n(competencia.pacientes_oral)}</b></div>
<div class="card">Dias · via oral<b>${n(competencia.dias_oral)}</b></div>
<div class="card">Pacientes · via enteral<b>${n(competencia.pacientes_enteral)}</b></div>
<div class="card">Dias · via enteral<b>${n(competencia.dias_enteral)}</b></div>
</div>
<p>Resultado da auditoria: <span class="${Number(competencia.auditoria?.criticas ?? 0) ? "warn" : "ok"}">${Number(competencia.auditoria?.criticas ?? 0)} crítica(s), ${Number(competencia.auditoria?.alertas ?? 0)} alerta(s)</span>.</p>
<p class="muted">Arquivo original: ${esc(relatorioArquivo?.nome_original ?? "—")} · SHA-256 ${esc(relatorioArquivo?.sha256 ?? "—")}</p>

<h2>4. Memorando da SMS</h2>
<table>
<tr><th>Memorando SMS</th><td>${esc(competencia.sms_memorando_numero ?? "—")}</td><th>Data</th><td>${esc(competencia.sms_memorando_data ?? "—")}</td></tr>
<tr><th>Link SEI</th><td colspan="3">${link(competencia.sms_memorando_link)}</td></tr>
<tr><th>Base normativa</th><td>${esc(competencia.portaria_referencia)}</td><th>SEI</th><td>${esc(competencia.portaria_sei_numero)} ${link(competencia.portaria_sei_link, "abrir")}</td></tr>
</table>

<h2>5. Assinatura e encaminhamento</h2>
<p>Fiscal(is): ${fiscal.length ? fiscal.map((a) => `${esc(a.servidor_nome)} (${esc(a.cargo)})`).join("; ") : "—"}</p>
<p>Encaminhamento à SES.UFI: ${competencia.encaminhado_ses_ufi_em ? `<span class="ok">${esc(dateTime(competencia.encaminhado_ses_ufi_em))}</span> por ${esc(competencia.encaminhado_por_nome ?? "—")}` : "Pendente"}</p>

<h2>6. Linha do tempo</h2>
<ul>${logs.map((l) => `<li><b>${esc(dateTime(l.ocorrido_em))}</b> · ${esc(l.usuario_nome ?? "Sistema")} · ${esc(l.acao)}${l.detalhes?.descricao ? ` — ${esc(l.detalhes.descricao)}` : ""}</li>`).join("") || "<li>Sem registros.</li>"}</ul>

<h2>7. Privacidade e rastreabilidade</h2>
<p>Este relatório apresenta apenas dados gerenciais e agregados. O detalhamento individual dos pacientes permanece no documento original armazenado de forma privada e não é reproduzido neste relatório.</p>

<p class="muted">Gerado em ${esc(dateTime(new Date().toISOString()))}${geradoPor ? ` por ${esc(geradoPor)}` : ""}.</p>
<script>window.onload=()=>window.print()</script>
</body></html>`;

  const janela = window.open("", "_blank", "noopener,noreferrer");
  if (!janela) return false;
  janela.document.open();
  janela.document.write(html);
  janela.document.close();
  return true;
}
