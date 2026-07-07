import { brl } from "@/lib/format";

const esc = (s: any) =>
  String(s ?? "—").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export type LinhaRelatorio = {
  prestador: string;
  competencia: string;
  sei: string;
  solicitado: number;
  atestado: number;
  anulado: number;
  temLink: boolean;
  linkSolicitacaoAnulacao?: string | null;
};

export type CtxRelatorio = {
  prestador: string; // "Consolidado geral" ou nome
  mes: string; // "Todos" ou MM/AAAA
  logoUrl?: string;
  emissor?: string;
};

/**
 * Gera o Relatório de Prestação de Contas (Auditoria de Anulações) e abre a
 * janela de impressão do navegador (Salvar como PDF). Layout institucional
 * SMS Joinville / ACP. Sem dependências externas — isolado em nova janela.
 */
export function gerarRelatorioPrestacaoContas(linhas: LinhaRelatorio[], ctx: CtxRelatorio) {
  const agora = new Date();
  const emissao = agora.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const totalSolic = linhas.reduce((s, l) => s + l.solicitado, 0);
  const totalAtest = linhas.reduce((s, l) => s + l.atestado, 0);
  const totalAnul = linhas.reduce((s, l) => s + l.anulado, 0);
  const pendencias = linhas.filter((l) => !l.temLink);

  const linhasHtml = linhas
    .map(
      (l, i) => `
      <tr class="${i % 2 ? "alt" : ""}">
        <td>${esc(l.prestador)}</td>
        <td>${esc(l.sei)}</td>
        <td>${esc(l.competencia)}</td>
        <td class="num">${brl(l.solicitado)}</td>
        <td class="num">${brl(l.atestado)}</td>
        <td class="num strong">${brl(l.anulado)}</td>
        <td class="center">${l.temLink ? '<span class="ok">Documentado</span>' : '<span class="pend">Pendente</span>'}</td>
      </tr>`,
    )
    .join("");

  const pendHtml = pendencias.length
    ? `<ul>${pendencias.map((p) => {
        const textContent = `${esc(p.prestador)} — competência ${esc(p.competencia)}`;
        const hasProcessoSei = p.sei && p.sei !== "—";
        const seiText = hasProcessoSei ? ` (SEI ${esc(p.sei)})` : "";
        
        if (p.linkSolicitacaoAnulacao && p.linkSolicitacaoAnulacao.startsWith("http")) {
          return `<li><a href="${esc(p.linkSolicitacaoAnulacao)}" target="_blank" style="color: #003866; text-decoration: underline; font-weight: 500;">${textContent}${seiText}</a></li>`;
        } else {
          return `<li>${textContent}${seiText} — Solicitação de anulação não realizada ainda</li>`;
        }
      }).join("")}</ul>`
    : '<p class="ok">Nenhuma pendência: todas as anulações estão com o link do SEI anexado.</p>';

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Relatório de Prestação de Contas — Auditoria de Anulações</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #1a2230; margin: 32px; font-size: 12px; }
  .header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #003866; padding-bottom: 14px; }
  .header img { height: 56px; }
  .header h1 { font-size: 16px; margin: 0; color: #003866; }
  .header h2 { font-size: 13px; margin: 2px 0 0; font-weight: 600; }
  .header p { margin: 2px 0 0; font-size: 11px; color: #5b6472; }
  h3 { color: #003866; font-size: 13px; border-left: 4px solid #3399cc; padding-left: 8px; margin: 22px 0 8px; }
  .resumo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .card { border: 1px solid #dde3ea; border-radius: 8px; padding: 10px 12px; }
  .card .label { font-size: 10px; text-transform: uppercase; color: #5b6472; letter-spacing: .04em; }
  .card .val { font-size: 16px; font-weight: 700; margin-top: 4px; }
  .card.azul .val { color: #003866; } .card.verde .val { color: #1f9d57; } .card.laranja .val { color: #c77700; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #003866; color: #fff; font-size: 10px; text-transform: uppercase; text-align: left; padding: 7px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #e6eaf0; }
  tr.alt td { background: #f6f8fb; }
  .num { text-align: right; font-variant-numeric: tabular-nums; } .strong { font-weight: 700; color: #003866; }
  .center { text-align: center; } .ok { color: #1f9d57; font-weight: 600; } .pend { color: #c77700; font-weight: 600; }
  tfoot td { font-weight: 700; border-top: 2px solid #003866; background: #eef3f8; }
  .meta { font-size: 11px; color: #5b6472; margin-top: 4px; }
  .footer { margin-top: 48px; display: flex; justify-content: space-between; align-items: flex-end; }
  .assinatura { text-align: center; }
  .assinatura .linha { border-top: 1px solid #1a2230; width: 240px; margin-top: 40px; padding-top: 4px; }
  @media print { body { margin: 14mm; } }
</style></head>
<body onload="window.focus(); window.print();">
  <div class="header">
    ${ctx.logoUrl ? `<img src="${esc(ctx.logoUrl)}" alt="Prefeitura de Joinville" />` : ""}
    <div>
      <h1>Secretaria Municipal de Saúde de Joinville</h1>
      <h2>Área de Convênios e Parcerias (ACP)</h2>
      <p>Relatório de Prestação de Contas · Auditoria de Anulações de Empenho</p>
    </div>
  </div>

  <h3>Resumo executivo</h3>
  <p class="meta">Recorte: <strong>${esc(ctx.prestador)}</strong> · Competência: <strong>${esc(ctx.mes)}</strong> · ${linhas.length} anulação(ões) analisada(s).</p>
  <div class="resumo">
    <div class="card azul"><div class="label">Total Solicitado</div><div class="val">${brl(totalSolic)}</div></div>
    <div class="card verde"><div class="label">Total Atestado</div><div class="val">${brl(totalAtest)}</div></div>
    <div class="card laranja"><div class="label">Devolvido ao Orçamento</div><div class="val">${brl(totalAnul)}</div></div>
    <div class="card"><div class="label">Pendências de Link SEI</div><div class="val">${pendencias.length}</div></div>
  </div>

  <h3>Pendências de documentação (link do SEI)</h3>
  ${pendHtml}

  <h3>Tabela consolidada das anulações</h3>
  <table>
    <thead><tr>
      <th>Prestador</th><th>Processo SEI</th><th>Competência</th>
      <th class="num">Solicitado</th><th class="num">Atestado</th><th class="num">Anulado</th><th class="center">Status</th>
    </tr></thead>
    <tbody>${linhasHtml || '<tr><td colspan="7" class="center">Nenhuma anulação no recorte.</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="3">TOTAIS</td>
      <td class="num">${brl(totalSolic)}</td><td class="num">${brl(totalAtest)}</td><td class="num">${brl(totalAnul)}</td><td></td>
    </tr></tfoot>
  </table>

  <div class="footer">
    <div class="meta">Emitido em ${esc(emissao)}${ctx.emissor ? ` por ${esc(ctx.emissor)}` : ""}.<br/>Documento gerado automaticamente pelo sistema de gestão de empenhos.</div>
    <div class="assinatura"><div class="linha">Assinatura da Auditoria</div></div>
  </div>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
