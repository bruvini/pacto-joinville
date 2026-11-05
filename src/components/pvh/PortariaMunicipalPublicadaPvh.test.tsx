import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const fonte = readFileSync(
  new URL("./PortariaMunicipalPublicadaPvh.tsx", import.meta.url),
  "utf8",
);

describe("PVH — Portaria Municipal publicada (Etapa 2)", () => {
  it("mostra número da Portaria, data de publicação, número SEI e link SEI na mesma linha em desktop", () => {
    expect(fonte).toContain("Número da Portaria");
    expect(fonte).toContain("Data de publicação");
    expect(fonte).toContain("Número SEI");
    expect(fonte).toContain("Link SEI");
    expect(fonte).toContain("xl:grid-cols-[minmax(160px,1fr)_minmax(170px,0.85fr)_minmax(150px,0.9fr)_minmax(300px,2fr)]");
  });

  it("inicializa, sincroniza e salva o número SEI no documento original", () => {
    expect(fonte).toContain("numero_sei: documento?.numero_sei ??");
    expect(fonte).toContain("numero_sei: form.numero_sei,");
    expect(fonte).toContain("numero_sei: form.numero_sei.trim() || null");
    expect(fonte).toContain("value={form.numero_sei}");
    expect(fonte).toContain('onBlur={() => void salvar()}');
    expect(fonte).toContain('.from("pvh_documentos")');
  });

  it("não mistura número da Portaria com número SEI nem exige SQL adicional", () => {
    expect(fonte).toContain("numero: form.numero.trim() || null");
    expect(fonte).toContain("numero_sei: form.numero_sei.trim() || null");
    expect(fonte).toContain("portaria_municipal_numero: form.numero.trim() || null");
  });
});
