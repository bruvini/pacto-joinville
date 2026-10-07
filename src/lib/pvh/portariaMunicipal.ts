import { brl } from "@/lib/format";

export type LinhaMinutaPvh = {
  cnes: string;
  nome: string;
  valor: number;
};

export type DestinatarioMemorandoPvh = {
  unidade: string;
  nome: string;
  cargo: string;
};

export type DocumentoGeradoPvh = {
  texto: string;
  html: string;
};

const MESES = [
  "",
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function esc(valor: unknown) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function competenciaExtensoPvh(competencia: string) {
  const match = String(competencia ?? "").match(/^(\d{2})\/(\d{4})$/);
  if (!match) return competencia || "[COMPETÊNCIA]";
  return `${MESES[Number(match[1])] ?? match[1]}/${match[2]}`;
}

export function dataExtensoPvh(data: string | null | undefined) {
  if (!data) return "";
  const match = String(data).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(data);
  return `${Number(match[3])} de ${MESES[Number(match[2])] ?? match[2]} de ${match[1]}`;
}

export function anoCompetenciaPvh(competencia: string) {
  return String(competencia ?? "").split("/")[1] || String(new Date().getFullYear());
}

export function numeroDocumentoSeiComAnoPvh(
  valor: string | null | undefined,
  ano: string,
) {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return `[NÚMERO]/${ano}`;
  return /\/\d{4}$/.test(bruto) ? bruto : `${bruto}/${ano}`;
}

export function numeroPortariaSesPvh(valor: string | null | undefined) {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return "[NÚMERO DA PORTARIA SES]";
  const numero = bruto.match(/\d{2,6}(?:\/\d{4})?/)?.[0];
  return numero ?? bruto;
}

function htmlDocumento(corpo: string) {
  return `<div style="font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5;">${corpo}</div>`;
}

export function gerarMinutaPortariaPvh(dados: {
  competencia: string;
  numeroMinutaSei?: string | null;
  dataDocumento?: string | null;
  unidadeResponsavel?: string | null;
  autoridadeNome?: string | null;
  autoridadeCargo?: string | null;
  normativaNumero?: string | null;
  normativaData?: string | null;
  portariaEstadualNumero?: string | null;
  portariaEstadualData?: string | null;
  portariaGeralNumero?: string | null;
  portariaGeralSei?: string | null;
  linhas: LinhaMinutaPvh[];
}): DocumentoGeradoPvh {
  const comp = competenciaExtensoPvh(dados.competencia);
  const compUpper = comp.toUpperCase();
  const ano = anoCompetenciaPvh(dados.competencia);
  const dataDoc = dataExtensoPvh(dados.dataDocumento) || "[DATA DA MINUTA]";
  const minutaSei = numeroDocumentoSeiComAnoPvh(dados.numeroMinutaSei, ano);
  const autoridade = dados.autoridadeNome?.trim() || "[NOME DA AUTORIDADE]";
  const cargo = dados.autoridadeCargo?.trim() || "Secretária da Saúde";
  const normativa = dados.normativaNumero?.trim() || "[DELIBERAÇÃO CIB]";
  const normativaData = dataExtensoPvh(dados.normativaData) || "[DATA DA DELIBERAÇÃO]";
  const portariaMes = numeroPortariaSesPvh(dados.portariaEstadualNumero);
  const portariaMesData = dataExtensoPvh(dados.portariaEstadualData) || "[DATA DA PORTARIA SES]";
  const portariaGeral = dados.portariaGeralNumero?.trim() || "[PORTARIA GERAL DO PVH]";
  const portariaGeralSei = dados.portariaGeralSei?.trim() || "[SEI DA PORTARIA GERAL]";
  const unidade = dados.unidadeResponsavel?.trim() || "SES.UCP.ACP";
  const total = dados.linhas.reduce((soma, linha) => soma + Number(linha.valor || 0), 0);

  const tabelaTexto = [
    `CNES\tESTABELECIMENTO\t${compUpper}`,
    ...dados.linhas.map((linha) => `${linha.cnes || "[CNES]"}\t${linha.nome}\t${brl(linha.valor)}`),
    `\tTOTAL\t${brl(total)}`,
  ].join("\n");

  const texto = [
    `MINUTA SEI Nº ${minutaSei} - ${unidade}`,
    "",
    `Joinville, ${dataDoc}.`,
    "",
    `PORTARIA Nº xxx/${ano}/SMS`,
    "",
    `Dispõe sobre a relação de estabelecimentos elegíveis para o recebimento dos recursos financeiros do Programa de Valorização dos Hospitais (PVH) da Secretaria de Estado da Saúde, e os respectivos valores destinados a cada um, com competência para ${comp}.`,
    "",
    `A ${cargo}, no uso das atribuições legais e regulamentares, de acordo com o disposto no Art. 2º, XIII da Lei nº 9.219, de 12 de julho de 2022, e tendo em vista a Deliberação nº ${normativa}, de ${normativaData}, que aprova a revisão e a implementação do Programa de Valorização dos Hospitais, e a Portaria SES nº ${portariaMes}, de ${portariaMesData}.`,
    "",
    "RESOLVE:",
    "",
    "Art. 1º Divulgar a relação de estabelecimentos elegíveis para o recebimento dos incentivos financeiros do Programa de Valorização dos Hospitais (PVH), e os respectivos valores destinados a cada um, conforme análise e cálculo da Secretaria de Estado da Saúde (SES/SC).",
    "",
    `§1º Para os fins desta Portaria, consideram-se estabelecimentos elegíveis aqueles que atendem aos requisitos estabelecidos na Deliberação nº ${normativa}, de ${normativaData}, que aprova a revisão e a implementação do Programa de Valorização dos Hospitais e na Portaria nº ${portariaGeral} (${portariaGeralSei}).`,
    "",
    "§2º A relação dos estabelecimentos considerados elegíveis e respectivos valores constam no Anexo I desta Portaria.",
    "",
    `Art. 2º O recurso de que trata esta Portaria refere-se à competência ${comp}, conforme a Portaria SES nº ${portariaMes}, de ${portariaMesData}.`,
    "",
    "Art. 3º Esta Portaria entra em vigor na data de sua publicação.",
    "",
    autoridade,
    cargo,
    "",
    "ANEXO I",
    tabelaTexto,
    "",
    `Nota 1: Portaria SES nº ${portariaMes}, de ${portariaMesData}`,
  ].join("\n");

  const linhasHtml = dados.linhas
    .map(
      (linha) =>
        `<tr><td style="border:1px solid #999;padding:6px;">${esc(linha.cnes || "[CNES]")}</td><td style="border:1px solid #999;padding:6px;">${esc(linha.nome)}</td><td style="border:1px solid #999;padding:6px;text-align:right;">${esc(brl(linha.valor))}</td></tr>`,
    )
    .join("");

  const html = htmlDocumento([
    `<p style="text-align:center;font-weight:700;">MINUTA SEI Nº ${esc(minutaSei)} - ${esc(unidade)}</p>`,
    `<p style="text-align:right;">Joinville, ${esc(dataDoc)}.</p>`,
    `<p style="text-align:center;font-weight:700;">PORTARIA Nº xxx/${esc(ano)}/SMS</p>`,
    `<p><strong>Dispõe sobre a relação de estabelecimentos elegíveis para o recebimento dos recursos financeiros do Programa de Valorização dos Hospitais (PVH) da Secretaria de Estado da Saúde, e os respectivos valores destinados a cada um, com competência para ${esc(comp)}.</strong></p>`,
    `<p>A ${esc(cargo)}, no uso das atribuições legais e regulamentares, de acordo com o disposto no Art. 2º, XIII da Lei nº 9.219, de 12 de julho de 2022, e tendo em vista a Deliberação nº ${esc(normativa)}, de ${esc(normativaData)}, que aprova a revisão e a implementação do Programa de Valorização dos Hospitais, e a Portaria SES nº ${esc(portariaMes)}, de ${esc(portariaMesData)}.</p>`,
    `<p style="text-align:center;font-weight:700;">RESOLVE:</p>`,
    `<p><strong>Art. 1º</strong> Divulgar a relação de estabelecimentos elegíveis para o recebimento dos incentivos financeiros do Programa de Valorização dos Hospitais (PVH), e os respectivos valores destinados a cada um, conforme análise e cálculo da Secretaria de Estado da Saúde (SES/SC).</p>`,
    `<p>§1º Para os fins desta Portaria, consideram-se estabelecimentos elegíveis aqueles que atendem aos requisitos estabelecidos na Deliberação nº ${esc(normativa)}, de ${esc(normativaData)}, que aprova a revisão e a implementação do Programa de Valorização dos Hospitais e na Portaria nº ${esc(portariaGeral)} (${esc(portariaGeralSei)}).</p>`,
    `<p>§2º A relação dos estabelecimentos considerados elegíveis e respectivos valores constam no Anexo I desta Portaria.</p>`,
    `<p><strong>Art. 2º</strong> O recurso de que trata esta Portaria refere-se à competência ${esc(comp)}, conforme a Portaria SES nº ${esc(portariaMes)}, de ${esc(portariaMesData)}.</p>`,
    `<p><strong>Art. 3º</strong> Esta Portaria entra em vigor na data de sua publicação.</p>`,
    `<p style="text-align:center;font-weight:700;">${esc(autoridade)}<br/>${esc(cargo)}</p>`,
    `<p style="text-align:center;font-weight:700;">ANEXO I</p>`,
    `<table style="border-collapse:collapse;width:100%;"><thead><tr><th style="border:1px solid #999;padding:6px;text-align:left;">CNES</th><th style="border:1px solid #999;padding:6px;text-align:left;">ESTABELECIMENTO</th><th style="border:1px solid #999;padding:6px;text-align:right;">${esc(compUpper)}</th></tr></thead><tbody>${linhasHtml}<tr><td colspan="2" style="border:1px solid #999;padding:6px;text-align:right;font-weight:700;">TOTAL</td><td style="border:1px solid #999;padding:6px;text-align:right;font-weight:700;">${esc(brl(total))}</td></tr></tbody></table>`,
    `<p><small>Nota 1: Portaria SES nº ${esc(portariaMes)}, de ${esc(portariaMesData)}</small></p>`,
  ].join(""));

  return { texto, html };
}

export function gerarMemorandoPortariaPvh(dados: {
  competencia: string;
  dataDocumento?: string | null;
  numeroMemorandoSei?: string | null;
  numeroMinutaSei?: string | null;
  unidadeResponsavel?: string | null;
  normativaNumero?: string | null;
  normativaData?: string | null;
  portariaEstadualNumero?: string | null;
  portariaEstadualData?: string | null;
  portariaGeralNumero?: string | null;
  portariaGeralSei?: string | null;
  memorandoPgmNumero?: string | null;
  memorandoPgmUnidade?: string | null;
  memorandoSapNumero?: string | null;
  memorandoSapUnidade?: string | null;
  processoReferencia?: string | null;
  destinatarios: DestinatarioMemorandoPvh[];
}): DocumentoGeradoPvh {
  const comp = competenciaExtensoPvh(dados.competencia);
  const ano = anoCompetenciaPvh(dados.competencia);
  const dataDoc = dataExtensoPvh(dados.dataDocumento) || "[DATA DO MEMORANDO]";
  const memo = numeroDocumentoSeiComAnoPvh(dados.numeroMemorandoSei, ano);
  const minuta = numeroDocumentoSeiComAnoPvh(dados.numeroMinutaSei, ano);
  const unidade = dados.unidadeResponsavel?.trim() || "SES.UCP.ACP";
  const normativa = dados.normativaNumero?.trim() || "[DELIBERAÇÃO CIB]";
  const normativaData = dataExtensoPvh(dados.normativaData) || "[DATA DA DELIBERAÇÃO]";
  const portariaMes = numeroPortariaSesPvh(dados.portariaEstadualNumero);
  const portariaMesData = dataExtensoPvh(dados.portariaEstadualData) || "[DATA DA PORTARIA SES]";
  const portariaGeral = dados.portariaGeralNumero?.trim() || "[PORTARIA GERAL DO PVH]";
  const portariaGeralSei = dados.portariaGeralSei?.trim() || "[SEI DA PORTARIA GERAL]";
  const memorandoPgm = dados.memorandoPgmNumero?.trim() || "[MEMORANDO PGM]";
  const unidadePgm = dados.memorandoPgmUnidade?.trim() || "PGM.UAD";
  const memorandoSap = dados.memorandoSapNumero?.trim() || "[MEMORANDO SAP]";
  const unidadeSap = dados.memorandoSapUnidade?.trim() || "SAP.CVN";
  const processoRef = dados.processoReferencia?.trim() || "[PROCESSO DE REFERÊNCIA]";
  const destinatarios = dados.destinatarios.filter(
    (d) => d.unidade?.trim() || d.nome?.trim() || d.cargo?.trim(),
  );

  const destinatariosTexto = destinatarios.length
    ? destinatarios
        .map((dest) => `${dest.unidade}\n${dest.nome}\n${dest.cargo}`)
        .join("\n\n")
    : "[DESTINATÁRIOS]";

  const unidades = destinatarios.map((d) => d.unidade).filter(Boolean).join(" e ") || "[UNIDADES DESTINATÁRIAS]";

  const texto = [
    `MEMORANDO SEI Nº ${memo} - ${unidade}`,
    "",
    `Joinville, ${dataDoc}.`,
    "",
    `À ${unidades}`,
    destinatariosTexto,
    "",
    `Assunto: Publicação de Portaria sobre o repasse dos incentivos do Programa de Valorização dos Hospitais - Minuta SEI Nº ${minuta} - ${unidade}.`,
    "",
    "Prezadas,",
    "",
    `Considerando a Deliberação nº ${normativa}, de ${normativaData}, que aprova a revisão e a implementação do Programa de Valorização dos Hospitais.`,
    "",
    `Considerando o Memorando SEI nº ${memorandoPgm} - ${unidadePgm}, que contém orientações da Procuradoria Geral do Município a respeito dos procedimentos e formalidades a serem cumpridas para a transferência dos recursos, entre as quais, a possibilidade de emissão de Portaria da Secretaria de Saúde;`,
    "",
    `Considerando o Memorando SEI nº ${memorandoSap} - ${unidadeSap}, que recomenda a reavaliação quanto à possibilidade de emissão de Portaria com a finalidade de regulamentar a transferência da assistência financeira complementar do Estado de Santa Catarina destinada aos Hospitais contemplados no Programa de Valorização dos Hospitais, a exemplo do procedimento adotado no processo SEI nº ${processoRef};`,
    "",
    `Considerando a Portaria SES nº ${portariaMes}, de ${portariaMesData}, que divulga os recursos discriminados no Programa de Valorização dos Hospitais, competência de ${comp}, para a transferência dos recursos financeiros devidos, do Fundo Estadual de Saúde ao Fundo Municipal de Saúde para os serviços hospitalares sob Gestão Municipal.`,
    "",
    `Considerando a Portaria nº ${portariaGeral} (${portariaGeralSei}), que dispõe sobre a transferência dos recursos financeiros do Programa de Valorização dos Hospitais (PVH) da Secretaria de Estado da Saúde para o ano de ${ano}, e estabelece outras providências.`,
    "",
    `Solicita-se a elaboração e publicação de Portaria consoante a Minuta SEI nº ${minuta} - ${unidade}.`,
    "",
    "Atenciosamente,",
  ].join("\n");

  const destinatariosHtml = destinatarios.length
    ? destinatarios
        .map(
          (dest) =>
            `<p><strong>${esc(dest.unidade)}</strong><br/>${esc(dest.nome)}<br/>${esc(dest.cargo)}</p>`,
        )
        .join("")
    : "<p>[DESTINATÁRIOS]</p>";

  const html = htmlDocumento([
    `<p style="text-align:center;font-weight:700;">MEMORANDO SEI Nº ${esc(memo)}/${esc(ano)} - ${esc(unidade)}</p>`,
    `<p style="text-align:right;">Joinville, ${esc(dataDoc)}.</p>`,
    `<p>À ${esc(unidades)}</p>`,
    destinatariosHtml,
    `<p><strong>Assunto:</strong> Publicação de Portaria sobre o repasse dos incentivos do Programa de Valorização dos Hospitais - Minuta SEI Nº ${esc(minuta)}/${esc(ano)} - ${esc(unidade)}.</p>`,
    "<p>Prezadas,</p>",
    `<p>Considerando a Deliberação nº ${esc(normativa)}, de ${esc(normativaData)}, que aprova a revisão e a implementação do Programa de Valorização dos Hospitais.</p>`,
    `<p>Considerando o Memorando SEI nº ${esc(memorandoPgm)} - ${esc(unidadePgm)}, que contém orientações da Procuradoria Geral do Município a respeito dos procedimentos e formalidades a serem cumpridas para a transferência dos recursos, entre as quais, a possibilidade de emissão de Portaria da Secretaria de Saúde;</p>`,
    `<p>Considerando o Memorando SEI nº ${esc(memorandoSap)} - ${esc(unidadeSap)}, que recomenda a reavaliação quanto à possibilidade de emissão de Portaria com a finalidade de regulamentar a transferência da assistência financeira complementar do Estado de Santa Catarina destinada aos Hospitais contemplados no Programa de Valorização dos Hospitais, a exemplo do procedimento adotado no processo SEI nº ${esc(processoRef)};</p>`,
    `<p>Considerando a Portaria SES nº ${esc(portariaMes)}, de ${esc(portariaMesData)}, que divulga os recursos discriminados no Programa de Valorização dos Hospitais, competência de ${esc(comp)}, para a transferência dos recursos financeiros devidos, do Fundo Estadual de Saúde ao Fundo Municipal de Saúde para os serviços hospitalares sob Gestão Municipal.</p>`,
    `<p>Considerando a Portaria nº ${esc(portariaGeral)} (${esc(portariaGeralSei)}), que dispõe sobre a transferência dos recursos financeiros do Programa de Valorização dos Hospitais (PVH) da Secretaria de Estado da Saúde para o ano de ${esc(ano)}, e estabelece outras providências.</p>`,
    `<p>Solicita-se a elaboração e publicação de Portaria consoante a Minuta SEI nº ${esc(minuta)}/${esc(ano)} - ${esc(unidade)}.</p>`,
    "<p>Atenciosamente,</p>",
  ].join(""));

  return { texto, html };
}

export async function copiarDocumentoFormatadoPvh(documento: DocumentoGeradoPvh) {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([documento.html], { type: "text/html" }),
          "text/plain": new Blob([documento.texto], { type: "text/plain" }),
        }),
      ]);
      return "formatado";
    }
  } catch {
    // Fallback abaixo.
  }

  await navigator.clipboard.writeText(documento.texto);
  return "texto";
}
