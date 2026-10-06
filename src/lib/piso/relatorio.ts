import { brl } from "@/lib/format";
import { PISO_ETAPAS, STATUS_COMPETENCIA } from "./etapas";
import { formatarDataHoraEvento, formatarEventoPiso } from "./historico";
import { statusParticipantePiso } from "./status";
import { urlDouValida } from "./regras";
import { atraso, enesimoDiaUtilCompetencia } from "./prazos";

const esc = (v: unknown) =>
  String(v ?? "—").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
const data = (v?: string | null) =>
  v ? new Date(`${v.slice(0, 10)}T12:00`).toLocaleDateString("pt-BR") : "—";
const arquivoMaisRecente = (arquivos: any[], categoria: string, participanteId?: string) =>
  arquivos
    .filter(
      (a) =>
        a.categoria === categoria &&
        (participanteId === undefined || a.participante_id === participanteId),
    )
    .sort((a, b) => b.enviado_em.localeCompare(a.enviado_em))[0];
const hash = (a: any) =>
  a
    ? `${esc(a.nome_original)}<br><small>SHA-256 ${esc(a.sha256)} · ${Math.round(Number(a.tamanho ?? 0) / 1024)} KB</small>`
    : "—";

export function gerarRelatorioExecutivoPiso(
  comp: any,
  participantes: any[],
  obrigacoes: any[],
  _documentos: any[],
  logs: any[],
  emissor?: string,
  extras: { arquivos?: any[]; ocorrencias?: any[]; feriados?: any[] } = {},
) {
  const arquivos = extras.arquivos ?? [],
    ocorrencias = extras.ocorrencias ?? [],
    feriados = (extras.feriados ?? []).map((f) => f.data),
    prazoEnvio = enesimoDiaUtilCompetencia(comp.competencia, 5, feriados),
    prazoRetorno = enesimoDiaUtilCompetencia(comp.competencia, 10, feriados),
    prazoInvestsus = enesimoDiaUtilCompetencia(comp.competencia, 15, feriados);
  const linhasInstituicoes = participantes
    .map((p) => {
      const arq = arquivoMaisRecente(arquivos, "planilha_carga", p.id),
        ocorr = ocorrencias.filter(
          (o) => o.participante_id === p.id && (!arq || o.arquivo_id === arq.id),
        );
      const status = statusParticipantePiso(p, Boolean(arq), ocorr.length);
      return `<tr><td><b>${esc(p.prestadores?.nome_instituicao)}</b></td><td>${data(p.data_envio)}${atraso(p.data_envio, prazoEnvio) ? '<br><b class="late">Em atraso</b>' : ""}<br><small>Prazo ${data(prazoEnvio)}</small></td><td>${data(p.data_retorno)}${atraso(p.data_retorno, prazoRetorno) ? '<br><b class="late">Em atraso</b>' : ""}<br><small>Prazo ${data(prazoRetorno)}</small></td><td>${esc(status.rotulo)}</td><td>${hash(arq)}</td><td>${p.auditoria_resumo?.linhas ?? 0}</td><td>${p.auditoria_resumo?.erros ?? 0}</td><td>${p.auditoria_resumo?.alertas ?? 0}</td><td>${ocorr.length}</td></tr>`;
    })
    .join("");
  const ocorrCarga = ocorrencias
    .filter((o) => o.categoria === "carga")
    .map(
      (o) =>
        `<tr><td>${esc(o.instituicao_nome)}</td><td>${o.linha ?? "—"}</td><td>${esc(o.cpf_mascarado)}</td><td>${esc(o.cnes)}</td><td>${esc(o.descricao)}</td></tr>`,
    )
    .join("");
  const cruz = comp.investsus_auditoria?.conciliacao ?? {},
    arquivoInvest = arquivoMaisRecente(arquivos, "investsus"),
    arquivoPortaria = arquivoMaisRecente(arquivos, "portaria_gm");
  const tabelaConciliacao = (titulo: string, filtro: (o: any) => boolean) => {
    const linhas = ocorrencias
      .filter(
        (o) =>
          o.categoria === "conciliacao" &&
          (!arquivoInvest || o.arquivo_id === arquivoInvest.id) &&
          filtro(o),
      )
      .map(
        (o) =>
          `<tr><td>${esc(o.instituicao_nome)}</td><td>${o.linha ?? "—"}</td><td>${esc(o.cpf_mascarado)}</td><td>${esc(o.cnes)}</td><td>${esc(o.descricao)}</td></tr>`,
      )
      .join("");
    return `<h4>${titulo}</h4><table><thead><tr><th>Instituição</th><th>Linha</th><th>CPF mascarado</th><th>CNES</th><th>Ocorrência</th></tr></thead><tbody>${linhas || '<tr><td colspan="5">Nenhum registro.</td></tr>'}</tbody></table>`;
  };
  const linhasObrig = obrigacoes
    .map((o) => {
      const p = participantes.find((x) => x.id === o.participante_id);
      return `<tr><td>${esc(p?.prestadores?.nome_instituicao)}</td><td>${esc(o.processo_sei)}</td><td>${esc(o.exercicio)}</td><td>${esc(o.fonte)}</td><td>${brl(o.saldo_disponivel)}</td><td>${brl(o.valor_a_liquidar)}</td></tr>`;
    })
    .join("");
  const linhasPag = obrigacoes
    .map((o) => {
      const p = participantes.find((x) => x.id === o.participante_id);
      return `<tr><td>${esc(p?.prestadores?.nome_instituicao)}</td><td>${data(o.data_programacao)}</td><td>${data(o.data_pagamento)}</td><td>${brl(o.valor_pago)}</td><td>${esc(o.observacao)}</td></tr>`;
    })
    .join("");
  const etapas = PISO_ETAPAS.map(
    (e) =>
      `<tr><td>${e.n}. ${esc(e.titulo)}</td><td>${comp.etapas_concluidas?.[String(e.n)] ? '<b class="ok">Concluída</b>' : "Pendente"}</td><td>${(comp.etapas_reconferir ?? []).includes(e.n) ? "Reconferir" : "—"}</td></tr>`,
  ).join("");
  const resumoInstituicoes = participantes
    .map((p) => {
      const os = obrigacoes.filter((o) => o.participante_id === p.id);
      return `<tr><td>${esc(p.prestadores?.nome_instituicao)}</td><td>${brl(p.valor_devido)}</td><td>${brl(os.reduce((t, o) => t + Number(o.valor_pago ?? 0), 0))}</td></tr>`;
    })
    .join("");
  const timeline = logs
    .slice(0, 80)
    .map((l) => {
      const evento = formatarEventoPiso(l);
      return `<li><b>${esc(evento.titulo)}</b><br><span>${formatarDataHoraEvento(l.data_hora)} · ${esc(l.usuario_nome || "Sistema")}</span>${evento.linhas.length ? `<br><small>${evento.linhas.map(esc).join(" · ")}</small>` : ""}</li>`;
    })
    .join("");
  const linkDou = urlDouValida(comp.portaria_gm_url_dou)
    ? `<a href="${esc(comp.portaria_gm_url_dou)}">Abrir publicação oficial no DOU</a>`
    : "—";
  const cfg = comp.municipal_config ?? {};
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório Executivo - Piso ${esc(comp.competencia)}</title><style>
  *{box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;color:#17263a;margin:12mm;font-size:10px}.head{border-bottom:3px solid #003b69;padding-bottom:10px}.head h1{margin:0;color:#003b69;font-size:19px}.head p{margin:4px 0;color:#607086}h2{break-after:avoid;border-left:4px solid #2d9ed1;padding-left:8px;color:#003b69;font-size:13px;margin:18px 0 7px}h3,h4{color:#174f78;font-size:11px;margin:12px 0 5px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.card{border:1px solid #d9e1ea;border-radius:7px;padding:8px}.card small{display:block;color:#687586}.card b{font-size:14px;color:#003b69}table{width:100%;border-collapse:collapse;break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid}th{background:#003b69;color:#fff;text-align:left;padding:6px}td{border-bottom:1px solid #dfe5ec;padding:6px;vertical-align:top}.ok{color:#13864b}.late{color:#a33b00}.note{border:1px solid #8bbbd3;background:#edf7fc;padding:8px;border-radius:6px}.warn{border-color:#e5b94e;background:#fff8df}ul{padding-left:18px}li{margin:6px 0}a{color:#006aa6}.footer{margin-top:24px;color:#687586;font-size:8px}@media print{body{margin:10mm}}</style></head><body onload="window.focus();window.print()">
  <header class="head"><h1>Relatório Executivo - Piso da Enfermagem</h1><p>Secretaria Municipal de Saúde de Joinville · Competência ${esc(comp.competencia)} · ${esc(STATUS_COMPETENCIA[comp.status] ?? comp.status)}</p></header>
  <h2>1. Coleta das instituições</h2><table><thead><tr><th>Instituição</th><th>Envio / prazo</th><th>Retorno / prazo</th><th>Situação</th><th>Arquivo original</th><th>Registros</th><th>Erros</th><th>Alertas</th><th>Ocorrências</th></tr></thead><tbody>${linhasInstituicoes}</tbody></table>
  <h3>1A. Auditoria das Planilhas de Carga</h3><div class="note warn">Ocorrências da planilha original, mantida sem alteração. Não bloquearam a continuidade.</div><table><thead><tr><th>Instituição</th><th>Linha</th><th>CPF mascarado</th><th>CNES</th><th>Ocorrência</th></tr></thead><tbody>${ocorrCarga || '<tr><td colspan="5">Sem ocorrências.</td></tr>'}</tbody></table>
  <h3>1B. Atualização da competência no InvestSUS</h3><table><tr><td>Data da carga</td><td>${data(comp.investsus_carga_em)}${atraso(comp.investsus_carga_em, prazoInvestsus) ? ' · <b class="late">Em atraso</b>' : ""}</td><td>Prazo</td><td>${data(prazoInvestsus)}</td></tr><tr><td>Confirmação final</td><td>${data(comp.investsus_confirmacao_em)}</td><td>Ocorrência</td><td>${esc(comp.investsus_ocorrencia)}</td></tr></table>
  <h2>2. Auditoria da saída do InvestSUS e Portaria GM/MS</h2><p><b>Arquivo InvestSUS:</b> ${hash(arquivoInvest)}</p><div class="cards">${[
    ["Cargas", cruz.registros_carga],
    ["InvestSUS", cruz.registros_investsus],
    ["Localizados", cruz.localizados],
    ["Críticas", cruz.criticas],
    ["Alertas", cruz.alertas],
    ["Sem complemento", cruz.sem_complemento],
    ["Fora da conciliação", cruz.fora_conciliacao],
  ]
    .map(([l, v]) => `<div class="card"><small>${l}</small><b>${v ?? 0}</b></div>`)
    .join("")}</div>
  <h3>2A. Conciliação Planilhas de Carga × InvestSUS</h3>${tabelaConciliacao("Críticas que exigem ação", (o) => o.severidade === "erro")}${tabelaConciliacao("Alertas para conferência", (o) => o.severidade === "alerta")}${tabelaConciliacao("Ausências sem complemento esperado", (o) => o.regra === "ausencia_sem_complemento")}${tabelaConciliacao("Fora da conciliação por erro de origem", (o) => o.regra === "fora_conciliacao_origem")}
  <h3>Portaria GM/MS</h3><table><tr><td>Número</td><td>${esc(comp.portaria_gm_numero)}</td><td>Data do ato</td><td>${data(comp.portaria_gm_data_ato)}</td></tr><tr><td>Publicação</td><td>${data(comp.portaria_gm_data_publicacao)}</td><td>Edição / seção / página</td><td>${esc(comp.portaria_gm_edicao)} / ${esc(comp.portaria_gm_secao)} / ${esc(comp.portaria_gm_pagina)}</td></tr><tr><td>PDF</td><td>${hash(arquivoPortaria)}</td><td>DOU</td><td>${linkDou}</td></tr><tr><td>Homologado</td><td>${brl(comp.valor_homologado)}</td><td>Desconto</td><td>${brl(comp.desconto_saldo)}</td></tr><tr><td>Acerto</td><td>${brl(comp.acerto_contas)}</td><td>Transferido</td><td>${brl(comp.valor_transferido)}</td></tr></table>
  <h2>3. Atos municipais</h2><table><tr><td>Processo das Portarias</td><td>${esc(cfg.processo)}</td><td>Consulta InvestSUS</td><td>${data(cfg.consulta_investsus)}</td></tr><tr><td>Autoridade</td><td>${esc(cfg.autoridade)} - ${esc(cfg.cargo)}</td><td>Destinatários</td><td>${esc((cfg.destinatarios ?? []).map((d: any) => `${d.nome} (${d.unidade})`).join("; "))}</td></tr></table><p class="note">O relatório apresenta configurações e identificadores; o texto integral da Minuta e do Memorando permanece no processo.</p>
  <h2>4. Crédito recebido no FMS</h2><table><tr><td>Data</td><td>${data(comp.credito_fms_data)}</td><td>Valor</td><td>${brl(comp.credito_fms_valor)}</td></tr><tr><td>Referência</td><td>${esc(comp.credito_fms_referencia)}</td><td>Transferido / diferença</td><td>${brl(comp.valor_transferido)} / ${brl(Number(comp.credito_fms_valor ?? 0) - Number(comp.valor_transferido ?? 0))}</td></tr><tr><td>Justificativa</td><td colspan="3">${esc(comp.justificativa_credito)}</td></tr></table>
  <h2>5. Empenho e liquidação</h2><table><thead><tr><th>Instituição</th><th>Processo</th><th>Exercício</th><th>Fonte</th><th>Saldo NE</th><th>A liquidar</th></tr></thead><tbody>${linhasObrig}</tbody></table>
  <h2>6. Execução no e-Pública</h2><table><thead><tr><th>Instituição</th><th>Solicitação</th><th>Movimento</th><th>Transmitido</th></tr></thead><tbody>${obrigacoes.map((o) => `<tr><td>${esc(participantes.find((p) => p.id === o.participante_id)?.prestadores?.nome_instituicao)}</td><td>${data(o.data_solicitacao_liquidacao)}</td><td>${data(o.data_movimento_liquidacao)}</td><td>${o.movimento_transmitido ? "Sim" : "Não"}</td></tr>`).join("")}</tbody></table>
  <h2>7. Pagamento</h2><table><thead><tr><th>Instituição</th><th>Programação</th><th>Pagamento</th><th>Valor pago</th><th>Observação</th></tr></thead><tbody>${linhasPag}</tbody></table>
  <h2>8. Validações temporais e resumo</h2><div class="cards">${[
    ["InvestSUS", comp.valor_apurado_investsus],
    ["Homologado", comp.valor_homologado],
    ["Transferido", comp.valor_transferido],
    ["Publicado municipal", comp.total_publicado_municipal],
    ["Crédito FMS", comp.credito_fms_valor],
  ]
    .map(([l, v]) => `<div class="card"><small>${l}</small><b>${brl(v)}</b></div>`)
    .join(
      "",
    )}</div><h3>Valores por instituição</h3><table><thead><tr><th>Instituição</th><th>Valor devido</th><th>Valor pago</th></tr></thead><tbody>${resumoInstituicoes}</tbody></table><h3>Etapas e reconferências</h3><table><thead><tr><th>Etapa</th><th>Status</th><th>Reconferência</th></tr></thead><tbody>${etapas}</tbody></table>
  <h2>9. Linha do tempo</h2><ul>${timeline || "<li>Sem registros.</li>"}</ul>
  <h2>10. Conclusão</h2><p>${esc(comp.conclusao_ocorrencia)}</p>
  <h2>11. Referências operacionais</h2><p>Planilhas originais das instituições, saída do InvestSUS, Portaria GM/MS e documentos SEI vinculados à competência.</p>
  <p class="footer">Emitido em ${new Date().toLocaleString("pt-BR")}${emissor ? ` por ${esc(emissor)}` : ""}. Documento gerado automaticamente; nenhum CPF completo é exibido.</p></body></html>`;
  const w = window.open("", "_blank", "width=1100,height=900");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
