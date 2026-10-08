import { brl, dateTime } from "@/lib/format";
import { PVH_ETAPAS, STATUS_PVH } from "@/lib/pvh/etapas";

const esc = (v: unknown) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const data = (v?: string | null) => {
  if (!v) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? new Date(`${v}T12:00:00`)
    : new Date(v);
  return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString("pt-BR");
};

const link = (href?: string | null, label = "Abrir") => {
  if (!href) return "—";
  const destino = /^https?:\/\//i.test(href) ? href : `https://${href}`;
  return `<a href="${esc(destino)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
};

export function gerarRelatorioExecutivoPvh({
  competencia,
  participantes,
  documentos,
  empenhos,
  pagamentos,
  notificacoes,
  logs,
  geradoPor,
}: {
  competencia: any;
  participantes: any[];
  documentos: any[];
  empenhos: any[];
  pagamentos: any[];
  notificacoes: any[];
  logs: any[];
  geradoPor?: string | null;
}) {
  const totalEstado = participantes.reduce(
    (s, p) => s + Number(p.valor_estadual ?? 0),
    0,
  );
  const totalMunicipio = participantes.reduce(
    (s, p) => s + Number(p.valor_municipal ?? 0),
    0,
  );
  const totalPago = participantes.reduce(
    (s, p) => s + Number(p.valor_pago ?? 0),
    0,
  );
  const concluidas = competencia.etapas_concluidas ?? {};
  const reconferir: number[] = competencia.etapas_reconferir ?? [];
  const norma = Array.isArray(competencia.pvh_normativas)
    ? competencia.pvh_normativas[0]
    : competencia.pvh_normativas;

  const linhasParticipantes = participantes
    .map((p) => {
      const prestador = Array.isArray(p.prestadores)
        ? p.prestadores[0]
        : p.prestadores;
      return `<tr>
        <td><strong>${esc(prestador?.nome_instituicao ?? "Instituição")}</strong></td>
        <td>${brl(Number(p.valor_estadual ?? 0))}</td>
        <td>${brl(Number(p.valor_municipal ?? 0))}</td>
        <td>${brl(Number(p.valor_pago ?? 0))}</td>
        <td>${p.notificar_email ? "Sim" : "Não aplicável"}</td>
        <td>${p.exige_prestacao_contas ? "Sim" : "Não"}</td>
      </tr>`;
    })
    .join("");

  const linhasEtapas = PVH_ETAPAS.map((etapa) => `<tr>
    <td>Etapa ${etapa.n}</td>
    <td>${esc(etapa.titulo)}</td>
    <td>${concluidas[String(etapa.n)] ? "Concluída" : "Em aberto"}</td>
    <td>${reconferir.includes(etapa.n) ? "Reconferir" : "—"}</td>
  </tr>`).join("");

  const linhasEmpenhos = empenhos.length
    ? empenhos
        .map(
          (e) => `<tr>
        <td>${esc(e.prestadores?.nome_instituicao ?? "—")}</td>
        <td>${esc(e.numero_ne ?? "Aguardando emissão")}</td>
        <td>${brl(Number(e.valor_total ?? 0))}</td>
        <td>${esc(e.cr_dotacao ?? "—")}</td>
        <td>${esc(e.fonte_recurso ?? "—")}</td>
        <td>${esc(e.nota_empenho_sei_numero ?? e.solicitacao_sei_numero ?? "—")}</td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="6">Sem Notas de Empenho registradas.</td></tr>';

  const linhasDocs = documentos.length
    ? documentos
        .map(
          (d) => `<tr>
        <td>${esc(d.tipo_codigo)}</td>
        <td>${esc(d.numero ?? d.numero_sei ?? "—")}</td>
        <td>${data(d.data_documento)}</td>
        <td>${link(d.link_documento, "Abrir no SEI")}</td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="4">Sem documentos municipais estruturados.</td></tr>';

  const linhasPagamentos = pagamentos.length
    ? pagamentos
        .map((p) => {
          const part = participantes.find((x) => x.id === p.participante_id);
          const prestador = Array.isArray(part?.prestadores)
            ? part.prestadores[0]
            : part?.prestadores;
          return `<tr>
            <td>${esc(prestador?.nome_instituicao ?? "—")}</td>
            <td>${data(p.data_programacao)}</td>
            <td>${data(p.data_pagamento)}</td>
            <td>${brl(Number(p.valor_pago ?? 0))}</td>
            <td>${esc(p.comprovante_sei_numero ?? "—")}</td>
            <td>${link(p.comprovante_sei_link, "Abrir")}</td>
          </tr>`;
        })
        .join("")
    : '<tr><td colspan="6">Sem pagamentos registrados.</td></tr>';

  const linhasNotificacoes = notificacoes.length
    ? notificacoes
        .map((n) => {
          const part = participantes.find((x) => x.id === n.participante_id);
          const prestador = Array.isArray(part?.prestadores)
            ? part.prestadores[0]
            : part?.prestadores;
          return `<tr>
            <td>${esc(prestador?.nome_instituicao ?? "—")}</td>
            <td>${esc((n.destinatarios ?? []).join("; "))}</td>
            <td>${n.enviado_em ? esc(dateTime(n.enviado_em)) : "Pendente"}</td>
            <td>${esc(n.enviado_por_nome ?? "—")}</td>
            <td>${esc(n.processo_sei_numero ?? "—")} ${link(n.processo_sei_link)}</td>
          </tr>`;
        })
        .join("")
    : '<tr><td colspan="5">Nenhuma comunicação registrada.</td></tr>';

  const timeline = logs
    .map(
      (l) => `<li><b>${esc(l.acao)}</b><div class="meta">${esc(
        dateTime(l.data_hora),
      )} · ${esc(l.usuario_nome ?? "Sistema")}</div></li>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Relatório Executivo · PVH · ${esc(competencia.competencia)}</title>
<style>
@page{size:A4;margin:14mm 13mm 16mm}*{box-sizing:border-box}
body{font-family:Inter,Arial,sans-serif;color:#172033;margin:0;font-size:11px;line-height:1.45}
.header{border-radius:16px;background:linear-gradient(120deg,#003b68,#075985 72%,#0c4a6e);color:#fff;padding:24px 26px;margin-bottom:18px}
.eyebrow{font-size:9px;text-transform:uppercase;letter-spacing:.12em;font-weight:700;opacity:.85}
h1{font-size:24px;margin:5px 0 4px}.subtitle{opacity:.88;margin:0}.chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
.chip{border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.13);border-radius:999px;padding:4px 8px;font-weight:700;font-size:9px}
h2{font-size:14px;color:#003b68;margin:18px 0 8px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.metric{border:1px solid #dbe4ee;border-radius:10px;padding:10px;background:#fbfdff}.metric small{display:block;color:#64748b;text-transform:uppercase;font-size:8px}.metric b{font-size:14px;color:#0f2740}
table{width:100%;border-collapse:collapse;border:1px solid #dbe4ee;border-radius:10px;overflow:hidden}
th,td{padding:7px 8px;border-bottom:1px solid #e5eaf0;text-align:left;vertical-align:top}th{background:#f7f9fb;color:#475569;font-size:9px;text-transform:uppercase}
a{color:#005a9c;font-weight:700;text-decoration:none}.timeline{border-left:2px solid #dbeafe;padding-left:18px}.timeline li{margin-bottom:8px}.meta{font-size:9px;color:#64748b}
.footer{margin-top:18px;padding-top:9px;border-top:1px solid #dbe4ee;color:#64748b;font-size:9px}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.header,table,.summary{break-inside:avoid}}
</style></head><body>
<header class="header">
<div class="eyebrow">Secretaria Municipal da Saúde · Joinville</div>
<h1>Programa de Valorização dos Hospitais · ${esc(competencia.competencia)}</h1>
<p class="subtitle">Relatório executivo da execução municipal do PVH.</p>
<div class="chips"><span class="chip">${esc(STATUS_PVH[competencia.status] ?? competencia.status)}</span><span class="chip">${esc(norma?.codigo ?? norma?.titulo ?? "Base normativa não informada")}</span></div>
</header>
<h2>1. Resumo executivo</h2>
<div class="summary"><div class="metric"><small>Publicado Estado</small><b>${brl(totalEstado)}</b></div><div class="metric"><small>Publicado Município</small><b>${brl(totalMunicipio)}</b></div><div class="metric"><small>Crédito FMS</small><b>${competencia.recurso_fms_valor == null ? "—" : brl(Number(competencia.recurso_fms_valor))}</b></div><div class="metric"><small>Pago</small><b>${brl(totalPago)}</b></div></div>
<h2>2. Instituições</h2><table><thead><tr><th>Instituição</th><th>Estado</th><th>Município</th><th>Pago</th><th>E-mail</th><th>Prestação</th></tr></thead><tbody>${linhasParticipantes}</tbody></table>
<h2>3. Portaria estadual e crédito FMS</h2><table><tbody><tr><th>Portaria SES</th><td>${esc(competencia.portaria_estadual_numero ?? "—")}</td><th>Data</th><td>${data(competencia.portaria_estadual_data)}</td></tr><tr><th>Fonte oficial</th><td colspan="3">${link(competencia.portaria_estadual_url, "Abrir publicação")}</td></tr><tr><th>Crédito FMS</th><td>${data(competencia.recurso_fms_data)}</td><th>Valor</th><td>${competencia.recurso_fms_valor == null ? "—" : brl(Number(competencia.recurso_fms_valor))}</td></tr></tbody></table>
<h2>4. Cadeia documental municipal</h2><table><thead><tr><th>Documento</th><th>Número/SEI</th><th>Data</th><th>Acesso</th></tr></thead><tbody>${linhasDocs}</tbody></table>
<h2>5. Empenhos</h2><table><thead><tr><th>Instituição</th><th>NE</th><th>Valor</th><th>Dotação/CR</th><th>Fonte</th><th>SEI</th></tr></thead><tbody>${linhasEmpenhos}</tbody></table>
<h2>6. Pagamentos</h2><table><thead><tr><th>Instituição</th><th>Programação</th><th>Pagamento</th><th>Valor</th><th>SEI</th><th>Acesso</th></tr></thead><tbody>${linhasPagamentos}</tbody></table>
<h2>7. Comunicação</h2><table><thead><tr><th>Instituição</th><th>Destinatários</th><th>Envio</th><th>Responsável</th><th>SEI</th></tr></thead><tbody>${linhasNotificacoes}</tbody></table>
<h2>8. Etapas e reconferências</h2><table><thead><tr><th>Etapa</th><th>Descrição</th><th>Status</th><th>Reconferência</th></tr></thead><tbody>${linhasEtapas}</tbody></table>
<h2>9. Linha do tempo</h2><ol class="timeline">${timeline || "<li>Sem registros.</li>"}</ol>
<div class="footer">Emitido em ${esc(dateTime(new Date().toISOString()))}${geradoPor ? ` · ${esc(geradoPor)}` : ""}. Relatório gerado automaticamente a partir dos registros estruturados do sistema.</div>
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
