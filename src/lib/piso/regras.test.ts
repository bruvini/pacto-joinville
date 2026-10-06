import { describe, it, expect } from "vitest";
import {
  urlDouValida,
  iguaisCentavo,
  soma,
  pendenciasEtapa,
  docCompleto,
  encaminhado,
  transferenciaFederalEsperada,
} from "./regras";
import { auditarPlanilha, auditarPlanilhaCarga, cpfValido } from "./planilha";

const base = {
  comp: { etapas_concluidas: {} },
  parts: [],
  obrigs: [],
  docs: [],
  assinaturas: [],
  matriz: [],
  encaminhamentos: [],
  cnes: [],
} as any;

describe("regras piso", () => {
  it("valida URL do DOU", () => {
    expect(urlDouValida("https://www.in.gov.br/web/dou/-/portaria-1")).toBe(true);
    expect(urlDouValida("http://www.in.gov.br/web/dou/x")).toBe(false);
    expect(urlDouValida("https://in.gov.br.evil.com/web/dou/x")).toBe(false);
    expect(urlDouValida("https://www.in.gov.br/outra")).toBe(false);
  });
  it("concilia centavo a centavo", () => {
    expect(iguaisCentavo(0.1 + 0.2, 0.3)).toBe(true);
    expect(iguaisCentavo(10, 10.01)).toBe(false);
    expect(soma([0.1, 0.2, null])).toBe(0.3);
  });
  it("calcula a transferência federal sem permitir saldo negativo antes do acerto", () => {
    expect(transferenciaFederalEsperada(100000, 120000, 35000)).toBe(35000);
    expect(transferenciaFederalEsperada(100000, 20000, 5000)).toBe(85000);
  });
  it("etapa 2 bloqueia críticas da conciliação sem continuidade excepcional", () => {
    const comp = {
      portaria_gm_numero: "1",
      portaria_gm_data_publicacao: "2026-01-01",
      portaria_gm_url_dou: "https://www.in.gov.br/web/dou/x",
      valor_homologado: 100,
      valor_apurado_investsus: 100,
      valor_transferido: 100,
      investsus_auditoria: { conciliacao: { criticas: 1 } },
    };
    const arquivos = [{ categoria: "investsus" }, { categoria: "portaria_gm" }];
    expect(pendenciasEtapa(2, { ...base, comp, arquivos })).toContain(
      "A conciliação possui críticas bloqueantes; corrija ou registre continuidade excepcional.",
    );
    expect(
      pendenciasEtapa(2, {
        ...base,
        arquivos,
        comp: { ...comp, conciliacao_excecao_por: "u", justificativa_conciliacao: "Conferido" },
      }),
    ).toEqual([]);
  });
  it("etapa 2 também bloqueia erros da auditoria interna do InvestSUS", () => {
    const comp = {
      portaria_gm_numero: "1",
      portaria_gm_data_publicacao: "2026-01-01",
      portaria_gm_url_dou: "https://www.in.gov.br/web/dou/x",
      valor_homologado: 100,
      valor_apurado_investsus: 100,
      valor_transferido: 100,
      investsus_auditoria: { interna: { erros: 1 }, conciliacao: { criticas: 0 } },
    };
    const arquivos = [{ categoria: "investsus" }, { categoria: "portaria_gm" }];
    expect(pendenciasEtapa(2, { ...base, comp, arquivos })).toContain(
      "A planilha do InvestSUS possui erros internos que precisam ser conferidos na origem.",
    );
    expect(
      pendenciasEtapa(2, {
        ...base,
        comp: {
          ...comp,
          conciliacao_excecao_por: "u",
          justificativa_conciliacao: "Justificativa da conciliação",
        },
        arquivos,
      }),
    ).toContain("A planilha do InvestSUS possui erros internos que precisam ser conferidos na origem.");
  });

  it("documento completo exige assinaturas obrigatórias", () => {
    const doc = {
      id: "d",
      tipo: "minuta",
      participante_id: null,
      obrigacao_id: null,
      numero_sei: "1",
      link_sei: null,
    };
    const matriz = [{ tipo_documento: "minuta", slot_key: "g", opcional: false }];
    expect(docCompleto({ matriz, assinaturas: [] }, doc)).toBe(false);
    expect(docCompleto({ matriz, assinaturas: [{ documento_id: "d", slot: "g" }] }, doc)).toBe(
      true,
    );
  });
  it("encaminhamento considera a última ação", () => {
    const e = [
      { documento_id: "d", acao: "encaminhado", ocorrido_em: "1" },
      { documento_id: "d", acao: "revertido", ocorrido_em: "2" },
    ];
    expect(encaminhado(e, "d")).toBe(false);
  });
  it("etapa 4 valida exclusivamente o crédito recebido no FMS", () => {
    const comp = {
      credito_fms_data: "2026-01-01",
      credito_fms_valor: 90,
      credito_fms_referencia: "Informação SEI Nº 31158661/2026 - SES.UFI.AFI",
      credito_fms_link: "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=1",
      valor_transferido: 100,
    };
    expect(pendenciasEtapa(4, { ...base, comp })).toContain(
      "Crédito difere do valor transferido; registre justificativa documental.",
    );
    expect(
      pendenciasEtapa(4, {
        ...base,
        comp: { ...comp, justificativa_credito: "Desconto bancário" },
      }),
    ).toEqual([]);
  });
});

describe("planilha de carga", () => {
  it("valida CPF", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("998224725")).toBe(false);
  });
  it("audita linhas", () => {
    const r = auditarPlanilha([
      {
        CPF: "52998224725",
        CNES: "1234567",
        CBO: "223505",
        Jornada: 30,
        "Salário Base": 5000,
      },
      {
        CPF: "52998224725",
        CNES: "1234567",
        CBO: "",
        Jornada: 0,
        "Salário Base": 0,
      },
      {
        CPF: "11144477735",
        CNES: "",
        CBO: "322205",
        Jornada: 40,
        "Salário Base": 3000,
      },
    ]);
    expect(r.cpfs_duplicados).toBe(1);
    expect(r.sem_cnes).toBe(1);
    expect(r.jornada_invalida).toBe(1);
    expect(r.salario_invalido).toBe(1);
    expect(r.por_categoria.enfermeiro).toBe(1);
  });

  it("marca CNES alheio à instituição e CBO não elegível", () => {
    const r = auditarPlanilhaCarga(
      [
        {
          CPF: "52998224725",
          CNES: "7654321",
          CBO: "131210",
          Jornada: 40,
          "Salário Base": 4000,
        },
      ],
      ["1234567"],
    ).resumo;
    expect(r.cbo_invalido).toBe(1);
    expect(r.cnes_fora_instituicao).toBe(1);
  });

  it("bloqueia a Etapa 1 quando a instituição não possui CNES mestre", () => {
    const comp = {
      etapas_concluidas: {},
      investsus_carga_em: "2026-09-15",
      investsus_confirmacao_em: "2026-09-16",
    };
    const parts = [
      {
        id: "p",
        prestador_id: "prestador-sem-cnes",
        data_envio: "2026-09-03",
        data_retorno: "2026-09-10",
        sem_elegiveis: true,
        prestadores: { nome_instituicao: "Instituição" },
      },
    ];
    expect(pendenciasEtapa(1, { ...base, comp, parts, arquivos: [], cnes: [] })).toContain(
      "Instituição: cadastre ao menos um CNES no prestador",
    );
  });

  it("não bloqueia a etapa 1 por ocorrências da planilha original", () => {
    const comp = {
      etapas_concluidas: {},
      investsus_carga_em: "2026-09-15",
      investsus_confirmacao_em: "2026-09-16",
    };
    const parts = [
      {
        id: "p",
        prestador_id: "prestador",
        data_envio: "2026-09-03",
        data_retorno: "2026-09-10",
        sem_elegiveis: false,
        auditoria_resumo: { erros: 2, ocorrencias: 2 },
        prestadores: { nome_instituicao: "Instituição" },
      },
    ];
    const arquivos = [{ participante_id: "p", categoria: "planilha_carga" }];
    const cnes = [{ prestador_id: "prestador", cnes: "1234567" }];
    expect(pendenciasEtapa(1, { ...base, comp, parts, arquivos, cnes })).toEqual([]);
  });
});
