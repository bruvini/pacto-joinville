import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {
 indicadoresFinanceirosEmenda,pendenciasFinanceirasEmenda,
 csvExcelSeguro,csvPendenciasGerenciais,csvNesGerenciais,
 csvCompetenciasGerenciais,csvPagamentosGerenciais,competenciaISO,
 type NeGerencial,type SubGerencial,type PagamentoGerencial,
 type ParcelaGerencial,type DocumentoGerencial,type CompetenciaGerencial,
 type SolicitacaoGerencial,type FontesGerenciais,type ResumoGerencial,
} from "./gerencial";

const ne=(v:Partial<NeGerencial>={})=>({
 emenda_id:"em1",lancamento_id:"lan1",solicitacao_id:"sol1",numero_ne:"123",
 exercicio_ne:2026,status_ne:"emitida",valor_ne_emitida:100000,ne_liquida:100000,
 saldo_disponivel_anular:100000,saldo_a_anular_fechamento:100000,
 compromissos_novos:0,subempenhos_confirmados_valor:0,
 liberacoes_legadas:0,pago_liquido_novo:0,pago_legado:0,conciliada:false,
 modelo_financeiro:"sem_movimentacao",...v
} as NeGerencial);
const sub=(v:Partial<SubGerencial>={})=>({
 id:"sub1",emenda_id:"em1",lancamento_id:"lan1",competencia_id:"comp1",
 solicitacao_id:"sol1",status:"solicitado",sequencia:1,valor_solicitado:60000,
 valor_subempenhado:null,...v
} as SubGerencial);
const pagamento=(v:Partial<PagamentoGerencial>={})=>({
 subempenho_id:"sub1",emenda_id:"em1",lancamento_id:"lan1",competencia_id:"comp1",
 valor_programado:60000,valor_pago_liquido:0,saldo_a_pagar:60000,
 valor_subempenhado:60000,status_subempenho:"subempenhado",conciliado:false,
 ...v
} as PagamentoGerencial);
const documento=(v:Partial<DocumentoGerencial>={})=>({
 id:"doc1",emenda_id:"em1",subempenho_id:"sub1",tipo:"aviso_subempenho",
 status_documental:"concluido",conclusao_id:"conc1",
 numero_sei:"123456",link_sei:"https://sei.joinville.sc.gov.br/abc",...v
} as DocumentoGerencial);
const comp=(v:Partial<CompetenciaGerencial>={})=>({
 emenda_id:"em1",lancamento_id:"lan1",competencia_id:"comp1",
 competencia:"2026-11-01",situacao_competencia:"pendente",valor_distribuido:60000,
 subempenhos_ativos:1,liberado_legado:0,pago_legado:0,documentos_legados:0,...v
} as CompetenciaGerencial);
const sol=(v:Partial<SolicitacaoGerencial>={})=>({
 id:"sol1",emenda_id:"em1",numero_sei_ne:"654321",
 link_sei_ne:"https://sei.joinville.sc.gov.br/ne",...v
} as SolicitacaoGerencial);
function base(v:Partial<FontesGerenciais>={}):FontesGerenciais{
 return {nes:[ne()],subempenhos:[],pagamentos:[],parcelas:[],documentos:[],
  competencias:[],solicitacoes:[sol()],...v};
}
const page=readFileSync(new URL("../../routes/_authenticated/emendas.$id_.lancamentos.$lancamentoId.tsx",import.meta.url),"utf8");
const cockpit=readFileSync(new URL("../../components/emendas/PainelGerencialEmenda.tsx",import.meta.url),"utf8");
const resumoNe=readFileSync(new URL("../../components/emendas/PainelResumoNeEmenda.tsx",import.meta.url),"utf8");
const subCards=readFileSync(new URL("../../components/emendas/FluxoSubempenhosEmenda.tsx",import.meta.url),"utf8");
const exec=readFileSync(new URL("../../components/emendas/ExecucaoEmenda.tsx",import.meta.url),"utf8");

describe("Emendas · Fase G · indicadores distintos",()=>{
 it("separa autorizado, reservado, empenhado, subempenhado, programado e pago líquido",()=>{
  expect(indicadoresFinanceirosEmenda({
   resumo:{valor_autorizado_vigente:250000,valor_reservado:20000,
    valor_empenhado:150000} as ResumoGerencial,
   nes:[ne({valor_ne_emitida:100000,subempenhos_confirmados_valor:50000,
    pago_liquido_novo:30000,compromissos_novos:50000,modelo_financeiro:"novo_subempenho"})],
   pagamentos:[pagamento({valor_programado:45000})]
  })).toEqual({
   autorizadoVigente:250000,reservadoEmSolicitacoes:20000,empenhado:150000,
   subempenhado:50000,programado:45000,pagoLiquido:30000
  });
 });
 it("não duplica valores quando o pagamento está no livro legado",()=>{
  const r=indicadoresFinanceirosEmenda({
   resumo:null,nes:[ne({modelo_financeiro:"modelo_legado",pago_legado:6000,
    pago_liquido_novo:0})],pagamentos:[]
  });
  expect(r).toMatchObject({pagoLiquido:6000,programado:0,autorizadoVigente:null});
 });
 it("valor programado não se transforma em pago",()=>{
  const r=indicadoresFinanceirosEmenda({
   resumo:null,nes:[ne({modelo_financeiro:"novo_subempenho",pago_liquido_novo:0})],
   pagamentos:[pagamento({valor_programado:60000,valor_pago_liquido:0})]
  });
  expect(r.programado).toBe(60000);
  expect(r.pagoLiquido).toBe(0);
 });
});
describe("Emendas · Fase G · filtros operacionais",()=>{
 it("localiza NE emitida sem utilização e limite potencialmente anulável",()=>{
  const r=pendenciasFinanceirasEmenda(base());
  expect(r.map(x=>x.tipo)).toContain("ne_sem_utilizacao");
  expect(r.map(x=>x.tipo)).toContain("saldo_anulavel");
  expect(r.find(x=>x.tipo==="ne_sem_utilizacao")).toMatchObject({
   numeroNe:"123/2026",valorPendente:100000,linkSei:"https://sei.joinville.sc.gov.br/ne"
  });
 });
 it("não chama distribuição de utilização financeira",()=>{
  const r=pendenciasFinanceirasEmenda(base({
   nes:[ne({distribuido_competencias:80000,saldo_disponivel_anular:20000})]
  }));
  expect(r.some(x=>x.tipo==="ne_sem_utilizacao")).toBe(true);
  expect(r.find(x=>x.tipo==="saldo_anulavel")?.valorPendente).toBe(20000);
 });
 it("encontra solicitações da mesma competência ainda sem Aviso",()=>{
  const r=pendenciasFinanceirasEmenda(base({
   subempenhos:[sub()],competencias:[comp()],
   documentos:[documento({tipo:"solicitacao_liquidacao",
    status_documental:"aguardando_assinaturas",conclusao_id:null})],
  }));
  expect(r).toContainEqual(expect.objectContaining({
   tipo:"solicitacao_sem_aviso",subempenhoId:"sub1",competencia:"2026-11-01",
   linkSei:"https://sei.joinville.sc.gov.br/abc"
  }));
 });
 it("pagamento parcial não aparece como quitado ou ainda não pago",()=>{
  const r=pendenciasFinanceirasEmenda(base({
   nes:[ne({compromissos_novos:60000,subempenhos_confirmados_valor:60000,
    saldo_disponivel_anular:40000})],
   subempenhos:[sub({status:"subempenhado",valor_subempenhado:60000})],
   pagamentos:[pagamento({valor_pago_liquido:30000,saldo_a_pagar:30000})],
   documentos:[documento()],competencias:[comp()],
   parcelas:[{subempenho_id:"sub1",comprovante_numero_sei:"67890",
    comprovante_link_sei:"https://sei.joinville.sc.gov.br/pag",
    valor_pago_liquido:30000} as ParcelaGerencial],
  }));
  const parcial=r.find(x=>x.tipo==="pagamento_parcial");
  expect(parcial).toMatchObject({
   valorPendente:30000,linkSei:"https://sei.joinville.sc.gov.br/pag"
  });
  expect(r.some(x=>x.tipo==="aguardando_pagamento")).toBe(false);
  expect(r.some(x=>x.tipo==="aguardando_conciliacao")).toBe(false);
 });
 it("pagamento integral só fica concluído após a conciliação individual",()=>{
  const r=pendenciasFinanceirasEmenda(base({
   subempenhos:[sub({status:"subempenhado",valor_subempenhado:60000})],
   documentos:[documento()],
   pagamentos:[pagamento({valor_pago_liquido:60000,saldo_a_pagar:0,conciliado:false})]
  }));
  expect(r.some(x=>x.tipo==="aguardando_conciliacao")).toBe(true);
 });
 it("alerta distribuição maior que o residual livre para anular",()=>{
  const r=pendenciasFinanceirasEmenda(base({
   nes:[ne({saldo_disponivel_anular:30000,saldo_a_anular_fechamento:50000})]
  }));
  expect(r.find(x=>x.tipo==="distribuicao_a_rever")?.valorPendente).toBe(20000);
 });
 it("competência sem execução não declarada é localizável sem fingir comprovante",()=>{
  const r=pendenciasFinanceirasEmenda(base({
   competencias:[comp({valor_distribuido:0,subempenhos_ativos:0,
    documentos_legados:0,situacao_competencia:"pendente"})],
  }));
  expect(r.some(x=>x.tipo==="competencia_pendente")).toBe(true);
 });
});
describe("Emendas · Fase G · relatórios e integração",()=>{
 it("CSV Excel contém BOM, separador e neutraliza fórmulas nos textos",()=>{
  const csv=csvExcelSeguro(["Campo"],[
   ["=SOMA(1;1)"],["+CMD"],["-cmd"],["@formula"],['a"b'],["ok\nlinha"]
  ]);
  expect(csv.startsWith("\uFEFFsep=;\r\n")).toBe(true);
  expect(csv).toContain('"\'=SOMA(1;1)"');
  expect(csv).toContain('"\'+CMD"');
  expect(csv).toContain('"\'-cmd"');
  expect(csv).toContain('"\'@formula"');
  expect(csv).toContain('"a""b"');
  expect(csv).not.toContain("ok\nlinha");
 });
 it("exporta pendências e NEs com links SEI e identificadores rastreáveis",()=>{
  const r=pendenciasFinanceirasEmenda(base());
  expect(csvPendenciasGerenciais(r,"EM-123")).toContain("https://sei.joinville.sc.gov.br/ne");
  expect(csvNesGerenciais([ne()],"EM-123")).toContain("Saldo disponível para anular");
  expect(csvCompetenciasGerenciais([comp()],"EM-123")).toContain("2026-11");
  expect(csvPagamentosGerenciais([pagamento()],[],"EM-123")).toContain("Link comprovante");
 });
 it("o cockpit consulta as visões F, usa paginação e não oculta relatório incompleto",()=>{
  for(const src of [
   "emenda_f_ne_painel","emenda_f_competencias_painel",
   "emenda_pagamento_subempenhos_painel","emenda_pagamento_parcelas_painel",
   "emenda_subempenho_documentos_painel","emendas_resumo",
   "PAGINA_CONSULTA","LIMITE_SEGURANCA"
  ])expect(cockpit).toContain(src);
  expect(cockpit).toContain("csvNesGerenciais");
  expect(cockpit).toContain("csvPagamentosGerenciais");
  expect(cockpit).toContain("Falha"=== "Falha"?"As exportações estão indisponíveis":"");
 });
 it("o lançamento se organiza por NE → competência → subempenhos → pagamentos",()=>{
  expect(exec).toContain("<PainelGerencialEmenda");
  expect(exec).not.toContain("<PainelIndicadoresEmenda");
  expect(page).toContain("<PainelResumoNeEmenda");
  expect(page).toContain('id="formalizacao-ne"');
  expect(page).toContain('id="distribuicao-ne"');
  expect(page).toContain('id="competencias-subempenhos"');
  expect(page).toContain('id="fechamento-ne"');
  expect(page).toContain('id="historico-financeiro"');
  expect(subCards).toContain('grupos.map');
  expect(subCards).toContain('subs.map(sub=>');
  expect(subCards).toContain('Nova solicitação nesta competência');
  expect(subCards).toContain('<PainelPagamentosEmenda');
 });
 it("linha do tempo mantém evidências SEI e permite consultar eventos anteriores",()=>{
  expect(page).toContain('Carregar mais 500 eventos anteriores');
  expect(page).toContain('Exportar eventos CSV');
  expect(page).toContain('evidencia(h)');
  expect(page).toContain('setHistoricoLimite');
  expect(resumoNe).toContain('Programado');
  expect(resumoNe).toContain('Pago líquido');
 });
});
