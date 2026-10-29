import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const migration=readFileSync(new URL("../../../supabase/migrations/20261029033000_emendas_exclusao_definitiva_operacional.sql",import.meta.url),"utf8");
const ui=readFileSync(new URL("../../components/emendas/ExecucaoEmenda.tsx",import.meta.url),"utf8");
describe("Emendas · exclusão definitiva do cadastro interno",()=>{
 it("remove operação independentemente de status ou execução",()=>{
  expect(migration).toContain("CREATE OR REPLACE FUNCTION public.emenda_excluir_lancamento");
  expect(migration).not.toContain("v_lanc.status NOT IN");
  expect(migration).not.toContain("emenda_cancelar_solicitacao");
  expect(ui).toContain('const podeExcluir=(l:(typeof lancamentos)[number])=>podeEditar&&!l.excluido_em');
 });
 it("guarda auditoria completa antes de apagar os dados, numa única transação",()=>{
  expect(migration).toMatch(/^BEGIN;/m);
  expect(migration).toMatch(/^COMMIT;/m);
  expect(migration.indexOf("INSERT INTO public.emenda_historico")).toBeLessThan(
    migration.indexOf("DELETE FROM public.emenda_fluxo_assinaturas")
  );
  expect(migration).toContain("'registros_operacionais',v_vinculados");
  expect(migration).toContain("to_jsonb(v_lanc)");
  expect(migration).toContain("WHERE d.lancamento_id=p_lancamento");
  expect(migration).toContain("WHERE f.solicitacao_id=v_solicitacao");
 });
 it("apaga todos os filhos antes da solicitação e lançamento, preservando competências compartilhadas",()=>{
  for(const tab of ["emenda_fluxo_assinaturas","emenda_fluxo_documentos","emenda_blocos_pagamento",
   "emenda_comprovantes","emenda_encerramentos_sem_execucao","emenda_conciliacoes_ne",
   "emenda_anulacoes","emenda_liberacoes","emenda_assinaturas_conferidas",
   "emenda_envios_sefaz","emenda_etapas_documentais","emenda_pareceres_financeiros",
   "emenda_competencias_filhas","emenda_lancamento_meses","emenda_lancamentos",
   "emenda_solicitacoes","emenda_competencias"]){
    expect(migration).toContain("DELETE FROM public."+tab);
  }
  expect(migration.indexOf("DELETE FROM public.emenda_lancamentos")).toBeLessThan(
   migration.indexOf("DELETE FROM public.emenda_solicitacoes")
  );
  expect(migration).toContain("outro.id<>p_lancamento");
  expect(migration).toContain("NOT EXISTS(SELECT 1 FROM public.emenda_lancamento_meses m");
 });
 it("mantém controle de acesso e não altera nenhum dado da SEFAZ",()=>{
  expect(migration).toContain("auth.uid()");
  expect(migration).toContain("public.has_any_role");
  expect(migration).toContain("TO authenticated");
  expect(migration).not.toMatch(/DELETE\s+FROM[^;]*\bCASCADE\b/i);
  expect(migration).not.toContain("DELETE FROM public.emenda_historico");
  expect(ui).toContain("Não é possível recuperar pela interface");
 });
});
