import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const sql=readFileSync(fileURLToPath(new URL(
 "../../../supabase/tests/eletivas_fase7_homologacao_verificacoes.sql",
 import.meta.url)),"utf8");

describe("Fase 7 — diagnóstico RLS: GRANT não equivale a acesso",()=>{
 it("não reprova SELECT concedido a anon quando RLS bloqueia por ausência de policy",()=>{
  expect(sql).not.toMatch(/IF has_table_privilege\('anon','public\.'\|\|nome,'SELECT'\)/);
  expect(sql).toContain("pg_catalog.pg_policy");
  expect(sql).toContain("pol.polpermissive");
  expect(sql).toContain("pg_catalog.pg_has_role('anon'::name,permitido.role_oid,'USAGE')");
  expect(sql).toContain("permitido.role_oid=0::oid");
 });
 it("ainda bloqueia papel com BYPASSRLS e políticas PERMISSIVE para anon ou PUBLIC",()=>{
  expect(sql).toContain("NOT rolbypassrls");
  expect(sql).toContain("NOT rolsuper");
  expect(sql).toContain("pol.polrelid=('public.'||nome)::regclass");
  expect(sql).toContain("política RLS permissiva aplicável a anon/PUBLIC");
 });
 it("permanece somente leitura e verifica funções de fechamento e integridade",()=>{
  expect(sql).toMatch(/\bBEGIN;[\s\S]*ROLLBACK;\s*$/);
  expect(sql).not.toMatch(/\b(?:UPDATE|DELETE FROM|INSERT INTO|DROP POLICY|ALTER TABLE)\b/i);
  for(const func of ["ec_encerrar_seguro","ec_aplicar_integracao","ec_importar_itens_local"])
   expect(sql).toContain(func);
  expect(sql).toContain("Fase 7: integração duplicada ativa");
  expect(sql).toContain("politica_permissiva_para_anon");
 });
});
