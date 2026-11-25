import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const anterior = readFileSync(new URL("../../../supabase/migrations/20261029033000_emendas_exclusao_definitiva_operacional.sql", import.meta.url), "utf8");
const protecao = readFileSync(new URL("../../../supabase/migrations/20261125170000_emendas_fase_a_protecao_exclusao.sql", import.meta.url), "utf8");
const ui = readFileSync(new URL("../../components/emendas/ExecucaoEmenda.tsx", import.meta.url), "utf8");

describe("Emendas · Fase A · exclusão segura", () => {
  it("substitui a RPC antiga por verificação conservadora antes de qualquer deleção", () => {
    expect(protecao).toContain("CREATE OR REPLACE FUNCTION public.emenda_excluir_lancamento");
    expect(protecao).toContain("v_lanc.status <> 'rascunho'");
    expect(protecao).toContain("v_lanc.solicitacao_id IS NOT NULL");
    expect(protecao).toContain("v_lanc.excluido_em IS NOT NULL");
    expect(protecao.indexOf("IF v_lanc.status <> 'rascunho'"))
      .toBeLessThan(protecao.indexOf("INSERT INTO public.emenda_historico"));
    expect(protecao.indexOf("IF v_lanc.status <> 'rascunho'"))
      .toBeLessThan(protecao.indexOf("DELETE FROM public.emenda_fluxo_assinaturas"));
  });
  it("preserva atos documentais, financeiros, assinaturas e pareceres", () => {
    for (const tabela of [
      "emenda_etapas_documentais", "emenda_pareceres_financeiros",
      "emenda_assinaturas_conferidas", "emenda_envios_sefaz",
      "emenda_fluxo_documentos", "emenda_comprovantes",
      "emenda_liberacoes", "emenda_blocos_pagamento",
      "emenda_anulacoes", "emenda_conciliacoes_ne",
      "emenda_encerramentos_sem_execucao",
    ]) expect(protecao).toContain("FROM public." + tabela);
    expect(protecao).toContain("d.coord_orcamentos_confirmada IS TRUE");
    expect(protecao).toContain("CREATE TRIGGER trg_emenda_guard_exclusao_executada");
  });
  it("mantém histórico forense da versão anterior e não apaga o histórico", () => {
    expect(anterior).toContain("'registros_operacionais',v_vinculados");
    expect(protecao).toContain("'registros_operacionais',v_vinculados");
    expect(protecao).toContain("to_jsonb(v_lanc)");
    expect(protecao).not.toContain("DELETE FROM public.emenda_historico");
    expect(protecao).not.toMatch(/DROP\s+(?:TABLE|TRIGGER)/i);
  });
  it("mantém autenticação e evita exclusão irrestrita também no frontend", () => {
    expect(protecao).toContain("auth.uid()");
    expect(protecao).toContain("public.has_any_role");
    expect(protecao).toContain("FROM PUBLIC,anon");
    expect(protecao).toContain("TO authenticated");
    expect(ui).toContain("motivoBloqueioExclusaoEmenda");
    expect(ui).toContain("Exclusão permitida somente para rascunhos sem atos documentados.");
  });
});
