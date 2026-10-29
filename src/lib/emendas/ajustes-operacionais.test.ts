import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../../../supabase/migrations/20261029012000_emendas_autorizacao_dotacao_validacao.sql",import.meta.url),"utf8");
const etapa=readFileSync(new URL("../../components/emendas/EtapasLancamento.tsx",import.meta.url),"utf8");
const execucao=readFileSync(new URL("../../components/emendas/ExecucaoEmenda.tsx",import.meta.url),"utf8");
const capa=readFileSync(new URL("../../routes/_authenticated/emendas.$id.tsx",import.meta.url),"utf8");
describe("Emendas · autorização e confirmação de orçamento",()=>{
 it("parecer aprovado não exige justificativa",()=>{
  expect(sql).toContain("desfecho='aprovado' OR length(btrim(comentario)) >= 5");
  expect(sql).toContain("p_desfecho='recusado' AND length(btrim(coalesce(p_comentario,'')))<5");
  expect(etapa).toContain('desfecho==="recusado"&&comentario.trim().length<5');
  expect(etapa).toContain('desfecho==="aprovado"?"Confirmar aprovação"');
 });
 it("recusa tem justificativa obrigatória e o parecer é auditado",()=>{
  expect(sql).toContain("INSERT INTO public.emenda_pareceres_financeiros");
  expect(sql).toContain("p_desfecho='aprovado' THEN '' ELSE btrim(p_comentario)");
 });
 it("confirmação da dotação tem nome, data, hora e estado persistente",()=>{
  expect(etapa).toContain('queryKey:["emendas","confirmador-dotacao"');
  expect(etapa).toContain("dot.conferido_em");
  expect(etapa).toContain("checked={dotOk}");
  expect(etapa).toContain("dotacao.trim()===dot.dotacao?.trim()");
  expect(etapa).toContain("fonte.trim()===dot.fonte?.trim()");
 });
 it("dotação vazia interrompe posteriores também no backend",()=>{
  expect(etapa).toContain("emenda_invalidar_dotacao");
  expect(etapa).toContain("aoSairDaDotacao");
  expect(sql).toContain("DELETE FROM public.emenda_etapas_documentais");
  expect(sql).toContain("l.status<>'rascunho'");
  expect(sql).toContain("DELETE FROM public.emenda_assinaturas_conferidas");
 });
 it("rastreia edição de rascunho com apenas dotação, mas não apaga parecer",()=>{
  expect(sql).toContain("CREATE OR REPLACE FUNCTION public.emenda_editar_lancamento");
  expect(sql).toContain("PERFORM public.emenda_invalidar_dotacao(l.id)");
  expect(sql).toContain("etapa<>'dotacao'");
  expect(sql).toContain("EXISTS(SELECT 1 FROM public.emenda_pareceres_financeiros");
 });
});
describe("Emendas · prioridade da lista de lançamentos",()=>{
 it("linhas abrem execução; Gerenciar abre modal administrativo",()=>{
  expect(execucao).toContain('role="link" tabIndex={0}');
  expect(execucao).toContain('onClick={e=>{e.stopPropagation();editar(l);}}');
  expect(execucao).toContain('>Gerenciar</Button>');
  expect(execucao).toContain("setExcluindo(editando)");
 });
 it("indicadores são opcionais e não precedem os lançamentos",()=>{
  expect(execucao.indexOf("<Card>")).toBeLessThan(execucao.indexOf("<PainelIndicadoresEmenda"));
  expect(execucao).toContain("indicadoresAbertos&&dados.data");
  expect(capa.indexOf("<ExecucaoEmenda")).toBeLessThan(capa.indexOf("Consultar vinculação, portarias"));
 });
});
