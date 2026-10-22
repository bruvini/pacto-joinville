import { describe, expect, it } from "vitest";
import { conclusaoAutomaticaPermitidaPiso, assinaturaTentativaConclusaoPiso } from "./conclusaoAutomatica";

describe("conclusão automática do Piso", () => {
  it("não conclui Etapa 1 da 13ª somente porque os CNES já estão cadastrados", () => {
    expect(conclusaoAutomaticaPermitidaPiso(1, "decimo_terceiro")).toBe(false);
  });
  it("mantém o comportamento da competência mensal", () => {
    expect(conclusaoAutomaticaPermitidaPiso(1, "mensal")).toBe(true);
    expect(conclusaoAutomaticaPermitidaPiso(2, "mensal")).toBe(true);
  });
  it("permite prosseguir automaticamente depois da confirmação inicial da 13ª", () => {
    expect(conclusaoAutomaticaPermitidaPiso(2, "decimo_terceiro")).toBe(false);
    expect(conclusaoAutomaticaPermitidaPiso(3, "decimo_terceiro")).toBe(true);
    expect(conclusaoAutomaticaPermitidaPiso(null, "decimo_terceiro")).toBe(false);
  });
});

describe("prevenção de loop nas conclusões automáticas", () => {
  const ctx = {
    comp: { updated_at: "2026-10-22T10:00:00Z", etapas_concluidas: {"1":true},
      etapas_reconferir:[],valor_homologado:null,valor_apurado_investsus:9876.68 },
    parts: [{id:"p",updated_at:"1",valor_devido:9524.68}],
    obrigs: [{id:"o",updated_at:"2",valor_empenhado:15000,valor_a_liquidar:null}],
    docs: [{id:"d",updated_at:"3",numero_sei:"123",data_documento:"2026-10-22",
      link_sei:"https://sei.joinville.sc.gov.br/"}],
    assinaturas: [{id:"a",documento_id:"d",slot:"fiscal"}],
    encaminhamentos:[],notificacoesEmail:[],
  } as any;
  it("não varia por refetch do React Query nem updated_at da competência", () => {
    const a=assinaturaTentativaConclusaoPiso(5,ctx);
    const b=assinaturaTentativaConclusaoPiso(5,{
      ...ctx,comp:{...ctx.comp,updated_at:"2026-10-22T11:00:00Z"},
    });
    expect(b).toBe(a);
  });
  it("muda após uma evidência real, permitindo somente uma nova tentativa", () => {
    const a=assinaturaTentativaConclusaoPiso(5,ctx);
    const b=assinaturaTentativaConclusaoPiso(5,{
      ...ctx,docs:[{...ctx.docs[0],numero_sei:"124"}],
    });
    expect(b).not.toBe(a);
  });
});
