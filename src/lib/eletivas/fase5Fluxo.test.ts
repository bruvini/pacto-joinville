import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {destinosPermitidosEC,sugestaoDestinoEC,aptosGemasEC,gerarMinutaEC,
 ETAPAS_FPO,type ComunicacaoEC,type FluxoEC} from "./comunicacoes";
import type {ItemEC} from "./financeiro";
const item=(p:Partial<ItemEC>={}):ItemEC=>({
 id:"11111111-1111-4111-8111-111111111111",chave:"faec_mult|aih1",
 categoria:"faec_mult",descricao:"Exemplo",aih:"4226100322066",
 procedimento:"040701003",valor_publicado:100,valor_esperado:130,
 situacao:"pendente",detalhe:{classificacao_auditor:"review",
  perfil:{aih:"4226100322066",estado:"review"}},...p,
});
const fpo=(p:Partial<FluxoEC>={}):FluxoEC=>({
 id:"22222222-2222-4222-8222-222222222222",
 competencia_id:"33333333-3333-4333-8333-333333333333",
 item_id:"11111111-1111-4111-8111-111111111111",
 aih:"4226100322066",etapa:5,situacao:"ativo",
 valor_estimado:350,versao:5,documento_sei:"31200000",...p});
const com=(p:Partial<ComunicacaoEC>={}):ComunicacaoEC=>({
 id:"44444444-4444-4444-8444-444444444444",
 tipo:"aih",referencia:"11111111-1111-4111-8111-111111111111",
 destino:"regulacao",situacao:"fila",assinatura:"0".repeat(32),
 enviada_em:null,protocolo:null,assunto:null,...p});
const read=(path:string)=>readFileSync(fileURLToPath(
 new URL("../../../"+path,import.meta.url)),"utf8");
describe("Fase 5 — fluxo HTML 2.42.2, destino e deduplicação",()=>{
 it("faixa bad/review sugere Central; FPO segue interno até produção aprovada",()=>{
  expect(destinosPermitidosEC(item(),[])).toEqual(["none","interno","regulacao"]);
  expect(sugestaoDestinoEC(item())).toBe("regulacao");
  const x=item({detalhe:{classificacao_auditor:"fpo"}});
  expect(destinosPermitidosEC(x,[fpo()])).toEqual(["none","interno"]);
  expect(sugestaoDestinoEC(x)).toBe("interno");
  expect(destinosPermitidosEC(item({categoria:"sia_mac"}),[])).toEqual(["none"]);
 });
 it("regularização apta à GEMAS só nas etapas 5–7, não por FPO oficial",()=>{
  expect(ETAPAS_FPO).toHaveLength(8);
  expect(aptosGemasEC([fpo({etapa:3}),fpo({etapa:5}),fpo({etapa:8}),
    fpo({etapa:6,situacao:"cancelado"})])).toHaveLength(1);
 });
 it("minuta da Central agrupa AIHs e não reconhece valores automaticamente",()=>{
  const m=gerarMinutaEC("regulacao","07/2026","2436469",[com()],[item()],[fpo()]);
  expect(m.assunto).toContain("07/2026");
  expect(m.para).toBe("sur.coorsceletivas@saude.sc.gov.br");
  expect(m.corpo).toContain("AIH: 4226100322066");
  expect(m.corpo).toContain("Regulação");
  expect(m.totalCobrar).toBe(0);
 });
 it("GEMAS consolidada agrupa ofício e análise e não soma no atesto",()=>{
  const primeira=item({decisao:"oficio",justificativa:"Divergência da fonte SES",
   procedimento:"040701003",situacao:"div"});
  const segunda=item({id:"66666666-6666-4666-8666-666666666666",
   decisao:"analise",justificativa:"Aguardando resposta",chave:"outro",
   categoria:"mac_compl"});
  const m=gerarMinutaEC("gemas","07/2026","2436469",
   [com({tipo:"ec_gemas",referencia:"consolidado",destino:"gemas"})],
   [primeira,segunda],[fpo()]);
  expect(m.para).toBe("gemas@saude.sc.gov.br");
  expect(m.totalCobrar).toBe(3000);
  expect(m.corpo).toContain("Itens em análise: 1");
  expect(m.corpo).toContain("não incorporadas automaticamente ao atesto");
 });
 it("GEMAS por reprocessamento rejeita fluxos antes da etapa 5",()=>{
  const comm=com({tipo:"regflow",referencia:fpo().id,destino:"gemas"});
  expect(()=>gerarMinutaEC("gemas","07/2026","2436469",
   [comm],[item()],[fpo({etapa:4})])).toThrow(/Produção ainda não aprovada/);
  const doc=gerarMinutaEC("gemas","07/2026","2436469",
    [comm],[item()],[fpo()]);
  expect(doc.corpo).toContain("não representam pagamentos reconhecidos");
  expect(doc.corpo).toContain("350,00");
 });
 it("grupo de envio idêntico não pode duplicar o mesmo caso",()=>{
  expect(()=>gerarMinutaEC("regulacao","07/2026","2436469",
    [com(),com()],[item()],[fpo()])).toThrow(/repetidas/);
  expect(()=>gerarMinutaEC("gemas","07/2026","2436469",
    [com()],[item()],[fpo()])).toThrow(/Selecione pelo menos/);
 });
 it("persistência é institucional, escrita auditada e nunca envia e-mail sozinho",()=>{
  const sql=read("supabase/migrations/20261016220000_eletivas_fase5_fluxo_comunicacoes.sql");
  for(const key of ["eletivas_fpo_fluxos","eletivas_fpo_vinculos",
    "eletivas_comunicacoes","eletivas_comunicacoes_eventos",
    "ec_fpo_iniciar","ec_fpo_mudar_etapa","ec_fpo_vincular_correcao",
    "ec_com_rotear","ec_com_marcar_envio","ec_com_reabrir",
    "situação","eletivas_correcoes"]) {
    if(key==="situação")continue;
    expect(sql).toContain(key);
  }
  expect(sql).toContain("UNIQUE(competencia_id,tipo,referencia)");
  expect(sql).toContain("situacao='enviada'");
  expect(sql).toContain("Ação reservada à ACP/Admin");
  expect(sql).not.toContain("DELETE FROM public.lancamentos_pagamento");
  expect(sql).not.toContain("UPDATE public.lancamentos_pagamento");
  const ui=read("src/components/eletivas/ComunicacoesEletivas.tsx");
  expect(ui).toContain("Gerar minuta com os selecionados");
  expect(ui).toContain("Confirmar envio institucional realizado");
  expect(ui).toContain("Esta ação NÃO envia e-mail");
  expect(ui).toContain("Reabrir para novo encaminhamento");
  const route=read("src/routes/_authenticated/eletivas.$id.tsx");
  expect(route).toContain('"comunicacoes","Comunicações e FPO"');
 });
});
