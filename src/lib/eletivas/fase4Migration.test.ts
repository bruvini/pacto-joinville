import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(name:string)=>readFileSync(fileURLToPath(
  new URL("../../../supabase/"+name,import.meta.url)),"utf8");
const s=read("migrations/20261015194500_eletivas_fase4_auditoria_correcoes.sql");
describe("Fase 4: segurança do modelo e migração sem dupla contagem",()=>{
 it("usa transação, controle de versão e revisões imutáveis em tabela RLS",()=>{
   expect(s).toMatch(/\bBEGIN;[\s\S]*COMMIT;\s*$/);
   expect(s.trim().split("COMMIT;")).toHaveLength(2);
   for(const tab of ["eletivas_decisoes_revisoes","eletivas_correcoes"])
     expect(s).toContain("CREATE TABLE IF NOT EXISTS public."+tab);
   expect(s).toContain("ec_decidir_item");
   expect(s).toContain("p_versao integer");
   expect(s).toContain("app.ec_decisao_item");
   expect(s).toContain("REVOKE ALL ON public.eletivas_correcoes");
   expect(s).toContain("ENABLE ROW LEVEL SECURITY");
 });
 it("congela JSON, migra registros legados e só conta aprovações normalizadas",()=>{
   expect(s).toContain("origem_legada_indice");
   expect(s).toContain("status='duplicada'");
   expect(s).toContain("ec_correcao_unica_aprovada");
   expect(s).toContain("ec_bloquear_correcoes_json");
   expect(s).toContain("status='aprovada'");
   expect(s).toContain("FROM public.eletivas_correcoes");
   expect(s).toContain("v_ajustes");
   expect(s).not.toContain("FOR v_corr IN SELECT value FROM jsonb_array_elements(v.correcoes)");
 });
 it("preserva Fases 0-3 e exige revisão de decisões em análise",()=>{
   expect(s).toContain("ec_validar_pendencias_fase4");
   expect(s).toContain("ec_encerrar");
   expect(s).toContain("ec_fontes_snapshot");
   expect(s).toContain("ec_validado_em");
   expect(s).toContain("decisao='analise'");
   expect(s).toContain("::public.app_role[]");
   expect(s).not.toContain("::app_role[]");
 });
 it("possui verificações SQL somente leitura",()=>{
   const t=read("tests/eletivas_fase4_verificacoes.sql");
   expect(t).toContain("has_function_privilege('anon'");
   expect(t).toContain("prestador_id,fingerprint");
   expect(t).toContain("public.ec_valor_item('faec_prod','ok','erro',100,100)");
   expect(t).toMatch(/\bBEGIN;[\s\S]*ROLLBACK;\s*$/);
 });
});
