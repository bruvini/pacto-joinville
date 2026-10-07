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
import {
  auditarPlanilha,
  auditarPlanilhaCarga,
  cpfValido,
  lerPlanilhaComCabecalho,
  numeroPlanilha,
} from "./planilha";

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
      investsus_auditoria: { versao_regras: 5, conciliacao: { criticas: 1 } },
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
      investsus_auditoria: { versao_regras: 5, interna: { erros: 1 }, conciliacao: { criticas: 0 } },
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

  it("não usa contagens antigas como se fossem auditoria atual", () => {
    const comp = {
      portaria_gm_numero: "1",
      portaria_gm_data_publicacao: "2026-01-01",
      portaria_gm_url_dou: "https://www.in.gov.br/web/dou/x",
      valor_homologado: 100,
      valor_apurado_investsus: 100,
      valor_transferido: 100,
      investsus_auditoria: {
        interna: { erros: 24 },
        conciliacao: { criticas: 58 },
      },
    };
    const arquivos = [{ categoria: "investsus" }, { categoria: "portaria_gm" }];
    const pendencias = pendenciasEtapa(2, { ...base, comp, arquivos });
    expect(pendencias).toContain("Reprocesse a auditoria do InvestSUS com as regras atuais.");
    expect(pendencias).not.toContain(
      "A planilha do InvestSUS possui erros internos que precisam ser conferidos na origem.",
    );
    expect(pendencias).not.toContain(
      "A conciliação possui críticas bloqueantes; corrija ou registre continuidade excepcional.",
    );
  });

  it("Nota de Empenho só fica completa com número no formato número/ano", () => {
    const ctx = { matriz: [], assinaturas: [] };
    const baseDoc = {
      id: "ne",
      tipo: "nota_empenho",
      participante_id: null,
      obrigacao_id: "o",
      numero_sei: "31130338",
      link_sei: "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=documento_visualizar&id_documento=1",
      data_documento: "2026-10-02",
    };
    expect(docCompleto(ctx, { ...baseDoc, numero: null })).toBe(false);
    expect(docCompleto(ctx, { ...baseDoc, numero: "6715-2026" })).toBe(false);
    expect(docCompleto(ctx, { ...baseDoc, numero: "6715/2026" })).toBe(true);
  });

  it("qualquer documento operacional só fica completo com Nº SEI, link SEI válido e data", () => {
    const ctx = { matriz: [], assinaturas: [] };
    const baseDoc = {
      id: "p",
      tipo: "portaria_municipal",
      participante_id: null,
      obrigacao_id: null,
    };
    expect(
      docCompleto(ctx, {
        ...baseDoc,
        numero_sei: "31150000",
        link_sei: null,
        data_documento: "2026-10-02",
      }),
    ).toBe(false);
    expect(
      docCompleto(ctx, {
        ...baseDoc,
        numero_sei: "31150000",
        link_sei: "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=documento_visualizar&id_documento=1",
        data_documento: null,
      }),
    ).toBe(false);
    expect(
      docCompleto(ctx, {
        ...baseDoc,
        numero_sei: "31150000",
        link_sei: "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=documento_visualizar&id_documento=1",
        data_documento: "2026-10-02",
      }),
    ).toBe(true);
  });

  it("Aviso de Movimento - Subempenho exige Nº SEI, link SEI válido e data", () => {
    const ctx = { matriz: [], assinaturas: [] };
    const baseDoc = {
      id: "avs",
      tipo: "aviso_subempenho",
      participante_id: null,
      obrigacao_id: "o",
      numero: null,
    };
    expect(
      docCompleto(ctx, {
        ...baseDoc,
        numero_sei: "31140000",
        link_sei: null,
        data_documento: "2026-10-02",
      }),
    ).toBe(false);
    expect(
      docCompleto(ctx, {
        ...baseDoc,
        numero_sei: "31140000",
        link_sei: "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=documento_visualizar&id_documento=1",
        data_documento: null,
      }),
    ).toBe(false);
    expect(
      docCompleto(ctx, {
        ...baseDoc,
        numero_sei: "31140000",
        link_sei: "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=documento_visualizar&id_documento=1",
        data_documento: "2026-10-02",
      }),
    ).toBe(true);
  });

  it("documento completo exige assinaturas obrigatórias", () => {
    const doc = {
      id: "d",
      tipo: "minuta",
      participante_id: null,
      obrigacao_id: null,
      numero_sei: "1",
      link_sei: "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=documento_visualizar&id_documento=1",
      data_documento: "2026-10-02",
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

describe("notificação por e-mail do Piso", () => {
  const participante = {
    id: "participante-1",
    prestador_id: "prestador-1",
    sem_elegiveis: false,
    prestadores: { nome_instituicao: "Hospital Teste" },
  };
  const contato = {
    id: "email-1",
    prestador_id: "prestador-1",
    email: "financeiro@hospital.org.br",
  };

  it("bloqueia a etapa sem destinatário e libera após envio + processo SEI", () => {
    expect(
      pendenciasEtapa(8, {
        ...base,
        parts: [participante],
        emailsPrestador: [contato],
        notificacoesEmail: [],
      }),
    ).toContain("Hospital Teste: selecione ao menos um destinatário para a notificação");

    expect(
      pendenciasEtapa(8, {
        ...base,
        parts: [participante],
        emailsPrestador: [contato],
        notificacoesEmail: [
          {
            participante_id: "participante-1",
            destinatarios: ["financeiro@hospital.org.br"],
            assunto: "Piso de Enfermagem - Outubro de 2026",
            corpo: "Mensagem",
            enviado_em: "2026-10-07T12:00:00.000Z",
            processo_sei_numero: "26.0.000001-0",
            processo_sei_link:
              "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=1",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("exige relatório executivo posterior à última notificação antes do encerramento", () => {
    const notificacao = {
      participante_id: "participante-1",
      destinatarios: ["financeiro@hospital.org.br"],
      assunto: "Piso de Enfermagem - Outubro de 2026",
      corpo: "Mensagem",
      enviado_em: "2026-10-07T12:00:00.000Z",
      processo_sei_numero: "26.0.000001-0",
      processo_sei_link:
        "https://sei.joinville.sc.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=1",
      updated_at: "2026-10-07T12:05:00.000Z",
    };
    const concluidas = Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [String(n), true]),
    );
    const ctx = {
      ...base,
      comp: {
        etapas_concluidas: concluidas,
        relatorio_gerado_em: "2026-10-07T12:00:00.000Z",
      },
      parts: [participante],
      emailsPrestador: [contato],
      notificacoesEmail: [notificacao],
    };

    expect(pendenciasEtapa(9, ctx)).toContain(
      "Gere novamente o Relatório Executivo após concluir as notificações por e-mail.",
    );
    expect(
      pendenciasEtapa(9, {
        ...ctx,
        comp: { ...ctx.comp, relatorio_gerado_em: "2026-10-07T12:10:00.000Z" },
      }),
    ).toEqual([]);
  });
});

describe("planilha de carga", () => {
  it("normaliza valores financeiros com separadores em ambos os padrões", () => {
    expect(numeroPlanilha("3.325,00")).toBe(3325);
    expect(numeroPlanilha("3,325.00")).toBe(3325);
    expect(numeroPlanilha("2.908,83")).toBe(2908.83);
    expect(numeroPlanilha("2,908.83")).toBe(2908.83);
    expect(numeroPlanilha(3325)).toBe(3325);
  });

  it("lê o valor bruto numérico do XLSX, sem transformar 3325 em 3,325", async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["CPF PROFISSIONAL", "CNES EMPREGADOR", "CBO", "JORNADA SEMANAL (CARGA HORARIA)", "SALÁRIO BASE (MENSAL)"],
      ["52998224725", "1234567", "322205", 44, 3325],
    ]);
    ws["E2"].z = "#,##0.00";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PisoEnfermagem");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const rows = await lerPlanilhaComCabecalho(bytes);
    expect(rows[0]["SALÁRIO BASE (MENSAL)"]).toBe(3325);
  });

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
