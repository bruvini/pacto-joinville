import { describe, expect, it } from "vitest";
import { simular13PorCnes, type FonteMensalPiso } from "./simulador13";

const mensal = (m: number, por_cnes: Record<string, number>): FonteMensalPiso => ({
  id: String(m), competencia: `${String(m).padStart(2, "0")}/2025`,
  tipo_parcela: "mensal",
  valor_homologado: Object.values(por_cnes).reduce((a,b) => a + b,0),
  portaria_gm_numero: "GM/MS nº 100/2025",
  etapas_concluidas: { "2": true },
  investsus_resumo: { origem_calculo: "edge_function", arquivo_id: "hash-file", por_cnes },
});
const cnes = [
  { prestador_id: "instituicaoA", cnes: "1234567" },
  { prestador_id: "instituicaoA", cnes: "7654321" },
  { prestador_id: "instituicaoB", cnes: "1111111" },
];
const historico = Array.from({ length: 11 }, (_, i) => mensal(i + 1, {
  "1234567": 100 + i, "7654321": 50, "1111111": 0,
}));

describe("conferência interna da 13ª AFC por CNES", () => {
  it("soma 11 competências completas e agrupa dois CNES de uma mesma instituição", () => {
    const r = simular13PorCnes(2025, historico, cnes);
    expect(r.disponivel).toBe(true);
    expect(r.valores.find(v => v.cnes === "1234567")?.media_centesimos).toBe(10500);
    expect(r.porInstituicao.find(v => v.prestador_id === "instituicaoA")?.total_centesimos).toBe(15500);
    expect(r.porInstituicao.find(v => v.prestador_id === "instituicaoB")?.total_centesimos).toBe(0);
  });
  it("não calcula quando alguma competência mensal está ausente", () => {
    const r = simular13PorCnes(2025, historico.slice(0, 10), cnes);
    expect(r.disponivel).toBe(false);
    expect(r.problemas).toContain("Cadastre e processe a competência mensal 11/2025.");
  });
  it("bloqueia CNES ausente em qualquer mês, sem presumir zero", () => {
    const hs = historico.map((v, i) => i === 2 ? mensal(3, { "1234567": 102, "1111111": 0 }) : v);
    const r = simular13PorCnes(2025, hs, cnes);
    expect(r.disponivel).toBe(false);
    expect(r.problemas.some(x => x.includes("CNES 7654321, 03/2025"))).toBe(true);
  });
  it("não usa o método federal de 2025 automaticamente para 2026", () => {
    const r = simular13PorCnes(2026, [], cnes);
    expect(r.disponivel).toBe(false);
    expect(r.problemas.some(x => x.includes("metodologia da 13ª de 2026"))).toBe(true);
  });
  it("recusa competência mensal sem homologação concluída", () => {
    const hs = historico.map((v, i) => i === 4 ? { ...v, etapas_concluidas: {} } : v);
    const r = simular13PorCnes(2025, hs, cnes);
    expect(r.disponivel).toBe(false);
    expect(r.problemas).toContain(
      "Competência 05/2025: Portaria mensal não homologada/concluída no PACTO.",
    );
  });
  it("recusa soma CNES divergente do valor homologado mensal", () => {
    const hs = historico.map((v, i) => i === 6 ? { ...v, valor_homologado: 1 } : v);
    const r = simular13PorCnes(2025, hs, cnes);
    expect(r.disponivel).toBe(false);
    expect(r.problemas).toContain(
      "Competência 07/2025: valores CNES divergentes do homologado mensal.",
    );
  });

  it("bloqueia fonte mensal manual, sem auditoria de arquivo", () => {
    const hs = historico.map((v, i) => i === 2
      ? { ...v, investsus_resumo: { por_cnes: { "1234567": 102 }, origem_calculo: "manual" } }
      : v);
    expect(simular13PorCnes(2025, hs, cnes).disponivel).toBe(false);
  });
  it("impede CNES associado a duas instituições diferentes", () => {
    const r = simular13PorCnes(2025, historico, [
      { prestador_id: "a", cnes: "1234567" }, { prestador_id: "b", cnes: "1234567" },
    ]);
    expect(r.disponivel).toBe(false);
    expect(r.problemas.some(x => x.includes("mais de uma instituição"))).toBe(true);
  });
});
