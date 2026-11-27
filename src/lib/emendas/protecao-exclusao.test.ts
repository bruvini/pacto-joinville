import { describe, expect, it } from "vitest";
import { motivoBloqueioExclusaoEmenda } from "./protecao-exclusao";
const rascunho = { status: "rascunho", solicitacao_id: null, excluido_em: null };
describe("Emendas · Fase A · exclusão de rascunho sem atos", () => {
  it("autoriza somente o rascunho sem atos", () => {
    expect(motivoBloqueioExclusaoEmenda(rascunho, {})).toBeNull();
  });
  it("protege lançamento formalizado e NE emitida", () => {
    expect(motivoBloqueioExclusaoEmenda({ ...rascunho, status: "formalizado" }, {})).not.toBeNull();
    expect(motivoBloqueioExclusaoEmenda({ ...rascunho, status: "emitido" }, {})).not.toBeNull();
    expect(motivoBloqueioExclusaoEmenda({ ...rascunho, solicitacao_id: "uuid" }, {})).not.toBeNull();
  });
  it("protege qualquer evidência documental relevante, mesmo em rascunho", () => {
    for (const campo of [
      "dotacaoConfirmada","etapaPosterior","parecer","assinatura","envioSeFaz",
      "documentoFluxo","comprovante","liberacao","pagamento","anulacao",
      "conciliacao","encerramento",
    ] as const) {
      expect(motivoBloqueioExclusaoEmenda(rascunho, { [campo]: true })).not.toBeNull();
    }
  });
  it("não reexclui lançamentos e não confunde dotação não confirmada com ato", () => {
    expect(motivoBloqueioExclusaoEmenda({ ...rascunho, excluido_em: "2026-10-29" }, {})).not.toBeNull();
    expect(motivoBloqueioExclusaoEmenda(rascunho, { dotacaoConfirmada: false })).toBeNull();
  });
});
