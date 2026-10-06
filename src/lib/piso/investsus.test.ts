import { describe, expect, it } from "vitest";
import {
  categoriaProfissional,
  complementoEsperado,
  conciliarCargaInvestsus,
  auditarInvestsus,
  INVESTSUS_AUDIT_RULES_VERSION,
  type RegistroInvestsus,
} from "./investsus";
import type { RegistroCarga } from "./planilha";

const carga = (patch: Partial<RegistroCarga> = {}): RegistroCarga => ({
  linha: 2,
  cpf: "52998224725",
  cpf_mascarado: "***.982.247-**",
  cnes: "1234567",
  cbo: "322205",
  jornada: 44,
  salario_base: 3325,
  nome: "Pessoa",
  categoria: "tecnico",
  valido: true,
  regras: [],
  ...patch,
});
const invest = (patch: Partial<RegistroInvestsus> = {}): RegistroInvestsus => ({
  linha: 2,
  cpf: "52998224725",
  cpf_mascarado: "***.982.247-**",
  cnpj: "19131243000197",
  cnes: "1234567",
  cbo: "Técnico de enfermagem",
  categoria: "tecnico",
  jornada: 44,
  nome: "Pessoa",
  empregador: "Instituição",
  valor_piso: 3325,
  valor_base: 3325,
  complemento: 0,
  valido: true,
  ...patch,
});

describe("auditoria cruzada do InvestSUS", () => {
  it("mantém versão explícita das regras para invalidar auditorias antigas", () => {
    expect(INVESTSUS_AUDIT_RULES_VERSION).toBeGreaterThan(0);
  });

  it("aceita a estrutura real do InvestSUS com CBO por descrição e sem coluna de jornada", () => {
    const resultado = auditarInvestsus([
      {
        "CNPJ EMPREGADOR": "83791848000294",
        "NOME EMPREGADOR": "BANCO DE OLHOS DE JOINVILLE",
        CBO: "Técnico de enfermagem",
        "CNES EMPREGADOR": "7728557",
        "CPF PROFISSIONAL": "52998224725",
        "NOME PROFISSIONAL": "PESSOA TESTE",
        "VALOR PISO PROFISSIONAL": 3325,
        "VALOR BASE PARA CALCULO DO COMPLEMENTO": 2908.83,
        "COMPLEMENTO MENSAL UNIÃO": 416.17,
      },
    ]);
    expect(resultado.resumo.erros).toBe(0);
    expect(resultado.resumo.alertas).toBe(0);
    expect(resultado.registros[0].categoria).toBe("tecnico");
    expect(resultado.registros[0].jornada).toBeNull();
  });

  it("separa ausência sem complemento e divergência real de salário-base sem duplicar crítica", () => {
    const resultado = conciliarCargaInvestsus(
      [
        carga({ cpf: "52998224725", salario_base: 3216.38 }),
        carga({ cpf: "39053344705", salario_base: 4002.72 }),
        carga({ cpf: "16899535009", salario_base: 2500 }),
      ],
      [
        invest({
          cpf: "16899535009",
          valor_base: 2750,
          valor_piso: 3325,
          complemento: 575,
        }),
      ],
    );
    expect(resultado.resumo.criticas).toBe(2);
    expect(resultado.resumo.sem_complemento).toBe(1);
    expect(
      resultado.ocorrencias.filter((o) => o.regra === "salario_divergente"),
    ).toHaveLength(1);
    expect(
      resultado.ocorrencias.filter((o) => o.regra === "complemento_divergente"),
    ).toHaveLength(0);
  });
  it("normaliza CBO e descrição para a mesma categoria", () => {
    expect(categoriaProfissional("322205")).toBe("tecnico");
    expect(categoriaProfissional("Técnico de enfermagem")).toBe("tecnico");
    expect(categoriaProfissional("223505")).toBe("enfermeiro");
    expect(categoriaProfissional("Enfermeiro")).toBe("enfermeiro");
  });
  it("classifica ausência sem complemento como informação", () => {
    const r = conciliarCargaInvestsus([carga()], []);
    expect(r.resumo.criticas).toBe(0);
    expect(r.resumo.sem_complemento).toBe(1);
  });
  it("classifica ausência com valor devido como crítica", () => {
    const r = conciliarCargaInvestsus([carga({ salario_base: 1000 })], []);
    expect(complementoEsperado("tecnico", 44, 1000)).toBe(2325);
    expect(r.resumo.criticas).toBe(1);
  });
  it("não cria crítica adicional para linha com erro de origem", () => {
    const r = conciliarCargaInvestsus([carga({ valido: false, regras: ["cbo_inelegivel"] })], []);
    expect(r.resumo.criticas).toBe(0);
    expect(r.resumo.fora_conciliacao).toBe(1);
  });
  it("considera registro somente no InvestSUS uma crítica", () => {
    expect(conciliarCargaInvestsus([], [invest()]).resumo.criticas).toBe(1);
  });

  it("usa o valor-base do próprio InvestSUS ao conferir o complemento de um registro localizado", () => {
    const resultado = conciliarCargaInvestsus(
      [carga({ salario_base: 2500 })],
      [invest({ valor_base: 3000, valor_piso: 3325, complemento: 325 })],
    );
    expect(resultado.ocorrencias.some((o) => o.regra === "salario_divergente")).toBe(true);
    expect(resultado.ocorrencias.some((o) => o.regra === "complemento_divergente")).toBe(false);
  });

  it("trata múltiplos vínculos em CNES distintos como alerta e duplicidade no mesmo CNES como crítica", () => {
    const outroCnes = invest({ linha: 3, cnes: "7654321" });
    const multiplos = conciliarCargaInvestsus([], [invest(), outroCnes]);
    expect(multiplos.ocorrencias.some((o) => o.regra === "multiplos_vinculos" && o.severidade === "alerta")).toBe(true);

    const duplicado = conciliarCargaInvestsus([], [invest(), invest({ linha: 3 })]);
    expect(duplicado.ocorrencias.some((o) => o.regra === "duplicidade_investsus" && o.severidade === "erro")).toBe(true);
  });

  it("considera CPF e CNES repetidos uma duplicidade crítica mesmo com CNPJ diferente", () => {
    const base = {
      "CPF PROFISSIONAL": "52998224725",
      "CNES EMPREGADOR": "1234567",
      CBO: "223505",
      "CNPJ EMPREGADOR": "19131243000197",
      "JORNADA SEMANAL": 44,
      "VALOR PISO PROFISSIONAL": 4750,
      "VALOR BASE PARA CÁLCULO": 4000,
      "COMPLEMENTO MENSAL UNIÃO": 750,
    };
    const resultado = auditarInvestsus([base, { ...base, "CNPJ EMPREGADOR": "82653800000156" }]);
    expect(resultado.ocorrencias.some((o) => o.regra === "duplicidade_investsus")).toBe(true);
  });
});
