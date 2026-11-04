/**
 * HTML com estilos embutidos para editores ricos, inclusive SEI.
 * O texto gerado em municipal.ts é a fonte única de conteúdo.
 */
export type TipoDocumentoSeiPiso = "minuta" | "memorando";

function escapar(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const base = "font-family:'Times New Roman',Times,serif;font-size:12pt;color:#111;line-height:1.5;";
const paragrafo = "text-align:justify;text-indent:1.25cm;margin:0 0 12pt;";
const semRecuo = "text-align:left;text-indent:0;margin:0 0 12pt;";
const central = "text-align:center;text-indent:0;margin:0 0 12pt;";
const direita = "text-align:right;text-indent:0;margin:0 0 12pt;";

function bloco(texto: string, estilo: string, negrito = false) {
  const linhas = texto.split("\n").map(escapar).join("<br>");
  return '<p style="' + base + estilo + '">' +
    (negrito ? "<strong>" + linhas + "</strong>" : linhas) + "</p>";
}

function artigo(texto: string) {
  return '<p style="' + base + paragrafo + '">' +
    escapar(texto).replace(/^(Art\.\s*\d+º|§\s*\d+º?)/u, "<strong>$1</strong>") +
    "</p>";
}

function tabelaAnexo(anexo: string) {
  const [titulo, cabecalho, ...linhas] = anexo.split("\n");
  const titulos = (cabecalho ?? "").split("\t");
  const celula = (conteudo: string, header: boolean, direita = false) => {
    const tag = header ? "th" : "td";
    return "<" + tag + ' style="border:1px solid #555;padding:5pt 7pt;' +
      "font-family:'Times New Roman',Times,serif;font-size:10pt;vertical-align:top;" +
      "text-align:" + (direita ? "right" : "left") + ";" +
      (header ? "font-weight:bold;" : "") + '">' + escapar(conteudo) +
      "</" + tag + ">";
  };
  const linhasHtml = linhas.filter(Boolean).map((linha) => {
    const colunas = linha.split("\t");
    if (colunas[0] === "TOTAL")
      return '<tr><td colspan="2" style="border:1px solid #555;padding:5pt 7pt;text-align:right;font-weight:bold;">TOTAL</td>' +
        celula(colunas[colunas.length - 1] ?? "", false, true) + "</tr>";
    return "<tr>" + colunas.map((c, i) => celula(c, false, i === colunas.length - 1)).join("") + "</tr>";
  }).join("");
  return bloco(titulo, central, true) +
    '<table style="width:100%;border-collapse:collapse;table-layout:auto;margin:0 0 14pt;">' +
    "<thead><tr>" + titulos.map((c, i) => celula(c, true, i === titulos.length - 1)).join("") +
    "</tr></thead><tbody>" + linhasHtml + "</tbody></table>";
}

export function gerarHtmlDocumentoSeiPiso(texto: string, tipo: TipoDocumentoSeiPiso): string {
  const partes = texto.trim().split(/\n\s*\n/).filter(Boolean);
  const html = partes.map((parte) => {
    if (/^(MINUTA|MEMORANDO) SEI Nº/i.test(parte)) return bloco(parte, central, true);
    if (/^Joinville,/i.test(parte)) return bloco(parte, direita);
    if (tipo === "minuta") {
      if (/^Dispõe sobre/i.test(parte))
        return '<p style="' + base +
          'margin:12pt 0 20pt 40%;text-align:justify;text-indent:0;font-size:11pt;line-height:1.4;">' +
          escapar(parte) + "</p>";
      if (/^RESOLVE:/i.test(parte)) return bloco(parte, central, true);
      if (/^(Art\.\s*\d+º|§\s*\d+º?)/u.test(parte)) return artigo(parte);
      if (/^ANEXO I\n/.test(parte)) return tabelaAnexo(parte);
      if (parte.startsWith("*"))
        return '<p style="' + base +
          'font-size:9pt;line-height:1.3;text-align:justify;margin:0 0 9pt;">' +
          escapar(parte).replace(/\n/g, " ") + "</p>";
      if (partes.some(p => p.startsWith("ANEXO I\n")) &&
          parte.includes("\n") && !/^A /i.test(parte))
        return bloco(parte, central, true);
      return bloco(parte, paragrafo);
    }
    if (/^Assunto:/i.test(parte))
      return '<p style="' + base + semRecuo + '"><strong>Assunto:</strong>' +
        escapar(parte.slice(8)) + "</p>";
    if (/^À |^e /i.test(parte) || parte === "[DESTINATÁRIOS]")
      return bloco(parte, semRecuo);
    if (/^Prezadas\(os\),/i.test(parte) || /^Atenciosamente,/i.test(parte))
      return bloco(parte, semRecuo);
    return bloco(parte, paragrafo);
  }).join("\n");
  return '<div lang="pt-BR" style="' + base + 'background:#fff;">' + html + "</div>";
}
