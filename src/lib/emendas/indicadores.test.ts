import {describe,it,expect} from "vitest";
import {apurarIndicadoresEmenda,gerarCsvIndicadores,type DadosIndicadores} from "./indicadores";
const baseLanc={
 id:"l1",status:"rascunho",competencia_inicial:"2026-10-01",periodicidade:"mensal",
 parcela_inicial:57,created_at:"2026-10-01T12:00:00Z",updated_at:"2026-10-01T12:00:00Z",
 solicitacao_id:null,excluido_em:null,
};
function dataset(patch:Partial<DadosIndicadores>={}):DadosIndicadores{
 return {lancamentos:[{...baseLanc}],meses:[{lancamento_id:"l1",competencia_id:"m1",parcela_convenio:57,liberacoes_minimas:1}],
  etapas:[],pareceres:[],assinaturas:[],solicitacoes:[],liberacoes:[],pagamentos:[],
  anulacoes:[],encerramentos:[],comprovantes:[],conciliacoes:[],...patch};
}
const agora=new Date("2026-10-29T12:00:00Z");
describe("Indicadores de emendas — Fase 6",()=>{
 it("rascunho não representa reserva, NE ou pagamento",()=>{
  const r=apurarIndicadoresEmenda(dataset(),new Date("2026-10-15"));
  expect(r.totais).toMatchObject({lancamentos:1,preparacao:1,reservado:0,ne:0,anulado:0,liberado:0,pago:0});
 });
 it("soma centavos sem erro de float e desconta anulações",()=>{
  const f=dataset({
   lancamentos:[{...baseLanc,status:"emitido",solicitacao_id:"s1"}],
   solicitacoes:[{id:"s1",status:"emitida",valor_ne:0.3,valor_solicitado:0.3,numero_ne:"120"}],
   liberacoes:[
    {id:"v1",lancamento_id:"l1",competencia_id:"m1",tipo:"original",valor:0.1},
    {id:"v2",lancamento_id:"l1",competencia_id:"m1",tipo:"complementar",valor:0.1},
   ],
   pagamentos:[
    {id:"p1",lancamento_id:"l1",competencia_id:"m1",liberacao_id:"v1",valor:0.1},
    {id:"p2",lancamento_id:"l1",competencia_id:"m1",liberacao_id:"v2",valor:0.1},
   ],
   anulacoes:[{lancamento_id:"l1",valor:0.1}],
   comprovantes:[{lancamento_id:"l1",competencia_id:"m1"}],
   conciliacoes:[{lancamento_id:"l1"}],
  });
  const r=apurarIndicadoresEmenda(f,agora);
  expect(r.totais).toMatchObject({ne:0.3,anulado:0.1,liberado:0.2,pago:0.2,conciliados:1});
  expect(r.alertas.filter(a=>a.nivel==="critico")).toHaveLength(0);
 });
 it("alerta pagamentos sem liberação, comprovante e estouro de NE",()=>{
  const f=dataset({
   lancamentos:[{...baseLanc,status:"emitido",solicitacao_id:"s1"}],
   solicitacoes:[{id:"s1",status:"emitida",valor_ne:100,valor_solicitado:100,numero_ne:"NE12"}],
   liberacoes:[{id:"v1",lancamento_id:"l1",competencia_id:"m1",tipo:"complementar",valor:120}],
   pagamentos:[{id:"p1",lancamento_id:"l1",competencia_id:"m1",liberacao_id:"desconhecida",valor:150}],
   anulacoes:[],comprovantes:[],
  });
  const r=apurarIndicadoresEmenda(f,agora);
  expect(r.alertas.some(a=>a.titulo==="Anulações e liberações superam a NE")).toBe(true);
  expect(r.alertas.some(a=>a.titulo==="Pagamentos superiores às liberações")).toBe(true);
  expect(r.alertas.some(a=>a.titulo==="Pagamento sem liberação vinculada")).toBe(true);
  expect(r.alertas.some(a=>a.titulo==="Pagamento sem comprovante")).toBe(true);
  expect(r.alertas.some(a=>a.titulo==="Liberação original inconsistente")).toBe(true);
 });
 it("alerta temporal é gerencial e depende de data explícita",()=>{
  const r=apurarIndicadoresEmenda(dataset(),new Date("2026-11-10T12:00:00Z"));
  expect(r.alertas.some(a=>a.chave==="l1:rascunho-antigo"&&a.detalhe.includes("não é um prazo legal"))).toBe(true);
 });
 it("parecer recusado aparece nos alertas",()=>{
  const r=apurarIndicadoresEmenda(dataset({
   pareceres:[{lancamento_id:"l1",desfecho:"recusado",ocorrido_em:"2026-10-10T12:00:00Z"}],
  }),new Date("2026-10-15"));
  expect(r.alertas.some(a=>a.titulo==="Parecer financeiro recusado")).toBe(true);
 });
 it("lançamento excluído não integra totais",()=>{
  const r=apurarIndicadoresEmenda(dataset({
   lancamentos:[{...baseLanc,excluido_em:"2026-10-15T12:00:00Z"}],
  }),agora);
  expect(r.totais.lancamentos).toBe(0);
 });
 it("relatório CSV com BOM, sem fórmula arbitrária e com status",()=>{
  const r=apurarIndicadoresEmenda(dataset(),agora);
  const csv=gerarCsvIndicadores(r.linhas,"=1+1");
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv).toContain("Reservado");
  expect(csv).toContain("'=1+1");
  expect(csv).toContain("57");
  expect(csv).toContain("\r\n");
 });
});
