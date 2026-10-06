import { describe, it, expect } from "vitest";
import {
  pagamentoLiberado,
  prazoLimitePrestacao,
  situacaoPrestacao,
  etapaPrestacao,
  statusMacroPrestacao,
} from "./prestacao";

const CONV_30 = { prazo_prestacao_contas_dias: 30 };

describe("pagamentoLiberado", () => {
  it("libera quando o processo está concluído", () => {
    expect(pagamentoLiberado({ concluido: true })).toBe(true);
  });
  it("libera quando há link válido do comprovante de pagamento", () => {
    expect(
      pagamentoLiberado({
        concluido: false,
        link_comprovante_pagamento_sei: "https://sei.joinville.sc.gov.br/doc/123",
      }),
    ).toBe(true);
  });
  it("não libera sem comprovante nem conclusão", () => {
    expect(pagamentoLiberado({ concluido: false, link_comprovante_pagamento_sei: null })).toBe(
      false,
    );
  });
});

describe("prazoLimitePrestacao", () => {
  it("conta a partir da DATA DO PAGAMENTO quando informada", () => {
    const prazo = prazoLimitePrestacao(
      { data_pagamento: "2026-07-10", competencia: "06/2026" },
      CONV_30,
    );
    expect(prazo).toEqual(new Date(2026, 7 - 1, 10 + 30)); // 09/08/2026
  });
  it("usa o fim do mês da competência como fallback sem data de pagamento", () => {
    const prazo = prazoLimitePrestacao({ data_pagamento: null, competencia: "06/2026" }, CONV_30);
    expect(prazo).toEqual(new Date(2026, 6, 30)); // 30/06 + 30 dias = 30/07/2026
  });
  it("adota 30 dias quando o convênio exige prestação e não tem prazo cadastrado", () => {
    expect(
      prazoLimitePrestacao(
        { data_pagamento: "2026-07-10", competencia: "06/2026" },
        { prazo_prestacao_contas_dias: null },
      ),
    ).toEqual(new Date(2026, 7 - 1, 10 + 30));
    expect(
      prazoLimitePrestacao(
        { data_pagamento: "2026-07-10", competencia: "06/2026" },
        { prazo_prestacao_contas_dias: 0, exige_prestacao_contas: false },
      ),
    ).toBeNull();
  });
  it("retorna null sem data de pagamento e sem competência válida", () => {
    expect(prazoLimitePrestacao({ data_pagamento: null, competencia: null }, CONV_30)).toBeNull();
  });
  it("usa a primeira competência quando há várias (multi-mês)", () => {
    const prazo = prazoLimitePrestacao(
      { data_pagamento: null, competencia: "05/2026, 06/2026" },
      CONV_30,
    );
    expect(prazo).toEqual(new Date(2026, 4, 31 + 30)); // fim de maio + 30
  });
});

describe("situacaoPrestacao", () => {
  const lancPago = { data_pagamento: "2026-07-01", competencia: "06/2026" };
  const hoje = (iso: string) => new Date(`${iso}T12:00:00`);

  it("aprovada tem prioridade sobre o prazo", () => {
    const s = situacaoPrestacao(lancPago, CONV_30, { status: "aprovada" }, hoje("2026-12-01"));
    expect(s.nivel).toBe("ok");
    expect(s.label).toBe("Aprovada");
  });
  it("reprovada é grave independente do prazo", () => {
    const s = situacaoPrestacao(lancPago, CONV_30, { status: "reprovada" }, hoje("2026-07-02"));
    expect(s.nivel).toBe("grave");
  });
  it("recebida fica em análise (info)", () => {
    const s = situacaoPrestacao(lancPago, CONV_30, { status: "recebida" }, hoje("2026-07-02"));
    expect(s.nivel).toBe("info");
  });
  it("aguardando dentro do prazo (mais de 7 dias) é informativo", () => {
    // prazo = 01/07 + 30 = 31/07; em 10/07 faltam 21 dias
    const s = situacaoPrestacao(lancPago, CONV_30, null, hoje("2026-07-10"));
    expect(s.nivel).toBe("info");
    expect(s.dias).toBe(21);
  });
  it("aguardando com 7 dias ou menos vira alerta", () => {
    const s = situacaoPrestacao(lancPago, CONV_30, null, hoje("2026-07-25")); // faltam 6
    expect(s.nivel).toBe("alerta");
    expect(s.dias).toBe(6);
  });
  it("no dia do vencimento ainda é alerta (0 dias), depois vira grave", () => {
    const noDia = situacaoPrestacao(lancPago, CONV_30, null, hoje("2026-07-31"));
    expect(noDia.dias).toBe(0);
    expect(noDia.nivel).toBe("alerta");
    const vencida = situacaoPrestacao(lancPago, CONV_30, null, hoje("2026-08-05"));
    expect(vencida.nivel).toBe("grave");
    expect(vencida.dias).toBe(-5);
  });
  it("sem exigência de prestação é neutro", () => {
    const s = situacaoPrestacao(
      lancPago,
      { prazo_prestacao_contas_dias: 0, exige_prestacao_contas: false },
      null,
      hoje("2026-07-10"),
    );
    expect(s.nivel).toBe("neutro");
    expect(s.prazo).toBeNull();
  });
});

describe("etapaPrestacao (esteira derivada)", () => {
  it("sem registro fica em recebimento", () => {
    expect(etapaPrestacao(null).slug).toBe("recebimento");
  });
  it("recebida (data ou status) avança para análise", () => {
    expect(etapaPrestacao({ status: "recebida" }).slug).toBe("analise");
    expect(etapaPrestacao({ data_recebimento: "2026-07-05" }).slug).toBe("analise");
  });
  it("ofício/envio à entidade coloca em diligências", () => {
    expect(
      etapaPrestacao({ data_recebimento: "2026-07-05", data_envio_entidade: "2026-07-10" }).slug,
    ).toBe("diligencia");
  });
  it("parecer SES avança a esteira", () => {
    expect(
      etapaPrestacao({ data_envio_entidade: "2026-07-10", link_parecer_ses_sei: "https://sei/1" })
        .slug,
    ).toBe("parecer_ses");
  });
  it("encaminhamento à CGM avança a esteira", () => {
    expect(
      etapaPrestacao({ data_parecer_ses: "2026-07-20", data_enc_cgm: "2026-07-22" }).slug,
    ).toBe("cgm");
  });
  it("baixa contábil precede o encerramento", () => {
    expect(
      etapaPrestacao({ data_enc_cgm: "2026-07-22", data_baixa_contabil: "2026-08-01" }).slug,
    ).toBe("baixa_contabil");
  });
  it("decisão final (aprovada/reprovada) encerra a esteira", () => {
    expect(etapaPrestacao({ data_baixa_contabil: "2026-08-01", status: "aprovada" }).slug).toBe(
      "encerrada",
    );
    expect(etapaPrestacao({ status: "reprovada" }).slug).toBe("encerrada");
  });
});

describe("statusMacroPrestacao (rótulos da planilha)", () => {
  it("diferencia aguarda retorno da Entidade x reanálise", () => {
    expect(statusMacroPrestacao({ data_envio_entidade: "2026-07-10" })).toBe(
      "Aguarda retorno — Entidade",
    );
    expect(
      statusMacroPrestacao({
        data_envio_entidade: "2026-07-10",
        data_retorno_entidade: "2026-07-25",
      }),
    ).toBe("Reanálise");
  });
  it("diferencia aguarda retorno da CGM x manifestação", () => {
    expect(statusMacroPrestacao({ data_enc_cgm: "2026-07-22" })).toBe("Aguarda retorno — CGM");
    expect(
      statusMacroPrestacao({ data_enc_cgm: "2026-07-22", data_retorno_cgm: "2026-08-05" }),
    ).toBe("Manifestação CGM");
  });
});
