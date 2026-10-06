import { describe, expect, it } from "vitest";
import {
  categoriaProfissional,
  complementoEsperado,
  conciliarCargaInvestsus,
  auditarInvestsus,
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
