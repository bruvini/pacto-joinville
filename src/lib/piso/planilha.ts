/** Leitura e auditoria da Planilha de Carga. CPFs completos existem apenas em memória. */
export type Linha = Record<string, unknown>;
export type CategoriaPiso = "enfermeiro" | "tecnico" | "auxiliar" | "parteira";

export interface OcorrenciaPlanilha {
  severidade: "erro" | "alerta" | "info";
  regra: string;
  linha: number;
  descricao: string;
  cpf_mascarado?: string;
  cnes?: string;
  instituicao_nome?: string;
  dados?: Record<string, unknown>;
}

export interface RegistroCarga {
  linha: number;
  cpf: string;
  cpf_mascarado: string;
  cnes: string;
  cbo: string;
  jornada: number;
  salario_base: number;
  nome: string;
  categoria: CategoriaPiso | null;
  valido: boolean;
  regras: string[];
}

export interface ResumoAuditoria {
  linhas: number;
  cpfs_invalidos: number;
  cpfs_duplicados: number;
  sem_cnes: number;
  cnes_invalidos: number;
  cnes_fora_instituicao: number;
  sem_cbo: number;
  cbo_invalido: number;
  jornada_invalida: number;
  salario_invalido: number;
  erros: number;
  alertas: number;
  ocorrencias: number;
  por_categoria: Record<string, number>;
  por_cnes: Record<string, number>;
  colunas_ausentes: string[];
}

const CBO_CATEGORIA: Record<string, CategoriaPiso> = {};
for (const cbo of [
  "223505",
  "223510",
  "223515",
  "223520",
  "223525",
  "223530",
  "223535",
  "223540",
  "223545",
  "223550",
  "223555",
  "223560",
  "223565",
])
  CBO_CATEGORIA[cbo] = "enfermeiro";
for (const cbo of ["322205", "322210", "322215", "322220", "322245"])
  CBO_CATEGORIA[cbo] = "tecnico";
for (const cbo of ["322230", "322235", "322250"]) CBO_CATEGORIA[cbo] = "auxiliar";
CBO_CATEGORIA["515115"] = "parteira";

export const normalizarTexto = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const somenteDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function mascararCpf(v: unknown): string {
  const d = somenteDigitos(v).padStart(11, "0").slice(-11);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "CPF não informado";
}

export function cpfValido(v: unknown): boolean {
  const original = String(v ?? "").trim();
  const d = somenteDigitos(original);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function numeroPlanilha(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "")
    .trim()
    .replace(/[^\d,.-]/g, "");
  if (!s) return Number.NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}

export const categoriaPorCbo = (v: unknown): CategoriaPiso | null =>
  CBO_CATEGORIA[somenteDigitos(v)] ?? null;
const acharColuna = (cols: string[], expressoes: RegExp[]) =>
  cols.find((col) => expressoes.some((re) => re.test(normalizarTexto(col))));

export function mapearColunasCarga(cols: string[]) {
  return {
    cpf: acharColuna(cols, [/cpf profissional/, /^cpf$/]),
    cnes: acharColuna(cols, [/cnes empregador/, /^cnes$/]),
    cbo: acharColuna(cols, [/^cbo$/, /codigo cbo/]),
    jornada: acharColuna(cols, [/jornada semanal/, /carga horaria/, /^jornada$/]),
    salario: acharColuna(cols, [/salario base/, /salario mensal/, /remuneracao base/]),
    nome: acharColuna(cols, [/nome profissional/, /^nome$/]),
  };
}

export async function lerPlanilhaComCabecalho(
  buffer: ArrayBuffer,
  modo: "carga" | "investsus" = "carga",
): Promise<Linha[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array", raw: false });
  for (const nomeAba of wb.SheetNames) {
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nomeAba], {
      header: 1,
      defval: "",
      raw: false,
    });
    for (let i = 0; i < Math.min(20, matriz.length); i++) {
      const cabecalho = (matriz[i] ?? []).map(String);
      const mapa = mapearColunasCarga(cabecalho);
      const textoCabecalho = cabecalho.map(normalizarTexto).join(" | ");
      const cabecalhoInvestsus =
        /cpf profissional/.test(textoCabecalho) &&
        /cnes empregador/.test(textoCabecalho) &&
        /complemento mensal uniao/.test(textoCabecalho);
      if (
        (modo === "carga" &&
          [mapa.cpf, mapa.cnes, mapa.cbo, mapa.jornada, mapa.salario].filter(Boolean).length >=
            4) ||
        (modo === "investsus" && cabecalhoInvestsus)
      ) {
        return (matriz.slice(i + 1) as unknown[][])
          .filter((linha) => linha.some((v) => String(v ?? "").trim()))
          .map((linha) =>
            Object.fromEntries(cabecalho.map((col, indice) => [col, linha[indice] ?? ""])),
          );
      }
    }
  }
  throw new Error("Não foi possível localizar o cabeçalho nas primeiras 20 linhas da planilha.");
}

export function auditarPlanilhaCarga(rows: Linha[], cnesPermitidos: string[] = []) {
  const mapa = mapearColunasCarga(Object.keys(rows[0] ?? {}));
  const obrigatorias = [
    ["CPF PROFISSIONAL", mapa.cpf],
    ["CNES EMPREGADOR", mapa.cnes],
    ["CBO", mapa.cbo],
    ["JORNADA SEMANAL (CARGA HORARIA)", mapa.jornada],
    ["SALÁRIO BASE (MENSAL)", mapa.salario],
  ] as const;
  const colunas_ausentes = obrigatorias.filter(([, c]) => !c).map(([n]) => n);
  const permitidos = new Set(cnesPermitidos.map(somenteDigitos));
  const ocorrencias: OcorrenciaPlanilha[] = [];
  const registros: RegistroCarga[] = [];
  const vistos = new Set<string>();
  const resumo: ResumoAuditoria = {
    linhas: rows.length,
    cpfs_invalidos: 0,
    cpfs_duplicados: 0,
    sem_cnes: 0,
    cnes_invalidos: 0,
    cnes_fora_instituicao: 0,
    sem_cbo: 0,
    cbo_invalido: 0,
    jornada_invalida: 0,
    salario_invalido: 0,
    erros: 0,
    alertas: 0,
    ocorrencias: 0,
    por_categoria: {},
    por_cnes: {},
    colunas_ausentes,
  };
  for (const coluna of colunas_ausentes)
    ocorrencias.push({
      severidade: "erro",
      regra: "coluna_ausente",
      linha: 0,
      descricao: `Coluna obrigatória não localizada: ${coluna}.`,
    });

  rows.forEach((row, indice) => {
    const linha = indice + 2,
      cpf = somenteDigitos(mapa.cpf ? row[mapa.cpf] : "");
    const cnes = somenteDigitos(mapa.cnes ? row[mapa.cnes] : ""),
      cbo = somenteDigitos(mapa.cbo ? row[mapa.cbo] : "");
    const jornada = numeroPlanilha(mapa.jornada ? row[mapa.jornada] : ""),
      salario = numeroPlanilha(mapa.salario ? row[mapa.salario] : "");
    const nome = mapa.nome ? String(row[mapa.nome] ?? "").trim() : "",
      categoria = categoriaPorCbo(cbo),
      regras: string[] = [];
    const adicionar = (
      severidade: OcorrenciaPlanilha["severidade"],
      regra: string,
      descricao: string,
    ) => {
      ocorrencias.push({
        severidade,
        regra,
        linha,
        descricao,
        cpf_mascarado: mascararCpf(cpf),
        cnes,
      });
      regras.push(regra);
    };
    if (!cpfValido(cpf)) {
      resumo.cpfs_invalidos++;
      adicionar("erro", "cpf_invalido", "CPF obrigatório ou inválido.");
    }
    if (!cnes) {
      resumo.sem_cnes++;
      adicionar("erro", "cnes_ausente", "CNES do empregador não informado.");
    } else if (cnes.length !== 7) {
      resumo.cnes_invalidos++;
      adicionar("erro", "cnes_invalido", "CNES deve possuir 7 dígitos.");
    } else if (permitidos.size && !permitidos.has(cnes)) {
      resumo.cnes_fora_instituicao++;
      adicionar("erro", "cnes_fora_instituicao", `CNES ${cnes} não pertence à instituição.`);
    }
    if (!cbo) {
      resumo.sem_cbo++;
      adicionar("erro", "cbo_ausente", "CBO não informado.");
    } else if (!categoria) {
      resumo.cbo_invalido++;
      adicionar(
        "erro",
        "cbo_inelegivel",
        `CBO ${cbo} não corresponde às categorias de enfermagem aceitas.`,
      );
    }
    if (!(jornada > 0)) {
      resumo.jornada_invalida++;
      adicionar("erro", "jornada_invalida", "Jornada deve ser numérica e maior que zero.");
    }
    if (!(salario > 0)) {
      resumo.salario_invalido++;
      adicionar(
        "erro",
        "salario_invalido",
        "Salário-base deve ser financeiro válido e maior que zero.",
      );
    }
    const chave = `${cpf}|${cnes}`;
    if (cpf && cnes && vistos.has(chave)) {
      resumo.cpfs_duplicados++;
      adicionar("alerta", "duplicidade_cpf_cnes", "CPF e CNES repetidos na Planilha de Carga.");
    }
    vistos.add(chave);
    if (categoria) resumo.por_categoria[categoria] = (resumo.por_categoria[categoria] ?? 0) + 1;
    if (cnes) resumo.por_cnes[cnes] = (resumo.por_cnes[cnes] ?? 0) + 1;
    registros.push({
      linha,
      cpf,
      cpf_mascarado: mascararCpf(cpf),
      cnes,
      cbo,
      jornada,
      salario_base: salario,
      nome,
      categoria,
      valido: !regras.some((r) => r !== "duplicidade_cpf_cnes"),
      regras,
    });
  });
  resumo.erros = ocorrencias.filter((o) => o.severidade === "erro").length;
  resumo.alertas = ocorrencias.filter((o) => o.severidade === "alerta").length;
  resumo.ocorrencias = ocorrencias.length;
  return { resumo, registros, ocorrencias };
}

export const auditarPlanilha = (rows: Linha[]) => auditarPlanilhaCarga(rows).resumo;
export const totalCriticas = (r: ResumoAuditoria) => r.erros;
