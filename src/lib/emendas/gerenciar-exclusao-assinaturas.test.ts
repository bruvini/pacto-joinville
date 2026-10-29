import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const migration=readFileSync(new URL("../../../supabase/migrations/20261029031500_emendas_assinaturas_nome_exclusao_gerenciar.sql",import.meta.url),"utf8");
const ui=readFileSync(new URL("../../components/emendas/ExecucaoEmenda.tsx",import.meta.url),"utf8");
describe("Emendas — matrícula de assinaturas e exclusão no Gerenciar",()=>{
 it("elimina a ambiguidade de coluna nome no SQL",()=>{
  const assinar=migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.emenda_fluxo_assinar"),
   migration.indexOf("REVOKE ALL ON FUNCTION public.emenda_fluxo_assinar"));
  expect(assinar).toContain("efa.nome=v_nome");
  expect(assinar).toContain("v_nome:=cfg.nome_servidor");
  expect(assinar).toContain("v_nome:=btrim(coalesce(p_manual,''));");
  expect(assinar).not.toMatch(/\bnome\s*=\s*nome\b/);
  expect(assinar).toContain("ON CONFLICT(documento_id,papel) DO UPDATE SET");
 });
 it("apresenta exclusão no modal mesmo depois da dotação e da autorização",()=>{
  expect(ui).toContain("const podeExcluir=");
  expect(ui).toContain("gerenciado&&podeEditar");
  expect(ui).toContain("rotuloExclusao(gerenciado.id)");
  expect(ui).toContain("Excluir competência");
  expect(ui).toContain("setExcluindo(gerenciado.id)");
 });
 it("confirma exclusão em modal próprio, não em window.alert/confirm",()=>{
  expect(ui).toContain("<Dialog open={!!excluindo}");
  expect(ui).toContain("Sim, excluir competência");
  expect(ui).not.toContain("window.confirm(");
  expect(ui).toContain('supabase.rpc("emenda_excluir_lancamento"');
 });
 it("apenas ocultação lógica e auditada; solicitações sem NE são canceladas antes",()=>{
  expect(migration).toContain("CREATE OR REPLACE FUNCTION public.emenda_excluir_lancamento");
  expect(migration).toContain("public.emenda_cancelar_solicitacao");
  expect(migration).toContain("status='cancelado',excluido_em=now(),excluido_por=v_ator");
  expect(migration).toContain("v_lancamento.status NOT IN ('rascunho','formalizado')");
  expect(migration).toContain("NE emitida: não é permitida exclusão");
  expect(migration).toContain("emenda_blocos_pagamento");
  expect(migration).toContain("emenda_conciliacoes_ne");
 });
});
