import { describe, it, expect } from "vitest";
import { acessosCompetenciaPvh } from "./acesso";
const comp = { portaria_estadual_numero: "2881/2026", portaria_estadual_data: "2026-08-24", portaria_estadual_url: "https://doe.sc.gov.br" };
const participantes = [
  { id: "a", valor_estadual: 1240000 },
  { id: "b", valor_estadual: 1775502.09 },
];
const alocacoes = participantes.map((p) => ({
  participante_id: p.id, valor_alocado: p.valor_estadual,
  pvh_empenhos: { numero_ne: "4083/2026", status: "ativo" },
}));
const acesso = (patch: any = {}) => acessosCompetenciaPvh({
  competencia: comp, participantes, alocacoes: [], concluidas: {}, reconferir: [], ...patch,
});

describe("liberação dinâmica das sete etapas PVH", () => {
  it("abre Etapas 1 e 3 ao criar a competência", () => {
    expect(acesso({ competencia: {} })).toMatchObject({
      1: true, 2: false, 3: true, 4: false, 5: false, 6: false, 7: false,
    });
  });
  it("libera Etapa 2 só com os dados completos e válidos da Etapa 1", () => {
    expect(acesso()[2]).toBe(true);
    expect(acesso({ participantes: [{ id: "a", valor_estadual: 0 }] })[2]).toBe(false);
    expect(acesso({ competencia: { ...comp, portaria_estadual_url: "" } })[2]).toBe(false);
  });
  it("Etapa 4 exige NE emitida vinculada em cada instituição, sem exigir a conclusão da 3", () => {
    expect(acesso({ alocacoes })[4]).toBe(true);
    expect(acesso({ alocacoes: alocacoes.slice(0, 1) })[4]).toBe(false);
    expect(acesso({ alocacoes: [{ ...alocacoes[0], pvh_empenhos: { status: "ativo", numero_ne: "" } }, alocacoes[1]] })[4]).toBe(false);
  });
  it("Etapas 5 e 6 são liberadas juntas após conclusão da 4", () => {
    expect(acesso({ alocacoes, concluidas: { 4: true } })).toMatchObject({ 5: true, 6: true });
    expect(acesso({ alocacoes, concluidas: { 4: true }, reconferir: [4] })).toMatchObject({ 5: false, 6: false });
  });
  it("Etapa 7 exige todas as anteriores concluídas e sem reconferência", () => {
    const todas = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };
    expect(acesso({ alocacoes, concluidas: todas })[7]).toBe(true);
    expect(acesso({ alocacoes, concluidas: todas, reconferir: [2] })[7]).toBe(false);
  });
  it("mantém consulta histórica disponível quando a competência está encerrada", () => {
    expect(acesso({ competencia: { status: "encerrada" } })[7]).toBe(true);
    expect(acesso({ competencia: { status: "encerrada" } })[4]).toBe(true);
  });
});
