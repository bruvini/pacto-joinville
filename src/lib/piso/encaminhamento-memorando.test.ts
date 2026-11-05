import { describe, expect, it } from "vitest";
import {
  assinaturasObrigatoriasMemorandoColetadas,
  destinoEncaminhamentoMemorando,
  memorandoEncaminhadoParaDestinatarios,
  unidadesDestinatariasMemorando,
} from "./encaminhamento-memorando";
import { pendenciasEtapa, type CtxPiso } from "./regras";

const base = (): CtxPiso => ({
  comp: {
    etapas_concluidas: { "2": true },
    municipal_config: {
      destinatarios: [
        { unidade: "SES.UAP", nome: "Sra Ana Paula Barauna", cargo: "Gerente" },
        { unidade: "SES.UAP.APA", nome: "Sra Renata Oliveira Mira", cargo: "Coordenadora" },
      ],
    },
  },
  parts: [], obrigs: [], arquivos: [], ocorrencias: [], cnes: [],
  docs: [{
    id: "memo-1", tipo: "memorando", participante_id: null, obrigacao_id: null,
    numero_sei: "31492522", link_sei: "https://portalsei.joinville.sc.gov.br/sei/",
    data_documento: "2026-11-04",
  }],
  matriz: [
    { tipo_documento: "memorando", slot_key: "fiscal", opcional: false },
    { tipo_documento: "memorando", slot_key: "gerente", opcional: false },
    { tipo_documento: "memorando", slot_key: "extra", opcional: true },
  ],
  assinaturas: [
    { documento_id: "memo-1", slot: "fiscal", assinado_em: "2026-11-04T15:00:00Z" },
    { documento_id: "memo-1", slot: "gerente", assinado_em: "2026-11-04T16:00:00Z" },
  ],
  encaminhamentos: [],
});

const registro = {
  documento_id: "memo-1",
  acao: "encaminhado",
  destino: "SES.UAP; SES.UAP.APA",
  ocorrido_em: "2026-11-04T17:00:00Z",
};

describe("confirmação de encaminhamento do memorando", () => {
  it("usa somente os setores SEI, removendo repetições e preservando o rótulo", () => {
    const unidades = unidadesDestinatariasMemorando([
      { unidade: " SES.UAP " }, { unidade: "SES.UAP.APA" },
      { unidade: "ses.uap" }, { unidade: "" },
    ]);
    expect(unidades).toEqual(["SES.UAP", "SES.UAP.APA"]);
    expect(destinoEncaminhamentoMemorando(unidades)).toBe("SES.UAP; SES.UAP.APA");
    expect(destinoEncaminhamentoMemorando(unidades.reverse())).toBe("SES.UAP; SES.UAP.APA");
  });

  it("só habilita confirmação após todas as assinaturas obrigatórias", () => {
    const ctx = base();
    expect(assinaturasObrigatoriasMemorandoColetadas(ctx)).toBe(true);
    expect(memorandoEncaminhadoParaDestinatarios(ctx)).toBe(false);
    ctx.assinaturas = ctx.assinaturas.slice(0, 1);
    expect(assinaturasObrigatoriasMemorandoColetadas(ctx)).toBe(false);
    expect(memorandoEncaminhadoParaDestinatarios(ctx)).toBe(false);
  });

  it("reconhece confirmação auditável e invalida se os destinatários mudarem", () => {
    const ctx = base();
    ctx.encaminhamentos = [registro];
    expect(memorandoEncaminhadoParaDestinatarios(ctx)).toBe(true);
    ctx.comp.municipal_config.destinatarios[1].unidade = "SES.UFI";
    expect(memorandoEncaminhadoParaDestinatarios(ctx)).toBe(false);
  });

  it("exige novo encaminhamento após troca de signatário ou reversão", () => {
    const ctx = base();
    ctx.encaminhamentos = [registro];
    ctx.assinaturas[1].assinado_em = "2026-11-04T18:00:00Z";
    expect(memorandoEncaminhadoParaDestinatarios(ctx)).toBe(false);
    ctx.assinaturas[1].assinado_em = "2026-11-04T16:00:00Z";
    ctx.encaminhamentos.push({
      ...registro, acao: "revertido", ocorrido_em: "2026-11-04T19:00:00Z",
    });
    expect(memorandoEncaminhadoParaDestinatarios(ctx)).toBe(false);
  });

  it("bloqueia concluir a etapa 3 até confirmar, mas preserva etapas historicamente encerradas", () => {
    const ctx = base();
    expect(pendenciasEtapa(3, ctx)).toContain(
      "Confirme o encaminhamento do Memorando no SEI para: SES.UAP, SES.UAP.APA.",
    );
    ctx.encaminhamentos = [registro];
    expect(pendenciasEtapa(3, ctx)).not.toContain(
      "Confirme o encaminhamento do Memorando no SEI para: SES.UAP, SES.UAP.APA.",
    );
    ctx.encaminhamentos = [];
    ctx.comp.etapas_concluidas["3"] = true;
    expect(pendenciasEtapa(3, ctx)).not.toContain(
      "Confirme o encaminhamento do Memorando no SEI para: SES.UAP, SES.UAP.APA.",
    );
    ctx.comp.etapas_reconferir = [3];
    expect(pendenciasEtapa(3, ctx)).toContain(
      "Confirme o encaminhamento do Memorando no SEI para: SES.UAP, SES.UAP.APA.",
    );
  });
});
