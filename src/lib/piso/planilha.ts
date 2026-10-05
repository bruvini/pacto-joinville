/** Auditoria da Planilha de Carga (Etapa 1). Só retorna agregados — nenhum CPF é persistido. */

export type Linha = Record<string, unknown>;
export interface ResumoAuditoria {
  linhas: number;
  cpfs_invalidos: number;
  cpfs_duplicados: number;
  sem_cnes: number;
  sem_cbo: number;
  jornada_invalida: number;
  salario_invalido: number;
  por_categoria: Record<string, number>;
  por_cnes: Record<string, number>;
  colunas_ausentes: string[];
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function cpfValido(v: unknown): boolean {
  const d = String(v ?? "").replace(/\D/g, "").padStart(11, "0");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
};

export function auditarPlanilha(rows: Linha[]): ResumoAuditoria {
  const cols = Object.keys(rows[0] ?? {});
  const achar = (re: RegExp) => cols.find((c) => re.test(norm(c)));
  const cCpf = achar(/cpf/), cCnes = achar(/cnes/), cCbo = achar(/cbo/), cJor = achar(/jornada|carga/), cSal = achar(/salario|remuneracao|vencimento/), cCat = achar(/categoria/);
  const r: ResumoAuditoria = { linhas: rows.length, cpfs_invalidos: 0, cpfs_duplicados: 0, sem_cnes: 0, sem_cbo: 0, jornada_invalida: 0, salario_invalido: 0, por_categoria: {}, por_cnes: {}, colunas_ausentes: [] };
  ([["CPF", cCpf], ["CNES", cCnes], ["CBO", cCbo], ["Jornada", cJor], ["Salário", cSal], ["Categoria", cCat]] as const).forEach(([n, c]) => !c && r.colunas_ausentes.push(n));
  const vistos = new Set<string>();
  for (const row of rows) {
    if (cCpf) {
      const d = String(row[cCpf] ?? "").replace(/\D/g, "");
      if (!cpfValido(d)) r.cpfs_invalidos++;
      else if (vistos.has(d)) r.cpfs_duplicados++;
      else vistos.add(d);
    }
    const cnes = cCnes ? String(row[cCnes] ?? "").trim() : "";
    if (cCnes && !cnes) r.sem_cnes++;
    if (cCbo && !String(row[cCbo] ?? "").trim()) r.sem_cbo++;
    if (cJor) { const j = num(row[cJor]); if (!(j > 0 && j <= 60)) r.jornada_invalida++; }
    if (cSal) { const s = num(row[cSal]); if (!(s > 0)) r.salario_invalido++; }
    const cat = cCat ? String(row[cCat] ?? "").trim() || "(vazia)" : "(sem coluna)";
    r.por_categoria[cat] = (r.por_categoria[cat] ?? 0) + 1;
    if (cnes) r.por_cnes[cnes] = (r.por_cnes[cnes] ?? 0) + 1;
  }
  return r;
}

export const totalCriticas = (r: ResumoAuditoria) =>
  r.cpfs_invalidos + r.cpfs_duplicados + r.sem_cnes + r.sem_cbo + r.jornada_invalida + r.salario_invalido + r.colunas_ausentes.length;
