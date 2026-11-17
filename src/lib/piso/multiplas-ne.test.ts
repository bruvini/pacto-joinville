import { describe, expect, it } from "vitest";
import { acharDoc, pendenciasEtapa, type CtxPiso, type Doc } from "./regras";
import { resumoEmpenhoPiso } from "./resumo-empenho";
import { saldosAnulacaoPiso } from "./anulacao";

const documento = (tipo: string, obrigacao_id: string, subempenho_id: string | null = null): Doc => ({
  id: `${obrigacao_id}:${subempenho_id}:${tipo}`, tipo, obrigacao_id, participante_id: null, subempenho_id,
  numero: tipo === "nota_empenho" ? "123/2026" : null,
  numero_sei: "12345678", link_sei: "https://sei.joinville.sc.gov.br/sei/documento", data_documento: "2026-11-15",
});
const parts = [{ id: "p", valor_devido: 9876.68 }];
const obrigs = [
  { id: "a", participante_id: "p", alocacao_manual: true, valor_aplicado: 1762.40, valor_a_liquidar: 1762.40, valor_empenhado: 1762.40, valor_solicitado: 1762.40, fonte: "1", cr_dotacao: "1", valor_pago: 1762.40, data_pagamento: "2026-11-15" },
  { id: "b", participante_id: "p", alocacao_manual: true, valor_aplicado: 8114.28, valor_a_liquidar: 8114.28, valor_empenhado: 8114.28, valor_solicitado: 8114.28, fonte: "2", cr_dotacao: "2", valor_pago: 8114.28, data_pagamento: "2026-11-15" },
];
const subempenhos = [
  { id: "s1", obrigacao_id: "a", valor: 1762.40 },
  { id: "s2", obrigacao_id: "b", valor: 4000 },
  { id: "s3", obrigacao_id: "b", valor: 4114.28 },
];
const docs = [
  ...obrigs.flatMap(o=>["solicitacao_ne","nota_empenho","programacao_pagamento","comprovante_pagamento"].map(t=>documento(t,o.id))),
  ...subempenhos.flatMap(s=>["solicitacao_liquidacao","aviso_liquidacao","aviso_subempenho"].map(t=>documento(t,s.obrigacao_id,s.id))),
];
const ctx: CtxPiso = { comp: { etapas_concluidas: { 5:true,6:true } }, parts, obrigs, subempenhos, docs, assinaturas: [], matriz: [], encaminhamentos: docs.filter(d=>["solicitacao_ne","aviso_liquidacao"].includes(d.tipo)).map(d=>({ documento_id:d.id, acao:"encaminhado", ocorrido_em:"2026-11-15" })) };

describe("Piso com várias NEs e subempenhos", () => {
  it("conclui empenho com parcelas informadas e notas documentadas, mesmo com divergência", () => {
    expect(pendenciasEtapa(5,ctx)).toEqual([]);
    expect(pendenciasEtapa(5,{...ctx,docs:docs.filter(d=>d.id!=="b:null:nota_empenho")})).not.toEqual([]);
    expect(pendenciasEtapa(5,{...ctx,obrigs:[obrigs[0],{...obrigs[1],valor_aplicado:8000}]})).toEqual([]);
    const divergente={...ctx,obrigs:[obrigs[0],{...obrigs[1],valor_aplicado:9876.68,valor_empenhado:13474.24,valor_solicitado:13474.24,valor_a_liquidar:9876.68}]};
    expect(pendenciasEtapa(5,divergente)).toEqual([]);
    expect(pendenciasEtapa(6,divergente)).toEqual([]);
    expect(pendenciasEtapa(7,divergente)).toEqual([]);
  });
  it("permite usar somente uma de duas NEs, com vários subempenhos", () => {
    const os = [{...obrigs[0],valor_empenhado:15000,valor_aplicado:9876.68,valor_a_liquidar:0,valor_pago:null,data_pagamento:null},{...obrigs[1],valor_empenhado:13474.24,valor_aplicado:9876.68,valor_a_liquidar:9876.68,valor_pago:9876.68}];
    const ss = [{id:"s2",obrigacao_id:"b",valor:4000},{id:"s3",obrigacao_id:"b",valor:5876.68}];
    const ds = docs.filter(d => d.obrigacao_id === "b" || ["solicitacao_ne","nota_empenho"].includes(d.tipo));
    const c = {...ctx,obrigs:os,subempenhos:ss,docs:ds};
    expect(pendenciasEtapa(6,c)).toEqual([]);
    expect(pendenciasEtapa(7,c)).toEqual([]);
    expect(pendenciasEtapa(6,{...c,subempenhos:ss.slice(0,1)})).not.toEqual([]);
    expect(pendenciasEtapa(6,{...c,subempenhos:ss.map(s=>({...s,valor:s.valor+0.01}))})).not.toEqual([]);
    expect(pendenciasEtapa(7,{...c,obrigs:[{...os[0],valor_pago:1},os[1]]})).not.toEqual([]);
  });
  it("libera e-Pública com duas NEs acima do devido, sem parcelas prévias", () => {
    const os = [{...obrigs[0],valor_aplicado:null,valor_a_liquidar:null,valor_empenhado:15000,valor_solicitado:15000},{...obrigs[1],valor_aplicado:null,valor_a_liquidar:null,valor_empenhado:13474.24,valor_solicitado:13474.24}];
    expect(pendenciasEtapa(5,{...ctx,obrigs:os,subempenhos:[]})).toEqual([]);
    expect(pendenciasEtapa(5,{...ctx,obrigs:[os[0],{...os[1],valor_empenhado:null}],subempenhos:[]})).not.toEqual([]);
    expect(pendenciasEtapa(6,{...ctx,obrigs:os,subempenhos:[]})).not.toEqual([]);
  });

  it("identifica cada bloqueio do e-Pública por NE e solicitação e reduz a lista após completar documentos", () => {
    const ds = docs.map(d => d.tipo === "nota_empenho"
      ? { ...d, numero: d.obrigacao_id === "a" ? "7201/2026" : "8110/2026" }
      : d);
    const c = {
      ...ctx,
      parts: [{ ...parts[0], prestadores: { nome_instituicao: "Banco de Olhos de Joinville" } }],
      subempenhos: subempenhos.map(s => ({ ...s, sequencia: s.id === "s3" ? 2 : 1 })),
      docs: ds.filter(d => d.tipo !== "aviso_subempenho"),
    };
    const pendentes = pendenciasEtapa(6, c);
    const sufixo = ": informe Nº SEI, link SEI válido e data do Aviso de Movimento - Subempenho";
    expect(pendentes).toEqual([
      "Banco de Olhos de Joinville · NE 7201/2026 · Solicitação 1" + sufixo,
      "Banco de Olhos de Joinville · NE 8110/2026 · Solicitação 1" + sufixo,
      "Banco de Olhos de Joinville · NE 8110/2026 · Solicitação 2" + sufixo,
    ]);
    expect(pendenciasEtapa(6, { ...c, docs: [...c.docs, ...ds.filter(d => d.id === "b:s2:aviso_subempenho")] }))
      .toEqual([pendentes[0], pendentes[2]]);
    expect(pendenciasEtapa(6, { ...c, docs: ds })).toEqual([]);
  });
  it("documentos e assinaturas não vazam entre duas cadeias da mesma NE", () => {
    const escopo={obrigacao_id:"b",subempenho_id:"s3"};
    expect(acharDoc(docs,"aviso_subempenho",escopo)?.id).toBe("b:s3:aviso_subempenho");
    expect(acharDoc(docs,"aviso_subempenho",{obrigacao_id:"b"})).toBeUndefined();
    expect(pendenciasEtapa(6,ctx)).toEqual([]);
    expect(pendenciasEtapa(6,{...ctx,docs:docs.filter(d=>d.id!=="b:s3:aviso_subempenho")})).not.toEqual([]);
    expect(pendenciasEtapa(6,{...ctx,subempenhos:subempenhos.map(s=>s.id==="s3"?{...s,valor:4114.29}:s)})).not.toEqual([]);
  });
  it("paga a parcela de cada NE sem repetir o devido e calcula excedentes por nota", () => {
    expect(pendenciasEtapa(7,ctx)).toEqual([]);
    expect(pendenciasEtapa(7,{...ctx,obrigs:obrigs.map(o=>({...o,valor_pago:9876.68}))})).not.toEqual([]);
    const excedente = saldosAnulacaoPiso([{...obrigs[0],valor_empenhado:2000},obrigs[1]]);
    expect(excedente.map(e=>e.previsto)).toEqual([237.60]);
  });
  it("o resumo considera apenas notas emitidas e preserva o devido único", () => {
    const parcial=resumoEmpenhoPiso(9876.68,parts,obrigs,["a"]).porInstituicao[0];
    expect(parcial.valorEmpenhado).toBe(1762.40);
    expect(parcial.saldoAEmpenhar).toBe(8114.28);
    const completo=resumoEmpenhoPiso(9876.68,parts,obrigs,["a","b"]);
    expect(completo.totalInvestsus).toBe(9876.68);
    expect(completo.porInstituicao[0].totalAplicado).toBe(9876.68);
    expect(completo.porInstituicao[0].saldoAEmpenhar).toBe(0);
  });
});
