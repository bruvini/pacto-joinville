import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PagamentoPvhCard } from "./PagamentoPvhCard";

describe("renderização da parcela PVH", () => {
  it("abre os campos de pagamento sem referência a variáveis removidas", () => {
    const pagamento = {
      id: "parcela-teste",
      programacao_sei_numero: "30753624",
      programacao_sei_link: "https://sei.joinville.sc.gov.br/programacao",
      comprovante_sei_numero: "30753625",
      comprovante_sei_link: "https://sei.joinville.sc.gov.br/comprovante",
      data_programacao: "2026-08-19",
      data_pagamento: "2026-08-07",
      valor_pago: 1240000,
    };

    const html = renderToStaticMarkup(
      <PagamentoPvhCard pagamento={pagamento} podeEditar={true} onChange={() => {}} />,
    );

    expect(html).toContain("Data da programação de pagamento");
    expect(html).toContain("Data do pagamento");
    expect(html).toContain('value="2026-08-19"');
    expect(html).toContain('value="2026-08-07"');
    expect(html).toContain("Completo");
  });
});
