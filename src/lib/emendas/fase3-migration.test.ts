import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
const sql=readFileSync(new URL("../../../supabase/migrations/20261028233000_emendas_lancamentos_fase3_documental.sql",import.meta.url),"utf8");
describe("Fase 3: contratos SQL das etapas documentais",()=>{
 it("prepara meses e parcelas antes da reserva",()=>{
  expect(sql).toContain("CREATE TABLE public.emenda_lancamentos");
  expect(sql).toContain("CREATE TABLE public.emenda_lancamento_meses");
  expect(sql).toContain("liberacoes_minimas integer NOT NULL DEFAULT 1");
  expect(sql).toContain("parcela_convenio");
  expect(sql).toContain("CREATE FUNCTION public.emenda_iniciar_lancamento(");
 });
 it("reserva só após três etapas e três assinaturas",()=>{
  expect(sql).toContain("CREATE FUNCTION public.emenda_formalizar_lancamento(");
  expect(sql).toContain("count(DISTINCT etapa)");
  expect(sql).toContain("count(DISTINCT papel)");
  expect(sql).toContain("public.emenda_formalizar_solicitacao(");
 });
 it("conferência não é assinatura eletrônica",()=>{
  expect(sql).toContain("CREATE TABLE public.emenda_assinaturas_conferidas");
  expect(sql).toContain("Conferência humana de evidências SEI");
 });
 it("operações com saldo por RPC e tabelas com RLS",()=>{
  expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.emenda_formalizar_solicitacao");
  expect(sql).toContain("FOR UPDATE");
  expect(sql).toContain("emenda_registrar_ne_documental");
 });
 it("editar etapas invalida conferências posteriores",()=>{
  expect(sql).toContain("DELETE FROM public.emenda_etapas_documentais");
  expect(sql).toContain("DELETE FROM public.emenda_assinaturas_conferidas");
  expect(sql).toContain("AFTER INSERT OR UPDATE OR DELETE");
 });
});
