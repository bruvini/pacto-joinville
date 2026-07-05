import { brl } from "@/lib/format";

const esc = (s: any) =>
  String(s ?? "—").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export type LinhaMensal = {
  prestador: string;
  objeto: string;
  parcela: string;
  numeroEmpenho: string;
  solicitado: number;
  atestado: number;
  dataPagamento: string; // dd/mm/aaaa ou "—"
  prestacaoStatus: string; // rótulo
  prazoPrestacao: string; // dd/mm/aaaa ou "—"
  valorAprovado: number;
  valorGlosado: number;
};

export type CtxMensal = {
  competencia: string; // MM/AAAA
  prestador: string; // "Todos os prestadores" ou nome
  logoUrl?: string;
  emissor?: string;
};

/**
 * Relatório Mensal Consolidado por competência (padrão contas anuais TCE/SC):
 * junta empenho, pagamento e prestação de contas de cada lançamento do mês.
 * Abre a janela de impressão do navegador (Salvar como PDF).
 */
export function gerarRelatorioMensal(linhas: LinhaMensal[], ctx: CtxMensal) {
  const agora = new Date();
  const emissao = agora.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const totalSolic = linhas.reduce((s, l) => s + l.solicitado, 0);
  const totalAtest = linhas.reduce((s, l) => s + l.atestado, 0);
  const totalAprov = linhas.reduce((s, l) => s + l.valorAprovado, 0);
  const totalGlosa = linhas.reduce((s, l) => s + l.valorGlosado, 0);
  const pagos = linhas.filter((l) => l.dataPagamento !== "—").length;
  const prestadas = linhas.filter((l) => l.prestacaoStatus === "Aprovada").length;

  const linhasHtml = linhas
    .map(
      (l, i) => `
      <tr class="${i % 2 ? "alt" : ""}">
        <td>${esc(l.prestador)}<div class="sub">${esc(l.objeto)}</div></td>
        <td class="center">${esc(l.parcela)}</td>
        <td class="center">${esc(l.numeroEmpenho)}</td>
        <td class="num">${brl(l.solicitado)}</td>
        <td class="num">${brl(l.atestado)}</td>
        <td class="center">${esc(l.dataPagamento)}</td>
        <td class="center">${esc(l.prazoPrestacao)}</td>
        <td class="center">${esc(l.prestacaoStatus)}</td>
        <td class="num">${l.valorAprovado ? brl(l.valorAprovado) : "—"}</td>
        <td class="num">${l.valorGlosado ? brl(l.valorGlosado) : "—"}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Relatório Mensal Consolidado — Competência ${esc(ctx.competencia)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #1a2230; margin: 32px; font-size: 11px; }
  .header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #003866; padding-bottom: 14px; }
  .header img { height: 56px; }
  .header h1 { font-size: 16px; margin: 0; color: #003866; }
  .header h2 { font-size: 13px; margin: 2px 0 0; font-weight: 600; }
  .header p { margin: 2px 0 0; font-size: 11px; color: #5b6472; }
  h3 { color: #003866; font-size: 13px; border-left: 4px solid #3399cc; padding-left: 8px; margin: 22px 0 8px; }
  .resumo { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
  .card { border: 1px solid #dde3ea; border-radius: 8px; padding: 8px 10px; }
  .card .label { font-size: 9px; text-transform: uppercase; color: #5b6472; letter-spacing: .04em; }
  .card .val { font-size: 14px; font-weight: 700; margin-top: 3px; }
  .card.azul .val { color: #003866; } .card.verde .val { color: #1f9d57; } .card.vermelho .val { color: #b3261e; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #003866; color: #fff; font-size: 9px; text-transform: uppercase; text-align: left; padding: 6px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #e6eaf0; vertical-align: top; }
  td .sub { font-size: 9px; color: #5b6472; }
  tr.alt td { background: #f6f8fb; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .center { text-align: center; white-space: nowrap; }
  tfoot td { font-weight: 700; border-top: 2px solid #003866; background: #eef3f8; }
  .meta { font-size: 10px; color: #5b6472; margin-top: 4px; }
  .footer { margin-top: 44px; display: flex; justify-content: space-between; align-items: flex-end; }
  .assinatura { text-align: center; }
  .assinatura .linha { border-top: 1px solid #1a2230; width: 240px; margin-top: 40px; padding-top: 4px; font-size: 10px; }
  @media print { body { margin: 12mm; } }
</style></head>
<body onload="window.focus(); window.print();">
  <div class="header">
    ${ctx.logoUrl ? `<img src="${esc(ctx.logoUrl)}" alt="Prefeitura de Joinville" />` : ""}
    <div>
      <h1>Secretaria Municipal de Saúde de Joinville</h1>
      <h2>Área de Convênios e Parcerias (ACP) · Área de Prestação de Contas (APC)</h2>
      <p>Relatório Mensal Consolidado — Empenho, Pagamento e Prestação de Contas</p>
    </div>
  </div>

  <h3>Resumo da competência ${esc(ctx.competencia)}</h3>
  <p class="meta">Recorte: <strong>${esc(ctx.prestador)}</strong> · ${linhas.length} lançamento(s) · ${pagos} pago(s) · ${prestadas} prestação(ões) aprovada(s).</p>
  <div class="resumo">
    <div class="card azul"><div class="label">Empenhado</div><div class="val">${brl(totalSolic)}</div></div>
    <div class="card verde"><div class="label">Atestado</div><div class="val">${brl(totalAtest)}</div></div>
    <div class="card"><div class="label">Pagos</div><div class="val">${pagos}/${linhas.length}</div></div>
    <div class="card verde"><div class="label">Comprovado (aprovado)</div><div class="val">${brl(totalAprov)}</div></div>
    <div class="card vermelho"><div class="label">Glosas</div><div class="val">${brl(totalGlosa)}</div></div>
    <div class="card"><div class="label">Prestações aprovadas</div><div class="val">${prestadas}/${linhas.length}</div></div>
  </div>

  <h3>Detalhamento por lançamento</h3>
  <table>
    <thead><tr>
      <th>Prestador · Objeto</th><th class="center">Parcela</th><th class="center">Nº Empenho</th>
      <th class="num">Empenhado</th><th class="num">Atestado</th>
      <th class="center">Pagamento</th><th class="center">Prazo Prest.</th><th class="center">Prestação</th>
      <th class="num">Aprovado</th><th class="num">Glosa</th>
    </tr></thead>
    <tbody>${linhasHtml || '<tr><td colspan="10" class="center">Nenhum lançamento na competência.</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="3">TOTAIS</td>
      <td class="num">${brl(totalSolic)}</td><td class="num">${brl(totalAtest)}</td>
      <td colspan="3"></td>
      <td class="num">${brl(totalAprov)}</td><td class="num">${brl(totalGlosa)}</td>
    </tr></tfoot>
  </table>

  <div class="footer">
    <div class="meta">Emitido em ${esc(emissao)}${ctx.emissor ? ` por ${esc(ctx.emissor)}` : ""}.<br/>Documento gerado automaticamente pelo sistema de gestão de empenhos — SMS Joinville.</div>
    <div class="assinatura"><div class="linha">Responsável pela Prestação de Contas</div></div>
  </div>
</body></html>`;

  const w = window.open("", "_blank", "width=1000,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
