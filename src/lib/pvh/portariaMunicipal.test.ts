import { describe, expect, it } from "vitest";
import { gerarMinutaPortariaPvh, gerarMemorandoPortariaPvh } from "./portariaMunicipal";

const base = {
  competencia: "10/2026",
  portariaEstadualNumero: "3531",
  portariaEstadualData: "2026-10-21",
  portariaEstadualUrl: "https://www.saude.sc.gov.br/portaria?id=12&documento=33",
  normativaNumero: "416/CIB/2026",
  normativaData: "2026-06-17",
};
describe("Documentos públicos PVH formatados para o SEI", () => {
  it("minuta: conserva formatação pública e links mensais em todas as três referências", () => {
    const doc = gerarMinutaPortariaPvh({
      ...base, numeroMinutaSei: "31405303", autoridadeNome: "Autoridade",
      autoridadeCargo: "Secretária da Saúde",
      linhas: [{ cnes: "1234567", nome: "Hospital Exemplo", valor: 1500 }],
    });
    expect((doc.html.match(/<a href=/g) ?? []).length).toBe(3);
    expect(doc.html).toContain("id=12&amp;documento=33");
    expect(doc.html).toContain("text-align:justify");
    expect(doc.html).toContain("text-indent:28pt");
    expect(doc.html).toContain("ANEXO I");
    expect(doc.html).toContain("border-collapse:collapse");
    expect(doc.texto).toContain("Portaria SES nº 3531, de 21 de outubro de 2026");
    expect(doc.texto).not.toContain("<a ");
  });
  it("memorando: cita a Portaria mensal com link e não injeta HTML no texto", () => {
    const doc = gerarMemorandoPortariaPvh({
      ...base, numeroMemorandoSei: "31405304", numeroMinutaSei: "31405303",
      destinatarios: [{unidade:"SES.UAP",nome:"Ana",cargo:"Gerente"}],
    });
    expect((doc.html.match(/<a href=/g) ?? []).length).toBe(1);
    expect(doc.html).toContain('text-align:justify');
    expect(doc.html).toContain("Portaria SES nº 3531");
    expect(doc.texto).not.toContain("<a ");
  });
  it("URL ausente ou maliciosa não vira hyperlink", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,abc", "", undefined]) {
      const doc = gerarMinutaPortariaPvh({
        ...base, portariaEstadualUrl:url,
        linhas: [{cnes:"1",nome:"<script>alert(1)</script>",valor:1}],
      });
      expect(doc.html).not.toContain("<a href=");
      expect(doc.html).not.toContain("<script>");
      expect(doc.html).toContain("&lt;script&gt;");
    }
  });
});
