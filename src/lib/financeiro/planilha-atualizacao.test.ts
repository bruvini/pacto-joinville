import {describe,expect,it} from "vitest";
import {COLUNAS_PLANILHA,montarLinhasPlanilha,tsvPlanilha,csvPlanilha,
 ordenarCompetenciasPlanilha,opcoesContratoPlanilha} from "./planilha-atualizacao";
const b={lancamentos:[],pisoCompetencias:[],pisoDocumentos:[],pvhCompetencias:[],
 pvhParticipantes:[],pvhEmpenhos:[],pvhAlocacoes:[]};
describe("Central da Planilha",()=>{
 it("mantém 19 campos com números SEI separados dos links e da NE",()=>{
   expect(COLUNAS_PLANILHA).toHaveLength(19);
   expect(COLUNAS_PLANILHA[4].chave).toBe("valorPrevisto");
   expect(COLUNAS_PLANILHA[12].chave).toBe("valorEmpenhado");
   expect(COLUNAS_PLANILHA[5].chave).toBe("numeroSolicitacaoSei");
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
      pisoDocumentos:[{obrigacao_id:"o",tipo:"nota_empenho",numero:"123/2026",numero_sei:"00987123",link_sei:"https://sei.gov.br/ne"}]});
   expect(a[0]).toMatchObject({valorPrevisto:9524.68,valorEmpenhado:15000,
    valorAnulado:5475.32,numeroEmpenho:"123/2026",numeroEmpenhoSei:"00987123"});
 });
 it("PVH: linha por alocação e atesto inexistente vazio",()=>{
   const a=montarLinhasPlanilha({...b,
    pvhCompetencias:[{id:"c",competencia:"10/2026"}],
    pvhParticipantes:[{id:"p",competencia_id:"c",prestador_id:"h",valor_pago:100}],
    pvhEmpenhos:[{id:"e",valor_total:5000,solicitacao_competencia_id:"c",prestador_id:"h",solicitacao_sei_numero:"01020304",nota_empenho_sei_numero:"01020305"}],
    pvhAlocacoes:[{id:"a",participante_id:"p",empenho_id:"e",valor_alocado:1200}]});
   expect(a).toHaveLength(1);expect(a[0]).toMatchObject({valorPrevisto:1200,
     valorEmpenhado:5000,valorAtestado:null,valorAnulado:null,numeroSolicitacaoSei:"01020304",numeroEmpenhoSei:"01020305"});
 });
 it("não repete total conciliado por instituição quando há várias NEs no Piso",()=>{
   const rows=montarLinhasPlanilha({...b,pisoCompetencias:[{
      id:"c",competencia:"10/2026",piso_participantes:[{id:"p",valor_devido:9500,
      piso_obrigacoes:[{id:"o1",valor_empenhado:7000},{id:"o2",valor_empenhado:5000}]}]}]});
   expect(rows).toHaveLength(2);
   expect(rows.map(r=>r.valorAtestado)).toEqual([9500,null]);
   expect(rows.map(r=>r.valorEmpenhado)).toEqual([7000,5000]);
 });
 it("ordena cronologicamente competências isoladas e agregadas",()=>{
   expect(ordenarCompetenciasPlanilha(["12/2025","01/2026","10/2026, 09/2026","02/2026"]))
     .toEqual(["10/2026","09/2026","02/2026","01/2026","12/2025"]);
   const rows=montarLinhasPlanilha({...b,lancamentos:[
     {id:"a",competencia:"12/2025"},
     {id:"b",competencia:"10/2026, 12/2026"},
     {id:"c",competencia:"11/2026"}]});
   expect(rows.map(r=>r.id)).toEqual(["convenios:b","convenios:c","convenios:a"]);
 });
 it("distingue contratos homônimos e programas nos filtros",()=>{
   const rows=montarLinhasPlanilha({...b,lancamentos:[
     {id:"l1",convenio_id:"c1",convenios:{objeto:"Cirurgias",numero_processo_sei_mae:"111"},prestadores:{nome_instituicao:"H1"}},
     {id:"l2",convenio_id:"c2",convenios:{objeto:"Cirurgias",numero_processo_sei_mae:"222"},prestadores:{nome_instituicao:"H2"}}],
     pisoCompetencias:[{id:"c",competencia:"10/2026",piso_participantes:[{id:"p",prestadores:{nome_instituicao:"H1"}}]}]});
   expect(opcoesContratoPlanilha(rows,"H1").map(o=>o.value)).toEqual(["convenio:c1","programa:piso"]);
   expect(opcoesContratoPlanilha(rows,"todas","convenios").map(o=>o.value)).toEqual(["convenio:c1","convenio:c2"]);
 });
 it("não infere números de documento a partir de IDs internos do link",()=>{
   const rows=montarLinhasPlanilha({...b,lancamentos:[{id:"a",link_solicitacao_sei:"https://sei.gov.br/documento/12345"}]});
   expect(rows[0].numeroSolicitacaoSei).toBeNull();
   expect(tsvPlanilha(rows).split("\n")[1].split("\t")[5]).toBe("");
 });
 it("cópia TSV e CSV preserva zeros e não executa fórmulas",()=>{
   const a=montarLinhasPlanilha({...b,lancamentos:[{id:"a",valor_solicitado:0,
     prestadores:{nome_instituicao:"=1+1"}}]});
   expect(tsvPlanilha(a)).toContain("0,00");
   expect(csvPlanilha(a)).toContain("'=1+1");
 });
});
