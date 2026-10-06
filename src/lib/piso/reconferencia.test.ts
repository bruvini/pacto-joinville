import { describe, expect, it } from "vitest";
import { calcularReconferencia, contextoCompleto, reconferenciaMudou } from "./reconferencia";
import { validarConclusao } from "./conclusao";
import type { CtxPiso } from "./regras";

function contexto(): CtxPiso {
  return {
    comp: { competencia: "11/2027", etapas_concluidas: { "1": true }, etapas_reconferir: [] },
    parts: [{ id: "instituicao", prestador_id: "prestador", prestadores: { nome_instituicao: "Instituição" } }],
    obrigs: [],
    docs: [],
    assinaturas: [],
    matriz: [],
    encaminhamentos: [],
    arquivos: [],
    ocorrencias: [],
    cnes: [{ prestador_id: "prestador", cnes: "1234567" }],
  };
}

function completarEtapa1(ctx: CtxPiso) {
  Object.assign(ctx.parts[0], {
    data_envio: "2027-11-01",
    data_retorno: "2027-11-02",
    sem_elegiveis: true,
  });
  Object.assign(ctx.comp, {
    investsus_carga_em: "2027-11-03",
  });
}

describe("integridade das etapas já concluídas", () => {
  it("marca etapa concluída por acidente em qualquer competência, sem apagar conclusão", () => {
    const ctx = contexto();
    expect(calcularReconferencia(ctx)).toEqual([1]);
    expect(ctx.comp.etapas_concluidas).toEqual({ "1": true });
    expect(ctx.comp.etapas_reconferir).toEqual([]);
  });
  it("recalcula todas as etapas concluídas, não apenas a Etapa 1", () => {
    const ctx = contexto();
    ctx.comp.etapas_concluidas = { "1": true, "2": true, "3": true, "4": true };
    expect(calcularReconferencia(ctx)).toEqual([1, 2, 3, 4]);
  });
  it("preserva marcações dos triggers até reconferência explícita", () => {
    const ctx = contexto();
    completarEtapa1(ctx);
    ctx.comp.etapas_reconferir = [4, 1];
    expect(calcularReconferencia(ctx)).toEqual([1, 4]);
    expect(() => validarConclusao(1, ctx)).not.toThrow();
    expect(() => validarConclusao(2, ctx)).toThrow("reconferência das etapas anteriores: 1");
  });
  it("não marca etapas ainda não concluídas nem concluições válidas", () => {
    const ctx = contexto();
    completarEtapa1(ctx);
    expect(calcularReconferencia(ctx)).toEqual([]);
    ctx.comp.etapas_concluidas = {};
    ctx.parts[0].data_retorno = null;
    expect(calcularReconferencia(ctx)).toEqual([]);
  });
  it("marca nova pendência em dados upstream que invalidam uma conclusão", () => {
    const ctx = contexto();
    completarEtapa1(ctx);
    expect(calcularReconferencia(ctx)).toEqual([]);
    ctx.parts[0].data_retorno = null;
    expect(calcularReconferencia(ctx)).toEqual([1]);
    expect(() => validarConclusao(2, ctx)).toThrow("reconferência");
  });
  it("bloqueia avanço mesmo antes da persistência de etapas_reconferir", () => {
    const ctx = contexto();
    Object.assign(ctx.comp, {
      credito_fms_data: "2027-11-10",
      credito_fms_valor: 100,
      credito_fms_referencia: "OB",
    });
    ctx.comp.etapas_concluidas = { "1": true, "2": true, "3": true };
    expect(() => validarConclusao(4, ctx)).toThrow("etapas anteriores: 1, 2, 3");
  });
  it("não grava novamente a mesma lista, independentemente de sua ordem", () => {
    expect(reconferenciaMudou([3, 1], [1, 3])).toBe(false);
    expect(reconferenciaMudou([1], [1])).toBe(false);
    expect(reconferenciaMudou([], [1])).toBe(true);
    expect(reconferenciaMudou(null, [])).toBe(false);
  });
  it("não valida contexto parcial como completo", () => {
    expect(contextoCompleto(undefined)).toBe(false);
    const ctx = contexto();
    expect(contextoCompleto(ctx)).toBe(true);
    delete ctx.arquivos;
    expect(contextoCompleto(ctx)).toBe(false);
    expect(() => validarConclusao(1, ctx)).toThrow("carregamento completo");
  });
  it("permite reconferir o encerramento sem bloquear pela própria marcação", () => {
    const ctx = contexto();
    ctx.comp.etapas_concluidas = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [String(i + 1), true]),
    );
    ctx.comp.etapas_reconferir = [8];
    ctx.comp.relatorio_gerado_em = "2027-11-30";
    completarEtapa1(ctx);
    // Etapas 2 e 3 não têm contexto válido: continuam bloqueando o encerramento.
    expect(() => validarConclusao(8, ctx)).toThrow("reconferência das etapas anteriores");
    expect(() => validarConclusao(8, ctx)).not.toThrow("Há etapas marcadas para reconferência.");
  });
});
