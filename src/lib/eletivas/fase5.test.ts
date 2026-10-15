import {describe,it,expect} from "vitest";
import * as XLSX from "xlsx";
import {quadroAtestoEC,gerarRtmaHtmlEC,gerarAnaliseHtmlEC,
  extrairTextoHtmlEC,conferirDocumentosEC,type ContextoFase5EC} from "./fase5Documentos";
import {prepararEncaminhamentoEC,gerarEncaminhamentoHtmlEC} from "./fase5Ses";
import {gerarXlsxFase5EC} from "./fase5Xlsx";
import type {ItemDocumentoEC} from "./fase5Documentos";
const linha=(categoria:ItemDocumentoEC["categoria"],p:number,e:number,
  extra:Partial<ItemDocumentoEC>={}):ItemDocumentoEC=>({
  chave:categoria+"|"+(extra.aih??""),categoria,descricao:"CIRURGIA DE REFERÊNCIA",
  valor_publicado:p,valor_esperado:e,situacao:"ok",conferido_em:"2026-10-15T14:00:00Z",
  ...extra,
});
const aih="4226100322066";
const modelo=():ContextoFase5EC=>({
  competencia:"07/2026",cnes:"2436469",prestador:"Hospital Municipal São José",
  documentos:{
    rtma_numero:"SEI 300001",analise_numero:"SEI 300002",
    rtma_link:"https://sei.joinville.sc.gov.br/a",analise_link:"https://sei.joinville.sc.gov.br/b",
    fiscais_rtma:["Fiscal A","Fiscal B"],fiscais_analise:["Fiscal C"],
    parecer:"validacao_parcial",amparo:"LEI Nº 9.038/2021 · SEI 0011190919",
    portaria_comissao:"PORTARIA Nº 123/2026",
  },
  itens:[
    linha("faec_prod",120,120,{procedimento:"040701001",aih,
      detalhe:{qt_aihs:1,qt_procedimentos:1,origem_ses:{fisico:{aba:"Físico",celula:"A9"}}}}),
    linha("faec_compl",30,30,{procedimento:"040701001"}),
    linha("faec_mult",100,100,{aih:"4226100322090",procedimento:"041501001",
      detalhe:{perfil:{principal:"041501001",faixa:"1",filhos:[
        {proc:"040702017",qt:1,unitario:100} ]}}}),
    linha("mac_compl",80,80,{aih:"4226100322077",procedimento:"040901018"}),
    linha("mac_mult",70,70,{aih:"4226100322088",procedimento:"041501001"}),
    linha("mac_fxfaec",25,25),
    linha("mac_prod",40,40,{aih:"4226100322077",procedimento:"040901018"}),
    linha("mac_fxfed",10,10),
    linha("sia_faec",15,15),
    linha("sia_mac",20,20),
    linha("faec_fxmac",5000,5000),
    linha("faec_compl",99,99,{chave:"erro",decisao:"erro"}),
    linha("mac_compl",40,60,{chave:"ses-oficio",
      decisao:"oficio",situacao:"div",procedimento:"040901018",
      justificativa:"Solicitação fundamentada em demonstração SES de julho."}),
    linha("faec_mult",0,300,{chave:"tecnico",decisao:"oficio",situacao:"pendente",
      aih:"4226100322099",detalhe:{exige_programacao_fpo:true},
      justificativa:"Análise da faixa depende da FPO do prestador."}),
  ],
  correcoes:[
    {competencia_origem:"06/2026",valor:10,documento_sei:"SEI 100002",
      motivo:"Correção aprovada",status:"aprovada",fonte_origem:"SES",referencia_origem:"R1"},
    {competencia_origem:"05/2026",valor:99,documento_sei:"SEI 100003",
      motivo:"Duplicado não aprovado",status:"duplicada"},
  ],
  fontes:[{categoria:"s_faec",nome_original:"SIH FAEC julho.xlsx",sha256:"f".repeat(64)}],
  fpo:[{procedimento:"041501001",competencia_programacao:"07/2026",
    documento_sei:"SEI 315000",vigencia_inicio:"2026-07-01",vigencia_fim:"2026-07-31",
    valor_federal_unitario:550}],
});
describe("Fase 5 — RTMA e análise, contratos do HTML",()=>{
 it("retém linhas do atesto, incluindo produção MAC separada, sem duplicar faec faixa MAC",()=>{
  const r=quadroAtestoEC(modelo());
  expect(r.linhas.map(x=>x.id)).toEqual([
   "faecPC","faecMS","macC","macMS","fxMac","macP","macFed","sia",
  ]);
  expect(r.linhas.find(x=>x.id==="faecPC")?.valorCentavos).toBe(15000);
  expect(r.linhas.find(x=>x.id==="macC")?.valorCentavos).toBe(12000); // 80 + min(40,60)
  expect(r.linhas.find(x=>x.id==="macP")?.valorCentavos).toBe(4000);
  expect(r.correcoesCent).toBe(1000);
  expect(r.totalLinhas).toBe(51000);
  expect(r.total).toBe(52000);
  expect(r.diferenca).toBe(0);
 });
 it("HTML do RTMA contém todos os campos/valor sem permitir edição de célula",()=>{
  const x=modelo(),html=gerarRtmaHtmlEC(x);
  for(const token of ["Proponente","Oferta de Serviço","Período de Execução",
   "Parceria nº","Parcela nº","Objeto Pactuado","Amparo Legal",
   "Quantidade de Cirurgias","Parecer da Comissão","Portaria de designação",
   "Valor total calculado — não editável"])expect(html).toContain(token);
  expect(html).toContain("R$");
  expect(html).not.toMatch(/contenteditable|data-ln/);
  expect(html).toContain("MINUTA");
  expect(html).not.toContain("5.000,00"); // recorte controle fora do atesto
 });
 it("relatório de análise separa categorias e inclui proveniência célula a célula",()=>{
  const html=gerarAnaliseHtmlEC(modelo());
  expect(html).toContain("RELATÓRIO DE ANÁLISE");
  expect(html).toContain("4226100322066");
  expect(html).toContain("Físico");
  expect(html).toContain("A9");
  expect(html).toContain("Quadro de reconciliação");
  expect(html).toContain("Diferença contra consolidação do motor");
  expect(extrairTextoHtmlEC(html)).toContain("CIRURGIA DE REFERÊNCIA");
 });
 it("verifica campos SEI e fiscais, sem inventar autenticação",()=>{
  const x=modelo();
  expect(conferirDocumentosEC(x)).toContain(
   "Quantidade global de cirurgias não comprovada por conjunto completo de AIHs.");
  x.documentos.fiscais_rtma=["Somente um"];
  expect(conferirDocumentosEC(x).some(p=>p.includes("dois fiscais"))).toBe(true);
 });
 it("escapa valores externos em HTML para cópia segura",()=>{
  const x=modelo();
  x.prestador='<img src=x onerror="alert(1)">';
  const html=gerarRtmaHtmlEC(x);
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;img");
 });
});
describe("Fase 5 — ofícios SES e XLSX",()=>{
 it("cobrança líquida só inclui ofício conferido com diferença > R$ 0,02",()=>{
  const r=prepararEncaminhamentoEC(modelo());
  expect(r.cobrancas).toHaveLength(1);
  expect(r.totalCent).toBe(2000);
  expect(r.analises).toHaveLength(1);
  expect(r.analises[0].motivoBloqueio).toContain("Falta");
  expect(r.corpo).toContain("I. DIFERENÇAS");
  expect(r.corpo).toContain("II. OCORRÊNCIAS");
  expect(r.assunto).not.toContain("\n");
 });
 it("valor zero em SES gera alerta e não vira cobrança fictícia",()=>{
  const x=modelo();
  x.itens=x.itens.filter(i=>i.decisao!=="oficio");
  const r=prepararEncaminhamentoEC(x);
  expect(r.valorZero).toBe(true);expect(r.totalCent).toBe(0);
  expect(r.assunto).toContain("Solicitação de análise técnica");
  expect(gerarEncaminhamentoHtmlEC(x)).toContain("R$ 0,00");
 });
 it("XLSX contém 13 abas e exclui dados nominativos e controle dos totais",()=>{
  const x=modelo();
  x.itens[0].detalhe={cpf:"111.222.333-44",nome_paciente:"Pessoa a proteger",
    qt_aihs:1,origem_ses:{fisico:{aba:"Físico",celula:"A9"}}};
  const wb=gerarXlsxFase5EC(x);
  expect(wb.SheetNames).toEqual([
   "Resumo","FAEC","MAC","SIA","Multiplas","Fila","Dossies",
   "AIHs e Filhos","FPO","Correcoes","Proveniencia","Parecer","SES Encaminhamentos",
  ]);
  const rows=XLSX.utils.sheet_to_json(wb.Sheets.Dossies) as Record<string,unknown>[];
  expect(JSON.stringify(rows)).not.toMatch(/111\.222\.333-44|Pessoa a proteger/);
  const sum=XLSX.utils.sheet_to_json(wb.Sheets.Resumo) as Record<string,unknown>[];
  const t=sum.find(x=>x.Componente==="Total preliminar");
  expect(t?.["Valor R$"]).toBe(520);
  expect(wb.Sheets.Resumo["B2"].t).toBe("n");
  expect(JSON.stringify(wb.Sheets.Proveniencia)).toContain("SHA256");
 });
});
