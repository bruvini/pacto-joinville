import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(p:string)=>readFileSync(fileURLToPath(new URL(p,import.meta.url)),"utf8");
const s=read("../../../supabase/migrations/20261015193000_eletivas_fase3_fpo_evidencias_e_travas.sql");
describe("Fase 3: controle fiscal e provas independentes",()=>{
 it("mantém transação única e tabelas de FPO, atos e publicações por AIH",()=>{
  expect(s).toMatch(/^--[\s\S]*BEGIN;[\s\S]*COMMIT;\s*$/);
  expect(s.trim().split("COMMIT;")).toHaveLength(2);
  for(const name of ["eletivas_fpo_programacoes","eletivas_atos_especiais",
    "eletivas_publicacoes_aih"])expect(s).toContain("CREATE TABLE IF NOT EXISTS public."+name);
  expect(s).toContain("public.app_role[]");
  expect(s).toContain("ENABLE ROW LEVEL SECURITY");
  expect(s).toContain("ec_auditar_evidencia_fase3");
 });
 it("não admite publicação inventada ou somatório pendente no atesto",()=>{
  expect(s).toContain("public.ec_conferir_publicacao_declarada");
  expect(s).toContain("a.documento_sei=NEW.detalhe->>'evidencia_publicacao'");
  expect(s).toContain("p_situacao='pendente'");
  expect(s).toContain("public.ec_impedir_aceite_sem_evidencia");
  expect(s).toContain("public.ec_impedir_encerramento_sem_evidencia");
  expect(s).not.toMatch(/TRUNCATE\s+public\.eletivas_/);
 });
 it("tem teste SQL read-only das permissões e centavos",()=>{
  const t=read("../../../supabase/tests/eletivas_fase3_verificacoes.sql");
  expect(t).toContain("has_table_privilege('anon'");
  expect(t).toContain("'faec_mult','pendente'");
  expect(t).toContain("ec_pub_aih_comprovante_guard");
  expect(t).toMatch(/\bBEGIN;[\s\S]*ROLLBACK;\s*$/);
 });
});
