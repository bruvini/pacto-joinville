import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const texto=readFileSync(fileURLToPath(new URL(
 "../../../supabase/migrations/20261015144000_eletivas_fase1_leitura_navegador.sql",
 import.meta.url)),"utf8");
describe("SQL Fase 1: segurança da pré-conciliação navegador",()=>{
 it("executa em uma transação sem redefinir tabelas antigas",()=>{
   expect(texto).toMatch(/\bBEGIN;[\s\S]*COMMIT;\s*$/);
   expect(texto).not.toMatch(/DROP TABLE/i);
   expect(texto).toContain("parser_local");
 });
 it("controla a importação com perfil ACP/Admin e declaração fiscal",()=>{
   expect(texto).toContain("CREATE OR REPLACE FUNCTION public.ec_importar_itens_local(");
   expect(texto).toContain("CREATE OR REPLACE FUNCTION public.ec_validar_execucao_local(");
   expect(texto).toContain("ARRAY['admin','acp']::app_role[]");
   expect(texto).toContain("competencia_id=p_comp");
   expect(texto).toContain("p_evidencias");
   expect(texto).toContain("ec_execucao_id=exec_id");
   expect(texto).toContain("motor_execucao_local");
   expect(texto).toContain("ec_invalidar_validacao_local");
   expect(texto).toContain("ec_validado_em IS NULL");
 });
 it("não dá acesso service_role ao navegador e não altera lançamentos",()=>{
   expect(texto).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
   expect(texto).not.toMatch(/UPDATE\s+public\.lancamentos_pagamento/i);
   expect(texto).toContain("REVOKE ALL ON FUNCTION public.ec_importar_itens_local");
   expect(texto).toContain("TO authenticated;");
 });
});
