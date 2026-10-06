import {
  categoriaPorCbo,
  cpfValido,
  mascararCpf,
  normalizarTexto,
  numeroPlanilha,
  somenteDigitos,
  type CategoriaPiso,
  type Linha,
  type OcorrenciaPlanilha,
  type RegistroCarga,
} from "./planilha";

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

const PISO_44: Record<CategoriaPiso, number> = {
  enfermeiro: 4750,
  tecnico: 3325,
  auxiliar: 2375,
  parteira: 2375,
};
const tolera = (a: number, b: number, tolerancia = 0.02) => Math.abs(a - b) <= tolerancia;
const achar = (cols: string[], termos: RegExp[]) =>
  cols.find((c) => termos.some((r) => r.test(normalizarTexto(c))));

export function categoriaProfissional(valor: unknown): CategoriaPiso | null {
  const cbo = categoriaPorCbo(valor);
  if (cbo) return cbo;
  const n = normalizarTexto(valor);
  if (/tecnico/.test(n)) return "tecnico";
  if (/auxiliar/.test(n)) return "auxiliar";
  if (/parteira/.test(n)) return "parteira";
  if (/enfermeir/.test(n)) return "enfermeiro";
  return null;
}

export function cnpjValido(valor: unknown): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const digito = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((t, x, i) => t + Number(x) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(d.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${d1}${d2}` === d.slice(12);
}

export function pisoProporcional(categoria: CategoriaPiso, jornada: number): number {
  return Math.round(((PISO_44[categoria] * Math.min(jornada, 44)) / 44) * 100) / 100;
}

export const complementoEsperado = (categoria: CategoriaPiso, jornada: number, base: number) =>
  Math.max(Math.round((pisoProporcional(categoria, jornada) - base) * 100) / 100, 0);

export function mapearColunasInvestsus(cols: string[]) {
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

export function auditarInvestsus(rows: Linha[]) {
  const mapa = mapearColunasInvestsus(Object.keys(rows[0] ?? {}));
  const ocorrencias: OcorrenciaPlanilha[] = [];
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
    const linha = indice + 2,
      cpf = somenteDigitos(mapa.cpf ? row[mapa.cpf] : ""),
      cnpj = somenteDigitos(mapa.cnpj ? row[mapa.cnpj] : "");
    const cnes = somenteDigitos(mapa.cnes ? row[mapa.cnes] : ""),
      cbo = String(mapa.cbo ? (row[mapa.cbo] ?? "") : "").trim();
    const categoria = categoriaProfissional(cbo),
      jornadaRaw = mapa.jornada ? numeroPlanilha(row[mapa.jornada]) : Number.NaN;
    const jornada = Number.isFinite(jornadaRaw) ? jornadaRaw : null,
      piso = numeroPlanilha(mapa.piso ? row[mapa.piso] : "");
    const base = numeroPlanilha(mapa.base ? row[mapa.base] : ""),
      complemento = numeroPlanilha(mapa.complemento ? row[mapa.complemento] : "");
    const nome = mapa.nome ? String(row[mapa.nome] ?? "").trim() : "",
      empregador = mapa.empregador ? String(row[mapa.empregador] ?? "").trim() : "";
    let valido = true;
    const add = (severidade: "erro" | "alerta", regra: string, descricao: string) => {
      ocorrencias.push({
        severidade,
        regra,
        linha,
        descricao,
        cpf_mascarado: mascararCpf(cpf),
        cnes,
        instituicao_nome: empregador,
      });
      if (severidade === "erro") valido = false;
    };
    if (!nome) add("erro", "nome_ausente", "Nome do profissional ausente no resultado do InvestSUS.");
    if (!cpfValido(cpf)) add("erro", "cpf_invalido", "CPF inválido no resultado do InvestSUS.");
    if (!cnpjValido(cnpj)) add("erro", "cnpj_invalido", "CNPJ do empregador inválido.");
    if (cnes.length !== 7) add("erro", "cnes_invalido", "CNES deve possuir 7 dígitos.");
    if (!categoria)
      add("erro", "categoria_invalida", "CBO/categoria profissional não reconhecido para o Piso.");
    if ([piso, base, complemento].some((v) => !Number.isFinite(v) || v < 0))
      add("erro", "valor_invalido", "Valores financeiros não podem ser negativos ou inválidos.");
    if (
      Number.isFinite(piso) &&
      Number.isFinite(base) &&
      Number.isFinite(complemento) &&
      !tolera(complemento, Math.max(piso - base, 0))
    )
      add(
        "erro",
        "complemento_inconsistente",
        "Complemento mensal difere de piso menos valor-base.",
      );
    if (jornada != null && jornada > 108)
      add(
        "alerta",
        "jornada_acima_108",
        "Jornada superior a 108 horas; conferir múltiplos vínculos.",
      );
    const chave = `${cpf}|${cnes}`;
    if ((chaves.get(chave) ?? 0) > 0)
      add(
        "alerta",
        "duplicidade_investsus",
        "Possível duplicidade de CPF/CNES na saída do InvestSUS; a auditoria cruzada classifica duplicidade exata como crítica.",
      );
    chaves.set(chave, (chaves.get(chave) ?? 0) + 1);
    const vinculos = cpfCnes.get(cpf) ?? new Set<string>();
    vinculos.add(cnes);
    cpfCnes.set(cpf, vinculos);
    registros.push({
      linha,
      cpf,
      cpf_mascarado: mascararCpf(cpf),
      cnpj,
      cnes,
      cbo,
      categoria,
      jornada,
      nome,
      empregador,
      valor_piso: piso,
      valor_base: base,
      complemento,
      valido,
    });
    if (categoria)
      resumo.por_categoria[categoria] = (resumo.por_categoria[categoria] ?? 0) + complemento;
    if (cnes) resumo.por_cnes[cnes] = (resumo.por_cnes[cnes] ?? 0) + complemento;
    if (empregador || cnpj)
      resumo.por_instituicao[empregador || cnpj] =
        (resumo.por_instituicao[empregador || cnpj] ?? 0) + complemento;
    if (Number.isFinite(complemento)) resumo.total_complemento += complemento;
    if (Number.isFinite(piso)) resumo.total_piso += piso;
    if (Number.isFinite(base)) resumo.total_base += base;
  });
  for (const [cpf, cnes] of cpfCnes)
    if (cnes.size > 1)
      ocorrencias.push({
        severidade: "alerta",
        regra: "multiplos_vinculos",
        linha: 0,
        descricao: "CPF aparece em CNES diferentes; conferir múltiplos vínculos.",
        cpf_mascarado: mascararCpf(cpf),
      });
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

export type RegistroCargaInstituicao = RegistroCarga & { instituicao_nome?: string };

export function conciliarCargaInvestsus(
  cargas: RegistroCargaInstituicao[],
  investsus: RegistroInvestsus[],
) {
  const ocorrencias: OcorrenciaPlanilha[] = [];
  const investPorChave = new Map(investsus.map((r) => [`${r.cpf}|${r.cnes}`, r]));
  const cargaPorChave = new Map(cargas.map((r) => [`${r.cpf}|${r.cnes}`, r]));
  let localizados = 0,
    criticas = 0,
    alertas = 0,
    semComplemento = 0,
    foraConciliacao = 0;

  const add = (o: OcorrenciaPlanilha) => {
    ocorrencias.push(o);
    if (o.severidade === "erro") criticas++;
    else if (o.severidade === "alerta") alertas++;
  };

  for (const carga of cargas) {
    if (!carga.valido) {
      foraConciliacao++;
      add({
        severidade: "info",
        regra: "fora_conciliacao_origem",
        linha: carga.linha,
        descricao:
          "A linha não entrou na conciliação porque a Planilha de Carga possui erro de origem. A ocorrência permanece registrada na etapa de coleta.",
        cpf_mascarado: carga.cpf_mascarado,
        cnes: carga.cnes,
        instituicao_nome: carga.instituicao_nome,
      });
      continue;
    }

    const inv = investPorChave.get(`${carga.cpf}|${carga.cnes}`);
    const pisoEsperado = carga.categoria
      ? pisoProporcional(carga.categoria, carga.jornada)
      : null;
    const complementoEsperadoOrigem =
      pisoEsperado == null ? null : Math.max(Math.round((pisoEsperado - carga.salario_base) * 100) / 100, 0);

    if (!inv) {
      if (complementoEsperadoOrigem != null && complementoEsperadoOrigem <= 0.02) {
        semComplemento++;
        add({
          severidade: "info",
          regra: "ausencia_sem_complemento",
          linha: carga.linha,
          descricao: `Profissional ausente no InvestSUS, porém sem complemento esperado: piso proporcional R$ ${pisoEsperado?.toFixed(2).replace(".", ",")} e salário-base R$ ${carga.salario_base.toFixed(2).replace(".", ",")}.`,
          cpf_mascarado: carga.cpf_mascarado,
          cnes: carga.cnes,
          instituicao_nome: carga.instituicao_nome,
        });
      } else {
        add({
          severidade: "erro",
          regra: "ausente_com_valor_devido",
          linha: carga.linha,
          descricao:
            complementoEsperadoOrigem == null
              ? "Profissional informado em carga válida não apareceu na saída do InvestSUS."
              : `Profissional ausente no InvestSUS com complemento esperado de R$ ${complementoEsperadoOrigem.toFixed(2).replace(".", ",")}.`,
          cpf_mascarado: carga.cpf_mascarado,
          cnes: carga.cnes,
          instituicao_nome: carga.instituicao_nome,
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
    ) =>
      condicao &&
      add({
        severidade,
        regra,
        linha: carga.linha,
        descricao,
        cpf_mascarado: carga.cpf_mascarado,
        cnes: carga.cnes,
        instituicao_nome: carga.instituicao_nome,
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
      `Valor-base do InvestSUS (R$ ${inv.valor_base.toFixed(2).replace(".", ",")}) difere do salário-base da Planilha de Carga (R$ ${carga.salario_base.toFixed(2).replace(".", ",")}).`,
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
        `Valor Piso Profissional do InvestSUS (R$ ${inv.valor_piso.toFixed(2).replace(".", ",")}) diverge do piso proporcional calculado pela carga (R$ ${pisoEsperado.toFixed(2).replace(".", ",")}).`,
      );
    }

    const complementoEsperadoInvestsus =
      pisoEsperado == null
        ? Math.max(inv.valor_piso - inv.valor_base, 0)
        : Math.max(Math.round((pisoEsperado - inv.valor_base) * 100) / 100, 0);

    comparar(
      inv.complemento < -0.005,
      "complemento_negativo",
      `Complemento mensal da União está negativo (R$ ${inv.complemento.toFixed(2).replace(".", ",")}).`,
    );
    comparar(
      !tolera(complementoEsperadoInvestsus, inv.complemento),
      "complemento_divergente",
      `Complemento do InvestSUS (R$ ${inv.complemento.toFixed(2).replace(".", ",")}) diverge do esperado (R$ ${complementoEsperadoInvestsus.toFixed(2).replace(".", ",")}) considerando piso proporcional e valor-base do próprio InvestSUS.`,
    );
  }

  for (const inv of investsus) {
    if (!cargaPorChave.has(`${inv.cpf}|${inv.cnes}`))
      add({
        severidade: "erro",
        regra: "somente_investsus",
        linha: inv.linha,
        descricao: "Registro existente somente no InvestSUS.",
        cpf_mascarado: inv.cpf_mascarado,
        cnes: inv.cnes,
        instituicao_nome: inv.empregador,
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
    const chavesExatas = new Set(registros.map((r) => `${r.cpf}|${r.cnes}`));
    const cnes = [...new Set(registros.map((r) => r.cnes))].join(", ");
    const duplicadoMesmoCnes = chavesExatas.size < registros.length;
    add({
      severidade: duplicadoMesmoCnes ? "erro" : "alerta",
      regra: duplicadoMesmoCnes ? "duplicidade_investsus" : "multiplos_vinculos",
      linha: registros[0]?.linha ?? 0,
      descricao: duplicadoMesmoCnes
        ? `CPF aparece ${registros.length} vezes no InvestSUS e há duplicidade no mesmo CNES.`
        : `CPF aparece ${registros.length} vezes no InvestSUS em CNES diferentes; conferir se os múltiplos vínculos são esperados.`,
      cpf_mascarado: mascararCpf(cpf),
      cnes,
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
