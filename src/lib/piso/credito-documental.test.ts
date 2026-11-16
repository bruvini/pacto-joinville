import { describe, expect, it } from "vitest";
import { etapasVisiveisPiso, etapaAtualPiso, etapaLiberadaPiso, numeroVisualEtapaPiso, etapasApresentadasPiso, grupoConcluidoPiso, etapaInternaGrupoPiso, numeroVisualGrupoPiso } from "./etapas";
import { numeroSeiCreditoPiso, pendenciasEtapa, type CtxPiso } from "./regras";

const ctx = (): CtxPiso => ({
  comp: { tipo_parcela: "mensal", etapas_concluidas: { "1": true, "2": true, "3": true },
    valor_homologado: 9876.68, desconto_saldo: 8114.28, valor_transferido: 1762.4,
    credito_fms_valor: 1762.4, credito_fms_data: "2026-11-09",
    credito_fms_referencia: "Informação SEI Nº 31622729/2026 - SES.UFI.AFI",
    credito_fms_link: "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=1" },
  parts: [], obrigs: [], assinaturas: [], matriz: [], encaminhamentos: [], arquivos: [], ocorrencias: [], cnes: [],
  docs: [{ id: "municipal", tipo: "portaria_municipal", participante_id: null, obrigacao_id: null,
    numero_sei: "32000000", link_sei: null, data_documento: "2026-11-16" }],
  afcHabilitada: true, conciliacaoAfc: null,
});
describe("crédito documental do Piso sem conciliação bancária obrigatória", () => {
  it("preserva a validação interna do crédito após portaria, mantendo as chaves", () => {
    expect(etapasVisiveisPiso("mensal").map(e => e.n)).toEqual([1,2,3,4,5,6,7,8,9]);
    expect(etapasVisiveisPiso("mensal",true).map(e => e.n)).toEqual([1,2,3,4,5,6,7,10,8,9]);
    expect(etapasVisiveisPiso("mensal").find(e=>e.n===4)?.titulo).toBe("Confirmação do recurso no FMS");
    expect(numeroVisualEtapaPiso(4,"mensal")).toBe(4);
    expect(numeroVisualEtapaPiso(5,"mensal")).toBe(5);
    expect(numeroVisualEtapaPiso(10,"mensal")).toBe("7A");
    expect(etapaAtualPiso({"1":true,"2":true,"3":true},"mensal")).toBe(4);
    expect(etapaLiberadaPiso(4, {"1":true,"2":true,"3":true})).toBe(true);
    expect(etapaLiberadaPiso(4, {"1":true,"2":true})).toBe(false);
    expect(etapaLiberadaPiso(5, {})).toBe(true);
  });
  it("preserva preparação especial e chave de crédito na 13ª parcela", () => {
    expect(etapasVisiveisPiso("decimo_terceiro").map(e=>e.n)).toEqual([2,3,4,5,6,7,8,9]);
    expect(numeroVisualEtapaPiso(4,"decimo_terceiro")).toBe(3);
    expect(numeroVisualEtapaPiso(9,"decimo_terceiro")).toBe(8);
  });
  it("agrupa o crédito com a portaria sem alterar migrações ou aprovações existentes", () => {
    expect(etapasApresentadasPiso("mensal").map(e => e.n)).toEqual([1,2,3,5,6,7,8,9]);
    expect(etapasApresentadasPiso("decimo_terceiro", true).map(e => e.n)).toEqual([2,3,5,6,7,10,8,9]);
    expect(numeroVisualGrupoPiso(5,"mensal")).toBe(4);
    expect(numeroVisualGrupoPiso(4,"mensal")).toBe(3);
    expect(grupoConcluidoPiso(3,{"3":true})).toBe(false);
    expect(etapaInternaGrupoPiso(3,{"3":true})).toBe(4);
    expect(grupoConcluidoPiso(3,{"3":true,"4":true})).toBe(true);
    expect(grupoConcluidoPiso(3,{"3":true,"4":true},[4])).toBe(false);
    expect(etapaInternaGrupoPiso(4,{"3":true,"4":true},[3])).toBe(3);
  });
  it("aceita crédito anterior à publicação e desconto federal sem saldo/exceção", () => {
    expect(pendenciasEtapa(4, ctx())).toEqual([]);
    expect(pendenciasEtapa(9, ctx()).some(p => /Encerramento exige conciliação/.test(p))).toBe(false);
  });
  it("exige evidência documental e justificativa de diferença, não extrato", () => {
    const c = ctx();
    c.comp.credito_fms_valor = 1500;
    c.comp.credito_fms_link = null;
    expect(pendenciasEtapa(4,c)).toContain("Crédito difere do valor transferido; registre justificativa documental.");
    expect(pendenciasEtapa(4,c)).toContain("Informe um link SEI válido para a Informação do crédito.");
  });
  it("lê número SEI legado e prioriza campo próprio", () => {
    expect(numeroSeiCreditoPiso(ctx().comp)).toBe("31622729");
    expect(numeroSeiCreditoPiso({...ctx().comp, credito_fms_numero_sei:"12345678"})).toBe("12345678");
  });
});
