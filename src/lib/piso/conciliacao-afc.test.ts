import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  disponibilidadeExtratoAfc, situacaoConciliacaoAfc,
  valorPublicacaoMunicipalComprovada, type ContaAfcFms,
} from "./conciliacao-afc";
import { resumoEmpenhoPiso } from "./resumo-empenho";
import { etapaLiberadaPiso } from "./etapas";

const conta = (saldo_bancario: number | null, compromissos_preexistentes = 0): ContaAfcFms => ({
  id: "fms", identificacao: "FMS — conta vinculada AFC",
  saldo_bancario, compromissos_preexistentes, data_saldo: "2026-11-05",
  documento_sei: "EXTRATO-001", documento_link: "https://sei.joinville.sc.gov.br/extrato",
});
const outubro = {
  valor_homologado: 9876.68, desconto_saldo: 8114.28, acerto_contas: 0,
  valor_transferido: 1762.40, credito_fms_valor: 1762.40,
  credito_fms_data: "2026-11-05", credito_fms_link: "https://sei.joinville.sc.gov.br/credito",
};
const sql = readFileSync(
  new URL("../../../supabase/migrations/20261106112000_piso_afc_conciliacao_fms.sql", import.meta.url),
  "utf8",
);

describe("Plano AFC 2026 — oito cenários de regressão", () => {
  it("A. desconto com saldo comprovado não reduz a obrigação homologada nem duplica o crédito", () => {
    const extrato = conta(9876.68);
    expect(disponibilidadeExtratoAfc(extrato, 0)).toBe(9876.68);
    expect(situacaoConciliacaoAfc(outubro, { situacao: "confirmada" }, extrato, 0))
      .toBe("Disponibilidade comprovada");
    expect(sql).toContain("v_devido > v_conta.saldo_bancario - v_conta.compromissos_preexistentes - v_outras");
  });
  it("B. desconto sem saldo ou crédito informado nunca é R$ 0,00 fictício", () => {
    expect(disponibilidadeExtratoAfc(conta(null), 0)).toBeNull();
    expect(situacaoConciliacaoAfc(outubro, { situacao: "rascunho" }, conta(null), 0))
      .toBe("Saldo não informado");
    expect(situacaoConciliacaoAfc({
      ...outubro, credito_fms_valor: null, credito_fms_data: null,
    }, { situacao: "rascunho" }, conta(9876.68), 0)).toBe("Aguardando conciliação");
  });
  it("C. crédito federal divergente exige conferência e justificativa documental", () => {
    expect(situacaoConciliacaoAfc({ ...outubro, credito_fms_valor: 1700 },
      { situacao: "rascunho" }, conta(9876.68), 0)).toBe("Divergência documental");
    expect(sql).toContain("length(btrim(coalesce(v_comp.justificativa_credito,''))) < 20");
  });
  it("D. empenhos superiores geram previsão de anulação, sem execução automática", () => {
    const parts = [
      { id: "boj", valor_devido: 9524.68 },
      { id: "beth", valor_devido: 352 },
    ];
    const obrigacoes = [
      { participante_id: "boj", valor_empenhado: 15000 },
      { participante_id: "beth", valor_empenhado: 1000 },
    ];
    const res = resumoEmpenhoPiso(9876.68, parts, obrigacoes);
    expect(res.totalConfere).toBe(true);
    expect(res.totalPrevisto).toBe(6123.32);
    expect(res.porInstituicao.map(p => p.excedentePrevisto)).toEqual([5475.32,648]);
  });
  it("E. Portaria municipal pendente não é apresentada como publicada", () => {
    const docs = [{ id: "doc", tipo: "portaria_municipal", numero_sei: "3111",
      link_sei: "https://sei.joinville.sc.gov.br/x", data_documento: "2026-11-04" }];
    const comp = {
      etapas_concluidas: { "2": true, "3": false },
      total_publicado_municipal: 9876.68,
      municipal_config: { portaria_numero: "123", publicacao_conferida: {
        documento_id: "doc", numero_sei: "3111", valor: 9876.68,
        origem: "conferencia_manual_documental",
      } },
    };
    expect(valorPublicacaoMunicipalComprovada(comp, docs)).toBeNull();
    expect(valorPublicacaoMunicipalComprovada({
      ...comp, etapas_concluidas: { "3": true },
      municipal_config: { portaria_numero: "123" },
    }, docs)).toBeNull();
    expect(valorPublicacaoMunicipalComprovada({
      ...comp, etapas_concluidas: { "3": true },
    }, docs)).toBe(9876.68);
  });
  it("F. competência encerrada protege alterações e mantém auditoria", () => {
    expect(sql).toContain("IF v_comp.status='encerrada'");
    expect(sql).toContain("ALTER TABLE public.piso_afc_conciliacoes ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("INSERT INTO public.historico_logs");
    expect(sql).toContain("NEW.status='encerrada'");
  });
  it("G. empenho segue paralelo à conciliação e 13ª permanece isolada", () => {
    expect(etapaLiberadaPiso(5, {}, [], "mensal", false)).toBe(true);
    expect(etapaLiberadaPiso(6, {}, [], "mensal", false)).toBe(false);
    expect(etapaLiberadaPiso(5, {}, [], "decimo_terceiro", false)).toBe(true);
    expect(sql).toContain("NEW.tipo_parcela<>'decimo_terceiro'");
    expect(sql).toContain("NEW.tipo_parcela='decimo_terceiro'");
    expect(sql).not.toMatch(/UPDATE\s+public\.piso_obrigacoes\s+SET\s+valor_anulado/i);
  });
  it("H. outubro/2026: soma institucional, desconto e transferido preservados", () => {
    expect(Math.round((9524.68 + 352) * 100)).toBe(987668);
    expect(Math.round((9876.68 - 8114.28) * 100)).toBe(176240);
    expect(disponibilidadeExtratoAfc(conta(9876.68, 0), 8114.28)).toBe(1762.4);
    expect(situacaoConciliacaoAfc(outubro, { situacao: "rascunho" },
      conta(9876.68, 0), 8114.28)).toBe("Disponibilidade insuficiente");
  });
  it("impede dupla utilização na mesma conta com lock e reservas cruzadas", () => {
    expect(sql).toContain("FROM public.piso_afc_contas_fms WHERE id=NEW.conta_id FOR UPDATE");
    expect(sql).toContain("situacao IN ('confirmada','reconferir')");
    expect(sql).toContain("Disponibilidade insuficiente: esta conta já possui compromissos");
  });
});
