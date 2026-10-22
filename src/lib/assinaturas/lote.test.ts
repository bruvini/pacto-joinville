import { describe, expect, it } from "vitest";
import { candidatosConvenios, candidatosPiso, candidatosPvh, resumoCandidatos } from "./lote";

const url = "https://sei.exemplo.gov.br/sei/documento/123";
describe("candidatos de assinaturas em lote", () => {
  it("não exibe lançamento concluído nem mãe com parcelas; exige referência documental", () => {
    const itens = candidatosConvenios([
      {id:"pai",concluido:false,link_solicitacao_sei:url,competencia:"10/2026"},
      {id:"filho",parent_id:"pai",concluido:false,link_solicitacao_sei:url,
        competencia:"10/2026",convenios:{modelo_fluxo:"fluxo_1"}},
      {id:"encerrado",concluido:true,link_solicitacao_sei:url},
      {id:"sem-evidencia",concluido:false},
    ],[],true,false);
    expect(itens.length).toBeGreaterThan(0);
    expect(new Set(itens.map(i=>i.registroId))).toEqual(new Set(["filho"]));
  });

  it("separa slots ACO e ACP nos convênios", () => {
    const lanc=[{id:"f",concluido:false,link_solicitacao_sei:url,
      link_empenho_sei:url,numero_empenho:"123/2026",
      competencia:"09/2026"}];
    const acp=candidatosConvenios(lanc,[],true,false);
    const aco=candidatosConvenios(lanc,[],false,true);
    expect(acp.some(i=>i.bloco==="etapa1")).toBe(true);
    expect(acp.some(i=>i.bloco==="libera_orc")).toBe(false);
    expect(aco.every(i=>i.bloco==="libera_orc")).toBe(true);
  });

  it("considera 2 Fiscais no relatório técnico, sem repetir os já cadastrados", () => {
    const l=[{id:"f",concluido:false,competencia:"09/2026",
      link_relatorio_tecnico_sei:url}];
    expect(candidatosConvenios(l,[],true,false).filter(i=>i.bloco==="rel_tecnico" && i.slot==="fiscal")).toHaveLength(2);
    const ja=[{lancamento_id:"f",bloco:"rel_tecnico",slot:"fiscal",servidor_nome:"Fiscal 1"}];
    expect(candidatosConvenios(l,ja,true,false).filter(i=>i.bloco==="rel_tecnico" && i.slot==="fiscal")).toHaveLength(1);
  });

  it("Piso aplica matriz própria e mantém 13ª em sua competência", () => {
    const items=candidatosPiso([
      {id:"doc",tipo:"solicitacao_ne",competencia_id:"c",link_sei:url},
      {id:"semlink",tipo:"solicitacao_ne",competencia_id:"c"},
    ],[{id:"c",status:"aberta",competencia:"12/2026",tipo_parcela:"decimo_terceiro"}],
    [],[{tipo_documento:"solicitacao_ne",slot_key:"fiscal",cargos:["Fiscal"],manual:false,opcional:false,ordem:1}],[]);
    expect(items).toMatchObject([{registroId:"doc",competencia:"12/2026",slot:"fiscal"}]);
  });

  it("identifica a instituição do Piso pelo vínculo obrigação → participante → prestador", () => {
    const candidatos = candidatosPiso(
      [{id:"doc1",tipo:"solicitacao_ne",competencia_id:"competencia1",
        participante_id:null,obrigacao_id:"obrigacao1",link_sei:url}],
      [{id:"competencia1",status:"em_andamento",competencia:"10/2026"}],
      [{id:"participante1",prestadores:{nome_instituicao:"Hospital Municipal São José"}}],
      [{tipo_documento:"solicitacao_ne",slot_key:"diretor_financeiro",
        label:"Diretora Financeira",cargos:["Diretoria Financeira"],ordem:1}],
      [],
      [{id:"obrigacao1",participante_id:"participante1"}],
    );
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]).toMatchObject({
      competencia:"10/2026",instituicao:"Hospital Municipal São José",
      documento:"Solicitação de NE",slot:"diretor_financeiro",
    });
  });

  it("informa quando a instituição não pode ser identificada em vez de rotular como obrigação", () => {
    const linhas = candidatosPiso(
      [{id:"doc1",tipo:"solicitacao_ne",competencia_id:"c",obrigacao_id:"sem-pai",link_sei:url}],
      [{id:"c",status:"aberta",competencia:"11/2026"}],[],
      [{tipo_documento:"solicitacao_ne",slot_key:"fiscal",
        label:"Fiscal",cargos:["Fiscal"],ordem:1}],[],[],
    );
    expect(linhas[0].instituicao).toBe("Sem instituição identificada");
  });

  it("PVH exclui revogadas da contagem e não gera candidatos para competências encerradas", () => {
    const data={
      competencias:[{id:"c",competencia:"10/2026",status:"em_andamento"},
        {id:"fim",competencia:"09/2026",status:"encerrada"}],
      empenhos:[{id:"e",solicitacao_competencia_id:"c",solicitacao_sei_link:url,
        solicitacao_enviada_sefaz:false}],
      documentos:[{id:"d",competencia_id:"c",tipo_codigo:"minuta_portaria_municipal",
        link_documento:url},{id:"d2",competencia_id:"fim",
        tipo_codigo:"minuta_portaria_municipal",link_documento:url}],
      subempenhos:[], alocacoes:[], participantes:[],
      assinaturasSolicitacao:[{empenho_id:"e",slot:"coord_orc",revogado_em:null}],
      assinaturasDocumento:[{documento_id:"d",slot:"gestao",revogado_em:"2026-10-01"}],
      assinaturasSub:[],
    };
    const itens=candidatosPvh(data);
    expect(itens.some(i=>i.registroId==="d2")).toBe(false);
    expect(itens.some(i=>i.registroId==="e"&&i.slot==="coord_orc")).toBe(false);
    expect(itens.some(i=>i.registroId==="d"&&i.slot==="gestao")).toBe(true);
    expect(resumoCandidatos(itens).length).toBe(itens.length);
  });
});
