import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resumoFinanceiroParcelasEmenda} from "./pagamentos-parciais";
const prefix="../../../supabase/migrations/";
const e1=readFileSync(new URL(prefix+"20261126130000_emendas_fase_e1_livro_pagamentos.sql",import.meta.url),"utf8");
const e2=readFileSync(new URL(prefix+"20261126131500_emendas_fase_e2_movimentos_transacionais.sql",import.meta.url),"utf8");
const e3=readFileSync(new URL(prefix+"20261126133000_emendas_fase_e3_paineis_pagamentos.sql",import.meta.url),"utf8");
const painel=readFileSync(new URL("../../components/emendas/PainelPagamentosEmenda.tsx",import.meta.url),"utf8");
const cadeia=readFileSync(new URL("../../components/emendas/FluxoSubempenhosEmenda.tsx",import.meta.url),"utf8");
const rota=readFileSync(new URL("../../routes/_authenticated/emendas.$id_.lancamentos.$lancamentoId.tsx",import.meta.url),"utf8");
const tipos=readFileSync(new URL("../../integrations/supabase/types.ts",import.meta.url),"utf8");

describe("Emendas · Fase E · projeções financeiras em centavos",()=>{
 it("programação isolada nunca representa valor pago",()=>{
  expect(resumoFinanceiroParcelasEmenda(120000,[
   {programadoAtual:40000,pagoBruto:0,devolvido:0,estornado:0}
  ])).toEqual({
   programado:40000,pagoBruto:0,devolvido:0,estornado:0,pagoLiquido:0,
   saldoAProgramar:80000,saldoAPagar:120000,saldoZerado:false
  });
 });
 it("duas parcelas preservam pagamentos parciais em separado",()=>{
  const r=resumoFinanceiroParcelasEmenda(120000,[
   {programadoAtual:30000,pagoBruto:28000,devolvido:0,estornado:0},
   {programadoAtual:40000,pagoBruto:10000,devolvido:0,estornado:0},
  ]);
  expect(r.programado).toBe(70000);
  expect(r.pagoLiquido).toBe(38000);
  expect(r.saldoAPagar).toBe(82000);
  expect(r.saldoZerado).toBe(false);
 });
 it("devolução e estorno reduzem apenas valor efetivamente pago líquido",()=>{
  const r=resumoFinanceiroParcelasEmenda(100,[
   {programadoAtual:100,pagoBruto:100,devolvido:20.01,estornado:5.01},
  ]);
  expect(r.programado).toBe(100);
  expect(r.pagoBruto).toBe(100);
  expect(r.pagoLiquido).toBe(74.98);
  expect(r.saldoAPagar).toBe(25.02);
 });
 it("somente saldo realmente zerado pode seguir para conciliação manual",()=>{
  const r=resumoFinanceiroParcelasEmenda(100.03,[
   {programadoAtual:60.02,pagoBruto:60.02,devolvido:0,estornado:0},
   {programadoAtual:40.01,pagoBruto:40.01,devolvido:0,estornado:0},
  ]);
  expect(r).toMatchObject({saldoAProgramar:0,saldoAPagar:0,saldoZerado:true});
 });
});
describe("Emendas · Fase E · contratos de dados",()=>{
 it("três migrations aditivas, transacionais, sem atualizar pagamentos históricos",()=>{
  for(const src of [e1,e2,e3]){
   expect(src).toMatch(/^BEGIN;/m);
   expect(src).toMatch(/^COMMIT;/m);
   expect(src).not.toMatch(/\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM\s+public\.emenda_|UPDATE\s+public\.emenda_blocos_pagamento)\b/i);
  }
  expect(e1).not.toContain("ALTER TABLE public.emenda_blocos_pagamento");
  expect(e2).not.toContain("INSERT INTO public.emenda_liberacoes");
 });
 it("seis entidades independentes, com auditoria, RBAC e FK até o subempenho",()=>{
  for(const tabela of ["parcelas","programacoes","comprovantes","ajustes","retificacoes","conciliacoes"]){
   expect(e1).toContain("CREATE TABLE public.emenda_pagamento_"+tabela);
   expect(e1).toContain("ALTER TABLE public.emenda_pagamento_"+tabela+" ENABLE ROW LEVEL SECURITY");
   expect(e1).toContain("ON public.emenda_pagamento_"+tabela+" FOR EACH ROW EXECUTE FUNCTION public.emenda_auditar_lancamento()");
   expect(tipos).toContain("emenda_pagamento_"+tabela+": {");
  }
  expect(e1).toContain("FOREIGN KEY(subempenho_id,emenda_id)");
  expect(e1).toContain("FOREIGN KEY(parcela_id,emenda_id,subempenho_id)");
 });
 it("cada parcela aceita um comprovante mas várias programações documentais",()=>{
  expect(e1).toContain("UNIQUE(parcela_id)");
  expect(e1).toContain("UNIQUE(parcela_id,sequencia)");
  expect(e1).toContain("UNIQUE(subempenho_id,sequencia)");
  expect(e2).toContain("use nova parcela para pagamento adicional");
  expect(e2).toContain("ORDER BY g.sequencia DESC LIMIT 1");
 });
 it("RPCs serializam pela emenda, validam autorização e idempotência",()=>{
  for(const rpc of ["emenda_pag_parcela_criar","emenda_pag_programar","emenda_pag_comprovar",
   "emenda_pag_ajustar","emenda_pag_retificar","emenda_pag_conciliar"]){
   expect(e2).toContain("CREATE FUNCTION public."+rpc+"(");
   expect(e2).toContain("REVOKE ALL ON FUNCTION public."+rpc+"(");
   expect(e2).toContain("GRANT EXECUTE ON FUNCTION public."+rpc+"(");
   expect(tipos).toContain(rpc+": {");
  }
  expect((e2.match(/FOR UPDATE/g)||[]).length).toBeGreaterThanOrEqual(6);
  expect(e2).toContain("SECURITY DEFINER SET search_path=''");
  expect(e2).toContain("public.has_any_role");
  expect(e2).toContain("chave_idempotencia");
 });
 it("programações e comprovações exigem valores diferentes e não confundem as evidências",()=>{
  expect(e1).toContain("valor_programado numeric(16,2)");
  expect(e1).toContain("valor_pago numeric(16,2)");
  expect(e1).toContain("data_prevista date NOT NULL");
  expect(e1).toContain("data_pagamento date NOT NULL");
  expect(e2).toContain("p_valor>prog.valor_programado");
  expect(e2).toContain("Pagamento excederia o valor do Aviso de Subempenho");
  expect(e2).toContain("Soma das programações vigentes supera o valor subempenhado");
 });
 it("devolução e estorno não ultrapassam o comprovante e conservam histórico",()=>{
  expect(e2).toContain("ja_ajustado+p_valor>c.valor_pago");
  expect(e1).toContain("'devolucao','estorno'");
  expect(e2).toContain("guard_emenda_pag_ajuste_immut");
  expect(e1).toContain("retificacoes");
  expect(e2).toContain("num_nonnulls(p_programacao,p_comprovante,p_ajuste)<>1");
 });
 it("só concilia mediante confirmação documentada de saldo totalmente quitado",()=>{
  expect(e2).toContain("CREATE FUNCTION public.emenda_pag_conciliar");
  expect(e2).toContain("liquido<>sub.valor_subempenhado OR programado<>sub.valor_subempenhado");
  expect(e2).toContain("A reabertura exige conciliação anterior vigente");
  expect(e2).toContain("Subempenho conciliado: registre reabertura formal");
  expect(e1).toContain("valor_pago_liquido_snapshot");
  expect(e3).toContain("'saldo_zerado_aguardando_conciliacao'");
  expect(e3).toContain("'conciliado'");
 });
 it("resumos calculam líquido e mostram soma programada como métrica distinta",()=>{
  expect(e3).toContain("security_invoker=true");
  expect(e3).toContain("LEFT JOIN LATERAL");
  expect(e3).toContain("AS valor_pago_liquido");
  expect(e3).toContain("AS saldo_a_pagar");
  expect(e3).toContain("AS saldo_a_programar");
  expect(e3).toContain("AS programado_nao_pago");
  expect(tipos).toContain("emenda_pagamento_subempenhos_painel: {");
  expect(tipos).toContain("emenda_pagamento_parcelas_painel: {");
 });
 it("interface traz cartões independentes, ajustes, retificação e conciliação manual",()=>{
  expect(cadeia).toContain("<PainelPagamentosEmenda");
  for(const action of ["emenda_pag_parcela_criar","emenda_pag_programar",
    "emenda_pag_comprovar","emenda_pag_ajustar","emenda_pag_retificar","emenda_pag_conciliar"])
   expect(painel).toContain(action);
  expect(painel).toContain("A programação");
  expect(painel).toContain("Conciliar pagamento");
  expect(painel).toContain("Reabrir conciliação");
  expect(painel).toContain("retificacoes.map");
  expect(rota).toContain('emenda_pagamento_ajustes:"Devolução / Estorno"');
 });
});
