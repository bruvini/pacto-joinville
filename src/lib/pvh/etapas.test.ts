import { describe, expect, it } from "vitest";
import {
  PVH_ETAPAS,
  competenciaValidaPvh,
  etapaAtualPvh,
  etapaLiberadaPvh,
  etapaNavegavelPvh,
  etapaPrincipalPvh,
  prerequisitosEtapaPvh,
} from "./etapas";

describe("fluxo PVH", () => {
  it("valida competência mensal", () => {
    expect(competenciaValidaPvh("10/2026")).toBe(true);
    expect(competenciaValidaPvh("13/2026")).toBe(false);
  });

  it("trabalha com sete etapas após incorporar o FMS à Portaria Municipal", () => {
    expect(PVH_ETAPAS).toHaveLength(7);
    expect(PVH_ETAPAS[3].titulo).toBe("Subempenho e liquidação");
    expect(PVH_ETAPAS[6].titulo).toBe(
      "Encerramento e prestação de contas",
    );
  });

  it("libera Empenhos desde a criação e Pagamento/Comunicação juntos após a Etapa 4", () => {
    expect(etapaLiberadaPvh(3, {})).toBe(true);
    expect(etapaLiberadaPvh(2, {})).toBe(false);
    expect(etapaLiberadaPvh(2, { "1": true })).toBe(true);
    expect(etapaLiberadaPvh(5, { "4": true })).toBe(true);
    expect(etapaLiberadaPvh(6, { "4": true })).toBe(true);
    expect(prerequisitosEtapaPvh(6)).toEqual([4]);
  });

  it("calcula a primeira etapa ainda não concluída no novo fluxo", () => {
    expect(etapaAtualPvh({})).toBe(1);
    expect(etapaAtualPvh({ "1": true, "2": true })).toBe(3);
    expect(etapaAtualPvh({}, "encerrada")).toBe(7);
  });

  it("mantém a navegação operacional baseada em pré-requisitos", () => {
    const concluidas = { "1": true };

    expect(etapaNavegavelPvh(1, concluidas)).toBe(true);
    expect(etapaNavegavelPvh(2, concluidas)).toBe(true);
    expect(etapaNavegavelPvh(3, concluidas)).toBe(true);
    expect(etapaNavegavelPvh(4, concluidas)).toBe(false);
    expect(etapaNavegavelPvh(7, concluidas)).toBe(false);
    expect(etapaNavegavelPvh(8, concluidas)).toBe(false);
  });

  it("prioriza a primeira reconferência válida entre as sete etapas", () => {
    const concluidas = {
      "1": true,
      "2": true,
      "3": true,
      "4": true,
      "5": true,
    };
    const reconferir = [4, 5, 6, 7, 8];

    expect(etapaNavegavelPvh(4, concluidas, reconferir)).toBe(true);
    expect(etapaNavegavelPvh(5, concluidas, reconferir)).toBe(true);
    expect(etapaPrincipalPvh(concluidas, "ativa", reconferir)).toBe(4);
  });

  it("bloqueia dependente quando um pré-requisito está em reconferência", () => {
    const concluidas = {
      "1": true,
      "2": true,
      "3": true,
      "4": true,
    };
    expect(etapaNavegavelPvh(5, concluidas, [4])).toBe(false);
  });
});
