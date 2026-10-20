import { describe, expect, it } from "vitest";
import { compararCamposExtraidos, lerMoeda, resumoSnapshot } from "./auditoria-documental";

describe("conferência financeira assistida",()=>{
  it("interpreta moeda brasileira com centavos sem confundir milhares",()=>{
    expect(lerMoeda("R$ 1.234,56")).toBe(1234.56);
    expect(lerMoeda("1234.56")).toBe(1234.56);
    expect(lerMoeda("R$ 10.000")).toBe(10000);
    expect(lerMoeda("não encontrado")).toBeNull();
  });
  it("separa as divergências dos valores iguais",()=>{
    const referencia=resumoSnapshot({
      numero_empenho:"2026NE0001",competencia:"10/2026",
      valor_solicitado:1250.25,valor_atestado:1200,
      data_pagamento:"2026-10-09",
    });
    const d=compararCamposExtraidos([
      {campo:"numero_empenho",valor:"2026NE0002",pagina:1,evidencia:"Empenho n. 2026NE0002"},
      {campo:"valor_solicitado",valor:"R$ 1.250,25",pagina:1},
      {campo:"valor_atestado",valor:"R$ 1.125,00",pagina:2},
      {campo:"data_pagamento",valor:"09/10/2026",pagina:2},
    ],referencia);
    expect(d.map(x=>x.campo)).toEqual(["numero_empenho","valor_atestado"]);
    expect(d.every(x=>x.gravidade==="critica")).toBe(true);
  });
  it("não trata campo ausente ou ilegível como divergência comprovada",()=>{
    expect(compararCamposExtraidos([
      {campo:"valor_liquidado",valor:"R$ 42,00"},
      {campo:"valor_atestado",valor:"ilegível"},
      {campo:"competencia",valor:""},
    ],{valor_liquidado:null,valor_atestado:4200,competencia:"10/2026"})).toEqual([]);
  });
});
