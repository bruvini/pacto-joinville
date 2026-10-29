import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../../../supabase/migrations/20261029015000_emendas_revisao_matriz_e_parecer.sql",import.meta.url),"utf8");
const ui=readFileSync(new URL("../../components/emendas/EtapasLancamento.tsx",import.meta.url),"utf8");
describe("Emendas: autorização reversível",()=>{
 it("reabertura é um evento auditável sem apagar a aprovação",()=>{
  expect(sql).toContain("'aprovado','recusado','reaberto'");
  expect(sql).toContain("emenda_reabrir_aprovacao(");
  expect(sql).toContain("'Aprovação revertida para nova análise financeira.'");
  expect(sql).toContain("DELETE FROM public.emenda_assinaturas_conferidas");
  expect(sql).toContain("l.status<>'rascunho'");
  expect(sql).toContain("emenda_envios_sefaz");
 });
 it("aprovação vigente não exibe novo formulário e reversão acontece na mesma linha",()=>{
  expect(ui).toContain("!aprovado&&");
  expect(ui).toContain("p.id===opinioes[0]?.id&&aprovado&&editavel");
  expect(ui).toContain("Reverter aprovação");
  expect(ui).toContain("A aprovação permanecerá no histórico");
 });
});
describe("Emendas: documento, matriz e envio na mesma etapa",()=>{
 it("formulário salva automaticamente, sem botão manual de validar",()=>{
  expect(ui).toContain("setTimeout(()=>salvarPedido.mutate(),900)");
  expect(ui).toContain("pedidoValido");
  expect(ui).toContain("saldoDisponivel");
  expect(ui).toContain("Valor solicitado");
  expect(ui).toContain("<SeiLink value={link}");
  expect(ui).not.toContain("Validar solicitação</Button>");
 });
 it("separa autorização como subseção da dotação e matriz/envio como subseções da solicitação",()=>{
  expect(ui).toContain('heading="Dotação, fonte e autorização financeira"');
  expect(ui).toContain('heading="Solicitação de empenho, assinaturas e envio"');
  expect(ui).toContain('heading="Nota de Empenho emitida"');
  expect(ui).not.toContain('heading="Matriz de cinco assinaturas"');
  expect(ui).not.toContain('heading="Confirmação de envio à SEFAZ.UCG.AEO"');
 });
 it("pool de assinatura compartilhado, 5 funções, incluindo alternativas de cargo",()=>{
  expect(ui).toContain('from("assinaturas_config")');
  expect(ui).toContain('p.cargos.some((cargo:string)=>cargo===pessoa.cargo)');
  expect(ui).toContain('cargos:["Gerente"]');
  expect(ui).toContain('cargos:["Coordenador ACP","Coordenador"]');
  expect(ui).toContain('cargos:["Diretoria Financeira"]');
  expect(ui).toContain('cargos:["Secretária de Saúde"]');
  expect(ui).toContain('onValueChange={id=>salvarAss.mutate');
  expect(ui).toContain("ass.conferido_em");
  expect(sql).toContain("pessoa.cargo IN ('Gerente','Coordenador ACP','Coordenador')");
  expect(sql).toContain("pessoa.cargo IN ('Diretoria Financeira','Secretária de Saúde')");
  expect(sql).toContain("ON CONFLICT(lancamento_id,papel) DO UPDATE");
 });
 it("número e link SEI não são exigidos para cada assinatura",()=>{
  expect(sql).toContain("ALTER COLUMN numero_sei DROP NOT NULL");
  expect(sql).toContain("ALTER COLUMN link_sei DROP NOT NULL");
  expect(sql).toContain("signatario_config_id uuid REFERENCES public.assinaturas_config");
  expect(sql).toContain("numero_sei=NULL,link_sei=NULL");
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.emenda_conferir_assinatura");
  expect(ui).not.toContain("Salvar conferência");
 });
});
