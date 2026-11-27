import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const read=(f:string)=>readFileSync(new URL(f,import.meta.url),"utf8");
const migration=read("../../../supabase/migrations/20261029030000_emendas_fluxo_pagamentos_documentado.sql");
const nota=read("../../components/emendas/FluxoNotaEmenda.tsx");
const legado=read("../../components/emendas/ConsultaLegadoEmenda.tsx");
const cadeias=read("../../components/emendas/FluxoSubempenhosEmenda.tsx");
const anula=read("../../components/emendas/FluxoAnulacaoEmenda.tsx");
const ass=read("../../components/emendas/FluxoAssinaturasEmenda.tsx");
const route=read("../../routes/_authenticated/emendas.$id_.lancamentos.$lancamentoId.tsx");
const etapa=read("../../components/emendas/EtapasLancamento.tsx");
describe("Emendas: formalização própria e legado documental somente leitura",()=>{
 it("matriz em 5 linhas e pares alternativos na mesma linha",()=>{
  expect(etapa).toContain("gruposObrigatorios.map(grupo=>");
  expect(etapa).toContain('grupo==="gerencia"?"Gerente / Coordenador ACP"');
  expect(etapa).toContain('md:grid-cols-2');
  expect(ass).toContain('SLOTS_PADRAO,SLOTS_LIBERA_ORC');
  expect(ass).toContain("g.opcoes.some");
 });
 it("saldo usa a reserva da própria solicitação e não acusa falha depois de emitida",()=>{
  expect(etapa).toContain("saldoDisponivel+valorDaPropriaSolicitacao");
  expect(etapa).toContain("editavel&&valor>saldoParaEsteLancamento");
  expect(etapa).toContain("manterInput");
 });
 it("nota tem 4 campos, sem exercício nem botão registrar; diferença é alerta",()=>{
  expect(nota).toContain("numero_ne");
  expect(nota).toContain("valor_ne");
  expect(nota).toContain("numero_sei");
  expect(nota).toContain("link_sei");
  expect(nota).toContain("Esta diferença não impede o registro da NE");
  expect(nota).toContain("emenda_fluxo_finalizar_ne");
  expect(nota).not.toContain("Registrar NE</Button>");
 });
 it("nota exige assinaturas SEFAZ e Financeira/Saúde",()=>{
  expect(migration).toContain("d.contexto='ne'");
  expect(migration).toContain("s.papel='sefaz'");
  expect(migration).toContain("s.papel IN ('financeira','secretaria')");
  expect(nota).toContain('tipo="ne"');
 });
 it("etapa financeira de Convênios não aparece na execução nova de Emendas",()=>{
  expect(route).not.toContain("<FluxoParcelasEmenda");
  expect(route).not.toContain("Liberações de recursos, comprovantes e pagamentos");
  expect(route).toContain("<FluxoSubempenhosEmenda");
  expect(route).toContain("<ConsultaLegadoEmenda");
  expect(cadeias).toContain("emenda_subempenho_criar");
  expect(cadeias).toContain("<PainelPagamentosEmenda");
  expect(legado).not.toContain(".rpc(");
  expect(legado).toContain("somente leitura");
 });
 it("anulação protege saldo livre e permite encerramento sem execução; fechamento exige conciliação",()=>{
  expect(anula).not.toContain("parcelasCompletas");
  expect(anula).toContain("Encerrar sem execução");
  expect(anula).toContain("saldo_disponivel_anular");
  expect(anula).toContain("saldo_a_anular_fechamento");
  expect(anula).toContain("emenda_fluxo_finalizar_anulacao");
  expect(anula).toContain("emenda_conciliar_encerrar_ne");
  expect(anula).toContain("Conciliar e encerrar NE");
 });
 it("persistência via RPC, RLS e auditoria inclusive exclusões",()=>{
  expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  expect(migration).toContain("emenda_fluxo_documentos_audit");
  expect(migration).toContain("emenda_fluxo_assinaturas_audit");
  expect(migration).toContain("CREATE FUNCTION public.emenda_fluxo_remover_assinatura");
  expect(migration).toContain("emenda_fluxo_finalizar_ne");
  expect(migration).toContain("emenda_registrar_bloco_pagamento");
  expect(route).toContain("emenda_fluxo_documentos");
  expect(route).toContain("emenda_fluxo_assinaturas");
 });
 it("reabre a solicitação sem NE e retifica a NE sem movimentações financeiras",()=>{
  expect(migration).toContain("CREATE FUNCTION public.emenda_fluxo_reabrir_solicitacao");
  expect(migration).toContain("CREATE FUNCTION public.emenda_fluxo_reabrir_ne");
  expect(migration).toContain("chave_idempotencia=gen_random_uuid()");
  expect(migration).toContain("NE com execução registrada; retificação automática bloqueada");
  expect(nota).toContain("Retificar dados da NE");
 });
 it("histórico da liberação antiga é preservado sem criar pagamentos na interface",()=>{
  expect(migration).toContain("CREATE FUNCTION public.emenda_fluxo_registrar_aviso");
  expect(legado).toContain("documentoValor(d,campo");
  expect(legado).toContain("d.contexto.startsWith(\"lib:\")");
  expect(legado).not.toContain("emenda_fluxo_registrar_aviso");
  expect(legado).not.toContain("emenda_fluxo_finalizar_pagamento");
 });
 it("mantém documentos da nota emitida antes da migration",()=>{
  expect(migration).toContain("INSERT INTO public.emenda_fluxo_documentos");
  expect(migration).toContain("ON CONFLICT(lancamento_id,contexto) DO NOTHING");
 });
});
