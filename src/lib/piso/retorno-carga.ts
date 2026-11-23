import {
  mapearColunasCarga, mascararCpf, normalizarTexto, numeroPlanilha,
  somenteDigitos, type Linha, type OcorrenciaPlanilha,
} from "./planilha";

/** O CPF integral existe apenas no processo de auditoria, jamais no resumo salvo. */
export interface LinhaRetornoCarga {
  cpf: string;
  cnes: string;
  resultado: string;
  incluido: boolean;
  observacao?: string;
}
export interface ResultadoConfirmacaoCarga {
  registros: LinhaRetornoCarga[];
  ocorrencias: OcorrenciaPlanilha[];
  resumo: {
    registros_carga: number;
    registros_retorno: number;
    correspondentes: number;
    incluidos_com_sucesso: number;
    sem_confirmacao: number;
    nao_incluidos: number;
    extras_retorno: number;
    divergencias_campos: number;
    duplicidades: number;
    criticas: number;
    alertas: number;
  };
}

const chave = (cpf: string, cnes: string) => `${cpf}|${cnes}`;
const coluna = (cabecalhos: string[], expressoes: RegExp[]) =>
  cabecalhos.find(h => expressoes.some(re => re.test(normalizarTexto(h))));
const valor = (linha: Linha, campo?: string) => campo ? linha[campo] : "";
const limpo = (v: unknown) => String(v ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 280);
const numeroOuVazio = (v: unknown) => {
  if (String(v ?? "").trim() === "") return 0;
  return numeroPlanilha(v);
};

const CAMPOS = [
  ["CBO", [/^cbo$/, /codigo cbo/], "codigo"],
  ["Jornada semanal", [/jornada semanal/, /carga horaria/, /^jornada$/], "numero"],
  ["Salário-base", [/salario base/, /salario mensal/, /remuneracao base/], "numero"],
  ["Insalubridade", [/insalubridade/], "numero"],
  ["Adicional noturno", [/adicional noturno/], "numero"],
  ["Encargo patronal", [/encargo patronal/], "numero"],
  ["Encargo trabalhista", [/encargo trabalhista/], "numero"],
  ["Vantagem fixa", [/vantagem fixa/, /^vfpg$/], "numero"],
  ["Vantagem variável", [/vantagem variavel/, /^vpvt$/], "numero"],
] as const;

function camposDivergentes(origem: Linha, retorno: Linha): string[] {
  const origHeaders = Object.keys(origem);
  const retHeaders = Object.keys(retorno);
  const diferentes: string[] = [];
  for (const [rotulo, expressoes, tipo] of CAMPOS) {
    const c1 = coluna(origHeaders, [...expressoes]);
    const c2 = coluna(retHeaders, [...expressoes]);
    if (!c1 || !c2) continue; // coluna não enviada na resposta não é divergência
    const v1 = origem[c1], v2 = retorno[c2];
    if (tipo === "numero") {
      const n1 = numeroOuVazio(v1), n2 = numeroOuVazio(v2);
      if (!Number.isFinite(n1) || !Number.isFinite(n2) || Math.abs(n1-n2)>0.01)
        diferentes.push(rotulo);
    } else if (somenteDigitos(v1) !== somenteDigitos(v2)) {
      diferentes.push(rotulo);
    }
  }
  return diferentes;
}

/**
 * A confirmação de carga é a evidência de PROCESSAMENTO DO ENVIO, não uma
 * autorização de pagamento. Compara CPF+CNES e atributos originais.
 */
export function conciliarConfirmacaoCarga(carga: Linha[], retorno: Linha[]): ResultadoConfirmacaoCarga {
  if (!carga.length || !retorno.length) throw new Error("Carga e retorno precisam conter registros.");
  const colCarga = mapearColunasCarga(Object.keys(carga[0]));
  const colRet = mapearColunasCarga(Object.keys(retorno[0]));
  const headersRet = Object.keys(retorno[0]);
  const colResultado = coluna(headersRet, [/^resultado$/, /^situacao$/, /^status/]);
  const colObservacao = coluna(headersRet, [/^observacao$/, /^motivo$/, /^detalhamento$/, /^justificativa$/]);
  if (!colCarga.cpf || !colCarga.cnes || !colRet.cpf || !colRet.cnes || !colResultado)
    throw new Error("A planilha precisa conter CPF PROFISSIONAL, CNES EMPREGADOR e RESULTADO do envio InvestSUS.");

  const porChave = new Map<string, Linha>();
  const porRet = new Map<string, Linha>();
  const ocorrencias: OcorrenciaPlanilha[] = [];
  const resumo = {
    registros_carga: carga.length, registros_retorno: retorno.length,
    correspondentes: 0, incluidos_com_sucesso: 0, sem_confirmacao: 0,
    nao_incluidos: 0, extras_retorno: 0, divergencias_campos: 0,
    duplicidades: 0, criticas: 0, alertas: 0,
  };
  const add = (severidade: OcorrenciaPlanilha["severidade"], regra: string,
    descricao: string, linha: number, cpf: string, cnes: string, dados?: Record<string, unknown>) => {
    ocorrencias.push({severidade, regra, descricao, linha,
      cpf_mascarado: mascararCpf(cpf), cnes, dados});
    if (severidade === "erro") resumo.criticas++;
    if (severidade === "alerta") resumo.alertas++;
  };

  carga.forEach((r, i) => {
    const cpf = somenteDigitos(valor(r,colCarga.cpf)), cnes = somenteDigitos(valor(r,colCarga.cnes));
    const k = chave(cpf,cnes);
    if (porChave.has(k)) {
      resumo.duplicidades++;
      add("alerta","duplicidade_na_carga_original","Vínculo repetido na carga institucional.", i+2,cpf,cnes);
    } else porChave.set(k,r);
  });
  retorno.forEach((r,i) => {
    const cpf = somenteDigitos(valor(r,colRet.cpf)), cnes = somenteDigitos(valor(r,colRet.cnes));
    const k = chave(cpf,cnes);
    if (porRet.has(k)) {
      resumo.duplicidades++;
      add("erro","duplicidade_retorno_carga","O mesmo CPF/CNES aparece mais de uma vez no comprovante de envio.",i+2,cpf,cnes);
    } else porRet.set(k,r);
  });

  const registros: LinhaRetornoCarga[] = [];
  const processados = new Set<string>();
  retorno.forEach((r,i) => {
    const cpf = somenteDigitos(valor(r,colRet.cpf)), cnes = somenteDigitos(valor(r,colRet.cnes));
    const k = chave(cpf,cnes);
    if (processados.has(k)) return; // repetição já contada como ocorrência
    processados.add(k);
    const status = limpo(valor(r,colResultado));
    const incluido = /^(incluido|atualizado) com sucesso\.?$/i.test(normalizarTexto(status));
    const observacao = limpo(valor(r,colObservacao));
    const origem = porChave.get(k);
    if (!origem) {
      resumo.extras_retorno++;
      add("alerta","somente_no_retorno",
        "Vínculo localizado no comprovante do InvestSUS, mas não nesta carga institucional. Confira se o retorno corresponde ao prestador e à competência.",i+2,cpf,cnes);
      return;
    }
    registros.push({cpf,cnes,resultado:status,incluido, ...(observacao ? {observacao}: {})});
    resumo.correspondentes++;
    if (incluido) resumo.incluidos_com_sucesso++;
    else {
      resumo.nao_incluidos++;
      add("alerta","retorno_nao_confirmou_inclusao",
        `O InvestSUS retornou “${status || "sem resultado"}” para este vínculo. Confira o detalhamento oficial; isso não equivale a homologação.`,
        i+2,cpf,cnes,{resultado_retorno:status, ...(observacao ? {observacao_retorno:observacao}: {})});
    }
    const diffs = camposDivergentes(origem,r);
    if (diffs.length) {
      resumo.divergencias_campos++;
      add("erro","divergencia_carga_retorno",
        `Dados diferentes entre a carga da instituição e a confirmação do InvestSUS: ${diffs.join(", ")}. Verifique qual arquivo foi transmitido.`,
        i+2,cpf,cnes,{campos_divergentes:diffs});
    }
  });
  carga.forEach((r,i) => {
    const cpf = somenteDigitos(valor(r,colCarga.cpf)), cnes=somenteDigitos(valor(r,colCarga.cnes));
    if (!porRet.has(chave(cpf,cnes))) {
      resumo.sem_confirmacao++;
      add("alerta","carga_sem_confirmacao",
        "O vínculo existe na carga institucional, mas não foi localizado neste comprovante do envio. Não é possível confirmar que ele tenha sido processado.",
        i+2,cpf,cnes);
    }
  });
  return {registros,ocorrencias,resumo};
}

/** Resumo por vínculo usado na etapa 2: CPF completo somente em memória. */
export function statusRetornoPorChave(registros: LinhaRetornoCarga[]) {
  return new Map(registros.map(r => [chave(r.cpf,r.cnes),r]));
}
