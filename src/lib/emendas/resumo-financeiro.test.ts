import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { descreverSituacaoFinanceiraEmenda } from "./resumo-financeiro";

describe("Emendas — situação financeira explicada", () => {
  it("explica limite totalmente comprometido em NE, sem confundir com pagamento", () => {
    const s = descreverSituacaoFinanceiraEmenda({
      limiteVigente: 510000, reservado: 0, empenhado: 510000, disponivel: 0,
    });
    expect(s.titulo).toBe("Recurso integralmente comprometido");
    expect(s.percentual).toBe(100);
    expect(s.distribuicao.ne).toBe(100);
    expect(s.distribuicao.reserva).toBe(0);
    expect(s.narrativa).toContain("510.000,00");
    expect(s.narrativa).toContain("Não há solicitações de empenho em reserva.");
    expect(s.narrativa).toContain("Não há saldo disponível");
    expect(s.narrativa).not.toMatch(/pago|pagamento realizado/i);
  });

  it("distingue reserva aguardando NE do empenho já registrado", () => {
    const s = descreverSituacaoFinanceiraEmenda({
      limiteVigente: 510000, reservado: 50000, empenhado: 400000, disponivel: 60000,
    });
    expect(s.titulo).toBe("Recurso parcialmente comprometido");
    expect(s.percentual).toBe(88);
    expect(s.narrativa).toContain("50.000,00");
    expect(s.narrativa).toContain("solicitações aguardando NE");
    expect(s.narrativa).toContain("60.000,00");
  });

  it("destaca valor registrado acima do limite em vez de chamá-lo disponível", () => {
    const s = descreverSituacaoFinanceiraEmenda({
      limiteVigente: 500000, reservado: 20000, empenhado: 500000, disponivel: -20000,
    });
    expect(s.titulo).toBe("Comprometimento acima do limite");
    expect(s.percentual).toBeGreaterThan(100);
  });

  it("mantém dados de referência visíveis acima da lista de lançamentos", () => {
    const texto = readFileSync(
      new URL("../../routes/_authenticated/emendas.$id.tsx", import.meta.url), "utf8",
    );
    expect(texto).toContain("<ResumoFinanceiroEmenda valores={{");
    expect(texto).toContain("Vinculação, portarias e regras de referência");
    expect(texto).not.toContain('<details className="rounded-lg border bg-card">');
    expect(texto.indexOf('id="referencia-emenda"'))
      .toBeLessThan(texto.indexOf("<ExecucaoEmenda emendaId={id}"));
  });
});
