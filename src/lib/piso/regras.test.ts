import { describe, it, expect } from "vitest";
import { urlDouValida, iguaisCentavo, soma, pendenciasEtapa, docCompleto, encaminhado } from "./regras";
import { auditarPlanilha, cpfValido } from "./planilha";

const base = { comp: { etapas_concluidas: {} }, parts: [], obrigs: [], docs: [], assinaturas: [], matriz: [], encaminhamentos: [] } as any;

describe("regras piso", () => {
  it("valida URL do DOU", () => {
    expect(urlDouValida("https://www.in.gov.br/web/dou/-/portaria-1")).toBe(true);
    expect(urlDouValida("http://www.in.gov.br/web/dou/x")).toBe(false);
    expect(urlDouValida("https://in.gov.br.evil.com/web/dou/x")).toBe(false);
    expect(urlDouValida("https://www.in.gov.br/outra")).toBe(false);
  });
  it("concilia centavo a centavo", () => {
    expect(iguaisCentavo(0.1 + 0.2, 0.3)).toBe(true);
    expect(iguaisCentavo(10, 10.01)).toBe(false);
    expect(soma([0.1, 0.2, null])).toBe(0.3);
  });
  it("etapa 2 exige justificativa quando diverge", () => {
    const comp = { portaria_gm_numero: "1", portaria_gm_data_publicacao: "2026-01-01", portaria_gm_url_dou: "https://www.in.gov.br/web/dou/x", valor_homologado: 100, valor_apurado_investsus: 99 };
    expect(pendenciasEtapa(2, { ...base, comp })).toContain("Valores divergentes: registre a justificativa formal.");
    expect(pendenciasEtapa(2, { ...base, comp: { ...comp, justificativa_conciliacao: "ok" } })).toEqual([]);
  });
  it("documento completo exige assinaturas obrigatórias", () => {
    const doc = { id: "d", tipo: "minuta", participante_id: null, obrigacao_id: null, numero_sei: "1", link_sei: null };
    const matriz = [{ tipo_documento: "minuta", slot_key: "g", opcional: false }];
    expect(docCompleto({ matriz, assinaturas: [] }, doc)).toBe(false);
    expect(docCompleto({ matriz, assinaturas: [{ documento_id: "d", slot: "g" }] }, doc)).toBe(true);
  });
  it("encaminhamento considera a última ação", () => {
    const e = [{ documento_id: "d", acao: "encaminhado", ocorrido_em: "1" }, { documento_id: "d", acao: "revertido", ocorrido_em: "2" }];
    expect(encaminhado(e, "d")).toBe(false);
  });
  it("etapa 4 trava rateio", () => {
    const parts = [{ id: "p", situacao: "retornado", valor_devido: 100, valor_recurso_atual: 60, valor_saldo_afc: 30 }];
    const comp = { credito_fms_data: "2026-01-01", credito_fms_valor: 100, total_publicado_municipal: 100, saldo_afc_anterior: 50 };
    expect(pendenciasEtapa(4, { ...base, comp, parts }).some((x) => x.includes("≠ valor devido"))).toBe(true);
  });
});

describe("planilha de carga", () => {
  it("valida CPF", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("111.111.111-11")).toBe(false);
  });
  it("audita linhas", () => {
    const r = auditarPlanilha([
      { CPF: "52998224725", CNES: "123", CBO: "2235", Jornada: 30, Salário: 5000, Categoria: "Enfermeiro" },
      { CPF: "52998224725", CNES: "", CBO: "", Jornada: 80, Salário: 0, Categoria: "Técnico" },
    ]);
    expect(r.cpfs_duplicados).toBe(1);
    expect(r.sem_cnes).toBe(1);
    expect(r.jornada_invalida).toBe(1);
    expect(r.salario_invalido).toBe(1);
    expect(r.por_categoria.Enfermeiro).toBe(1);
  });
});
