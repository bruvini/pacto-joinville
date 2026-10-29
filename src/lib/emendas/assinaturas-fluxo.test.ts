import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../../../supabase/migrations/20261029022000_emendas_assinaturas_fluxo_envio.sql",import.meta.url),"utf8");
const matriz=readFileSync(new URL("../../components/emendas/EtapasLancamento.tsx",import.meta.url),"utf8");
const pagina=readFileSync(new URL("../../routes/_authenticated/emendas.$id_.lancamentos.$lancamentoId.tsx",import.meta.url),"utf8");
const fase5=readFileSync(new URL("../../components/emendas/Fase5Emenda.tsx",import.meta.url),"utf8");
describe("Emendas: envio à SEFAZ e assinaturas alternativas",()=>{
 it("corrige ambiguidade etapa no backend",()=>{
  expect(sql).toContain("documento_solicitacao public.emenda_etapas_documentais%ROWTYPE");
  expect(sql).toContain("d.etapa='solicitacao'");
  expect(sql).not.toContain("SELECT * INTO etapa");
  expect(sql).toContain("CREATE OR REPLACE FUNCTION public.emenda_confirmar_envio_sefaz");
 });
 it("cinco grupos obrigatórios admitem até sete signatários",()=>{
  expect(sql).toContain("'gerencia_acp_coord'");
  expect(sql).toContain("'diretoria_financeira_secretaria'");
  expect(sql).toContain("WHEN a.papel IN ('gerencia_acp','gerencia_acp_coord') THEN 'gerencia_acp'");
  expect(sql).toContain("WHEN a.papel IN ('diretoria_financeira','diretoria_financeira_secretaria') THEN 'diretoria_financeira'");
  expect(matriz).toContain('const gruposObrigatorios=["orcamentos","fiscal","gerencia","diretor","financeiro"]');
  expect(matriz).toContain("gruposCompletos(assinaturas)===5");
  expect(matriz).toContain("const elegiveis=pool.filter");
 });
 it("preserva assinatura secretaria legada, sem alterar data",()=>{
  expect(sql).toContain("SET papel='diretoria_financeira_secretaria'");
  expect(sql).toContain("a.cargo_signatario='Secretária de Saúde'");
 });
 it("remoção auditada só em rascunho antes do envio",()=>{
  expect(sql).toContain("CREATE FUNCTION public.emenda_remover_assinatura");
  expect(sql).toContain("lanc.status<>'rascunho'");
  expect(sql).toContain("EXISTS(SELECT 1 FROM public.emenda_envios_sefaz");
  expect(sql).toContain("DELETE FROM public.emenda_assinaturas_conferidas");
  expect(matriz).toContain('emenda_remover_assinatura');
  expect(matriz).toContain('Retirar conferência');
  expect(matriz).toContain('setAssinaturaParaRemover(ass)');
 });
 it("envio só é exibido com todos os cinco grupos completos",()=>{
  expect(matriz).toContain('{assinaturasCompletas&&<section className="space-y-2 border-t pt-4">');
  expect(matriz).toContain("confirmarEnvio.mutate()");
 });
});
describe("Emendas: hierarquia e linha do tempo",()=>{
 it("timeline modal no cabeçalho registra inclusive remoções",()=>{
  expect(pagina).toContain('setHistoricoAberto(true)');
  expect(pagina).toContain('<Dialog open={historicoAberto}');
  expect(pagina).toContain("h.anterior");
  expect(pagina).toContain("h.novo");
  expect(pagina).toContain('h.acao==="DELETE"');
  expect(pagina).toContain('autores.data?.get(h.usuario_id)');
 });
 it("etapa de liberação sempre visível, bloqueada antes da NE",()=>{
  expect(pagina).toContain("Aguardando a Nota de Empenho e suas assinaturas");
  expect(pagina).toContain("!liberacaoPermitida&&<LockKeyhole");
  expect(pagina).toContain("liberacaoPermitida&&<div className=\"border-t p-4\">");
 });
 it("anulação só tem ação quando existe saldo residual",()=>{
  expect(fase5).toContain("residual>0&&<Button");
  expect(fase5).toContain("Conciliar e encerrar NE");
 });
});
