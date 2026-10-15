import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(p:string)=>readFileSync(fileURLToPath(
  new URL("../../../"+p,import.meta.url)),"utf8");
const sql=read("supabase/migrations/20261015201000_eletivas_vinculo_origem_atesto_competencia.sql");
const ec=read("src/routes/_authenticated/eletivas.index.tsx");
const lanc=read("src/routes/_authenticated/lancamentos.$id.tsx");
const tela=read("src/components/lancamentos/ValorAtestadoEtapa6.tsx");
const f6=read("src/components/eletivas/FechamentoEletivas.tsx");
describe("Eletivas: vínculo direto ao lançamento",()=>{
 it("migration complementar é transacional e usa Fase 6 anterior",()=>{
  expect(sql).toMatch(/\bBEGIN;[\s\S]*COMMIT;\s*$/);
  expect(sql).toContain("ec_aplicar_integracao(uuid,numeric,boolean)");
  expect(sql).toContain("CREATE OR REPLACE FUNCTION public.ec_criar_competencia_vinculada");
 });
 it("seleciona instituição, convênio e parcela individual aberta",()=>{
  for(const field of ["p_prest","p_convenio","p_lanc","cv.modelo_fluxo='fluxo_1'",
    "l.concluido","l.data_pagamento IS NOT NULL","l.competencia ~"])expect(sql).toContain(field);
  expect(sql).toContain("ec_listar_lancamentos_disponiveis");
  expect(sql).toContain("l.parent_id IS NULL AND l.competencia LIKE '%,%'");
  expect(sql).toContain("SELECT * INTO l FROM public.lancamentos_pagamento WHERE id=p_lanc FOR UPDATE");
  for(const label of ["Instituição","Convênio","Competência / Parcela já aberta"])
    expect(ec).toContain(label);
  expect(ec).toContain(".rpc(\"ec_criar_competencia_vinculada\"");
  expect(ec).not.toContain("CompetenciaInput");
 });
 it("não permite criação solta, edição/exclusão após evidências ou fechamento",()=>{
  expect(sql).toContain("REVOKE INSERT ON public.eletivas_competencias FROM authenticated");
  expect(sql).toContain("app.ec_criacao_vinculada");
  expect(sql).toContain("ec_editar_competencia");
  expect(sql).toContain("ec_excluir_competencia");
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.eletivas_exclusoes");
  for(const t of ["eletivas_arquivos","eletivas_itens","eletivas_fechamentos",
    "eletivas_integracoes","eletivas_correcoes"])
      expect(sql).toContain("FROM public."+t+" WHERE competencia_id=p_comp");
  expect(ec).toContain("Excluir rascunho");
  expect(ec).toContain("Salvar alterações");
 });
});
describe("Etapa 6: duas origens, uma escolhida",()=>{
 it("não sobrescreve o manual na aplicação de cálculo automático",()=>{
   for(const coluna of ["valor_atestado_manual","valor_atestado_automatico",
      "origem_valor_atestado","ec_escolha_pendente"])
     expect(sql).toContain("ADD COLUMN IF NOT EXISTS "+coluna);
   const apply=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.ec_aplicar_integracao("),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.ec_bloquear_avanco_sem_origem("));
   expect(apply).toContain("SET valor_atestado_automatico=e.valor_novo");
   expect(apply).toContain("exigir_escolha");
   expect(apply).not.toContain("SET valor_atestado=e.valor_novo WHERE");
   expect(apply).toContain("e.status<>'proposta'");
   expect(sql).toContain("status='aplicada'");
 });
 it("origem precisa de ato fiscal SEI e confirmação no banco",()=>{
   expect(sql).toContain("ec_atesto_escolher_fonte");
   expect(sql).toContain("ec_escolha_pendente=false");
   expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.eletivas_atesto_escolhas");
   expect(sql).toContain("CREATE TRIGGER ec_escolhas_imutaveis");
   expect(sql).toContain("p_valor_anterior");
   expect(sql).toContain("ec_bloquear_avanco_sem_origem");
   expect(sql).toContain("ec_fontes_atesto_insert_guard");
   expect(sql).toContain("Lançamento novo não aceita atesto automático injetado.");
   expect(tela).toContain("Considerar valor manual");
   expect(tela).toContain("Considerar valor automático");
   expect(tela).toContain("Histórico de escolhas");
 });
 it("formulário geral grava o manual, nunca a coluna automática",()=>{
   expect(lanc).toContain("valor_atestado_manual: merged.valor_atestado_manual");
   expect(lanc).not.toContain("valor_atestado: merged.valor_atestado ?");
   expect(lanc).toContain("<ValorAtestadoEtapa6");
   expect(tela).toContain("manualAlterado(v)");
   expect(f6).toContain("proposta");
   expect(f6).toContain("valor manual");
 });
});
