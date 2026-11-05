import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fonte = readFileSync(
  fileURLToPath(new URL("./EtapasPiso.tsx", import.meta.url)),
  "utf8",
);

describe("regressão da renderização do Piso", () => {
  it("não referencia observacao13 removida da reorganização do fluxo", () => {
    expect(fonte).not.toMatch(/\bobservacao13\b/);
  });

  it("não exige processo SEI anual redundante na interface de empenho", () => {
    const etapa5 = fonte.slice(fonte.indexOf("else if (n === 5)"), fonte.indexOf("else if (n === 6)"));
    expect(etapa5).not.toContain("Processo anual de empenho / liquidação no SEI");
    expect(etapa5).not.toContain('saveObrig(o.id, "processo_sei"');
    expect(etapa5).not.toContain('saveObrig(o.id, "link_processo_sei"');
    expect(etapa5).toContain('doc("solicitacao_ne"');
    expect(etapa5).toContain('doc("nota_empenho"');
  });

  it("mantém a etapa mensal e a 13ª com seus conteúdos próprios", () => {
    expect(fonte).toContain("if (n === 1)");
    expect(fonte).toContain('else if (n === 2 && c.tipo_parcela === "decimo_terceiro")');
    expect(fonte).toContain("<Simulador13Piso");
    expect(fonte).toContain("<PortariaFederal13Piso");
  });
  it("libera a Portaria municipal somente após encaminhamento confirmado do Memorando", () => {
    const etapa3 = fonte.slice(fonte.indexOf("else if (n === 3)"), fonte.indexOf("else if (n === 4)"));
    expect(etapa3).toContain("memorandoEncaminhadoParaDestinatarios({");
    expect(etapa3).toContain("{memorandoEncaminhado && (");
    expect(etapa3).toContain('doc("portaria_municipal", {');
    expect(etapa3).toContain('inlineCampos: (');
    const posConfirmacao = etapa3.indexOf("<ConfirmacaoEncaminhamentoMemorandoPiso");
    const posPortaria = etapa3.indexOf("{memorandoEncaminhado && (");
    expect(posConfirmacao).toBeGreaterThan(0);
    expect(posPortaria).toBeGreaterThan(posConfirmacao);
    expect(etapa3.indexOf("Número da Portaria municipal")).toBeGreaterThan(posPortaria);
  });

  it("integra os quatro campos na mesma linha responsiva do cartão SEI", () => {
    const cartao = readFileSync(
      fileURLToPath(new URL("./DocumentoCard.tsx", import.meta.url)), "utf8",
    );
    expect(cartao).toContain("inlineCampos?: ReactNode");
    expect(cartao).toContain('xl:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_minmax(300px,2fr)_minmax(160px,0.85fr)]');
    expect(cartao).toContain("{inlineCampos}");
  });

});
