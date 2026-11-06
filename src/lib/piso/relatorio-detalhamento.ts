
import { brl } from "@/lib/format";
import { hrefSei, linkValido } from "@/lib/sei";
import { docCompleto, type CtxPiso } from "./regras";
import { memorandoEncaminhadoParaDestinatarios, unidadesDestinatariasMemorando } from "./encaminhamento-memorando";
import { formatarDataHoraEvento, formatarEventoPiso } from "./historico";
import { rotuloParcelaPiso } from "./parcelas";

export type FontesDetalhamentoPiso = {
  comp: any;
  participantes: any[];
  obrigacoes: any[];
  documentos: any[];
  assinaturas: any[];
  matriz: any[];
  encaminhamentos: any[];
  arquivos: any[];
  logs: any[];
};

const texto = (valor: unknown) => String(valor ?? "").trim() || "Não informado";
export const escaparRelatorioPiso = (valor: unknown) =>
  String(valor ?? "—").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const mostrar = (valor: unknown) => escaparRelatorioPiso(texto(valor));
const dinheiro = (valor: unknown) =>
  valor === null || valor === undefined || valor === "" ? "Não informado" : brl(Number(valor));
const data = (valor: unknown) => {
  if (!valor) return "Não informado";
  const dt = new Date(String(valor).slice(0, 10) + "T12:00:00");
  return Number.isNaN(dt.getTime()) ? "Data inválida" : dt.toLocaleDateString("pt-BR");
};
const dataHora = (valor: unknown) => {
  if (!valor) return "Não registrado";
  const dt = new Date(String(valor));
  return Number.isNaN(dt.getTime()) ? "Data inválida" :
    dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};
const linkSei = (valor: unknown, legenda = "Abrir documento no SEI") =>
  typeof valor === "string" && linkValido(valor)
    ? '<a href="' + escaparRelatorioPiso(hrefSei(valor)) +
        '" target="_blank" rel="noopener noreferrer">' + escaparRelatorioPiso(legenda) + "</a>"
    : '<span class="pendente">Link SEI não informado ou inválido</span>';
const documento = (fontes: FontesDetalhamentoPiso, tipo: string) =>
  fontes.documentos.find(d => d.tipo === tipo && !d.participante_id && !d.obrigacao_id);
const listaEncaminhamentos = (fontes: FontesDetalhamentoPiso, id: string | undefined) =>
  fontes.encaminhamentos
    .filter(e => Boolean(id) && e.documento_id === id)
    .sort((a, b) => String(a.ocorrido_em ?? "").localeCompare(String(b.ocorrido_em ?? "")));

export function registrarAssinaturasRelatorioPiso(
  doc: any,
  matriz: any[],
  assinaturas: any[],
): string {
  if (!doc) return '<p class="pendente">Documento não registrado; assinaturas indisponíveis.</p>';
  const exigidos = matriz.filter(m => m.tipo_documento === doc.tipo)
    .sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0));
  const presentes = assinaturas.filter(a => a.documento_id === doc.id);
  if (!exigidos.length && !presentes.length)
    return '<p class="pendente">Sem matriz de assinaturas configurada ou registros de assinatura.</p>';

  const linhas = exigidos.map(m => {
    const registro = presentes.find(a => a.slot === m.slot_key);
    return '<tr><td>' + mostrar(m.label || m.slot_key) +
      '<br><small>' + (m.opcional ? "Opcional" : "Obrigatória") + '</small></td><td>' +
      (registro ? mostrar(registro.servidor_nome) : '<span class="pendente">Pendente</span>') +
      '</td><td>' + (registro ? mostrar(registro.cargo) : "—") +
      '</td><td>' + (registro ? dataHora(registro.assinado_em) : "—") + '</td></tr>';
  });
  const reconhecidos = new Set(exigidos.map(m => m.slot_key));
  presentes.filter(a => !reconhecidos.has(a.slot)).forEach(a => {
    linhas.push('<tr><td>' + mostrar(a.slot) +
      '<br><small>Fora da matriz atual: verificar histórico</small></td><td>' +
      mostrar(a.servidor_nome) + '</td><td>' + mostrar(a.cargo) +
      '</td><td>' + dataHora(a.assinado_em) + '</td></tr>');
  });
  const obrigatorias = exigidos.filter(m => !m.opcional);
  const atendidas = obrigatorias.filter(m => presentes.some(a => a.slot === m.slot_key));
  const situacao = obrigatorias.length
    ? 'Obrigatórias registradas: ' + atendidas.length + '/' + obrigatorias.length
    : 'Sem assinaturas obrigatórias configuradas; conferir matriz vigente';
  return '<p class="subnote">' + escaparRelatorioPiso(situacao) +
    ' · Assinaturas registradas: ' + presentes.length + '</p>' +
    '<table class="tabela-documentos"><thead><tr><th>Signatário / papel</th><th>Nome registrado</th><th>Cargo</th><th>Data e hora</th></tr></thead><tbody>' +
    linhas.join("") + '</tbody></table>';
}

function detalheDocumentoMunicipal(
  fontes: FontesDetalhamentoPiso,
  tipo: string,
  titulo: string,
): string {
  const doc = documento(fontes, tipo);
  const ctx = { matriz: fontes.matriz, assinaturas: fontes.assinaturas };
  const situacao = !doc ? "Ainda não registrado" :
    docCompleto(ctx, doc) ? "Metadados e assinaturas obrigatórias completos" :
      "Requer conferência documental/assinaturas";
  return '<article class="bloco-documental"><h3>' + escaparRelatorioPiso(titulo) + '</h3>' +
    '<p class="subnote">Situação cadastral: <strong>' + escaparRelatorioPiso(situacao) +
    '</strong>. A comprovação final deve ser verificada no documento oficial do SEI.</p>' +
    '<table class="tabela-chaves"><tbody><tr><td>Número do documento SEI</td><td>' +
    mostrar(doc?.numero_sei) + '</td><td>Data do documento</td><td>' +
    data(doc?.data_documento) + '</td></tr><tr><td>Referência adicional</td><td>' +
    mostrar(doc?.numero) + '</td><td>Link oficial</td><td>' +
    linkSei(doc?.link_sei) + '</td></tr></tbody></table>' +
    '<h4>Assinaturas e responsabilidades</h4>' +
    registrarAssinaturasRelatorioPiso(doc, fontes.matriz, fontes.assinaturas) +
    '</article>';
}

export function secaoAtosMunicipaisDetalhadaPiso(fontes: FontesDetalhamentoPiso): string {
  const config = fontes.comp.municipal_config ?? {};
  const memo = documento(fontes, "memorando");
  const unidades = unidadesDestinatariasMemorando(config.destinatarios);
  const ctx = {
    comp: fontes.comp,
    docs: fontes.documentos,
    matriz: fontes.matriz,
    assinaturas: fontes.assinaturas,
    encaminhamentos: fontes.encaminhamentos,
  } as CtxPiso;
  const confirmado = memorandoEncaminhadoParaDestinatarios(ctx);
  const encaminhamentos = listaEncaminhamentos(fontes, memo?.id);
  const ultimo = encaminhamentos.at(-1);
  const destinatarios = (Array.isArray(config.destinatarios) ? config.destinatarios : [])
    .map((d: any) => '<tr><td>' + mostrar(d.unidade) + '</td><td>' +
      mostrar(d.nome) + '</td><td>' + mostrar(d.cargo) + '</td></tr>').join("");
  const linhasEnc = encaminhamentos.map(e =>
    '<tr><td>' + dataHora(e.ocorrido_em) + '</td><td>' + mostrar(e.acao) +
    '</td><td>' + mostrar(e.destino) + '</td><td>' + mostrar(e.usuario_nome) +
    '</td><td>' + mostrar(e.motivo) + '</td></tr>').join("");
  const cfgLink = linkSei(fontes.comp.link_processo_sei, "Abrir processo das Portarias no SEI");
  const ficha = '<h2>3. Atos municipais, tramitação e documentos SEI</h2>' +
    '<div class="note"><b>Rastreabilidade:</b> os números SEI, links e assinaturas abaixo ' +
    'provêm de registros da competência. Os textos-base gerados no sistema não substituem ' +
    'a versão oficial assinada e publicada no SEI.</div>' +
    '<table class="tabela-chaves"><tbody>' +
    '<tr><td>Processo das Portarias</td><td>' + mostrar(config.processo) +
    '</td><td>Processo SEI vinculado</td><td>' + cfgLink + '</td></tr>' +
    '<tr><td>Data da consulta ao InvestSUS</td><td>' + data(config.consulta_investsus) +
    '</td><td>Autoridade municipal</td><td>' + mostrar(config.autoridade) + ' · ' +
      mostrar(config.cargo) + '</td></tr>' +
    '<tr><td>Portaria municipal nº</td><td>' + mostrar(config.portaria_numero) +
    '</td><td>Valor publicado comprovado</td><td>' + dinheiro(fontes.comp.total_publicado_municipal) +
    ' <small>(valor informado; conferir status documental abaixo)</small></td></tr></tbody></table>';

  return ficha +
    detalheDocumentoMunicipal(fontes, "minuta", "3A. Minuta da Portaria municipal") +
    detalheDocumentoMunicipal(fontes, "memorando", "3B. Memorando de solicitação de publicação") +
    '<h4>Destinatários do memorando cadastrados</h4><p class="subnote">Setores SEI: ' +
    (unidades.length ? escaparRelatorioPiso(unidades.join("; ")) : "Não informados") +
    '</p><table class="tabela-documentos"><thead><tr><th>Setor / unidade SEI</th><th>Destinatário</th><th>Cargo</th></tr></thead><tbody>' +
    (destinatarios || '<tr><td colspan="3">Nenhum destinatário cadastrado.</td></tr>') + '</tbody></table>' +
    '<h4>Comprovação de encaminhamento</h4><p class="' + (confirmado ? "ok" : "pendente") +
    '"><strong>' + (confirmado
      ? "Encaminhamento confirmado para os destinatários atuais"
      : "Encaminhamento ainda não comprovado para os destinatários atuais") +
    '</strong> · Último registro: ' + (ultimo ? mostrar(ultimo.acao) + ' em ' +
      dataHora(ultimo.ocorrido_em) + ', por ' + mostrar(ultimo.usuario_nome) :
      "nenhum registro") + '</p>' +
    '<table class="tabela-documentos"><thead><tr><th>Data/hora</th><th>Ação</th><th>Destino</th><th>Responsável</th><th>Justificativa</th></tr></thead><tbody>' +
    (linhasEnc || '<tr><td colspan="5">Nenhum encaminhamento registrado.</td></tr>') +
    '</tbody></table>' +
    detalheDocumentoMunicipal(fontes, "portaria_municipal", "3C. Portaria municipal publicada");
}

const rotulosDocumentos: Record<string, string> = {
  minuta: "Minuta municipal", memorando: "Memorando",
  portaria_municipal: "Portaria municipal",
  solicitacao_ne: "Solicitação de NE", nota_empenho: "Nota de Empenho",
  solicitacao_liquidacao: "Solicitação de liquidação",
  aviso_liquidacao: "Aviso de liquidação", aviso_subempenho: "Aviso de subempenho",
  programacao_pagamento: "Programação de pagamento",
  comprovante_pagamento: "Comprovante de pagamento",
  solicitacao_anulacao: "Solicitação de anulação",
  aviso_anulacao: "Aviso de anulação",
};

export function secaoInventarioDocumentalPiso(fontes: FontesDetalhamentoPiso): string {
  const linhas = [...fontes.documentos].sort((a, b) =>
    String(a.tipo).localeCompare(String(b.tipo))).map(d => {
    const prestador = fontes.participantes.find(p => p.id === d.participante_id ||
      fontes.obrigacoes.some(o => o.id === d.obrigacao_id && o.participante_id === p.id));
    const assinaturas = fontes.assinaturas.filter(a => a.documento_id === d.id);
    const ult = listaEncaminhamentos(fontes, d.id).at(-1);
    return '<tr><td><strong>' + escaparRelatorioPiso(rotulosDocumentos[d.tipo] ?? d.tipo) +
      '</strong><br><small>' + mostrar(prestador?.prestadores?.nome_instituicao ?? "Competência") +
      '</small></td><td>' + mostrar(d.numero_sei) +
      (d.numero ? '<br><small>Referência: ' + mostrar(d.numero) + '</small>' : '') +
      '</td><td>' + data(d.data_documento) + '</td><td>' + linkSei(d.link_sei) +
      '</td><td>' + assinaturas.length + ' registro(s)' +
      (assinaturas.length ? '<br><small>' +
        assinaturas.map(a => mostrar(a.servidor_nome) + ' (' + mostrar(a.slot) + ')').join("; ") +
        '</small>' : '') + '</td><td>' + (ult ? mostrar(ult.acao) +
      '<br>' + dataHora(ult.ocorrido_em) + '<br><small>' + mostrar(ult.destino) + '</small>' :
      'Sem encaminhamento registrado') + '</td></tr>';
  }).join("");
  return '<h2>13. Inventário documental consolidado e rastreabilidade SEI</h2>' +
    '<p class="note">Inclui documentos municipais, financeiros, de liquidação, pagamento e anulação ' +
    'registrados na competência, com vínculo SEI, signatários e movimentações. Documentos sem ' +
    'metadados completos não são apresentados como comprovados.</p>' +
    '<table class="tabela-documentos"><thead><tr><th>Documento / instituição</th><th>Número SEI</th><th>Data</th><th>Acesso</th><th>Assinaturas registradas</th><th>Último encaminhamento</th></tr></thead><tbody>' +
    (linhas || '<tr><td colspan="6">Nenhum documento cadastrado.</td></tr>') +
    '</tbody></table>';
}

export function secaoEvidenciasOriginaisPiso(fontes: FontesDetalhamentoPiso): string {
  const linhas = [...fontes.arquivos].sort((a,b) =>
    String(b.enviado_em ?? "").localeCompare(String(a.enviado_em ?? ""))).map(a => {
    const p = fontes.participantes.find(x => x.id === a.participante_id);
    return '<tr><td>' + mostrar(a.categoria) + '</td><td>' + mostrar(a.nome_original) +
      '</td><td>' + mostrar(p?.prestadores?.nome_instituicao ?? "Competência") +
      '</td><td>' + dataHora(a.enviado_em) + '</td><td>' + mostrar(a.enviado_por_nome) +
      '</td><td><small>' + mostrar(a.sha256) + '</small></td></tr>';
  }).join("");
  return '<h2>14. Evidências originais e integridade dos arquivos</h2>' +
    '<p class="note">O nome, a data e o hash SHA-256 identificam a evidência registrada; ' +
    'o relatório não presume autenticidade externa nem substitui a conferência documental.</p>' +
    '<table class="tabela-documentos"><thead><tr><th>Categoria</th><th>Arquivo</th><th>Instituição</th><th>Importação</th><th>Responsável</th><th>SHA-256</th></tr></thead><tbody>' +
    (linhas || '<tr><td colspan="6">Nenhum arquivo registrado.</td></tr>') +
    '</tbody></table>';
}

export function secaoHistoricoIntegralPiso(fontes: FontesDetalhamentoPiso): string {
  const ordenados = [...fontes.logs].sort((a,b) =>
    String(a.data_hora ?? "").localeCompare(String(b.data_hora ?? "")));
  const linhas = ordenados.map((l,i) => {
    const evento = formatarEventoPiso(l);
    return '<tr><td>' + (i + 1) + '</td><td>' +
      escaparRelatorioPiso(formatarDataHoraEvento(l.data_hora)) + '</td><td>' +
      mostrar(l.usuario_nome || "Sistema") + '</td><td><b>' + mostrar(evento.titulo) +
      '</b>' + (evento.linhas?.length ?
        '<br><small>' + evento.linhas.map(escaparRelatorioPiso).join(" · ") + '</small>' : '') +
      '</td></tr>';
  }).join("");
  return '<h2>15. Histórico cronológico dos eventos da competência</h2>' +
    '<p class="note">Total de ' + ordenados.length + ' registros disponíveis na consulta integral, ' +
    'ordenados do mais antigo para o mais recente. Os metadados exibidos são descrições ' +
    'de auditoria; registros integrais permanecem preservados no PACTO.</p>' +
    '<table class="tabela-documentos"><thead><tr><th>Ordem</th><th>Data e hora</th><th>Responsável</th><th>Evento e alterações</th></tr></thead><tbody>' +
    (linhas || '<tr><td colspan="4">Sem registros no histórico.</td></tr>') +
    '</tbody></table>';
}

export function secaoPanoramaExecutivoPiso(
  fontes: FontesDetalhamentoPiso,
  publicadoComprovado: number | null,
  situacaoAfc: string,
): string {
  const c = fontes.comp;
  const exigemReconf = Array.isArray(c.etapas_reconferir) ? c.etapas_reconferir : [];
  const completas = Object.values(c.etapas_concluidas ?? {}).filter(Boolean).length;
  const pagamentosComData = fontes.obrigacoes.filter(o => o.data_pagamento && o.valor_pago != null);
  const valorPago = pagamentosComData.reduce((v,o) => v + Number(o.valor_pago),0);
  const pendentesDePagamento = fontes.obrigacoes.filter(o => !o.data_pagamento).length;
  const instituicoes = fontes.participantes.length;
  const registradas = fontes.documentos.length;
  const comSei = fontes.documentos.filter(d => d.numero_sei && linkValido(d.link_sei)).length;
  const evidencias = [
    ['InvestSUS apurado', c.valor_apurado_investsus],
    ['Homologação federal', c.valor_homologado],
    ['Transferência federal prevista', c.valor_transferido],
    ['Crédito FMS registrado', c.credito_fms_valor],
    ['Publicação municipal comprovada', publicadoComprovado],
  ].map(([rotulo,valor]) => '<div class="card"><small>' +
    mostrar(rotulo) + '</small><b>' + dinheiro(valor) + '</b></div>').join("");
  return '<h2>0. Síntese executiva e situação da competência</h2>' +
    '<p class="lead"><strong>' + mostrar(rotuloParcelaPiso(c)) + '</strong> · ' +
    instituicoes + ' instituição(ões) · ' + completas + ' etapa(s) assinalada(s) como concluída(s)' +
    (exigemReconf.length ? ' · <span class="pendente">' + exigemReconf.length +
      ' etapa(s) com reconferência pendente</span>' : '') + '.</p>' +
    '<div class="cards">' + evidencias + '</div>' +
    '<p class="note"><b>Leitura do fluxo:</b> a apuração InvestSUS não equivale à publicação municipal; ' +
    'a transferência prevista não prova crédito; o desconto federal não equivale à anulação de empenho. ' +
    'A conciliação AFC está classificada como <b>' + mostrar(situacaoAfc) + '</b>.</p>' +
    '<div class="resumo-paineis"><div><b>Documentos SEI</b><br>' + registradas +
    ' registro(s), dos quais ' + comSei + ' possuem número e link cadastrados.</div>' +
    '<div><b>Pagamentos com data e valor registrados</b><br>' + dinheiro(pagamentosComData.length ? valorPago : null) + ' em ' +
    pagamentosComData.length + ' obrigação(ões) com data e valor cadastrados. ' +
    pendentesDePagamento + ' ainda sem data de pagamento.</div></div>' +
    '<p class="subnote">Os indicadores descrevem o estado cadastrado na data de emissão; ' +
    'não equivalem a atesto externo ou conciliação bancária automática.</p>';
}
