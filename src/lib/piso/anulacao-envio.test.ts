import { describe, expect, it } from "vitest";
import {
  assinaturasAnulacaoCompletas, envioAnulacaoConfirmado,
  matrizAnulacaoConfigurada, DESTINO_ANULACAO_PISO,
} from "./anulacao-envio";

const matriz = [
  {tipo_documento:"solicitacao_anulacao",slot_key:"fiscal",opcional:false},
  {tipo_documento:"solicitacao_anulacao",slot_key:"gerente",opcional:false},
  {tipo_documento:"solicitacao_anulacao",slot_key:"diretor",opcional:false},
  {tipo_documento:"solicitacao_anulacao",slot_key:"financeira",opcional:false},
  {tipo_documento:"solicitacao_anulacao",slot_key:"comissao",opcional:true},
] as any[];
const assinaturas = ["fiscal","gerente","diretor","financeira"].map((slot,i) => ({
  documento_id:"sol",slot,assinado_em:`2026-11-23T12:0${i}:00Z`,
}));
const envio = { documento_id:"sol",destino:DESTINO_ANULACAO_PISO,acao:"encaminhado",
  ocorrido_em:"2026-11-23T12:05:00Z" };
const ctx = { matriz, assinaturas, encaminhamentos:[envio] } as any;

describe("Piso: sequência da solicitação de anulação", () => {
  it("exige os quatro slots vigentes e ignora antigos opcionais", () => {
    expect(matrizAnulacaoConfigurada(ctx)).toBe(true);
    expect(assinaturasAnulacaoCompletas(ctx,"sol")).toBe(true);
    expect(assinaturasAnulacaoCompletas(ctx,"outro")).toBe(false);
    expect(matrizAnulacaoConfigurada({...ctx,matriz:matriz.filter(x=>x.slot_key!=="diretor")})).toBe(false);
    expect(matrizAnulacaoConfigurada({...ctx,matriz:matriz.map(x=>x.slot_key==="fiscal"?{...x,opcional:true}:x)})).toBe(false);
  });
  it("não confirma antes de coletar a última assinatura", () => {
    const incompleto = {...ctx,assinaturas:assinaturas.slice(0,3)};
    expect(envioAnulacaoConfirmado(incompleto,"sol")).toBe(false);
  });
  it("só confirma o último envio se for à unidade correta e posterior às assinaturas", () => {
    expect(envioAnulacaoConfirmado(ctx,"sol")).toBe(true);
    expect(envioAnulacaoConfirmado({...ctx,encaminhamentos:[{...envio,destino:"SEFAZ"}]},"sol")).toBe(false);
    expect(envioAnulacaoConfirmado({...ctx,encaminhamentos:[{...envio,ocorrido_em:"2026-11-23T12:01:00Z"}]},"sol")).toBe(false);
  });
  it("reversão posterior e assinatura substituída exigem nova confirmação", () => {
    expect(envioAnulacaoConfirmado({...ctx,encaminhamentos:[envio,{...envio,acao:"revertido",ocorrido_em:"2026-11-23T12:06:00Z"}]},"sol")).toBe(false);
    const novaAssinatura = [...assinaturas.slice(0,3),{...assinaturas[3],assinado_em:"2026-11-23T12:07:00Z"}];
    expect(envioAnulacaoConfirmado({...ctx,assinaturas:novaAssinatura},"sol")).toBe(false);
  });
  it("evento de outro documento não confirma a solicitação", () => {
    expect(envioAnulacaoConfirmado({...ctx,encaminhamentos:[{...envio,documento_id:"aviso"}]},"sol")).toBe(false);
  });
});
