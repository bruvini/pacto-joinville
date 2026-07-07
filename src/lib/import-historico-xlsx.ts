// =====================================================================
// Leitura do workbook (.xlsx) para o importador de histórico de PC.
// Isolado num módulo separado porque importa `xlsx`; a lógica pura de
// parsing/mapeamento vive em `import-historico.ts` (testável sem xlsx).
// =====================================================================
import * as XLSX from "xlsx";
import { norm, montarLinha, COLUNAS_PC, type LinhaImport } from "./import-historico";

/** Lê o workbook (ArrayBuffer) e devolve as abas + a aba provável de PC. */
export function lerWorkbook(buf: ArrayBuffer): { wb: XLSX.WorkBook; abas: string[]; abaProvavel: string } {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const abas = wb.SheetNames;
  const abaProvavel = abas.find((n) => norm(n).includes("prestacao") || norm(n).includes("contas")) ?? abas[0];
  return { wb, abas, abaProvavel };
}

/**
 * Extrai as linhas de PC de uma aba. O cabeçalho está na 2ª linha da planilha
 * (a 1ª é uma nota), então detectamos a linha de cabeçalho procurando "instituição".
 */
export function extrairLinhas(wb: XLSX.WorkBook, aba: string): LinhaImport[] {
  const ws = wb.Sheets[aba];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
  let hIdx = aoa.findIndex((row) => (row ?? []).some((c) => norm(c) === "instituicao"));
  if (hIdx < 0) hIdx = 1;
  const headers = (aoa[hIdx] ?? []).map(norm);

  // Resolve o índice de cada coluna lógica (cabeçalho exato; senão, trecho).
  const idx: Record<string, number> = {};
  for (const [chave, [exato, contem]] of Object.entries(COLUNAS_PC)) {
    let i = headers.findIndex((h) => h === exato);
    if (i < 0 && contem) i = headers.findIndex((h) => h.includes(contem));
    idx[chave] = i;
  }

  const out: LinhaImport[] = [];
  for (let r = hIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const get = (chave: string) => { const i = idx[chave]; return i >= 0 ? row[i] : null; };
    // Pula linhas totalmente vazias (sem instituição e sem empenho).
    if (!String(get("instituicao") ?? "").trim() && !String(get("empenho") ?? "").trim()) continue;
    out.push(montarLinha(get, r + 1));
  }
  return out;
}
