import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const route=read("routes/_authenticated/emendas.$id_.lancamentos.$lancamentoId.tsx");
const flow=read("components/emendas/FluxoSubempenhosEmenda.tsx");
const matrix=read("components/emendas/MatrizSubempenhosEmenda.tsx");
const resumo=read("components/emendas/PainelResumoNeEmenda.tsx");
const pvh=read("components/pvh/CadeiaSubempenhoPvh.tsx");
const e=read("lib/emendas/gerencial.ts");

describe("Emendas · experiência operacional simplificada",()=>{
 it("coloca os subempenhos antes da configuração de limite e do fechamento",()=>{
  const indices=["<PainelResumoNeEmenda","<FluxoSubempenhosEmenda",
   "<PainelDistribuicaoNeEmenda","<FluxoAnulacaoEmenda"]
   .map(x=>route.indexOf(x));
  expect(indices.every(x=>x>=0)).toBe(true);
  expect(indices).toEqual([...indices].sort((a,b)=>a-b));
  expect(route).toContain("Configurações avançadas · limite da NE por competência");
  expect(route).toContain("open={limitesAbertos}");
  expect(route).not.toContain("Linha do tempo financeira da NE");
 });
 it("mantém histórico completo e CSV no modal sem ocupar a página de trabalho",()=>{
  expect(route).toContain("Linha do tempo do lançamento");
  expect(route).toContain("<Dialog open={historicoAberto}");
  expect(route).toContain("Exportar eventos CSV");
  expect(route).toContain("Carregar mais 500 eventos anteriores");
  expect(route).toContain("emenda_historico");
 });
 it("exibe ação de solicitação de subempenho em competência com saldo",()=>{
  expect(flow).toContain("Nova solicitação de subempenho");
  expect(flow).toContain("Criar solicitação");
  expect(flow).toContain("emenda_subempenho_criar");
  expect(flow).toContain("Saldo para novas solicitações");
  expect(flow).toContain("Definir limite da competência");
  expect(flow).toContain("onAbrirLimites");
 });
 it("rascunho não depende da matriz; documento e conclusão continuam protegidos",()=>{
  expect(flow).toContain("const podeCriar=podeEditar&&!!aloc");
  expect(flow).not.toContain("podeCriar=podeEditar&&matrizPronta");
  expect(flow).toContain("const podeRegistrar=podeEditar&&habilitada&&politicaAtiva&&!documento");
  expect(flow).toContain("emenda_subempenho_documentar");
  expect(flow).toContain("emenda_subempenho_concluir_etapa");
  expect(flow).toContain("configAberta");
  expect(flow).toContain("Configuração administrativa de documentos e assinaturas");
  expect(matrix).toContain("emenda_sub_matriz_homologar");
 });
 it("replica a interação de acordeão do PVH sem copiar assinaturas",()=>{
  expect(pvh).toContain("<Accordion");
  expect(pvh).toContain('type="single"');
  expect(flow).toContain('<Accordion type="single"');
  expect(flow).toContain("<AccordionItem value={tipo}");
  expect(flow).toContain("<AccordionTrigger");
  expect(flow).toContain("<AccordionContent");
  expect(flow).toContain("<SeiLink value={link}");
  for(const etapa of ["solicitacao_liquidacao","movimento_liquidacao","aviso_subempenho"])
   expect(flow).toContain(etapa);
  expect(flow).toContain("matrizes.some(m=>m.tipo===tipo&&m.ativa)");
 });
 it("pagamento permanece condicionado ao Aviso efetivo",()=>{
  expect(flow).toContain('sub.status==="subempenhado"&&<PainelPagamentosEmenda');
  expect(flow).not.toContain("<FluxoParcelasEmenda");
  expect(e).toContain("pagamento_parcial");
  expect(resumo).not.toContain('["#historico-financeiro","Linha do tempo"]');
 });
});
