import {describe,it,expect} from "vitest";
import {filtrarInvestigacaoEC,indicadoresInvestigacaoEC,filtrosIniciaisEC} from "./investigacao";
import {valorConciliadoCentavos,type ItemEC} from "./financeiro";
import {sanitizarEvidenciaEC} from "./privacidade";
const item=(chave:string,categoria:ItemEC["categoria"],situacao:ItemEC["situacao"],
  valor_publicado:number,valor_esperado:number,extra:Record<string,unknown>={})=>
 ({chave,categoria,situacao,valor_publicado,valor_esperado,
   descricao:"Cirurgia "+chave,...extra}) as ItemEC;
const linhas=[
 item("f1","faec_prod","ok",120,120,{
   aih:"4226100322066",conferido_em:"2026-10-15T14:00:00Z"}),
 item("f2","faec_mult","pendente",0,350,{
   aih:"4226100322000",decisao:"analise"}),
 item("c1","faec_fxmac","ok",2000,2000,{conferido_em:null}),
 item("m1","mac_compl","div",80,110,{decisao:"oficio",conferido_em:null}),
 item("s1","sia_faec","ok",25,25,{decisao:"erro",conferido_em:"2026-10-15T14:00:00Z"}),
];
describe("Fase 4: investigação e centavos fiscais",()=>{
 it("corrige precedência: erro não soma mesmo quando situação era ok",()=>{
   expect(valorConciliadoCentavos(linhas[4])).toBe(0);
   expect(valorConciliadoCentavos(linhas[1])).toBe(0);
 });
 it("não duplica controles, nem correções em análise/rejeitadas",()=>{
   const k=indicadoresInvestigacaoEC(linhas,[
     {competencia_origem:"06/2026",valor:40,documento_sei:"12345",motivo:"Correção",status:"aprovada"},
     {competencia_origem:"05/2026",valor:40,documento_sei:"12345",motivo:"Dup",status:"duplicada"},
     {competencia_origem:"04/2026",valor:99,documento_sei:"12345",motivo:"Rej",status:"rejeitada"},
   ]);
   expect(k.publicado).toBe(22500); // 120+80+25, sem FAEC controle.
   expect(k.esperado).toBe(60500); // 120+350+110+25.
   expect(k.corrigido).toBe(4000);
   expect(k.admitido).toBe(20000); // 120 + min(80,110).
   expect(k.incontroverso).toBe(12000);
   expect(k.discussao).toBe(3000);
   expect(k.pendente).toBe(35000);
   expect(k.total).toBe(24000);
 });
 it("fila reúne conferências abertas, discussões e análises",()=>{
   const filtro={...filtrosIniciaisEC,vista:"fila" as const};
   const chaves=filtrarInvestigacaoEC(linhas,filtro).map(i=>i.chave);
   expect(chaves).toContain("f2");
   expect(chaves).toContain("m1");
   expect(chaves).toContain("c1");
   expect(chaves).not.toContain("f1");
 });
 it("cruza busca por AIH com categoria, decisão e estado da conferência",()=>{
   const filtro={...filtrosIniciaisEC,busca:"4226100322000",
     categoria:"faec_mult",decisao:"analise",conferencia:"nao_conferido" as const};
   expect(filtrarInvestigacaoEC(linhas,filtro).map(i=>i.chave)).toEqual(["f2"]);
   expect(filtrarInvestigacaoEC(linhas,{...filtro,categoria:"mac_compl"})).toEqual([]);
 });
 it("não expõe campos de paciente no JSON técnico",()=>{
   const fonte={aih:"4226100322066",procedimento:"041501001",
     cpf:"111.222.333-44",nome_paciente:"Nome protegido",
     perfil:{nome_mae:"Outra pessoa",cns:"123456789012345",
       regra:"CNS: 123456789012345; CPF: 111.222.333-44"}};
   const r=JSON.stringify(sanitizarEvidenciaEC(fonte));
   expect(r).toContain("4226100322066");
   expect(r).not.toMatch(/Nome protegido|nome_paciente|nome_mae|111\.222\.333-44|123456789012345/);
 });
});
