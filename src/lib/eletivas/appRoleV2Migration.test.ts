import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(p:string)=>readFileSync(fileURLToPath(new URL(p,import.meta.url)),"utf8");
const sql=read("../../../supabase/migrations/20261015180000_eletivas_reparo_app_role_v2.sql");
const check=read("../../../supabase/tests/eletivas_app_role_v2_verificacoes.sql");
describe("EC-APPROLE-V2: reparo separado, seguro e rastreável",()=>{
 it("usa nome novo e não inclui o erro bloqueante de proconfig",()=>{
   expect(sql).toContain("EC-APPROLE-V2");
   expect(sql).not.toContain("Configuração de segurança inesperada");
   expect(sql).not.toMatch(/NOT\s*\(\s*'search_path='\s*=\s*ANY/);
   expect(sql).toContain("p.prosecdef");
   expect(sql).toContain("ALTER FUNCTION %s SET search_path = %L");
 });
 it("preserva a verificação de usuário e corrige as quatro RPCs, sem mudar dados",()=>{
   for(const sig of ["ec_importar_itens_local","ec_conferir_item","ec_validar_execucao_local","ec_encerrar"])
     expect(sql).toContain("public."+sig+"(");
   expect(sql).toContain("public.has_any_role");
   expect(sql).toContain("::public.app_role[]");
   expect(sql).toContain("EXECUTE corrigida");
   expect(sql).toMatch(/\bBEGIN;[\s\S]*COMMIT;\s*$/);
   expect(sql).not.toMatch(/\b(?:UPDATE|DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|ALTER\s+TABLE)\s+public\.eletivas/i);
 });
 it("verifica o resultado instalado sem exigir formato fixo do catálogo",()=>{
   expect(check).toContain("EC-APPROLE-V2");
   expect(check).toContain("p.proconfig");
   expect(check).toContain("pg_catalog.btrim(substr");
   expect(check).toContain("has_function_privilege('anon'");
   expect(check).toContain("has_function_privilege('authenticated'");
   expect(check).toMatch(/\bBEGIN;[\s\S]*ROLLBACK;\s*$/);
 });
});
