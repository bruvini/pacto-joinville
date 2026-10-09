import * as XLSX from "npm:xlsx@0.18.5";

export const INVESTSUS_AUDIT_RULES_VERSION = 5;

type Linha = Record<string, unknown>;
type CategoriaPiso = "enfermeiro" | "tecnico" | "auxiliar" | "parteira";

export interface Ocorrencia {
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
}

export interface RegistroInvestsus {
  linha: number;
  cpf: string;
  cpf_mascarado: string;
  cnpj: string;
  cnes: string;
  cbo: string;
  categoria: CategoriaPiso | null;
  jornada: number | null;
  nome: string;
  empregador: string;
  valor_piso: number;
  valor_base: number;
  complemento: number;
  valido: boolean;
}

const CBO_CATEGORIA: Record<string, CategoriaPiso> = {};
for (const cbo of [
  "223505","223510","223515","223520","223525","223530","223535",
  "223540","223545","223550","223555","223560","223565",
]) CBO_CATEGORIA[cbo] = "enfermeiro";
for (const cbo of ["322205","322210","322215","322220","322245"]) CBO_CATEGORIA[cbo] = "tecnico";
for (const cbo of ["322230","322235","322250"]) CBO_CATEGORIA[cbo] = "auxiliar";
CBO_CATEGORIA["515115"] = "parteira";

const PISO_44: Record<CategoriaPiso, number> = {
  enfermeiro: 4750,
  tecnico: 3325,
  auxiliar: 2375,
  parteira: 2375,
};

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
  const d = somenteDigitos(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function cnpjValido(v: unknown): boolean {
  const d = somenteDigitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const digito = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((t, x, i) => t + Number(x) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(d.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = digito(d.slice(0, 12) + d1, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return `${d1}${d2}` === d.slice(12);
}

export function numeroPlanilha(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!s) return Number.NaN;
  const ultimaVirgula = s.lastIndexOf(",");
  const ultimoPonto = s.lastIndexOf(".");
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    const decimal = ultimaVirgula > ultimoPonto ? "," : ".";
    const milhar = decimal === "," ? "." : ",";
    return Number(s.split(milhar).join("").replace(decimal, "."));
  }
  if (ultimaVirgula >= 0) {
    if (/^-?\d{1,3}(?:,\d{3})+$/.test(s)) return Number(s.replace(/,/g, ""));
    return Number(s.replace(",", "."));
  }
  if (ultimoPonto >= 0) {
    if (/^-?\d{1,3}(?:\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
    return Number(s);
  }
  return Number(s);
}

const categoriaPorCbo = (v: unknown): CategoriaPiso | null =>
  CBO_CATEGORIA[somenteDigitos(v)] ?? null;

const achar = (cols: string[], termos: RegExp[]) =>
  cols.find((c) => termos.some((r) => r.test(normalizarTexto(c))));

function mapearColunasCarga(cols: string[]) {
  return {
    cpf: achar(cols, [/cpf profissional/, /^cpf$/]),
    cnes: achar(cols, [/cnes empregador/, /^cnes$/]),
    cbo: achar(cols, [/^cbo$/, /codigo cbo/]),
    jornada: achar(cols, [/jornada semanal/, /carga horaria/, /^jornada$/]),
    salario: achar(cols, [/salario base/, /salario mensal/, /remuneracao base/]),
    nome: achar(cols, [/nome profissional/, /^nome$/]),
  };
}

function mapearColunasInvestsus(cols: string[]) {
  return {
    cnpj: achar(cols, [/cnpj empregador/, /^cnpj$/]),
    empregador: achar(cols, [/nome empregador/]),
    cbo: achar(cols, [/^cbo$/, /categoria profissional/]),
    cnes: achar(cols, [/cnes empregador/, /^cnes$/]),
    cpf: achar(cols, [/cpf profissional/, /^cpf$/]),
    nome: achar(cols, [/nome profissional/]),
    piso: achar(cols, [/valor piso profissional/, /^valor piso$/]),
    base: achar(cols, [/valor base para calculo/, /salario base/]),
    complemento: achar(cols, [/complemento mensal uniao/, /^complemento$/]),
    jornada: achar(cols, [/jornada semanal/, /carga horaria/]),
  };
}

export function lerPlanilha(bytes: Uint8Array, modo: "carga" | "investsus"): Linha[] {
  const wb = XLSX.read(bytes, { type: "array" });
  for (const nome of wb.SheetNames) {
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], {
      header: 1,
      defval: "",
      raw: true,
    });
    for (let i = 0; i < Math.min(20, matriz.length); i++) {
      const cab = (matriz[i] ?? []).map(String);
      const carga = mapearColunasCarga(cab);
      const texto = cab.map(normalizarTexto).join(" | ");
      const invest =
        /cpf profissional/.test(texto) &&
        /cnes empregador/.test(texto) &&
        /complemento mensal uniao/.test(texto);
      const cargaOk =
        [carga.cpf, carga.cnes, carga.cbo, carga.jornada, carga.salario].filter(Boolean).length >= 4;
      if ((modo === "carga" && cargaOk) || (modo === "investsus" && invest)) {
        return (matriz.slice(i + 1) as unknown[][])
          .filter((linha) => linha.some((v) => String(v ?? "").trim()))
          .map((linha) =>
            Object.fromEntries(cab.map((col, indice) => [col, linha[indice] ?? ""])),
          );
      }
    }
  }
  throw new Error("Não foi possível localizar o cabeçalho nas primeiras 20 linhas da planilha.");
}

/**
 * Extrai uma memória de valores já homologados por CNES, sem recalcular
 * a 13ª com a fórmula do complemento mensal.
 * O arquivo precisa conter cabeçalhos CNES e VALOR AFC 13ª (ou VALOR
 * HOMOLOGADO DA 13ª). Valores devem corresponder à fonte oficial do ano.
 * Não aceita duplicidade, CNES inválido, fórmulas sem resultado ou totais
 * ambíguos. O arquivo original permanece arquivado com SHA-256.
 */
export function lerMemoria13PorCnes(bytes: Uint8Array): Array<{ cnes: string; valor: string }> {
  const wb = XLSX.read(bytes, { type: "array" });
  for (const nome of wb.SheetNames) {
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], {
      header: 1, defval: "", raw: true,
    });
    for (let i = 0; i < Math.min(30, matriz.length); i++) {
      const nomes = (matriz[i] ?? []).map(normalizarTexto);
      const posCnes = nomes.findIndex((n) => n === "cnes" || n === "cnes empregador");
      const posValor = nomes.findIndex((n) =>
        /valor/.test(n) &&
        /(13|decima terceira|decimo terceiro)/.test(n) &&
        /(afc|parcela|homologado|repasse)/.test(n),
      );
      if (posCnes < 0 || posValor < 0) continue;
      const saida: Array<{ cnes: string; valor: string }> = [];
      const vistos = new Set<string>();
      for (const linha of matriz.slice(i + 1)) {
        const nomeCnes = String(linha[posCnes] ?? "").trim();
        const valorOriginal = linha[posValor];
        if (!nomeCnes && (valorOriginal == null || String(valorOriginal).trim() === "")) continue;
        if (/^total\b/i.test(nomeCnes)) continue;
        const cnes = somenteDigitos(nomeCnes);
        const valor = numeroPlanilha(valorOriginal);
        if (cnes.length !== 7 || vistos.has(cnes))
          throw new Error(`CNES inválido ou duplicado na memória da 13ª: ${nomeCnes}.`);
        if (!Number.isFinite(valor) || valor < 0 || Math.abs(valor * 100 - Math.round(valor * 100)) > 0.001)
          throw new Error(`Valor da 13ª inválido para CNES ${cnes}.`);
        vistos.add(cnes);
        saida.push({ cnes, valor: (Math.round(valor * 100) / 100).toFixed(2) });
      }
      if (!saida.length) throw new Error("Memória da 13ª sem CNES ou valores.");
      if (saida.length > 20000) throw new Error("Memória da 13ª excede 20 mil CNES.");
      return saida;
    }
  }
  throw new Error(
    "Planilha da 13ª não identificada. Use cabeçalhos CNES e VALOR AFC 13ª " +
    "(ou VALOR HOMOLOGADO DA 13ª), preservando o arquivo oficial de origem.",
  );
}

export function auditarCarga(rows: Linha[], cnesPermitidos: string[]) {
  const mapa = mapearColunasCarga(Object.keys(rows[0] ?? {}));
  const permitidos = new Set(cnesPermitidos.map(somenteDigitos));
  const ocorrencias: Ocorrencia[] = [];
  const registros: RegistroCarga[] = [];
  const vistos = new Set<string>();

  rows.forEach((row, indice) => {
    const linha = indice + 2;
    const cpf = somenteDigitos(mapa.cpf ? row[mapa.cpf] : "");
    const cnes = somenteDigitos(mapa.cnes ? row[mapa.cnes] : "");
    const cbo = somenteDigitos(mapa.cbo ? row[mapa.cbo] : "");
    const jornada = numeroPlanilha(mapa.jornada ? row[mapa.jornada] : "");
    const salario = numeroPlanilha(mapa.salario ? row[mapa.salario] : "");
    const nome = mapa.nome ? String(row[mapa.nome] ?? "").trim() : "";
    const categoria = categoriaPorCbo(cbo);
    const regras: string[] = [];

    const add = (severidade: Ocorrencia["severidade"], regra: string, descricao: string) => {
      ocorrencias.push({ severidade, regra, linha, descricao, cpf_mascarado: mascararCpf(cpf), cnes });
      regras.push(regra);
    };

    if (!cpfValido(cpf)) add("erro", "cpf_invalido", "CPF obrigatório ou inválido.");
    if (!cnes) add("erro", "cnes_ausente", "CNES do empregador não informado.");
    else if (cnes.length !== 7) add("erro", "cnes_invalido", "CNES deve possuir 7 dígitos.");
    else if (permitidos.size && !permitidos.has(cnes))
      add("erro", "cnes_fora_instituicao", `CNES ${cnes} não pertence à instituição.`);
    if (!cbo) add("erro", "cbo_ausente", "CBO não informado.");
    else if (!categoria)
      add("erro", "cbo_inelegivel", `CBO ${cbo} não corresponde às categorias de enfermagem aceitas.`);
    if (!(jornada > 0)) add("erro", "jornada_invalida", "Jornada deve ser numérica e maior que zero.");
    if (!(salario > 0))
      add("erro", "salario_invalido", "Salário-base deve ser financeiro válido e maior que zero.");

    const chave = `${cpf}|${cnes}`;
    if (cpf && cnes && vistos.has(chave))
      add("alerta", "duplicidade_cpf_cnes", "CPF e CNES repetidos na Planilha de Carga.");
    vistos.add(chave);

    registros.push({
      linha, cpf, cpf_mascarado: mascararCpf(cpf), cnes, cbo, jornada,
      salario_base: salario, nome, categoria,
      valido: !regras.some((r) => r !== "duplicidade_cpf_cnes"),
    });
  });

  return { registros, ocorrencias };
}

function categoriaProfissional(v: unknown): CategoriaPiso | null {
  const cbo = categoriaPorCbo(v);
  if (cbo) return cbo;
  const n = normalizarTexto(v);
  if (/tecnico/.test(n)) return "tecnico";
  if (/auxiliar/.test(n)) return "auxiliar";
  if (/parteira/.test(n)) return "parteira";
  if (/enfermeir/.test(n)) return "enfermeiro";
  return null;
}

function pisoProporcional(categoria: CategoriaPiso, jornada: number): number {
  return Math.round(((PISO_44[categoria] * Math.min(jornada, 44)) / 44) * 100) / 100;
}

const tolera = (a: number, b: number, tolerancia = 0.02) => Math.abs(a - b) <= tolerancia;

export function auditarInvestsus(rows: Linha[]) {
  const mapa = mapearColunasInvestsus(Object.keys(rows[0] ?? {}));
  const ocorrencias: Ocorrencia[] = [];
  const registros: RegistroInvestsus[] = [];
  const chaves = new Map<string, number>();
  const cpfCnes = new Map<string, Set<string>>();
  const resumo = {
    linhas: rows.length,
    profissionais: 0,
    cnes: 0,
    instituicoes: 0,
    total_complemento: 0,
    total_piso: 0,
    total_base: 0,
    erros: 0,
    alertas: 0,
    por_categoria: {} as Record<string, number>,
    por_cnes: {} as Record<string, number>,
    por_instituicao: {} as Record<string, number>,
  };

  rows.forEach((row, indice) => {
    const linha = indice + 2;
    const cpf = somenteDigitos(mapa.cpf ? row[mapa.cpf] : "");
    const cnpj = somenteDigitos(mapa.cnpj ? row[mapa.cnpj] : "");
    const cnes = somenteDigitos(mapa.cnes ? row[mapa.cnes] : "");
    const cbo = String(mapa.cbo ? (row[mapa.cbo] ?? "") : "").trim();
    const categoria = categoriaProfissional(cbo);
    const jornadaRaw = mapa.jornada ? numeroPlanilha(row[mapa.jornada]) : Number.NaN;
    const jornada = Number.isFinite(jornadaRaw) ? jornadaRaw : null;
    const piso = numeroPlanilha(mapa.piso ? row[mapa.piso] : "");
    const base = numeroPlanilha(mapa.base ? row[mapa.base] : "");
    const complemento = numeroPlanilha(mapa.complemento ? row[mapa.complemento] : "");
    const nome = mapa.nome ? String(row[mapa.nome] ?? "").trim() : "";
    const empregador = mapa.empregador ? String(row[mapa.empregador] ?? "").trim() : "";
    let valido = true;

    const add = (severidade: "erro" | "alerta", regra: string, descricao: string) => {
      ocorrencias.push({
        severidade, regra, linha, descricao,
        cpf_mascarado: mascararCpf(cpf), cnes, instituicao_nome: empregador,
      });
      if (severidade === "erro") valido = false;
    };

    if (!nome) add("erro", "nome_ausente", "Nome do profissional ausente no resultado do InvestSUS.");
    if (!cpfValido(cpf)) add("erro", "cpf_invalido", "CPF inválido no resultado do InvestSUS.");
    if (!cnpjValido(cnpj)) add("erro", "cnpj_invalido", "CNPJ do empregador inválido.");
    if (cnes.length !== 7) add("erro", "cnes_invalido", "CNES deve possuir 7 dígitos.");
    if (!categoria) add("erro", "categoria_invalida", "CBO/categoria profissional não reconhecido para o Piso.");
    if ([piso, base, complemento].some((v) => !Number.isFinite(v) || v < 0))
      add("erro", "valor_invalido", "Valores financeiros não podem ser negativos ou inválidos.");
    if (
      Number.isFinite(piso) && Number.isFinite(base) && Number.isFinite(complemento) &&
      !tolera(complemento, Math.max(piso - base, 0))
    ) add("erro", "complemento_inconsistente", "Complemento mensal difere de piso menos valor-base.");
    if (jornada != null && jornada > 108)
      add("alerta", "jornada_acima_108", "Jornada superior a 108 horas; conferir múltiplos vínculos.");

    const chave = `${cpf}|${cnes}`;
    if ((chaves.get(chave) ?? 0) > 0)
      add("alerta", "duplicidade_investsus", "Possível duplicidade de CPF/CNES na saída do InvestSUS.");
    chaves.set(chave, (chaves.get(chave) ?? 0) + 1);
    const vinculos = cpfCnes.get(cpf) ?? new Set<string>();
    vinculos.add(cnes);
    cpfCnes.set(cpf, vinculos);

    registros.push({
      linha, cpf, cpf_mascarado: mascararCpf(cpf), cnpj, cnes, cbo, categoria,
      jornada, nome, empregador, valor_piso: piso, valor_base: base, complemento, valido,
    });

    if (categoria) resumo.por_categoria[categoria] = (resumo.por_categoria[categoria] ?? 0) + complemento;
    if (cnes) resumo.por_cnes[cnes] = (resumo.por_cnes[cnes] ?? 0) + complemento;
    if (empregador || cnpj)
      resumo.por_instituicao[empregador || cnpj] =
        (resumo.por_instituicao[empregador || cnpj] ?? 0) + complemento;
    if (Number.isFinite(complemento)) resumo.total_complemento += complemento;
    if (Number.isFinite(piso)) resumo.total_piso += piso;
    if (Number.isFinite(base)) resumo.total_base += base;
  });

  for (const [cpf, vinculos] of cpfCnes) {
    if (vinculos.size > 1)
      ocorrencias.push({
        severidade: "alerta",
        regra: "multiplos_vinculos",
        linha: 0,
        descricao: "CPF aparece em CNES diferentes; conferir múltiplos vínculos.",
        cpf_mascarado: mascararCpf(cpf),
      });
  }

  resumo.profissionais = new Set(registros.map((r) => r.cpf)).size;
  resumo.cnes = new Set(registros.map((r) => r.cnes)).size;
  resumo.instituicoes = new Set(registros.map((r) => r.cnpj)).size;
  resumo.total_complemento = Math.round(resumo.total_complemento * 100) / 100;
  resumo.total_piso = Math.round(resumo.total_piso * 100) / 100;
  resumo.total_base = Math.round(resumo.total_base * 100) / 100;
  resumo.erros = ocorrencias.filter((o) => o.severidade === "erro").length;
  resumo.alertas = ocorrencias.filter((o) => o.severidade === "alerta").length;
  return { registros, ocorrencias, resumo };
}

export function conciliar(cargas: Array<RegistroCarga & { instituicao_nome?: string }>, investsus: RegistroInvestsus[]) {
  const ocorrencias: Ocorrencia[] = [];
  const investPorChave = new Map(investsus.map((r) => [`${r.cpf}|${r.cnes}`, r]));
  const cargaPorChave = new Map(cargas.map((r) => [`${r.cpf}|${r.cnes}`, r]));
  let localizados = 0, criticas = 0, alertas = 0, semComplemento = 0, foraConciliacao = 0;

  const add = (o: Ocorrencia) => {
    ocorrencias.push(o);
    if (o.severidade === "erro") criticas++;
    else if (o.severidade === "alerta") alertas++;
  };

  for (const carga of cargas) {
    if (!carga.valido) {
      foraConciliacao++;
      add({
        severidade: "info", regra: "fora_conciliacao_origem", linha: carga.linha,
        descricao: "A linha não entrou na conciliação porque a Planilha de Carga possui erro de origem.",
        cpf_mascarado: carga.cpf_mascarado, cnes: carga.cnes, instituicao_nome: carga.instituicao_nome,
      });
      continue;
    }

    const inv = investPorChave.get(`${carga.cpf}|${carga.cnes}`);
    const pisoEsperado = carga.categoria ? pisoProporcional(carga.categoria, carga.jornada) : null;
    const complementoOrigem =
      pisoEsperado == null ? null : Math.max(Math.round((pisoEsperado - carga.salario_base) * 100) / 100, 0);

    if (!inv) {
      if (complementoOrigem != null && complementoOrigem <= 0.02) {
        semComplemento++;
        add({
          severidade: "info", regra: "ausencia_sem_complemento", linha: carga.linha,
          descricao: "Profissional ausente no InvestSUS, porém sem complemento esperado.",
          cpf_mascarado: carga.cpf_mascarado, cnes: carga.cnes, instituicao_nome: carga.instituicao_nome,
        });
      } else {
        add({
          severidade: "alerta", regra: "nao_homologado_investsus", linha: carga.linha,
          descricao:
            complementoOrigem == null
              ? "Registro da Planilha de Carga não consta na saída homologada do InvestSUS."
              : `Registro não consta na saída homologada do InvestSUS; complemento local estimado R$ ${complementoOrigem.toFixed(2).replace(".", ",")}.`,
          cpf_mascarado: carga.cpf_mascarado, cnes: carga.cnes, instituicao_nome: carga.instituicao_nome,
        });
      }
      continue;
    }

    localizados++;
    const comparar = (
      condicao: boolean,
      regra: string,
      descricao: string,
      severidade: "erro" | "alerta" = "erro",
    ) => condicao && add({
      severidade, regra, linha: carga.linha, descricao,
      cpf_mascarado: carga.cpf_mascarado, cnes: carga.cnes, instituicao_nome: carga.instituicao_nome,
    });

    comparar(
      Boolean(carga.categoria && inv.categoria && carga.categoria !== inv.categoria),
      "categoria_divergente",
      `Categoria profissional diverge — carga ${carga.cbo}, InvestSUS ${inv.cbo}.`,
    );
    comparar(
      inv.jornada != null && Math.abs(carga.jornada - inv.jornada) > 0.01,
      "jornada_divergente",
      `Jornada diverge — carga ${carga.jornada}h, InvestSUS ${inv.jornada}h.`,
    );
    comparar(
      !tolera(carga.salario_base, inv.valor_base),
      "salario_divergente",
      "Valor-base homologado no InvestSUS difere do salário-base da Planilha de Carga.",
      "alerta",
    );
    comparar(
      Boolean(carga.nome && inv.nome && normalizarTexto(carga.nome) !== normalizarTexto(inv.nome)),
      "nome_divergente",
      "Nome do profissional diverge entre a Planilha de Carga e o InvestSUS.",
      "alerta",
    );
    if (pisoEsperado != null) {
      comparar(
        !tolera(pisoEsperado, inv.valor_piso),
        "piso_divergente",
        "Valor Piso Profissional do InvestSUS diverge do piso proporcional calculado pela carga.",
      );
    }
    const complementoEsperado =
      pisoEsperado == null
        ? Math.max(inv.valor_piso - inv.valor_base, 0)
        : Math.max(Math.round((pisoEsperado - inv.valor_base) * 100) / 100, 0);
    comparar(inv.complemento < -0.005, "complemento_negativo", "Complemento mensal da União está negativo.");
    comparar(
      !tolera(complementoEsperado, inv.complemento),
      "complemento_divergente",
      "Complemento do InvestSUS diverge do esperado considerando piso proporcional e valor-base.",
    );
  }

  for (const inv of investsus) {
    if (!cargaPorChave.has(`${inv.cpf}|${inv.cnes}`))
      add({
        severidade: "erro", regra: "somente_investsus", linha: inv.linha,
        descricao: "Registro existente somente no InvestSUS.",
        cpf_mascarado: inv.cpf_mascarado, cnes: inv.cnes, instituicao_nome: inv.empregador,
      });
  }

  const porCpf = new Map<string, RegistroInvestsus[]>();
  for (const r of investsus) {
    const arr = porCpf.get(r.cpf) ?? [];
    arr.push(r);
    porCpf.set(r.cpf, arr);
  }
  for (const [cpf, registros] of porCpf) {
    if (registros.length <= 1) continue;
    const chaves = new Set(registros.map((r) => `${r.cpf}|${r.cnes}`));
    const duplicado = chaves.size < registros.length;
    add({
      severidade: duplicado ? "erro" : "alerta",
      regra: duplicado ? "duplicidade_investsus" : "multiplos_vinculos",
      linha: registros[0]?.linha ?? 0,
      descricao: duplicado
        ? `CPF aparece ${registros.length} vezes e há duplicidade no mesmo CNES.`
        : `CPF aparece ${registros.length} vezes em CNES diferentes.`,
      cpf_mascarado: mascararCpf(cpf),
      cnes: [...new Set(registros.map((r) => r.cnes))].join(", "),
    });
  }

  return {
    ocorrencias,
    resumo: {
      registros_carga: cargas.length,
      registros_investsus: investsus.length,
      localizados,
      criticas,
      alertas,
      sem_complemento: semComplemento,
      fora_conciliacao: foraConciliacao,
    },
  };
}

const MESES: Record<string, string> = {
  janeiro:"01", fevereiro:"02", marco:"03", abril:"04", maio:"05", junho:"06",
  julho:"07", agosto:"08", setembro:"09", outubro:"10", novembro:"11", dezembro:"12",
};
const UFS = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO";
const normalizarPdf = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const moeda = (s?: string) => s ? Number(s.replace(/\./g, "").replace(",", ".")) : null;

function linhaJoinville(texto: string): string {
  const marcador = /(?:SC\s+)?420910\s+JOINVILLE\s+MUNICIPAL\s+/i.exec(texto);
  if (!marcador) return "";
  const restante = texto.slice((marcador.index ?? 0) + marcador[0].length);
  const proxima = restante.search(new RegExp(`\\s+(?:${UFS})\\s+\\d{6}\\s+`, "i"));
  return (proxima >= 0 ? restante.slice(0, proxima) : restante.slice(0, 500)).trim();
}

function valoresJoinville(texto: string): number[] {
  const linha = linhaJoinville(texto);
  if (!linha) return [];
  const tokens = linha.match(/(?:-|–|—)|(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?/g) ?? [];
  return tokens.slice(0, 4).map((token) => /^(?:-|–|—)$/.test(token.trim()) ? 0 : (moeda(token.trim()) ?? 0));
}

function dataExtenso(texto: string): string | null {
  const m = normalizarPdf(texto).match(
    /(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i,
  );
  return m ? `${m[3]}-${MESES[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}` : null;
}
function dataNumerica(texto: string): string | null {
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export async function extrairPortaria(bytes: Uint8Array) {
  // Carrega dependências de PDF somente quando a Portaria é processada.
  // A auditoria de XLSX/CSV não deve depender do boot do parser de PDF.
  const [{ default: pdfParse }, { Buffer }] = await Promise.all([
    import("npm:pdf-parse@1.1.1"),
    import("node:buffer"),
  ]);
  const pdf = await pdfParse(Buffer.from(bytes));
  const texto = normalizarPdf(pdf.text ?? "");
  // A 13ª deve constar expressamente na ementa do ato, e não apenas
  // em uma menção lateral no corpo de uma portaria mensal.
  const ementa = texto.slice(0, 2500)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const parcela13_detectada = /decima\s+terceira\s+parcela|13[aª]?\s+parcela|decimo\s+terceiro/.test(ementa);
  const numero = texto.match(/PORTARIA\s+GM\/?MS\s+(?:N[Oº°.]?\s*)?([\d.]+)/i)?.[1] ?? null;
  const trechoAto = texto.match(/PORTARIA\s+GM\/?MS[^,\n]*(?:,|\s)\s*DE\s+(.{5,45}?\d{4})/i)?.[1] ?? "";
  const data_ato = dataExtenso(trechoAto) ?? dataNumerica(trechoAto);
  const publicacaoTrecho = texto.match(/(?:PUBLICA(?:CAO|ÇÃO)|PUBLICADO\s+EM)\s*:?\s*([^|;]{5,35})/i)?.[1] ?? "";
  const data_publicacao = dataNumerica(publicacaoTrecho) ?? dataExtenso(publicacaoTrecho);
  const edicao = texto.match(/EDI(?:CAO|ÇÃO)\s*:?\s*([\dA-Z.-]+)/i)?.[1] ?? null;
  const secao = texto.match(/SE(?:CAO|ÇÃO)\s*:?\s*([\dA-Z.-]+)/i)?.[1] ?? null;
  const pagina = texto.match(/P(?:A|Á)GINA\s*:?\s*([\dA-Z.-]+)/i)?.[1] ?? null;
  const valores = valoresJoinville(texto);
  const dados = {
    numero, data_ato, data_publicacao, edicao, secao, pagina,
    valor_homologado: valores[0] ?? null,
    desconto_saldo: valores[1] ?? null,
    acerto_contas: valores[2] ?? null,
    valor_transferido: valores[3] ?? null,
    joinville_localizada: valores.length >= 4,
    parcela13_detectada,
  };
  const campos_nao_extraidos = Object.entries({
    numero, data_ato, data_publicacao,
    valor_homologado: dados.valor_homologado,
    desconto_saldo: dados.desconto_saldo,
    acerto_contas: dados.acerto_contas,
    valor_transferido: dados.valor_transferido,
  }).filter(([,v]) => v == null).map(([k]) => k);
  return { ...dados, campos_nao_extraidos };
}
