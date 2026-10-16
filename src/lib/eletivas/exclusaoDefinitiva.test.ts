import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolverDestinoEncontro} from "./competencias";
const read=(p:string)=>readFileSync(fileURLToPath(
 new URL("../../../"+p,import.meta.url)),"utf8");
const sql=read("supabase/migrations/20261016203000_eletivas_exclusao_definitiva_teste.sql");
const ui=read("src/routes/_authenticated/eletivas.index.tsx");
describe("Exclusão definitiva auditada — teste 07/2026",()=>{
 it("compartilha a competência apenas até a exclusão: arquivada NÃO abre vínculo",()=>{
  expect(resolverDestinoEncontro({
   encontro_id:"a",encontro_lancamento_id:"l",lancamento_id:"l",
   encontro_status:"arquivada"
  }).acao).toBe("bloquear");
  expect(resolverDestinoEncontro({
   encontro_id:null,encontro_lancamento_id:null,lancamento_id:"l",
   encontro_status:null
  }).acao).toBe("criar");
 });
 it("transação única: tombstone mínimo, filhos primeiro e competência depois",()=>{
  expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;\s*$/);
  const fn=sql.split("CREATE OR REPLACE FUNCTION public.ec_excluir_competencia_teste(")[1]
   .split("$purge$;")[0];
  for(const x of [
   "ARRAY['admin','acp']","p_confirmacao","length(btrim(coalesce(p_motivo,'')))<20",
   "public.eletivas_exclusoes","caminhos_storage",
   "public.eletivas_fechamentos","public.eletivas_integracoes",
   "public.eletivas_atesto_escolhas","l.origem_valor_atestado='automatico'",
   "DELETE FROM public.eletivas_decisoes_revisoes",
   "DELETE FROM public.eletivas_atos_especiais",
   "DELETE FROM public.eletivas_publicacoes_aih",
   "DELETE FROM public.eletivas_fpo_programacoes",
   "DELETE FROM public.eletivas_correcoes",
   "DELETE FROM public.eletivas_itens",
   "DELETE FROM public.eletivas_arquivos",
   "DELETE FROM public.eletivas_competencias",
  ])expect(fn).toContain(x);
  expect(fn.indexOf("DELETE FROM public.eletivas_itens"))
   .toBeLessThan(fn.indexOf("DELETE FROM public.eletivas_competencias"));
  expect(fn).not.toContain("DELETE FROM public.lancamentos_pagamento");
  expect(fn).not.toContain("UPDATE public.lancamentos_pagamento");
 });
 it("a exclusão real usa a API Storage, com retry e sem apagar objetos por SQL",()=>{
  expect(sql).not.toContain("DELETE FROM storage.objects");
  expect(sql).toContain("ec_storage_limpeza_exclusao_teste");
  expect(sql).toContain("e.excluido_por=auth.uid()");
  expect(sql).toContain("name=ANY(e.caminhos_storage)");
  expect(sql).toContain("ec_confirmar_limpeza_teste");
  expect(ui).toContain('.storage.from("eletivas-arquivos").remove');
  expect(ui).toContain("Concluir limpeza pendente");
  expect(ui).toContain("ec_excluir_competencia_teste");
  expect(ui).toContain("EXCLUIR ");
 });
 it("a interface exige justificativa e confirmação exata",()=>{
  expect(ui).toContain('confirmacaoApagar.trim()!=="EXCLUIR "');
  expect(ui).toContain('(motivoExcluir[excluirId]??"").trim().length<20');
  expect(ui).toContain("Apagar definitivamente e liberar competência");
 });
});
