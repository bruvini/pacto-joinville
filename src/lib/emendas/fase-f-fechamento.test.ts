import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {diagnosticoFechamentoNe,consolidarSituacaoEmenda} from "./fechamento-ne";
const read=(nome:string)=>readFileSync(new URL("../../../supabase/migrations/"+nome,import.meta.url),"utf8");
const f1=read("20261126140000_emendas_fase_f1_diagnosticos_fechamento.sql");
const f2=read("20261126141500_emendas_fase_f2_anulacao_conciliacao_rpc.sql");
const f3=read("20261126143000_emendas_fase_f3_travas_encerramento.sql");
const fluxo=readFileSync(new URL("../../components/emendas/FluxoAnulacaoEmenda.tsx",import.meta.url),"utf8");
const lista=readFileSync(new URL("../../components/emendas/ExecucaoEmenda.tsx",import.meta.url),"utf8");
const rota=readFileSync(new URL("../../routes/_authenticated/emendas.$id_.lancamentos.$lancamentoId.tsx",import.meta.url),"utf8");
const types=readFileSync(new URL("../../integrations/supabase/types.ts",import.meta.url),"utf8");
const base={
 valorNe:120000,anulacoes:0,liberacoesLegadas:0,compromissosNovos:0,
 distribuido:0,pagoLegado:0,pagoNovo:0,
 totalCompetencias:3,competenciasPendentes:0,documentosPendentes:0,
 subempenhosPendentes:0,subempenhosNaoConciliados:0,
};
describe("Emendas · Fase F · apuração e encerramento",()=>{
 it("anulação protege distribuição e compromissos, sem somá-los duas vezes",()=>{
  const r=diagnosticoFechamentoNe({...base,valorNe:100000,compromissosNovos:50000,
   distribuido:70000,pagoNovo:30000});
  expect(r.saldoDisponivelAnular).toBe(30000);
  expect(r.saldoParaAnularNoFechamento).toBe(50000);
  expect(r.precisaReduzirDistribuicao).toBe(true);
  expect(r.saldoPagamentosPendente).toBe(20000);
  expect(r.prontaConciliar).toBe(false);
 });
 it("a anulação integral com competências sem execução é conciliável sem comprovante fictício",()=>{
  const r=diagnosticoFechamentoNe({...base,valorNe:100000,anulacoes:100000});
  expect(r.prontaConciliar).toBe(true);
  expect(r.saldoPagamentosPendente).toBe(0);
  expect(r.saldoParaAnularNoFechamento).toBe(0);
 });
 it("execução legada concilia somente depois de liquidar e anular corretamente",()=>{
  const r=diagnosticoFechamentoNe({...base,anulacoes:40000,
   liberacoesLegadas:80000,pagoLegado:80000});
  expect(r.prontaConciliar).toBe(true);
 });
 it("subempenho de R$ 80 mil com só R$ 60 mil pagos continua pendente",()=>{
  const r=diagnosticoFechamentoNe({...base,anulacoes:40000,
   compromissosNovos:80000,distribuido:80000,pagoNovo:60000,subempenhosNaoConciliados:1});
  expect(r.saldoPagamentosPendente).toBe(20000);
  expect(r.prontaConciliar).toBe(false);
 });
 it("saldo financeiro zerado não substitui conciliação de cada subempenho",()=>{
  const r=diagnosticoFechamentoNe({...base,anulacoes:40000,
   compromissosNovos:80000,distribuido:80000,pagoNovo:80000,subempenhosNaoConciliados:1});
  expect(r.saldoPagamentosPendente).toBe(0);
  expect(r.prontaConciliar).toBe(false);
 });
 it("documentos ou competências pendentes impedem encerramento",()=>{
  expect(diagnosticoFechamentoNe({...base,anulacoes:120000,documentosPendentes:1}).prontaConciliar).toBe(false);
  expect(diagnosticoFechamentoNe({...base,anulacoes:120000,competenciasPendentes:1}).prontaConciliar).toBe(false);
  expect(diagnosticoFechamentoNe({...base,anulacoes:120000,subempenhosPendentes:1}).prontaConciliar).toBe(false);
 });
 it("conflito de modelos não produz conclusão, mesmo com somas compatíveis",()=>{
  const r=diagnosticoFechamentoNe({...base,liberacoesLegadas:10000,compromissosNovos:10000,
   anulacoes:110000,pagoLegado:10000,pagoNovo:10000});
  expect(r.conflito).toBe(true);
  expect(r.prontaConciliar).toBe(false);
 });
 it("emenda com duas NEs não é concluída quando apenas uma encerrou",()=>{
  expect(consolidarSituacaoEmenda([
   {conciliada:true,saldoParaAnular:0,saldoPagar:0},
   {conciliada:false,saldoParaAnular:15000,saldoPagar:5000}
  ])).toMatchObject({
   totalNes:2,nesConciliadas:1,nesPendentes:1,totalmenteConciliada:false,
   saldoParaAnular:15000,saldoPagamentos:5000
  });
 });
});
describe("Emendas · Fase F · SQL e frontend",()=>{
 it("três migrations transacionais e aditivas sem regravar evidências anteriores",()=>{
  for(const f of [f1,f2,f3]){
   expect(f).toMatch(/^BEGIN;/m);
   expect(f).toMatch(/^COMMIT;/m);
   expect(f).not.toMatch(/\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM\s+public\.emenda_|UPDATE\s+public\.emenda_blocos_pagamento)\b/i);
  }
  expect(f2).toContain("ADD COLUMN total_comprometido");
  expect(f2).toContain("ADD COLUMN total_pago_liquido");
 });
 it("distingue competências executadas e formalmente encerradas sem execução",()=>{
  expect(f1).toContain("CREATE VIEW public.emenda_f_competencias_painel");
  for(const status of ["sem_execucao","executada_legado","executada_novo","pendente","inconsistente"])
   expect(f1).toContain("'"+status+"'");
  expect(f1).toContain("subempenhos_nao_conciliados");
  expect(f2).toContain("CREATE OR REPLACE FUNCTION public.emenda_encerrar_competencia_sem_execucao(");
  expect(f2).toContain("comp.valor_distribuido<>0");
  expect(f2).toContain("comp.documentos_legados<>0");
 });
 it("anula somente saldo livre de distribuição e compromissos, com SEI",()=>{
  expect(f1).toContain("greatest(coalesce(alc.total,0),coalesce(b.total_liberado_legado,0)");
  expect(f1).toContain("saldo_disponivel_anular");
  expect(f1).toContain("saldo_a_anular_fechamento");
  expect(f2).toContain("p_valor>ne.saldo_disponivel_anular");
  expect(f2).toContain("f.saldo_a_anular_fechamento>f.saldo_disponivel_anular");
  expect(f2).not.toContain("Conclua todas as competências antes da anulação.");
 });
 it("concilia NE somente com pagamentos líquidos, documentos e competências resolvidos",()=>{
  expect(f1).toContain("AS pronta_conciliar");
  expect(f1).toContain("competencias_pendentes");
  expect(f1).toContain("subempenhos_nao_conciliados");
  expect(f1).toContain("saldo_de_pagamentos_pendentes");
  expect(f2).toContain("NOT coalesce(f.pronta_conciliar,false)");
  expect(f2).toContain("modelo_financeiro,total_comprometido,total_pago_liquido,total_distribuido");
  expect(f2).toContain("UPDATE public.emenda_solicitacoes SET status='encerrada'");
 });
 it("travas impedem novos atos após conciliação e preservam histórico",()=>{
  for(const tabela of ["emenda_ne_competencias","emenda_subempenhos","emenda_anulacoes",
   "emenda_pagamento_parcelas","emenda_pagamento_comprovantes","emenda_pagamento_conciliacoes"]){
   expect(f3).toContain("ON public."+tabela);
  }
  expect(f3).toContain("NE conciliada e encerrada: movimentos financeiros proibidos.");
  expect(f3).toContain("guard_f_conciliacao_validar");
  expect(f3).toContain("guard_f_conc_immut");
  expect(f2).toContain("OLD.status='emitida' AND NEW.status='encerrada'");
 });
 it("visões respeitam RLS e consolidam todas as NEs da mesma emenda",()=>{
  expect((f1.match(/security_invoker=true/g)||[]).length).toBe(3);
  expect(f1).toContain("CREATE VIEW public.emenda_f_emenda_painel");
  expect(f1).toContain("nes_pendentes");
  expect(f1).toContain("totalmente_conciliada");
  for(const nome of ["emenda_f_competencias_painel","emenda_f_ne_painel","emenda_f_emenda_painel"])
   expect(types).toContain(nome+": {");
 });
 it("interface não exige pagamento em todas as competências sem considerar sem execução",()=>{
  expect(fluxo).toContain("Encerrar sem execução");
  expect(fluxo).toContain("emenda_encerrar_competencia_sem_execucao");
  expect(fluxo).toContain("saldo_disponivel_anular");
  expect(fluxo).toContain("saldo_a_anular_fechamento");
  expect(fluxo).toContain("!ne?.pronta_conciliar");
  expect(fluxo).not.toContain("parcelasCompletas");
  expect(rota).toContain("emenda_f_competencias_painel");
  expect(lista).toContain("Conciliação financeira consolidada da emenda");
  expect(lista).toContain("emenda_f_emenda_painel");
 });
});
