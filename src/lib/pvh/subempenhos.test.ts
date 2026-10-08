import { describe, expect, it } from "vitest";
import {
  coberturaSubempenhoFechadaPvh,
  saldoSubempenharPvh,
  totalSubempenhadoPvh,
} from "./subempenhos";

describe("fluxos de subempenho do PVH", () => {
  it("fecha uma NE com um único fluxo", () => {
    const fluxos = [{ valor: 600000 }];
    expect(totalSubempenhadoPvh(fluxos)).toBe(600000);
    expect(saldoSubempenharPvh(600000, fluxos)).toBe(0);
    expect(coberturaSubempenhoFechadaPvh(600000, fluxos)).toBe(true);
  });

  it("permite fracionar uma mesma NE em mais de um fluxo", () => {
    const fluxos = [{ valor: 400000 }, { valor: 240000 }];
    expect(totalSubempenhadoPvh(fluxos)).toBe(640000);
    expect(saldoSubempenharPvh(640000, fluxos)).toBe(0);
    expect(coberturaSubempenhoFechadaPvh(640000, fluxos)).toBe(true);
  });

  it("mantém a NE pendente enquanto houver saldo sem fluxo", () => {
    const fluxos = [{ valor: 400000 }];
    expect(saldoSubempenharPvh(640000, fluxos)).toBe(240000);
    expect(coberturaSubempenhoFechadaPvh(640000, fluxos)).toBe(false);
  });
});
