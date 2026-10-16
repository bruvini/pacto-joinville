import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolverDestinoEncontro,type ParcelaVinculo} from "./competencias";
const ler=(p:string)=>readFileSync(fileURLToPath(new URL("../../../"+p,import.meta.url)),"utf8");
const sql=ler("supabase/migrations/20261016120000_eletivas_fase1_fundacao_competencias.sql");
const lista=ler("src/routes/_authenticated/eletivas.index.tsx");
const detalhe=ler("src/routes/_authenticated/eletivas.$id.tsx");
const f=(v:Partial<ParcelaVinculo>={}):ParcelaVinculo=>({
 lancamento_id:"p1",encontro_id:null,encontro_lancamento_id:null,encontro_status:null,...v,
});
describe("Fase 1 — fundação institucional",()=>{
 it("cria somente competência inexistente",()=>{
  expect(resolverDestinoEncontro(f())).toEqual({acao:"criar"});
 });
 it("abre o encontro existente sem reprocessar",()=>{
  expect(resolverDestinoEncontro(f({encontro_id:"ec1",encontro_lancamento_id:"p1",
   encontro_status:"auditoria"}))).toEqual({acao:"abrir",id:"ec1"});
 });
 it("permite primeiro vínculo a encontro legado aberto",()=>{
  for(const status of ["preparacao","auditoria","pendente_validacao"])
   expect(resolverDestinoEncontro(f({encontro_id:"ec1",encontro_status:status})))
    .toEqual({acao:"vincular",id:"ec1"});
 });
 it("nega troca de origem e encontro encerrado",()=>{
  for(const p of [
   f({encontro_id:"ec1",encontro_lancamento_id:"p2",encontro_status:"auditoria"}),
   f({encontro_id:"ec1",encontro_status:"encerrada"}),
   f({encontro_id:"ec1",encontro_status:"desconhecido"}),
  ])expect(resolverDestinoEncontro(p).acao).toBe("bloquear");
 });
 it("SQL é incremental e não altera valores financeiros",()=>{
  expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;\s*$/);
  expect(sql).not.toMatch(/CREATE TABLE|UPDATE public\.lancamentos_pagamento SET/);
 });
 it("edição busca CNES na base e protege evidências",()=>{
  const f=sql.split("CREATE OR REPLACE FUNCTION public.ec_editar_competencia(")[1];
  expect(f).toContain("SELECT r.cnes INTO cnes_oficial");
  expect(f).toContain("cnes=cnes_oficial");
  for(const t of ["c.documentos IS DISTINCT FROM '{}'::jsonb",
   "eletivas_correcoes","eletivas_decisoes_revisoes","eletivas_fpo_programacoes"])
   expect(f).toContain(t);
 });
 it("vínculo já preenchido não muda, mesmo com nova parcela",()=>{
  expect(sql).toContain("IF c.lancamento_id IS NOT NULL THEN");
  expect(sql).toContain("IF c.lancamento_id=p_lancamento THEN RETURN; END IF;");
  expect(sql).toContain("vinculo_convenio_confirmado");
 });
 it("exclusão de rascunho com documento é bloqueada",()=>{
  const f=sql.split("CREATE OR REPLACE FUNCTION public.ec_excluir_competencia(")[1];
  expect(f).toContain("c.documentos IS DISTINCT FROM '{}'::jsonb");
  expect(f).toContain("INSERT INTO public.eletivas_exclusoes");
 });
 it("interface mantém seleção e permite recuperar origem e histórico",()=>{
  for(const x of ["Instituição","Convênio","Competência / Parcela",
   "ec_criar_competencia_vinculada","resolverDestinoEncontro"])
   expect(lista).toContain(x);
  expect(detalhe).toContain('queryKey:["ec-origem-lancamento"');
  expect(detalhe).toContain("Carregar mais eventos anteriores");
  expect(detalhe).toContain(".limit(limiteEventos)");
 });
});
