import { describe, expect, it } from "vitest";
import { gerarTextoMemorandoCacon } from "./memorando";
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
  };

  it("só libera a auditoria com os dois documentos SEI válidos", () => {
    expect(etapa1Completa(base)).toBe(true);
    expect(etapa1Completa({ ...base, hmsj_anexo_link: "texto" })).toBe(false);
  });

  it("considera a extração concluída sem críticas bloqueantes", () => {
    expect(etapa2Completa(base)).toBe(true);
    expect(etapa2Completa({ ...base, auditoria: { criticas: 1 } })).toBe(false);
    expect(etapaAtualCacon(base)).toBe(3);
  });

  it("gera o Memorando SMS com documentos, competência e valor extraído", () => {
    const txt = gerarTextoMemorandoCacon({
      ...base,
      sms_memorando_numero: "31029969",
      sms_memorando_data: "2026-09-04",
      portaria_referencia: "Portaria SES/SC nº 68, de 29/01/2014",
      portaria_sei_numero: "0016111061",
    });
    expect(txt).toContain("MEMORANDO SEI Nº 31029969/2026 - SES.UCP.ACP");
    expect(txt).toContain("SEI 0016111061");
    expect(txt).toContain("documentos SEI 30788020 e 30788041");
    expect(txt).toContain("agosto/2026");
    expect(txt).toContain("R$ 51.685,59");
  });
});
