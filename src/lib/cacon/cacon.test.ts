import { describe, expect, it } from "vitest";
import { gerarHtmlMemorandoCacon, gerarTextoMemorandoCacon } from "./memorando";
import { etapa1Completa, etapa2Completa, etapaAtualCacon } from "./etapas";

describe("Dieta CACON", () => {
  const base = {
    competencia: "08/2026",
    data_recebimento: "2026-09-03",
    hmsj_memorando_numero: "30788020",
    hmsj_memorando_link: "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=documento_visualizar&id_documento=1",
    hmsj_anexo_numero: "30788041",
    hmsj_anexo_link: "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=documento_visualizar&id_documento=2",
    processado_em: "2026-09-03T14:00:00Z",
    total_unidades: 3527,
    valor_fornecido: 51685.59,
    auditoria: { criticas: 0, alertas: 0 },
    extracao: { confirmada_em: "2026-09-03T14:05:00Z" },
  };

  it("só libera a auditoria com os dois documentos SEI válidos", () => {
    expect(etapa1Completa(base)).toBe(true);
    expect(etapa1Completa({ ...base, hmsj_anexo_link: "texto" })).toBe(false);
  });

  it("só conclui a auditoria após conferência humana e sem críticas bloqueantes", () => {
    expect(etapa2Completa(base)).toBe(true);
    expect(etapa2Completa({ ...base, extracao: {} })).toBe(false);
    expect(etapa2Completa({ ...base, auditoria: { criticas: 1 } })).toBe(false);
    expect(etapaAtualCacon(base)).toBe(3);
  });

  it("preserva competências históricas já concluídas como conferidas", () => {
    expect(
      etapa2Completa({ ...base, extracao: {}, status: "concluida" }),
    ).toBe(true);
  });

  it("gera o Memorando SMS com documentos, competência e valor extraído", () => {
    const txt = gerarTextoMemorandoCacon({
      ...base,
      sms_memorando_numero: "31029969",
      sms_memorando_data: "2026-09-04",
      portaria_referencia: "Portaria SES/SC nº 68, de 29/01/2014",
      portaria_sei_numero: "0016111061",
    });
    const html = gerarHtmlMemorandoCacon({
      ...base,
      sms_memorando_numero: "31029969",
      sms_memorando_data: "2026-09-04",
      portaria_referencia: "Portaria SES/SC nº 68, de 29/01/2014",
      portaria_sei_numero: "0016111061",
    });
    // O editor do SEI inclui número e data no cabeçalho automaticamente.
    expect(txt.startsWith("À Gerência Financeira (SES.UFI)")).toBe(true);
    expect(txt).not.toMatch(/^MEMORANDO SEI Nº/m);
    expect(txt).not.toContain("Joinville, 4 de setembro de 2026.");
    expect(html).toMatch(/<div[^>]*>\s*<p[^>]*><strong>À Gerência Financeira \(SES\.UFI\)<\/strong><\/p>/);
    expect(html).not.toContain("Joinville, 4 de setembro de 2026.");
    expect(html).not.toContain("MEMORANDO SEI Nº 31029969/2026 - SES.UCP.ACP");
    expect(txt).toContain("SEI 0016111061");
    expect(txt).toContain("Memorando SEI Nº 30788020/2026 - HMSJ.SUP.NUT");
    expect(txt).toContain("Relatório de Dietas fornecidas");
    expect(txt).toContain("(30788041)");
    expect(txt).toContain("agosto/2026");
    expect(txt).toContain("R$ 51.685,59");
    // A identificação do memorando continua na tabela do corpo.
    expect(txt).toContain("Memorando SEI SES.UCP.ACP 31029969/2026");
  });
});
