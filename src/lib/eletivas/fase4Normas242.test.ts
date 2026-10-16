import {describe,it,expect} from "vitest";
import {classificacaoCIB,normaParaCompetencia,normaNotaFpo,
 NORMAS_CIB} from "../../../supabase/functions/_shared/eletivas-normativas";
import {auditarAihNormativa} from "../../../supabase/functions/_shared/eletivas-auditor-faixa";
const aih="4226100322066";
const workbook=(faixa:string,proc:string,unit=350)=>({
 rows:[
  {aih,proc:"041501001",faixa,principal:"041501001",qt:1},
  {aih,proc,faixa,principal:"041501001",qt:2}
 ],
 cib:{[proc]:{nature:(faixa==="1"?"Federal":"Estadual") as "Estadual"|"Federal",
  compl:unit,nome:"Descrição oriunda do workbook"}},
});
describe("Fase 4 — matrizes oficiais congeladas do HTML 2.42.2",()=>{
 it("conserva todas as entradas I/II dos 3 snapshots, sem interpolação",()=>{
  expect(NORMAS_CIB.map(n=>[n.id,n.anexoI.size,n.anexoII.size])).toEqual([
   ["030",667,249],["727",667,249],["399",667,255]
  ]);
  expect(normaParaCompetencia("03/2025")).toBeNull();
  expect(normaParaCompetencia("04/2025")?.id).toBe("030");
  expect(normaParaCompetencia("08/2025")?.id).toBe("030");
  expect(normaParaCompetencia("09/2025")?.id).toBe("727");
  expect(normaParaCompetencia("07/2026")?.id).toBe("727");
  expect(normaParaCompetencia("08/2026")?.id).toBe("399");
  expect(normaParaCompetencia("12/2026")?.id).toBe("399");
  expect(normaParaCompetencia("01/2027")).toBeNull();
 });
 it("seis códigos estaduais novos aparecem só com a 399",()=>{
  for(const code of ["030907001","030907002","040401036","040501018",
    "040505036","040901015"]){
   expect(classificacaoCIB(code,"07/2026").classificacao).toBe("Não localizado");
   expect(classificacaoCIB(code,"08/2026").classificacao).toBe("Estadual");
  }
 });
 it("código em ambos os anexos nunca vira elegível automático",()=>{
  expect(classificacaoCIB("040905008","07/2026").classificacao).toBe("Ambos");
  const p=auditarAihNormativa(aih,"07/2026",workbook("1","040905008"));
  expect(p.estado).toBe("review");
  expect(p.ambos).toBe(1);
 });
 it("classifica AIH pela CIB vigente e ignora natureza local divergente",()=>{
  const est=auditarAihNormativa(aih,"07/2026",workbook("1","030304020"));
  expect(est.estado).toBe("ok");
  expect(est.natureza).toBe("Estadual");
  expect(est.complemento).toBe(700);
  expect(est.componentes[0].naturezaWorkbook).toBe("Federal");
  expect(est.componentes[0].classification).toBe("Estadual");
  const federal=auditarAihNormativa(aih,"07/2026",workbook("5","040701003"));
  expect(federal.estado).toBe("fpo");
  expect(federal.programacaoFpoEfetivaComprovada).toBe(false);
  expect(federal.creditoReconhecidoAutomatico).toBe(false);
 });
 it("incompatibilidade em faixa 1 não gera crédito CIB",()=>{
  const p=auditarAihNormativa(aih,"07/2026",workbook("1","040701003"));
  expect(p.estado).toBe("bad");
  expect(p.elegivel).toBe(false);
 });
 it("sem workbook, sem valor do unitário e fora de vigência: revisar",()=>{
  expect(auditarAihNormativa(aih,"07/2026").estado).toBe("review");
  const p=auditarAihNormativa(aih,"07/2026",{
    ...workbook("1","030304020"),
    cib:{}});
  expect(p.enquadramentoConferido).toBe(true);
  expect(p.conferido).toBe(false);
  expect(p.complemento).toBe(0);
  expect(auditarAihNormativa(aih,"01/2027",workbook("1","030304020")).estado)
   .toBe("review");
 });
 it("Nota Informativa 05/2026 só a partir de agosto, sem prova de FPO",()=>{
  expect(normaNotaFpo("07/2026")).toBeNull();
  expect(normaNotaFpo("08/2026")).toMatchObject({
   nota:"Nota Informativa 05/2026",
   codigos:["040701003","041304002","040901018"],
  });
  expect(normaNotaFpo("08/2026")?.comprovacao).toContain("não prova");
 });
});
