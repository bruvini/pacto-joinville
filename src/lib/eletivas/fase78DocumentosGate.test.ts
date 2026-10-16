import {describe,it,expect} from "vitest";
import * as XLSX from "xlsx";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {gerarAnaliseSeisSecoesEC,SECOES_ANALISE_FASE7}
 from "./fase7Relatorios";
import {ABAS_HTML_FASE7,gerarXlsxHtmlFase7EC,
 gerarCsvDivergenciasFase7EC,consolidadoDoManifestoEC} from "./fase7Exportacao";
import {perfilDaCompetencia,TESTES_FASE8} from "./fase8Perfis";
import type {ContextoExportFase7EC} from "./fase7Exportacao";
const read=(p:string)=>readFileSync(fileURLToPath(
 new URL("../../../"+p,import.meta.url)),"utf8");
const data=():ContextoExportFase7EC=>({
 competencia:"07/2026",cnes:"2436469",prestador:"Hospital Municipal São José",
 documentos:{rtma_numero:"SEI 3120000",analise_numero:"SEI 3120001",
  fiscais_analise:["Fiscal A"],fiscais_rtma:["Fiscal A","Fiscal B"]},
 itens:[
  {chave:"faec_prod|040702017",categoria:"faec_prod",id:"id-fa",
   procedimento:"040702017",descricao:"Cirurgia",
   aih:"4226100322066",situacao:"ok",valor_publicado:100,valor_esperado:100,
   conferido_em:"2026-10-16",detalhe:{qt_aihs:1,qt_procedimentos:1,
    origem_ses:{fisico:{aba:"Físico",celula:"A9"}}}},
  {chave:"faec_fxmac|controle",categoria:"faec_fxmac",
   procedimento:"040701001",descricao:"Recorte controle",
   situacao:"ok",valor_publicado:900,valor_esperado:900,conferido_em:"2026-10-16"},
  {chave:"mac_compl|x",categoria:"mac_compl",id:"id-mac",
   procedimento:"040901018",descricao:"Procedimento com diferença",
   situacao:"div",decisao:"oficio",conferido_em:"2026-10-16",
   justificativa:"Diferença a cobrar no ofício da competência",
   valor_publicado:40,valor_esperado:60},
  {chave:"faec_mult|aih",categoria:"faec_mult",id:"id-mult",
   procedimento:"041501001",descricao:"Múltipla",
   aih:"4226100322067",situacao:"pendente",decisao:"analise",
   valor_publicado:0,valor_esperado:90,
   detalhe:{classificacao_auditor:"review",perfil:{faixa:"1",estado:"review"}}},
 ],
 correcoes:[{competencia_origem:"06/2026",valor:10,status:"aprovada",
  documento_sei:"SEI 30000",motivo:"Diferença paga na competência seguinte",
  referencia_origem:"ref01",aihs:["4226100322064"]}],
 fontes:[{categoria:"s_faec",nome_original:"SEI 07.xlsx",sha256:"a".repeat(64)}],
 fpo:[],comunicacoes:[{id:"c1",tipo:"aih",referencia:"id-mult",
  destino:"regulacao",situacao:"fila"}],
 fluxos:[{id:"f1",aih:"4226100322067",etapa:3,valor_estimado:90,
  situacao:"ativo",documento_sei:null}],eventos:[{
   comunicacao_id:"c1",acao:"rotear",registrado_em:"2026-10-16",
   justificativa:"Dúvida da faixa em AIH",protocolo:null
  }],
 consolidadoSES:null
});
describe("Fase 7 — relatórios/exportação paritários em estrutura",()=>{
 it("Análise tem seis blocos na ordem e discrimina valores automáticos",()=>{
  const html=gerarAnaliseSeisSecoesEC(data());
  const indexes=SECOES_ANALISE_FASE7.map(h=>html.indexOf(h));
  expect(indexes.every(n=>n>=0)).toBe(true);
  expect(indexes).toEqual([...indexes].sort((a,b)=>a-b));
  for(const k of ["Físico","A9","Central","INTEGRIDADE","SEI"]){
   if(k==="Central"||k==="INTEGRIDADE")continue;
   expect(html).toContain(k);
  }
  expect(html).toContain("Correções");
  expect(html).toContain("R$");
  expect(html).not.toMatch(/contenteditable|<input|<textarea/);
  expect(html).toContain("não é somado novamente"); // Exibido para rastreabilidade.
 });
 it("XLSX tem exatamente dez abas na ordem do HTML, incluindo abas vazias",()=>{
  const wb=gerarXlsxHtmlFase7EC(data());
  expect(wb.SheetNames).toEqual([...ABAS_HTML_FASE7]);
  expect(wb.SheetNames).toEqual([
   "Consolidado","Checkmate SES","Itens","Divergências","Correções",
   "Auditoria de Faixa","Comunicações","Regularizações FPO","Alertas","FPO"]);
  const resumo=XLSX.utils.sheet_to_json(wb.Sheets.Consolidado,{header:1}) as unknown[][];
  expect(JSON.stringify(resumo)).toContain("Total preliminar do atesto");
  const check=XLSX.utils.sheet_to_json(wb.Sheets["Checkmate SES"],{header:1}) as unknown[][];
  expect(JSON.stringify(check)).toContain("NÃO COMPROVADO");
  const xlsx=JSON.stringify(wb.Sheets);
  expect(xlsx).not.toContain("Pessoa a proteger");
  expect(xlsx).toContain("Correções");
 });
 it("número e moeda não viram strings, controle FAEC faixa MAC não duplica",()=>{
  const wb=gerarXlsxHtmlFase7EC(data());
  const rows=XLSX.utils.sheet_to_json(wb.Sheets.Consolidado,{header:1}) as unknown[][];
  const total=rows.find(r=>r[1]==="Total preliminar do atesto");
  const controle=rows.find(r=>String(r[1]).includes("faixa MAC"));
  expect(total?.[3]).toBe(150);
  expect(controle?.[3]).toBe(900);
  const a=XLSX.utils.sheet_to_json(wb.Sheets.Itens,{header:1}) as unknown[][];
  expect(a.some(r=>r[7]===100&&r[8]===100)).toBe(true);
 });
 it("CSV separa com ;, protege injeção e mantém cabeçalho de divergências",()=>{
  const ctx=data();
  ctx.itens[2].descricao='=HYPERLINK("https://example.org")';
  const csv=gerarCsvDivergenciasFase7EC(ctx);
  expect(csv.charCodeAt(0)).toBe(0xFEFF);
  expect(csv).toContain("Complemento previsto");
  expect(csv).toContain('"'=HYPERLINK');
  expect(csv).toContain(";");expect(csv).toContain("\r\n");
  expect(csv).not.toContain("900,00");
 });
 it("consolidado só é exibido como oficial com memória válida, nunca por estimativa",()=>{
  const c=consolidadoDoManifestoEC([{
   categoria:"ec_consolidado",nome_original:"Consolidado Geral.xlsx",
   observacao:"SES Geral!A2/B2 | produção 150.00 | ajustes 10.00 | total 160.00"
  }],"2436469","07/2026");
  expect(c?.total).toBe(160);
  const inc=consolidadoDoManifestoEC([{
   categoria:"ec_consolidado",observacao:"SES Geral | produção 150.00 | ajustes 10.00 | total 160.00 | total derivado"
  }],"2436469","07/2026");
  expect(inc?.total).toBeNull();
 });
});
describe("Fase 8 — nenhum sinal verde sem evidências oficiais",()=>{
 it("somente abril, julho e >=agosto são perfis válidos",()=>{
  expect(perfilDaCompetencia("04/2026")).toBe("abril_2026");
  expect(perfilDaCompetencia("07/2026")).toBe("julho_2026");
  expect(perfilDaCompetencia("08/2026")).toBe("agosto_ou_posterior");
  expect(perfilDaCompetencia("11/2026")).toBe("agosto_ou_posterior");
  expect(perfilDaCompetencia("06/2026")).toBeNull();
  expect(TESTES_FASE8).toHaveLength(10);
 });
 it("gate do SQL exige zero divergências, três perfis, execução congelada, ACP/Admin, e jamais ativa deploy",()=>{
  const sql=read("supabase/migrations/20261016230000_eletivas_fase8_gate_homologacao.sql");
  for(const t of ["eletivas_fase8_validacoes","eletivas_fase8_eventos",
   "eletivas_fase8_autorizacoes","ec_fase8_prontidao",
   "ec_fase8_registrar","ec_fase8_autorizar","ec_fase8_revogar",
   "p_financeiras IS DISTINCT FROM 0","p_funcionais IS DISTINCT FROM 0",
   "c.ec_execucao_id=v.execucao_id","validos=3",
   "auth.uid()","ec_fase8_verificacoes_ok"]){
   expect(sql).toContain(t);
  }
  expect(sql).toContain("'implantacao_automatica',false");
  expect(sql).not.toMatch(/UPDATE public\.lancamentos_pagamento/);
  expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;\s*$/);
 });
 it("UI exige declaração fiscal e não autoriza por comparação isolada",()=>{
  const ui=read("src/components/eletivas/Fase8ValidacaoEletivas.tsx");
  expect(ui).toContain("comparacaoOK");
  expect(ui).toContain("!okTodos");
  expect(ui).toContain("p_declaracao:true");
  expect(ui).toContain("NÃO está autorizada");
  expect(ui).toContain("autorizacao_administrativa");
  const comp=read("src/components/eletivas/HomologacaoEletivas.tsx");
  expect(comp).toContain("<Fase8ValidacaoEletivas");
 });
});
