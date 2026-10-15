import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const migration=readFileSync(fileURLToPath(new URL(
  "../../../supabase/migrations/20261015170000_eletivas_corrige_app_role_search_path.sql",
  import.meta.url,
)),"utf8");
const funcs=[
  "public.ec_importar_itens_local(uuid,jsonb,jsonb,text)",
  "public.ec_conferir_item(uuid)",
  "public.ec_validar_execucao_local(uuid)",
  "public.ec_encerrar(uuid)",
];
describe("Eletivas — reparo de enum com search_path restrito",()=>{
  it("protege as quatro RPCs atingidas pelo tipo app_role sem schema",()=>{
    for(const signature of funcs)expect(migration).toContain(signature);
    expect(migration).toContain("to_regtype('public.app_role')");
    expect(migration).toContain("public.has_any_role(uuid,public.app_role[])");
    expect(migration).toContain("::public.app_role[]");
    expect(migration).toContain("::app_role[]");
    expect(migration).toContain("pg_catalog.pg_get_functiondef");
  });
  it("faz substituição estrita sem alargar search_path ou privilégios",()=>{
    expect(migration).toMatch(/\bBEGIN;[\s\S]*COMMIT;\s*$/);
    expect(migration).toContain("p.prosecdef");
    expect(migration).toContain("ALTER FUNCTION %s SET search_path = %L");
    expect(migration).toContain("nome_funcao,''");
    expect(migration).not.toContain("NOT ('search_path=' = ANY");
    expect(migration).toContain("e_definer IS DISTINCT FROM true");
    expect(migration).toContain("EXECUTE nova_definicao");
    expect(migration).toContain("replace(definicao,'::app_role[]','::public.app_role[]')");
    expect(migration).not.toMatch(/(?:DROP|TRUNCATE|DELETE FROM|UPDATE public\.|GRANT EXECUTE TO PUBLIC)/i);
    expect(migration).not.toMatch(/SET\s+search_path\s*=\s*public/i);
  });
  it("não confunde proconfig formatada com perda de segurança",()=>{
    const original=readFileSync(fileURLToPath(new URL(
      "../../../supabase/tests/eletivas_app_role_verificacoes.sql",
      import.meta.url)),"utf8");
    expect(original).toContain("unnest(COALESCE(configuracao,ARRAY[]::text[]))");
    expect(original).toContain("translate(substr(parametro.valor,13)");
    expect(original).toContain("chr(34)||chr(39)||chr(32)");
    expect(original).not.toContain("'search_path='=ANY");
  });
  it("confirma que as versões instaladas possuem exatamente a vulnerabilidade corrigida",()=>{
    const paths=[
      "../../../supabase/migrations/20261015101500_eletivas_fase0_integridade_execucao.sql",
      "../../../supabase/migrations/20261015144000_eletivas_fase1_leitura_navegador.sql",
    ];
    const old=paths.map(path=>readFileSync(fileURLToPath(new URL(path,import.meta.url)),"utf8"));
    expect(old[0]).toContain("CREATE OR REPLACE FUNCTION public.ec_conferir_item");
    expect(old[1]).toContain("CREATE OR REPLACE FUNCTION public.ec_importar_itens_local");
    expect(old[1]).toContain("CREATE OR REPLACE FUNCTION public.ec_validar_execucao_local");
    expect(old[1]).toContain("CREATE OR REPLACE FUNCTION public.ec_encerrar");
    expect(old.every(s=>s.includes("::app_role[]"))).toBe(true);
  });
});
