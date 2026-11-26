import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const migration = readFileSync(new URL("../../../supabase/migrations/20261029031500_emendas_assinaturas_nome_exclusao_gerenciar.sql", import.meta.url), "utf8");
const ui = readFileSync(new URL("../../components/emendas/ExecucaoEmenda.tsx", import.meta.url), "utf8");
describe("Emendas · assinaturas e exclusão de rascunhos", () => {
  it("corrige a antiga ambiguidade da coluna nome", () => {
    const assinar = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.emenda_fluxo_assinar"),
      migration.indexOf("REVOKE ALL ON FUNCTION public.emenda_fluxo_assinar"));
    expect(assinar).toContain("efa.nome=v_nome");
    expect(assinar).toContain("v_nome:=cfg.nome_servidor");
    expect(assinar).toContain("v_nome:=btrim(coalesce(p_manual,''));");
    expect(assinar).not.toMatch(/\bnome\s*=\s*nome\b/);
    expect(assinar).toContain("ON CONFLICT(documento_id,papel) DO UPDATE SET");
  });
  it("mostra a gestão mas só permite excluir lançamento em preparação sem atos", () => {
    expect(ui).toContain("const podeExcluir=");
    expect(ui).toContain("motivoBloqueioExclusaoEmenda");
    expect(ui).toContain("setExcluindo(gerenciado.id)");
    expect(ui).toContain("Exclusão permitida somente para rascunhos sem atos documentados.");
  });
  it("confirma exclusão em modal próprio, sem window.alert", () => {
    expect(ui).toContain("<Dialog open={!!excluindo}");
    expect(ui).toContain("Excluir rascunho do PACTO");
    expect(ui).not.toContain("window.confirm(");
    expect(ui).toContain('supabase.rpc("emenda_excluir_lancamento"');
  });
  it("não orienta exclusão de NE ou pagamentos", () => {
    expect(ui).not.toContain("Exclusão definitiva dos registros internos, inclusive NE e pagamentos cadastrados.");
    expect(ui).toContain("Lançamentos formalizados e NEs devem seguir cancelamento ou retificação controlada.");
  });
});
