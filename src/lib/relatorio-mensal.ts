import { brl } from "@/lib/format";

const esc = (s: any) =>
  String(s ?? "—").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export type LinhaPendente = {
  prestador: string;
  convenio: string;
  competencia: string;
  parcela: string;
  atestado: number;
  dataPagamento: string; // dd/mm/aaaa ou "—"
  prazoPrestacao: string; // dd/mm/aaaa ou "—"
  diasRestantes: number | null; // >0 faltam, <0 atrasada, 0 vence hoje, null sem prazo
  situacaoLabel: string; // "Atrasado há 5 dias", "Vence Hoje", "Vence em 3 dias"
  bloco: "vencidas" | "hoje" | "avencer" | "outros";
};

export type CtxPendente = {
  prestador: string; // "Todos os prestadores" ou nome
  logoUrl?: string;
  emissor?: string;
};

/**
 * Relatório Consolidado de Prestações de Contas Pendentes e A Vencer.
 * Retrato dinâmico de TODOS os lançamentos pendentes/atrasados do sistema
 * agrupados por urgência (Vencidas → Vencendo Hoje → A Vencer em 7 dias).
 * Abre a janela de impressão do navegador (Salvar como PDF).
 */
export function gerarRelatorioPendentes(linhas: LinhaPendente[], ctx: CtxPendente) {
  const agora = new Date();
  const emissao = agora.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const vencidas = linhas.filter((l) => l.bloco === "vencidas");
  const hoje = linhas.filter((l) => l.bloco === "hoje");
  const avencer = linhas.filter((l) => l.bloco === "avencer");
  const outros = linhas.filter((l) => l.bloco === "outros");

  const renderBloco = (titulo: string, items: LinhaPendente[], corTitulo: string, corFundo: string) => {
    if (items.length === 0) return "";
    const rows = items
      .map(
        (l, i) => `
      <tr class="${i % 2 ? "alt" : ""}">
        <td>${esc(l.prestador)}<div class="sub">${esc(l.convenio)}</div></td>
        <td class="center">${esc(l.competencia)}</td>
        <td class="center">${esc(l.parcela)}</td>
        <td class="num">${brl(l.atestado)}</td>
        <td class="center">${esc(l.dataPagamento)}</td>
        <td class="center">${esc(l.prazoPrestacao)}</td>
        <td class="center" style="color:${corTitulo};font-weight:600">${esc(l.situacaoLabel)}</td>
      </tr>`,
      )
      .join("");
    return `
    <h3 style="border-color:${corTitulo}">${titulo} <span class="badge" style="background:${corFundo};color:${corTitulo}">${items.length}</span></h3>
    <table>
      <thead><tr>
        <th>Prestador / Convênio</th><th class="center">Competência</th><th class="center">Parcela</th>
        <th class="num">Atestado</th><th class="center">Pagamento</th><th class="center">Prazo Limite</th><th class="center">Situação</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  };

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Relatório de Prestações de Contas Pendentes e A Vencer</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #1a2230; margin: 32px; font-size: 11px; }
  .header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #003866; padding-bottom: 14px; }
  .header img { height: 56px; }
  .header h1 { font-size: 16px; margin: 0; color: #003866; }
  .header h2 { font-size: 13px; margin: 2px 0 0; font-weight: 600; }
  .header p { margin: 2px 0 0; font-size: 11px; color: #5b6472; }
  h3 { color: #003866; font-size: 13px; border-left: 4px solid #3399cc; padding-left: 8px; margin: 22px 0 8px; display: flex; align-items: center; gap: 8px; }
  .badge { font-size: 10px; padding: 1px 7px; border-radius: 10px; font-weight: 700; }
  .resumo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .card { border: 1px solid #dde3ea; border-radius: 8px; padding: 10px 12px; }
  .card .label { font-size: 9px; text-transform: uppercase; color: #5b6472; letter-spacing: .04em; }
  .card .val { font-size: 18px; font-weight: 700; margin-top: 3px; }
  .card.vermelho .val { color: #b3261e; } .card.laranja .val { color: #c77700; } .card.azul .val { color: #003866; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #003866; color: #fff; font-size: 9px; text-transform: uppercase; text-align: left; padding: 6px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #e6eaf0; vertical-align: top; }
  td .sub { font-size: 9px; color: #5b6472; }
  tr.alt td { background: #f6f8fb; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .center { text-align: center; white-space: nowrap; }
  .meta { font-size: 10px; color: #5b6472; margin-top: 4px; }
  .footer { margin-top: 44px; }
  @media print { body { margin: 12mm; } }
</style></head>
<body onload="window.focus(); window.print();">
  <div class="header">
    ${ctx.logoUrl ? `<img src="${esc(ctx.logoUrl)}" alt="Prefeitura de Joinville" />` : ""}
    <div>
      <h1>Secretaria Municipal de Saúde de Joinville</h1>
      <h2>Área de Convênios e Parcerias (ACP) · Área de Prestação de Contas (APC)</h2>
      <p>Relatório Consolidado de Prestações de Contas Pendentes e A Vencer</p>
    </div>
  </div>

  <h3>Resumo executivo</h3>
  <p class="meta">Recorte: <strong>${esc(ctx.prestador)}</strong> · Data de referência: <strong>${esc(emissao.split(",")[0] || emissao)}</strong> · ${linhas.length} prestação(ões) pendente(s).</p>
  <div class="resumo">
    <div class="card vermelho"><div class="label">Vencidas (Crítico)</div><div class="val">${vencidas.length}</div></div>
    <div class="card laranja"><div class="label">Vencendo Hoje</div><div class="val">${hoje.length}</div></div>
    <div class="card azul"><div class="label">A Vencer (≤7 dias)</div><div class="val">${avencer.length}</div></div>
    <div class="card"><div class="label">Outros Prazos e Pendências</div><div class="val">${outros.length}</div></div>
  </div>

  ${renderBloco("🔴 Prestações de Contas Vencidas (Crítico)", vencidas, "#b3261e", "#fdecea")}
  ${renderBloco("🟠 Vencendo Hoje (Alerta Máximo)", hoje, "#c77700", "#fff4e5")}
  ${renderBloco("🟡 A Vencer nos Próximos 7 Dias (Preventivo)", avencer, "#0066aa", "#e8f0fe")}
  ${renderBloco("⚪ Outros Prazos e Pendências", outros, "#5b6472", "#f0f2f5")}

  <div class="footer">
    <div class="meta">Emitido em ${esc(emissao)}${ctx.emissor ? ` por ${esc(ctx.emissor)}` : ""}.<br/>Documento gerado automaticamente pelo sistema de gestão de empenhos — SMS Joinville.</div>
  </div>
</body></html>`;

  const w = window.open("", "_blank", "width=1000,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
