import {describe,expect,it} from "vitest";
import {COLUNAS_PLANILHA,montarLinhasPlanilha,tsvPlanilha,csvPlanilha} from "./planilha-atualizacao";
const b={lancamentos:[],pisoCompetencias:[],pisoDocumentos:[],pvhCompetencias:[],
 pvhParticipantes:[],pvhEmpenhos:[],pvhAlocacoes:[]};
describe("Central da Planilha",()=>{
 it("mantém 15 campos e distingue previsão de NE",()=>{
   expect(COLUNAS_PLANILHA).toHaveLength(15);
   expect(COLUNAS_PLANILHA[4].chave).toBe("valorPrevisto");
   expect(COLUNAS_PLANILHA[10].chave).toBe("valorEmpenhado");
 });
 it("consolida filhas do convênio sem duplicar empenho",()=>{
   const a=montarLinhasPlanilha({...b,lancamentos:[
     {id:"p",valor_solicitado:2000,valor_empenho_liquido:2000},
     {id:"a",parent_id:"p",competencia:"10/2026",valor_atestado:700},
     {id:"b",parent_id:"p",competencia:"11/2026",valor_atestado:800}]});
   expect(a).toHaveLength(1);expect(a[0]).toMatchObject({valorAtestado:1500,valorEmpenhado:2000});
 });
 it("associa solicitação, NE e anulação do Piso na mesma obrigação",()=>{
   const a=montarLinhasPlanilha({...b,pisoCompetencias:[{id:"c",competencia:"10/2026",
      piso_participantes:[{id:"p",valor_devido:9524.68,prestadores:{nome_instituicao:"BOJ"},
      piso_obrigacoes:[{id:"o",valor_empenhado:15000,valor_anulado:5475.32}]}]}],
      pisoDocumentos:[{obrigacao_id:"o",tipo:"nota_empenho",numero:"123/2026",link_sei:"https://sei.gov.br/ne"}]});
   expect(a[0]).toMatchObject({valorPrevisto:9524.68,valorEmpenhado:15000,
    valorAnulado:5475.32,numeroEmpenho:"123/2026"});
 });
 it("PVH: linha por alocação e atesto inexistente vazio",()=>{
   const a=montarLinhasPlanilha({...b,
    pvhCompetencias:[{id:"c",competencia:"10/2026"}],
    pvhParticipantes:[{id:"p",competencia_id:"c",prestador_id:"h",valor_pago:100}],
    pvhEmpenhos:[{id:"e",valor_total:5000,solicitacao_competencia_id:"c",prestador_id:"h"}],
    pvhAlocacoes:[{id:"a",participante_id:"p",empenho_id:"e",valor_alocado:1200}]});
   expect(a).toHaveLength(1);expect(a[0]).toMatchObject({valorPrevisto:1200,
     valorEmpenhado:5000,valorAtestado:null,valorAnulado:null});
 });
 it("não repete total conciliado por instituição quando há várias NEs no Piso",()=>{
   const rows=montarLinhasPlanilha({...b,pisoCompetencias:[{
      id:"c",competencia:"10/2026",piso_participantes:[{id:"p",valor_devido:9500,
      piso_obrigacoes:[{id:"o1",valor_empenhado:7000},{id:"o2",valor_empenhado:5000}]}]}]});
   expect(rows).toHaveLength(2);
   expect(rows.map(r=>r.valorAtestado)).toEqual([9500,null]);
   expect(rows.map(r=>r.valorEmpenhado)).toEqual([7000,5000]);
 });
 it("cópia TSV e CSV preserva zeros e não executa fórmulas",()=>{
   const a=montarLinhasPlanilha({...b,lancamentos:[{id:"a",valor_solicitado:0,
     prestadores:{nome_instituicao:"=1+1"}}]});
   expect(tsvPlanilha(a)).toContain("0,00");
   expect(csvPlanilha(a)).toContain("'=1+1");
 });
});
