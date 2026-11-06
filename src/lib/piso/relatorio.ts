import { brl } from "@/lib/format";
import { STATUS_COMPETENCIA } from "./etapas";
import { rotuloParcelaPiso } from "./parcelas";
import { formatarDataHoraEvento, formatarEventoPiso } from "./historico";
import { saldosAnulacaoPiso } from "./anulacao";
import { etapasVisiveisPiso } from "./etapas";
import { statusParticipantePiso } from "./status";
import { urlDouValida } from "./regras";
import { atraso, prazosEtapa1Piso } from "./prazos";
import { hrefSei, linkValido } from "@/lib/sei";
import { INVESTSUS_AUDIT_RULES_VERSION } from "./investsus";
import { disponibilidadeExtratoAfc, situacaoConciliacaoAfc, valorPublicacaoMunicipalComprovada } from "./conciliacao-afc";

const dinheiro = (v: number | null | undefined) => v == null ? "Não informado" : brl(v);
const esc = (v: unknown) =>
  String(v ?? "—").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
const data = (v?: string | null) =>
  v ? new Date(`${v.slice(0, 10)}T12:00`).toLocaleDateString("pt-BR") : "—";
const dataHora = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};
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
  documentos: any[],
  logs: any[],
  emissor?: string,
  extras: {
    arquivos?: any[];
    ocorrencias?: any[];
    feriados?: any[];
    encaminhamentos?: any[];
    notificacoesEmail?: any[];
    conciliacaoAfc?: any;
    reservasAfc?: any[];
  } = {},
) {
  const arquivos = extras.arquivos ?? [],
    ocorrencias = extras.ocorrencias ?? [],
    encaminhamentos = extras.encaminhamentos ?? [],
    notificacoesEmail = extras.notificacoesEmail ?? [],
    prazosEtapa1 = comp.tipo_parcela === "decimo_terceiro"
       ? { envioInstituicoes: null, retornoInstituicoes: null, envioInvestsus: null }
       : prazosEtapa1Piso(comp.competencia),
    prazoEnvio = prazosEtapa1.envioInstituicoes,
    prazoRetorno = prazosEtapa1.retornoInstituicoes,
    prazoInvestsus = prazosEtapa1.envioInvestsus;
  const conciliacao = extras.conciliacaoAfc ?? null;
  const contaFms = conciliacao?.piso_afc_contas_fms ?? null;
  const reservasOutras = contaFms ? (extras.reservasAfc ?? [])
    .filter((r: any) => r.conta_id === contaFms.id &&
      r.competencia_id !== comp.id && r.situacao === "confirmada")
    .reduce((acc: number, r: any) => acc + Number(r.valor_reservado ?? 0), 0) : null;
  const disponivelExtrato = disponibilidadeExtratoAfc(contaFms, reservasOutras);
  const situacaoAfc = situacaoConciliacaoAfc(comp, conciliacao, contaFms, reservasOutras);
  const publicadoComprovado = valorPublicacaoMunicipalComprovada(comp, documentos);
  const parecerMunicipal = publicadoComprovado == null
    ? "Valor municipal não confirmado por ato documental. A apuração InvestSUS não equivale à publicação."
    : "Valor comprovado no ato municipal e vinculado ao documento SEI.";
  const quadroAfc = [
    ["Homologação federal",comp.valor_homologado],
    ["Desconto federal por compensação",comp.desconto_saldo],
    ["Acerto federal",comp.acerto_contas],
    ["Transferência federal prevista",comp.valor_transferido],
    ["Crédito efetivo no FMS",comp.credito_fms_valor],
    ["Saldo anterior declarado (não presumir disponível)",comp.saldo_afc_anterior],
    ["Saldo bancário do extrato",contaFms?.saldo_bancario],
    ["Compromissos anteriores no FMS",contaFms?.compromissos_preexistentes],
    ["Reserva em outras competências",reservasOutras],
    ["Disponibilidade líquida calculada do extrato",disponivelExtrato],
    ["Reserva confirmada desta competência",conciliacao?.situacao === "confirmada" ? conciliacao.valor_reservado : null],
  ].map(([nome, valor]) => `<tr><td>${esc(nome)}</td><td>${dinheiro(valor as number | null)}</td></tr>`).join("");
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
  const auditoriaAtual =
      Number(comp.investsus_auditoria?.versao_regras ?? 0) === INVESTSUS_AUDIT_RULES_VERSION,
    cruz = auditoriaAtual ? comp.investsus_auditoria?.conciliacao ?? {} : {},
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
      const solicitacao = documentos.find(
        (d) => d.tipo === "solicitacao_ne" && d.obrigacao_id === o.id,
      );
      const nota = documentos.find(
        (d) => d.tipo === "nota_empenho" && d.obrigacao_id === o.id,
      );
      const encaminhamentoSolicitacao = encaminhamentos
        .filter((e) => e.documento_id === solicitacao?.id)
        .sort((a, b) => String(b.ocorrido_em ?? "").localeCompare(String(a.ocorrido_em ?? "")))[0];
      const situacaoSolicitacao =
        encaminhamentoSolicitacao?.acao === "encaminhado"
          ? `Encaminhada para ${esc(encaminhamentoSolicitacao.destino)}`
          : "Pendente de encaminhamento";
      const linkProcesso = linkValido(o.link_processo_sei)
        ? `<a href="${esc(hrefSei(o.link_processo_sei))}">Abrir no SEI</a>`
        : "—";
      return `<tr><td>${esc(p?.prestadores?.nome_instituicao)}</td><td>${esc(o.processo_sei)}<br><small>${linkProcesso}</small></td><td>${esc(o.fonte)}</td><td>${esc(o.cr_dotacao)}</td><td>${dinheiro(p?.valor_devido)}</td><td>${dinheiro(o.valor_empenhado)}</td>
      <td>${dinheiro(o.valor_a_liquidar)}</td>
      <td>${o.valor_empenhado==null || o.valor_a_liquidar==null ? "Não informado" :
        brl(Math.max(0,Number(o.valor_empenhado)-Number(o.valor_a_liquidar)))}</td>
      <td>Nº SEI ${esc(solicitacao?.numero_sei)}<br>${data(solicitacao?.data_documento)}<br>
        <small>${linkValido(solicitacao?.link_sei) ? `<a href="${esc(hrefSei(solicitacao.link_sei))}">Abrir no SEI</a>` : "Sem link SEI"}</small><br><small>${situacaoSolicitacao}</small></td>
      <td>${esc(nota?.numero)}<br><small>${data(nota?.data_documento)}</small><br>
        <small>${linkValido(nota?.link_sei) ? `<a href="${esc(hrefSei(nota.link_sei))}">Abrir NE no SEI</a>` : "Sem link SEI"}</small></td></tr>`;
    })
    .join("");
  const linhasPag = obrigacoes
    .map((o) => {
      const p = participantes.find((x) => x.id === o.participante_id);
      const programacao = documentos.find((d) => d.tipo === "programacao_pagamento" && d.obrigacao_id === o.id);
      return `<tr><td>${esc(p?.prestadores?.nome_instituicao)}</td><td>${data(programacao?.data_documento ?? o.data_programacao)}</td><td>${data(o.data_pagamento)}</td><td>${brl(o.valor_pago)}</td><td>${esc(o.observacao)}</td></tr>`;
    })
    .join("");
  const linhasNotificacoes = participantes
    .filter((p) => !p.sem_elegiveis)
    .map((p) => {
      const notificacao = notificacoesEmail.find((n) => n.participante_id === p.id);
      const linkProcesso = linkValido(notificacao?.processo_sei_link)
        ? `<a href="${esc(hrefSei(notificacao.processo_sei_link))}">Abrir no SEI</a>`
        : "—";
      const destinatarios = Array.isArray(notificacao?.destinatarios)
        ? notificacao.destinatarios.join("; ")
        : "—";
      return `<tr><td>${esc(p.prestadores?.nome_instituicao)}</td><td>${esc(destinatarios)}</td><td>${esc(notificacao?.assunto)}</td><td>${dataHora(notificacao?.enviado_em)}</td><td>${esc(notificacao?.enviado_por_nome)}</td><td>${esc(notificacao?.processo_sei_numero)}<br><small>${linkProcesso}</small></td></tr>`;
    })
    .join("");
  const saldosAnulacao = saldosAnulacaoPiso(obrigacoes);
  const linhasAnulacao = saldosAnulacao.map(s => {
    const instituicao = participantes.find(p => p.id === s.participanteId)?.prestadores?.nome_instituicao;
    const solicitacao = documentos.find(d => d.obrigacao_id === s.obrigacaoId && d.tipo === "solicitacao_anulacao");
    const aviso = documentos.find(d => d.obrigacao_id === s.obrigacaoId && d.tipo === "aviso_anulacao");
    const enviada = encaminhamentos.filter(e => e.documento_id === solicitacao?.id).sort(
      (a,b) => String(a.ocorrido_em).localeCompare(String(b.ocorrido_em))).at(-1)?.acao === "encaminhado";
    const link = (d: any) => linkValido(d?.link_sei)
      ? `<a href="${esc(hrefSei(d.link_sei))}">Abrir SEI</a>` : "—";
    return `<tr><td>${esc(instituicao)}</td><td>${brl(s.empenhado)}</td><td>${brl(s.necessario)}</td><td>${brl(s.previsto)}</td><td>${s.anulado==null?"Pendente":brl(s.anulado)}</td><td>${esc(solicitacao?.numero_sei)}<br>${link(solicitacao)}<br>${enviada?"Enviada à SEFAZ":"Envio pendente"}</td><td>${esc(aviso?.numero_sei)}<br>${link(aviso)}</td></tr>`;
  }).join("");
  const etapas = etapasVisiveisPiso(comp.tipo_parcela, saldosAnulacao.length > 0).map(
    (e) =>
      `<tr><td>${e.n===10?"7A":e.n}. ${esc(e.titulo)}</td><td>${comp.etapas_concluidas?.[String(e.n)] ? '<b class="ok">Concluída</b>' : "Pendente"}</td><td>${(comp.etapas_reconferir ?? []).includes(e.n) ? "Reconferir" : "—"}</td></tr>`,
  ).join("");
  const resumoInstituicoes = participantes
    .map((p) => {
      const os = obrigacoes.filter((o) => o.participante_id === p.id);
      return `<tr><td>${esc(p.prestadores?.nome_instituicao)}</td><td>${brl(p.valor_devido)}</td><td>${brl(os.reduce((t, o) => t + Number(o.valor_pago ?? 0), 0))}</td></tr>`;
    })
    .join("");
  const timeline = logs
    // Resumo auditável do PDF; o histórico integral permanece disponível no PACTO.
    .filter(l => /import|portaria|homolog|cr[eé]dito|financ|empenh|anula|assin|encaminh|pagam|conclu|reconfer|AFC/i
      .test(String(l.acao ?? "") + " " + JSON.stringify(l.detalhes ?? {})))
    .slice(0, 100)
    .map((l) => {
      const evento = formatarEventoPiso(l);
      return `<li><b>${esc(evento.titulo)}</b><br><span>${formatarDataHoraEvento(l.data_hora)} · ${esc(l.usuario_nome || "Sistema")}</span>${evento.linhas.length ? `<br><small>${evento.linhas.map(esc).join(" · ")}</small>` : ""}</li>`;
    })
    .join("");
  const linkDou = urlDouValida(comp.portaria_gm_url_dou)
    ? `<a href="${esc(comp.portaria_gm_url_dou)}">Abrir publicação oficial no DOU</a>`
    : "—";
  const linkCredito = linkValido(comp.credito_fms_link)
    ? `<a href="${esc(hrefSei(comp.credito_fms_link))}">Abrir Informação no SEI</a>`
    : "—";
  const cfg = comp.municipal_config ?? {};
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório Executivo - Piso ${esc(rotuloParcelaPiso(comp))}</title><style>
  *{box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;color:#17263a;margin:12mm;font-size:10px}.head{border-bottom:3px solid #003b69;padding-bottom:10px}.head h1{margin:0;color:#003b69;font-size:19px}.head p{margin:4px 0;color:#607086}h2{break-after:avoid;border-left:4px solid #2d9ed1;padding-left:8px;color:#003b69;font-size:13px;margin:18px 0 7px}h3,h4{color:#174f78;font-size:11px;margin:12px 0 5px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.card{border:1px solid #d9e1ea;border-radius:7px;padding:8px}.card small{display:block;color:#687586}.card b{font-size:14px;color:#003b69}table{width:100%;border-collapse:collapse;break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid}th{background:#003b69;color:#fff;text-align:left;padding:6px}td{border-bottom:1px solid #dfe5ec;padding:6px;vertical-align:top}.ok{color:#13864b}.late{color:#a33b00}.note{border:1px solid #8bbbd3;background:#edf7fc;padding:8px;border-radius:6px}.warn{border-color:#e5b94e;background:#fff8df}ul{padding-left:18px}li{margin:6px 0}a{color:#006aa6}.footer{margin-top:24px;color:#687586;font-size:8px}@media print{body{margin:10mm}}</style></head><body onload="window.focus();window.print()">
  <header class="head"><h1>Relatório Executivo - Piso da Enfermagem</h1><p>Secretaria Municipal de Saúde de Joinville · Competência ${esc(rotuloParcelaPiso(comp))} · ${esc(STATUS_COMPETENCIA[comp.status] ?? comp.status)}</p></header>
  <h2>1. Coleta das instituições</h2><table><thead><tr><th>Instituição</th><th>Envio / prazo</th><th>Retorno / prazo</th><th>Situação</th><th>Arquivo original</th><th>Registros</th><th>Erros</th><th>Alertas</th><th>Ocorrências</th></tr></thead><tbody>${linhasInstituicoes}</tbody></table>
  <h3>1A. Auditoria das Planilhas de Carga</h3><div class="note warn">Ocorrências da planilha original, mantida sem alteração. Não bloquearam a continuidade.</div><table><thead><tr><th>Instituição</th><th>Linha</th><th>CPF mascarado</th><th>CNES</th><th>Ocorrência</th></tr></thead><tbody>${ocorrCarga || '<tr><td colspan="5">Sem ocorrências.</td></tr>'}</tbody></table>
  <h3>1B. Envio das Planilhas de Carga ao InvestSUS</h3><table><tr><td>Data do envio</td><td>${data(comp.investsus_carga_em)}${atraso(comp.investsus_carga_em, prazoInvestsus) ? ' · <b class="late">Em atraso</b>' : ""}</td><td>Prazo fixo</td><td>${data(prazoInvestsus)}</td></tr></table>
  <h2>2. Auditoria da saída do InvestSUS e Portaria GM/MS</h2><p><b>Arquivo InvestSUS:</b> ${hash(arquivoInvest)}</p>${auditoriaAtual ? "" : '<div class="note warn">A auditoria armazenada foi calculada por regras anteriores. Reprocesse o InvestSUS antes de usar os indicadores de conciliação.</div>'}<div class="cards">${[
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
  <h2>3. Atos municipais</h2><p class="note">${esc(parecerMunicipal)}</p><table><tr><td>Processo das Portarias</td><td>${esc(cfg.processo)}</td><td>Consulta InvestSUS</td><td>${data(cfg.consulta_investsus)}</td></tr><tr><td>Autoridade</td><td>${esc(cfg.autoridade)} - ${esc(cfg.cargo)}</td><td>Destinatários</td><td>${esc((cfg.destinatarios ?? []).map((d: any) => `${d.nome} (${d.unidade})`).join("; "))}</td></tr></table><p class="note">O relatório apresenta configurações e identificadores; o texto integral da Minuta e do Memorando permanece no processo.</p>
  <h2>4. Crédito recebido no FMS</h2><table><tr><td>Data</td><td>${data(comp.credito_fms_data)}</td><td>Valor efetivamente creditado</td><td>${dinheiro(comp.credito_fms_valor)}</td></tr><tr><td>Informação SEI</td><td>${esc(comp.credito_fms_referencia)}</td><td>Link SEI</td><td>${linkCredito}</td></tr><tr><td>Transferido / diferença</td><td>${dinheiro(comp.valor_transferido)} / ${comp.credito_fms_valor==null || comp.valor_transferido==null ? "Não informado" : brl(Number(comp.credito_fms_valor)-Number(comp.valor_transferido))}</td><td>Justificativa</td><td>${esc(comp.justificativa_credito)}</td></tr></table>
  <h2>4A. Conciliação Financeira da Assistência Complementar</h2>
  <p class="note">Situação: <b>${esc(situacaoAfc)}</b>. Fonte no âmbito do FMS: ${esc(contaFms?.identificacao)}.
  Data do extrato: ${data(contaFms?.data_saldo)}. Número SEI: ${esc(contaFms?.documento_sei)}.
  ${linkValido(contaFms?.documento_link)
      ? `<a href="${esc(hrefSei(contaFms.documento_link))}">Abrir extrato no SEI</a>` : "Evidência SEI não informada"}.
  Crédito registrado não é somado novamente ao saldo do extrato. O desconto federal não prova disponibilidade.</p>
  <table><thead><tr><th>Componente / origem</th><th>Valor ou situação</th></tr></thead><tbody>${quadroAfc}</tbody></table>
  <p>Conferência: ${dataHora(conciliacao?.confirmada_em)}. Situação da revisão: ${esc(conciliacao?.revisao_situacao)}.
  Ofício: ${esc(conciliacao?.revisao_oficio)}. Protocolo: ${esc(conciliacao?.revisao_protocolo)}.
  Decisão: ${esc(conciliacao?.revisao_decisao)}.</p>
  <h2>5. Empenho e liquidação</h2><table><thead><tr><th>Instituição</th><th>Processo SEI</th><th>Fonte</th><th>CR/dotação</th><th>Valor devido após homologação</th><th>Valor originalmente empenhado</th><th>Necessário após conciliação</th><th>Previsão de anulação</th><th>Solicitação de NE</th><th>Nº da NE</th></tr></thead><tbody>${linhasObrig}</tbody></table>
  <h2>6. Execução no e-Pública</h2><table><thead><tr><th>Instituição</th><th>Solicitação de Subempenho / Liquidação</th><th>Aviso de Movimento - Empenho em Liquidação</th><th>Aviso de Movimento - Subempenho</th></tr></thead><tbody>${obrigacoes.map((o) => {
    const solicitacao = documentos.find((d) => d.tipo === "solicitacao_liquidacao" && d.obrigacao_id === o.id);
    const aviso = documentos.find((d) => d.tipo === "aviso_liquidacao" && d.obrigacao_id === o.id);
    const avisoSub = documentos.find((d) => d.tipo === "aviso_subempenho" && d.obrigacao_id === o.id);
    const linkSub = linkValido(avisoSub?.link_sei)
      ? `<a href="${esc(hrefSei(avisoSub.link_sei))}">Abrir no SEI</a>`
      : "—";
    return `<tr><td>${esc(participantes.find((p) => p.id === o.participante_id)?.prestadores?.nome_instituicao)}</td><td>${esc(solicitacao?.numero_sei)}</td><td>${esc(aviso?.numero_sei)}</td><td>Nº SEI ${esc(avisoSub?.numero_sei)}<br>${data(avisoSub?.data_documento)}<br><small>${linkSub}</small></td></tr>`;
  }).join("")}</tbody></table>
  <h2>7. Pagamento</h2><table><thead><tr><th>Instituição</th><th>Programação</th><th>Pagamento</th><th>Valor pago</th><th>Observação</th></tr></thead><tbody>${linhasPag}</tbody></table>
  <h2>7A. Anulação condicional de empenhos</h2><table><thead><tr><th>Instituição</th><th>Empenhado original</th><th>Necessário</th><th>Previsto a anular</th><th>Anulado efetivo</th><th>Solicitação e envio SEFAZ</th><th>Aviso da SEFAZ</th></tr></thead><tbody>${linhasAnulacao || '<tr><td colspan="7">Sem excedente declarado para anulação nesta competência.</td></tr>'}</tbody></table>
  <h2>8. Notificação por e-mail</h2><table><thead><tr><th>Instituição</th><th>Destinatários</th><th>Assunto</th><th>Envio registrado</th><th>Responsável</th><th>Processo SEI</th></tr></thead><tbody>${linhasNotificacoes || '<tr><td colspan="6">Nenhuma notificação registrada.</td></tr>'}</tbody></table>
  <h2>9. Validações temporais e resumo</h2><div class="cards">${[
    ["InvestSUS", comp.valor_apurado_investsus],
    ["Homologado", comp.valor_homologado],
    ["Transferido", comp.valor_transferido],
    ["Valor municipal efetivamente comprovado", publicadoComprovado],
    ["Crédito FMS efetivamente informado", comp.credito_fms_valor],
  ]
    .map(([l, v]) => `<div class="card"><small>${l}</small><b>${dinheiro(v as number | null)}</b></div>`)
    .join(
      "",
    )}</div><h3>Valores por instituição</h3><table><thead><tr><th>Instituição</th><th>Valor devido</th><th>Valor pago</th></tr></thead><tbody>${resumoInstituicoes}</tbody></table><h3>Etapas e reconferências</h3><table><thead><tr><th>Etapa</th><th>Status</th><th>Reconferência</th></tr></thead><tbody>${etapas}</tbody></table>
  <h2>10. Eventos relevantes da linha do tempo</h2><p class="note">O PDF prioriza acontecimentos financeiros e documentais. A trilha completa, sem exclusões, permanece no histórico do PACTO.</p><ul>${timeline || "<li>Sem registros.</li>"}</ul>
  <h2>11. Conclusão</h2><p>${esc(comp.conclusao_ocorrencia)}</p>
  <h2>12. Referências operacionais</h2><p>Planilhas originais das instituições, saída do InvestSUS, Portaria GM/MS e documentos SEI vinculados à competência.</p>
  <p class="footer">Emitido em ${new Date().toLocaleString("pt-BR")}${emissor ? ` por ${esc(emissor)}` : ""}. Documento gerado automaticamente; nenhum CPF completo é exibido.</p></body></html>`;
  const w = window.open("", "_blank", "width=1100,height=900");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
