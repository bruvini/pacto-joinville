import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(p:string)=>readFileSync(fileURLToPath(
 new URL("../../../"+p,import.meta.url)),"utf8");
const sql=read("supabase/migrations/20261015195500_eletivas_fase6_fechamento_integracao_segura.sql");
describe("Fase 6: fechamento seguro e convênio",()=>{
 it("é incremental, transacional e guarda versões imutáveis antes da reabertura",()=>{
  expect(sql).toMatch(/\bBEGIN;[\s\S]*COMMIT;\s*$/);
  for(const t of ["eletivas_fechamentos","eletivas_integracoes"]){
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public."+t);
    expect(sql).toContain("ALTER TABLE public."+t+" ENABLE ROW LEVEL SECURITY");
  }
  expect(sql).toContain("ec_snapshot_apos_fechamento");
  expect(sql).toContain("ec_fechamentos_immutable");
  expect(sql).toContain("md5(payload::text)");
  expect(sql).not.toMatch(/TRUNCATE\s+public\.eletivas_/);
 });
 it("só fecha com confirmação e conserva todas as travas do ec_encerrar legado",()=>{
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.ec_encerrar(uuid) FROM PUBLIC,anon,authenticated");
  expect(sql).toContain("ec_encerrar_seguro");
  expect(sql).toContain("ec_checklist_fechamento");
  expect(sql).toContain("c.ec_execucao_id IS DISTINCT FROM p_execucao");
  expect(sql).toContain("valor:=public.ec_encerrar(p_comp)");
  expect(sql).toContain("app.ec_fechamento_id");
 });
 it("não usa texto do objeto como vínculo: IDs, prestador, convênio e competência exata",()=>{
  expect(sql).toContain("ec_vincular_lancamento");
  expect(sql).toContain("cv.modelo_fluxo='fluxo_1'");
  expect(sql).toContain("cv.prestador_id=NEW.prestador_id");
  expect(sql).toContain("l.competencia=NEW.competencia");
  expect(sql).not.toMatch(/cv\.objeto\s+ILIKE/);
  expect(sql).toContain("app.ec_vinculo_comp");
 });
 it("proposta não altera lançamento e aplicação é ação distinta com valor esperado e tolerância zero",()=>{
  const proposta=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.ec_propor_integracao("),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.ec_aplicar_integracao("));
  const aplicar=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.ec_aplicar_integracao("),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.ec_cancelar_proposta("));
  expect(proposta).toContain("status IN('proposta','aplicada')");
  expect(proposta).not.toContain("UPDATE public.lancamentos_pagamento");
  expect(aplicar).toContain("p_confirmo IS DISTINCT FROM true");
  expect(aplicar).toContain("l.valor_atestado IS DISTINCT FROM p_valor_anterior");
  expect(aplicar).toContain("UPDATE public.lancamentos_pagamento");
  expect(aplicar).toContain("l.valor_atestado,0)<>0");
  expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS ec_integracao_comp_ativa");
  expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS ec_integracao_lanc_ativo");
 });
 it("bloqueia reabertura após integração e preserva snapshots",()=>{
  const reabrir=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.ec_reabrir_controlado("));
  expect(reabrir).toContain("ARRAY['admin']::public.app_role[]");
  expect(reabrir).toContain("status IN('proposta','aplicada')");
  expect(reabrir).toContain("app.ec_reabrir_id");
  expect(reabrir).toContain("snapshot_preservado");
  expect(reabrir).not.toContain("DELETE FROM public.eletivas_fechamentos");
 });
 it("possui verificação SQL sem mutação de produção",()=>{
  const tst=read("supabase/tests/eletivas_fase6_verificacoes.sql");
  expect(tst).toContain("has_function_privilege");
  expect(tst).toContain("ec_snapshot_final");
  expect(tst).toContain("ec_integracao_valor_guard");
  expect(tst).toMatch(/\bBEGIN;[\s\S]*ROLLBACK;\s*$/);
 });
});
