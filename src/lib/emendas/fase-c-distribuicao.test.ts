import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {saldosDistribuicao,valorMoedaDistribuicao} from "./distribuicao-ne";

const c1=readFileSync(new URL("../../../supabase/migrations/20261126110000_emendas_fase_c1_ne_competencias.sql",import.meta.url),"utf8");
const c2=readFileSync(new URL("../../../supabase/migrations/20261126111500_emendas_fase_c2_distribuicao_protecao_rpc.sql",import.meta.url),"utf8");
const c3=readFileSync(new URL("../../../supabase/migrations/20261126113000_emendas_fase_c3_paineis_ne.sql",import.meta.url),"utf8");
const pagina=readFileSync(new URL("../../routes/_authenticated/emendas.$id_.lancamentos.$lancamentoId.tsx",import.meta.url),"utf8");
const painel=readFileSync(new URL("../../components/emendas/PainelDistribuicaoNeEmenda.tsx",import.meta.url),"utf8");
const tipos=readFileSync(new URL("../../integrations/supabase/types.ts",import.meta.url),"utf8");

describe("Emendas · Fase C · valores financeiros",()=>{
 it("não confunde valor distribuído com compromisso efetivo",()=>{
  expect(saldosDistribuicao({ne:120000,anulacoes:0,alocado:70000,comprometido:45000}))
   .toEqual({neLiquida:120000,semDistribuicao:50000,aComprometer:75000});
 });
 it("respeita anulações e centavos",()=>{
  expect(saldosDistribuicao({ne:100.03,anulacoes:20.01,alocado:75.01,comprometido:50.01}))
   .toEqual({neLiquida:80.02,semDistribuicao:5.01,aComprometer:30.01});
 });
 it("interpreta moeda pt-BR e rejeita entradas ambíguas ou inválidas",()=>{
  expect(valorMoedaDistribuicao("1.234,56")).toBe(1234.56);
  expect(valorMoedaDistribuicao("1000,00")).toBe(1000);
  expect(valorMoedaDistribuicao("150.55")).toBe(150.55);
  expect(valorMoedaDistribuicao("0")).toBeNull();
  expect(valorMoedaDistribuicao("12,345")).toBeNull();
  expect(valorMoedaDistribuicao("-5,00")).toBeNull();
 });
});
describe("Emendas · Fase C · estrutura, garantias e histórico",()=>{
 it("migrations são aditivas e transacionais, sem rateio ou atualização de dados legados",()=>{
  for(const file of [c1,c2,c3]){
   expect(file).toMatch(/^BEGIN;/m);
   expect(file).toMatch(/^COMMIT;/m);
   expect(file).not.toMatch(/\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM\s+public\.emenda_|UPDATE\s+public\.emenda_lancamento_meses)\b/i);
  }
  expect(c1).not.toMatch(/\bINSERT\s+INTO\s+public\.emenda_ne_competencias/i);
  expect(c2).not.toMatch(/\bINSERT\s+INTO\s+public\.emenda_lancamento_meses/i);
 });
 it("suporta várias NEs na mesma competência e uma NE em várias competências",()=>{
  expect(c1).toContain("UNIQUE(solicitacao_id,competencia_id)");
  expect(c1).toContain("FOREIGN KEY (solicitacao_id,emenda_id)");
  expect(c1).toContain("FOREIGN KEY (lancamento_id,competencia_id)");
  expect(c1).not.toContain("UNIQUE(competencia_id)");
  expect(c2).toContain("emenda_lancamento_meses");
 });
 it("define valor explícito e impede distribuir acima da NE líquida",()=>{
  expect(c1).toContain("valor_alocado numeric(16,2) NOT NULL");
  expect(c2).toContain("IF demais+NEW.valor_alocado>ne.valor_ne-anuladas THEN");
  expect(c2).toContain("IF NEW.valor_alocado<reservado_competencia THEN");
  expect(c2).toContain("IF NEW.status='subempenhado' THEN");
  expect(c2).toContain("valor_novo:=NEW.valor_subempenhado;");
  expect(c2).toContain("valor_novo:=NEW.valor_solicitado;");
  expect(c2).toContain("IF comprometido + valor_novo > teto THEN");
 });
 it("protege anulações, fluxo legado, status da NE e exclusão física",()=>{
  for(const item of [
   "guard_emenda_ne_competencias","guard_emenda_c_subempenho_distribuicao",
   "guard_emenda_c_anulacao_distribuicao","guard_emenda_c_liberacao_legada",
   "guard_emenda_c_ne_distribuida"
  ])expect(c2).toContain(item);
  expect(c2).toContain("Distribuição da NE não pode ser apagada");
  expect(c2).toContain("Distribuição cancelada somente admite reativação formal.");
  expect(c2).toContain("SET valor_alocado=p_valor,status='ativa'");
  expect(c1).toContain("AFTER INSERT OR UPDATE OR DELETE ON public.emenda_ne_competencias");
  expect(c2).toContain("FOR UPDATE");
 });
 it("restringe acesso direto e RPCs a papéis autorizados",()=>{
  expect(c1).toContain("ENABLE ROW LEVEL SECURITY");
  expect(c1).toContain("GRANT SELECT ON public.emenda_ne_competencias TO authenticated");
  expect(c2).toContain("public.has_any_role");
  expect(c2).toContain("FROM PUBLIC,anon");
  expect(c2).toContain("TO authenticated");
  expect(c2).toContain("SECURITY DEFINER SET search_path=''");
 });
 it("visões usam permissões de invocador e agregam compromissos sem multiplicar joins",()=>{
  expect(c3).toMatch(/security_invoker=true/g);
  expect(c3).toContain("LEFT JOIN LATERAL");
  expect(c3).toContain("total_reservado");
  expect(c3).toContain("saldo_competencia");
  expect(c3).toContain("saldo_a_distribuir");
  expect(c3).toContain("saldo_ne_a_comprometer");
 });
 it("painel permite distribuir manualmente sem alterar a execução documental",()=>{
  expect(pagina).toContain("<PainelDistribuicaoNeEmenda");
  expect(painel).toContain('emenda_ne_competencia_definir');
  expect(painel).toContain('emenda_ne_competencia_cancelar');
  expect(painel).toContain("Reativar");
  expect(painel).toContain('Outras NEs nesta competência');
  expect(painel).toContain('períodos trimestrais e anuais nunca são rateados automaticamente');
  expect(tipos).toContain("emenda_ne_competencias: {");
  expect(tipos).toContain("emenda_ne_competencias_painel: {");
  expect(tipos).toContain("emenda_ne_painel: {");
 });
});
