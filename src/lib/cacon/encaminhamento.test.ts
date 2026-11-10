import { describe, expect, it } from "vitest";
import { pendenciasEncaminhamentoCacon } from "./encaminhamento";

const base = {
  competencia: "10/2026",
  processado_em: "2026-11-10T17:00:00Z",
  valor_fornecido: 36332.77,
  total_unidades: 2724,
  extracao: { confirmada_em: "2026-11-10T18:00:00Z" },
  auditoria: { criticas: 0 },
  sms_memorando_numero: "31567825",
  sms_memorando_link: "https://sei.joinville.sc.gov.br/sei/controlador.php?id=123",
  sms_memorando_data: null,
  portaria_referencia: "Portaria SES/SC nº 68, de 29/01/2014",
  portaria_sei_numero: "0016111061",
};

const assinatura = [{ slot: "fiscal", servidor_nome: "Fiscal" }];

describe("CACON — liberação do encaminhamento à SES.UFI", () => {
  it("libera com assinatura fiscal e Memorando completo, mesmo sem data gravada", () => {
    expect(pendenciasEncaminhamentoCacon(base, assinatura)).toEqual([]);
  });

  it("não considera assinatura fiscal registrada como motivo de bloqueio", () => {
    expect(pendenciasEncaminhamentoCacon(base, assinatura))
      .not.toContain("Registre ao menos uma assinatura fiscal.");
  });

  it("bloqueia se a assinatura fiscal não existir", () => {
    expect(pendenciasEncaminhamentoCacon(base, [])).toEqual([
      "Registre ao menos uma assinatura fiscal.",
    ]);
  });

  it("bloqueia se a auditoria ou conferência humana estiver pendente", () => {
    expect(pendenciasEncaminhamentoCacon({
      ...base, extracao: { confirmada_em: null },
    }, assinatura)).toContain("Conclua a conferência da produção CACON.");
  });

  it("informa o campo SEI faltante, sem apenas desabilitar o botão", () => {
    const pendencias = pendenciasEncaminhamentoCacon({
      ...base, sms_memorando_numero: "", sms_memorando_link: "inválido",
    }, assinatura);
    expect(pendencias).toEqual([
      "Informe o Nº SEI do Memorando SMS.",
      "Informe o link válido do Memorando SMS no SEI.",
    ]);
  });

  it("continua exigindo base normativa e referência da Portaria", () => {
    const pendencias = pendenciasEncaminhamentoCacon({
      ...base, portaria_referencia: "", portaria_sei_numero: null,
    }, assinatura);
    expect(pendencias).toEqual([
      "Confira a base normativa.",
      "Informe o Nº SEI da Portaria.",
    ]);
  });
});
