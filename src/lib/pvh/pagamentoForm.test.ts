import { describe, expect, it } from "vitest";
import {
  erroCronologiaPagamentoPvh, hidratarPagamentoPvh,
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
  it("aceita a mesma data ou pagamento posterior à programação", () => {
    expect(erroCronologiaPagamentoPvh(base)).toBe(null);
    expect(erroCronologiaPagamentoPvh({ ...base, data_pagamento: "2026-09-10" })).toBe(null);
    expect(pagamentoCompletoPvh(base)).toBe(true);
  });

  it("explica cronologia inválida preservando as datas digitadas", () => {
    const digitado = { ...base, data_pagamento: "2026-09-01" };
    expect(erroCronologiaPagamentoPvh(digitado)).toContain("não pode ser anterior");
    expect(digitado.data_pagamento).toBe("2026-09-01");
    expect(pagamentoCompletoPvh(digitado)).toBe(false);
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

  it("aceita pagamento parcial enquanto a segunda data não foi digitada", () => {
    expect(erroCronologiaPagamentoPvh({ ...base, data_pagamento: "" })).toBeNull();
  });
});
