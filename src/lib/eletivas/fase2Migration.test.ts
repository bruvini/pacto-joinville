import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const sql=readFileSync(fileURLToPath(new URL(
 "../../../supabase/migrations/20261015161000_eletivas_fase2_resumo_financeiro.sql",
 import.meta.url)),"utf8");
describe("Resumo SQL da Fase 2",()=>{
 it("usa a mesma função do fechamento para valor admitido",()=>{
   expect(sql).toContain("public.ec_valor_item(");
   expect(sql).toContain("fiscalmente_admitido");
   expect(sql).toContain("controle_faec_fxmac_nao_somado");
   expect(sql).toContain("total_com_correcoes");
   expect(sql).toMatch(/WHEN controle THEN 0::numeric ELSE admitido/);
 });
 it("não modifica o cálculo de encerramento nem dados antigos",()=>{
   expect(sql).toMatch(/^--[\s\S]*BEGIN;[\s\S]*COMMIT;\s*$/);
   expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
   expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.ec_encerrar\(/);
   expect(sql).toContain("SECURITY INVOKER");
   expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.ec_resumo_financeiro(uuid) TO authenticated");
 });
});
