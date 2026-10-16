import {describe,it,expect} from "vitest";
import {CATEGORIAS_ELETIVAS,valorConciliadoCentavos,valorIncontroversoCentavos,
 resumoEncontro,type ItemEC} from "./financeiro";
const item=(p:Partial<ItemEC>={}):ItemEC=>({
 chave:"faec_compl|040704025",categoria:"faec_compl",descricao:"Exemplo sintético",
 valor_publicado:150,valor_esperado:120,situacao:"div",...p
});
describe("Fase 3 — regra HTML 2.42.2 em centavos",()=>{
 it.each([
  ["ok prevalece sobre erro","ok","erro",15000],
  ["info prevalece sobre erro","info","erro",15000],
  ["aceite preserva publicado","div","aceito",15000],
  ["erro confirmado zera","div","erro",0],
  ["ofício conserva incontroverso","div","oficio",12000],
  ["análise conserva incontroverso","div","analise",12000],
  ["pendência conserva incontroverso","pendente",null,12000],
  ["não contemplado conserva incontroverso","nc",null,12000],
  ["fora do rol conserva incontroverso","fora",null,12000],
 ] as const)("%s",(_label,situacao,decisao,valor)=>{
  expect(valorIncontroversoCentavos(item({situacao,decisao}))).toBe(valor);
 });
 it("múltipla FAEC federal sem FPO efetiva não entra no atesto",()=>{
  expect(valorIncontroversoCentavos(item({
   categoria:"faec_mult",situacao:"pendente",
   valor_publicado:1200,valor_esperado:1200,
   detalhe:{publicacao_independente:true,exige_programacao_fpo:true}
  }))).toBe(0);
 });
 it("tolerância de R$ 0,02 só afeta parcela admitida",()=>{
  expect(valorIncontroversoCentavos(item({valor_publicado:.02,valor_esperado:1}))).toBe(0);
  expect(valorIncontroversoCentavos(item({valor_publicado:.03,valor_esperado:.02}))).toBe(3);
 });
 it("zero esperado continua com publicado em análise; erro zera",()=>{
  expect(valorConciliadoCentavos(item({valor_publicado:123.45,valor_esperado:0,
   decisao:"analise"}))).toBe(12345);
  expect(valorConciliadoCentavos(item({valor_publicado:123.45,valor_esperado:0,
   decisao:"erro"}))).toBe(0);
 });
 it("11 componentes: FAEC faixa MAC conserva memória mas não duplica total",()=>{
  expect(CATEGORIAS_ELETIVAS).toHaveLength(11);
  const itens=CATEGORIAS_ELETIVAS.map(([categoria],i)=>item({
   chave:categoria+"|"+i,categoria,situacao:"ok",
   valor_publicado:100.25,valor_esperado:100.25
  }));
  const r=resumoEncontro(itens);
  expect(r.publicados.faec_fxmac).toBe(10025);
  expect(r.controleFaecFxMac).toBe(10025);
  expect(r.componentes.faec_fxmac).toBe(0);
  expect(r.encontro).toBe(100250);
  expect(r.publicado).toBe(100250);
  expect(r.total).toBe(100250);
 });
 it("ofício não acrescenta cobrança ao valor do atesto",()=>{
  const r=resumoEncontro([item({decisao:"oficio",valor_publicado:110.50,
    valor_esperado:145.65})]);
  expect(r.encontro).toBe(11050);
  expect(r.oficio).toBe(3515);
  expect(r.esperadoNaoPago).toBe(3515);
  expect(r.total).toBe(11050);
 });
 it("não cobra envelope isolado nem o recorte de controle",()=>{
  const r=resumoEncontro([
   item({chave:"mac_mult|041501001",categoria:"mac_mult",
    procedimento:"0415010010",valor_publicado:100,valor_esperado:200,decisao:"oficio"}),
   item({chave:"faec_fxmac|040704025",categoria:"faec_fxmac",
    valor_publicado:0,valor_esperado:50,decisao:"oficio"}),
  ]);
  expect(r.oficio).toBe(0);
  expect(r.encontro).toBe(10000);
 });
 it("correções apenas aprovadas; não somar duplicada/rejeitada",()=>{
  const c={competencia_origem:"07/2026",documento_sei:"SEI",motivo:"Correção",valor:20.35};
  const r=resumoEncontro([item({situacao:"ok",valor_publicado:100})],[
   {...c,status:"aprovada"},{...c,status:"duplicada"},{...c,status:"rejeitada"}
  ]);
  expect(r.correcoes).toBe(2035);
  expect(r.total).toBe(12035);
 });
 it("SIA financeira + complemento já normalizados somam uma única vez",()=>{
  const r=resumoEncontro([item({categoria:"sia_mac",chave:"sia_mac|001",
   situacao:"ok",valor_publicado:91.30,valor_esperado:90.20})]);
  expect(r.sia).toBe(9130);
  expect(r.esperado).toBe(9020);
 });
});
