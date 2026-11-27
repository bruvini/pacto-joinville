import {describe,expect,it} from "vitest";
import {readFileSync,existsSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const rota=read("routes/_authenticated/emendas.$id_.lancamentos.$lancamentoId.tsx");
const cadeia=read("components/emendas/FluxoSubempenhosEmenda.tsx");
const pagamentos=read("components/emendas/PainelPagamentosEmenda.tsx");
const arquivo=read("components/emendas/ConsultaLegadoEmenda.tsx");
const pv=read("components/pvh/CadeiaSubempenhoPvh.tsx");
const piso=read("components/piso/ObrigacoesFinanceirasPiso.tsx");

describe("Emendas · correção da navegação financeira e-Pública",()=>{
 it("fluxo operacional não renderiza o componente de liberação de Convênios",()=>{
  expect(rota).not.toContain("<FluxoParcelasEmenda");
  expect(rota).not.toContain('from "@/components/emendas/FluxoParcelasEmenda"');
  expect(rota).not.toContain("Liberações de recursos, comprovantes e pagamentos");
  expect(rota).not.toContain("liberacaoLegadaPermitida");
  expect(rota).not.toContain("fluxoLegadoIniciado");
  expect(existsSync(new URL("../../components/emendas/FluxoParcelasEmenda.tsx",import.meta.url))).toBe(false);
 });
 it("NE → subempenho visível → limites avançados → conciliação",()=>{
  const ordem=[
   '<PainelResumoNeEmenda',
   '<FluxoSubempenhosEmenda',
   '<PainelDistribuicaoNeEmenda',
   '<FluxoAnulacaoEmenda',
  ].map(q=>rota.indexOf(q));
  expect(ordem.every(i=>i>=0)).toBe(true);
  expect(ordem).toEqual([...ordem].sort((a,b)=>a-b));
  expect(cadeia).toContain("emenda_subempenho_criar");
  expect(cadeia).toContain("<PainelPagamentosEmenda");
  expect(pagamentos).toContain("emenda_pag_programar");
  expect(pagamentos).toContain("emenda_pag_comprovar");
  expect(pagamentos).not.toContain("emenda_fluxo_registrar_aviso");
 });
 it("Piso e PVH confirmam três subetapas no e-Pública, sem copiar assinaturas do PVH",()=>{
  for(const etapa of ["Solicitação de Subempenho / Liquidação",
   "Aviso de Movimento — Empenho em Liquidação",
   "Aviso de Movimento — Subempenho"])
   expect(pv).toContain(etapa);
  expect(piso).toContain("Aviso de Movimento - Empenho em Liquidação");
  expect(piso).toContain("Aviso de Movimento - Subempenho");
  expect(cadeia).toContain("TIPOS_SUBEMENDA");
  expect(cadeia).toContain("<MatrizSubempenhosEmenda");
 });
 it("documentos antigos continuam consultáveis e não criam movimentação alguma",()=>{
  expect(rota).toContain("<ConsultaLegadoEmenda");
  expect(arquivo).toContain("documentoValor(d,campo");
  expect(arquivo).toContain("somente leitura");
  expect(arquivo).toContain("Sem liberação ou pagamento vinculado");
  expect(arquivo).not.toContain("useEffect");
  expect(arquivo).not.toContain("useMutation");
  expect(arquivo).not.toContain("supabase.rpc");
  expect(arquivo).not.toContain("emenda_fluxo_registrar_aviso");
 });
 it("fluxo legada permanece na trilha de auditoria para consulta documental",()=>{
  expect(rota).toContain('supabase.from("emenda_liberacoes")');
  expect(rota).toContain('supabase.from("emenda_blocos_pagamento")');
  expect(rota).toContain('supabase.from("emenda_fluxo_documentos")');
  expect(rota).toContain("emenda_liberacoes:\"Liberação de recurso\"");
 });
});
