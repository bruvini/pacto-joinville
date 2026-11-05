import { describe, expect, it } from "vitest";
import {
  complementoFinanceiroPendente,
  papelFinanceiroComplementarDisponivel,
} from "./assinaturas-ne";
import { readFileSync } from "node:fs";

describe("Emendas — assinatura financeira complementar da Nota de Empenho", () => {
  it("aceita a Secretaria após a Diretoria Financeira", () => {
    const assinaturas = [{ papel: "sefaz" }, { papel: "financeira" }];
    expect(complementoFinanceiroPendente(assinaturas)).toBe(true);
    expect(papelFinanceiroComplementarDisponivel("secretaria", assinaturas)).toBe(true);
    expect(papelFinanceiroComplementarDisponivel("financeira", assinaturas)).toBe(false);
  });

  it("aceita a Diretoria após a Secretaria, mas não edita a primeira", () => {
    const assinaturas = [{ papel: "sefaz" }, { papel: "secretaria" }];
    expect(papelFinanceiroComplementarDisponivel("financeira", assinaturas)).toBe(true);
    expect(papelFinanceiroComplementarDisponivel("secretaria", assinaturas)).toBe(false);
  });

  it("não oferece nova assinatura se ambas já constam ou se nenhuma financeira assinou", () => {
    expect(complementoFinanceiroPendente([{ papel: "financeira" }, { papel: "secretaria" }])).toBe(false);
    expect(complementoFinanceiroPendente([{ papel: "sefaz" }])).toBe(false);
    expect(papelFinanceiroComplementarDisponivel("sefaz", [{ papel: "financeira" }])).toBe(false);
  });

  it("não libera troca ou remoção de assinaturas existentes depois da emissão", () => {
    const matriz = readFileSync(new URL("../../components/emendas/FluxoAssinaturasEmenda.tsx", import.meta.url), "utf8");
    const nota = readFileSync(new URL("../../components/emendas/FluxoNotaEmenda.tsx", import.meta.url), "utf8");
    expect(matriz).toContain("editavel&&!somenteComplementoFinanceiro&&<Button");
    expect(matriz).toContain("papelFinanceiroComplementarDisponivel(o.papel,assinaturas)");
    expect(nota).toContain("somenteComplementoFinanceiro={jaEmitida&&!emRetificacao}");
  });
});

describe("Emendas — formulário do documento comprobatório", () => {
  it("mantém campos com espaço em telas largas e empilha em telas estreitas", () => {
    const fonte = readFileSync(new URL("../../components/emendas/FluxoParcelasEmenda.tsx", import.meta.url), "utf8");
    expect(fonte).toContain("lg:grid-cols-[minmax(240px,290px)_minmax(0,1fr)]");
    expect(fonte).toContain("Número SEI do comprovante");
    expect(fonte).toContain("Link do documento no SEI");
  });
});
