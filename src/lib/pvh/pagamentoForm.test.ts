import { describe, expect, it } from "vitest";
import {
  hidratarPagamentoPvh,
  pagamentoCompletoPvh, patchPagamentoPvh,
} from "./pagamentoForm";

const base = hidratarPagamentoPvh({
  programacao_sei_numero: "123",
  programacao_sei_link: "https://sei.joinville.sc.gov.br/programacao",
  comprovante_sei_numero: "456",
  comprovante_sei_link: "https://sei.joinville.sc.gov.br/comprovante",
  data_programacao: "2026-09-10",
  data_pagamento: "2026-09-15",
  valor_pago: 100,
});

describe("persistência segura do pagamento PVH", () => {
  it("aceita pagamento anterior, igual ou posterior à programação", () => {
    expect(pagamentoCompletoPvh({ ...base, data_pagamento: "2026-08-07", data_programacao: "2026-08-19" })).toBe(true);
    expect(pagamentoCompletoPvh({ ...base, data_pagamento: "2026-09-10" })).toBe(true);
    expect(pagamentoCompletoPvh(base)).toBe(true);
  });

  it("não modifica as datas reais informadas pela SEFAZ", () => {
    const digitado = { ...base, data_programacao: "2026-08-19", data_pagamento: "2026-08-07" };
    expect(patchPagamentoPvh(digitado, base)).toMatchObject({
      data_programacao: "2026-08-19",
      data_pagamento: "2026-08-07",
    });
  });

  it("salva as duas datas juntas quando ambas mudaram", () => {
    expect(patchPagamentoPvh({
      ...base, data_programacao: "2026-10-02", data_pagamento: "2026-10-04",
    }, base)).toEqual({
      data_programacao: "2026-10-02", data_pagamento: "2026-10-04",
    });
  });

  it("não sobrescreve outros campos ou grava novamente o que não mudou", () => {
    expect(patchPagamentoPvh(base, base)).toEqual({});
    expect(patchPagamentoPvh({ ...base, comprovante_sei_numero: "999" }, base))
      .toEqual({ comprovante_sei_numero: "999" });
  });

  it("continua exigindo ambas as datas para concluir", () => {
    expect(pagamentoCompletoPvh({ ...base, data_pagamento: "" })).toBe(false);
    expect(pagamentoCompletoPvh({ ...base, data_programacao: "" })).toBe(false);
  });
});
