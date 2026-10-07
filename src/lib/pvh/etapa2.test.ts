import { describe, expect, it } from "vitest";
import {
  documentoEtapa2CompletoPvh,
  etapa2ProntaPvh,
  SLOTS_MEMORANDO_PVH,
  SLOTS_MINUTA_PVH,
  TIPO_MEMORANDO_PVH,
  TIPO_MINUTA_PVH,
  TIPO_PORTARIA_MUNICIPAL_PVH,
} from "./etapa2";
import {
  gerarMemorandoPortariaPvh,
  gerarMinutaPortariaPvh,
} from "./portariaMunicipal";

const minuta = {
  id: "minuta",
  tipo_codigo: TIPO_MINUTA_PVH,
  numero_sei: "30999330",
  data_documento: "2026-09-23",
  link_documento: "https://sei.joinville.sc.gov.br/minuta",
  dados: {
    autoridade_nome: "Daniela Aparecida Gregório França Cavalcante",
    autoridade_cargo: "Secretária da Saúde",
    portaria_geral_numero: "195/2026/SES",
    portaria_geral_sei: "30392890",
    unidade_responsavel: "SES.UCP.ACP",
    cnes_por_prestador: {
      bethesda: "2521296",
      hmsj: "2436469",
    },
  },
};

const memorando = {
  id: "memo",
  tipo_codigo: TIPO_MEMORANDO_PVH,
  numero_sei: "30999337",
  data_documento: "2026-09-23",
  link_documento: "https://sei.joinville.sc.gov.br/memorando",
  dados: {
    destinatarios: [
      { unidade: "SES.UAP", nome: "Ana Paula Baraúna", cargo: "Gerente" },
      { unidade: "SES.UAP.APA", nome: "Renata Mira", cargo: "Coordenadora" },
    ],
    memorando_pgm_numero: "0020700582/2024",
    memorando_sap_numero: "0020731294/2024",
    processo_referencia: "23.0.271636-6",
    encaminhado_ses_uap: true,
    encaminhado_ses_uap_apa: true,
  },
};

const portaria = {
  id: "portaria",
  tipo_codigo: TIPO_PORTARIA_MUNICIPAL_PVH,
  numero: "232/2026/SMS",
  data_documento: "2026-09-25",
  link_documento: "https://sei.joinville.sc.gov.br/portaria",
};

const assinaturas = [
  { documento_id: "minuta", slot: "gestao", revogado_em: null },
  {
    documento_id: "minuta",
    slot: "diretor_servicos_complementares",
    revogado_em: null,
  },
  { documento_id: "memo", slot: "fiscal", revogado_em: null },
  { documento_id: "memo", slot: "gestao", revogado_em: null },
];

describe("Etapa 2 do PVH", () => {
  it("usa valores estaduais como fonte e não exige segunda conciliação municipal", () => {
    expect(
      etapa2ProntaPvh({
        participantes: [
          { id: "a", prestador_id: "bethesda", valor_estadual: 1240000, valor_municipal: null },
          { id: "b", prestador_id: "hmsj", valor_estadual: 1775502.09, valor_municipal: null },
        ],
        documentos: [minuta, memorando, portaria],
        assinaturas,
      }),
    ).toBe(true);
  });

  it("exige CNES de todas as instituições no Anexo I", () => {
    const minutaSemHmsj = {
      ...minuta,
      dados: {
        ...minuta.dados,
        cnes_por_prestador: { bethesda: "2521296" },
      },
    };

    expect(
      etapa2ProntaPvh({
        participantes: [
          { id: "a", prestador_id: "bethesda", valor_estadual: 1240000 },
          { id: "b", prestador_id: "hmsj", valor_estadual: 1775502.09 },
        ],
        documentos: [minutaSemHmsj, memorando, portaria],
        assinaturas,
      }),
    ).toBe(false);
  });

  it("Minuta exige Gerente/Coordenador + Diretor e deixa Fiscal opcional", () => {
    const semFiscal = assinaturas.filter(
      (assinatura) => !(assinatura.documento_id === "minuta" && assinatura.slot === "fiscal"),
    );
    expect(documentoEtapa2CompletoPvh(minuta, semFiscal)).toBe(true);

    const semDiretor = semFiscal.filter(
      (assinatura) => assinatura.slot !== "diretor_servicos_complementares",
    );
    expect(documentoEtapa2CompletoPvh(minuta, semDiretor)).toBe(false);
    expect(SLOTS_MINUTA_PVH.find((slot) => slot.key === "fiscal")?.opcional).toBe(true);
  });

  it("Memorando exige Fiscal + Gerente/Coordenador e os dois encaminhamentos", () => {
    expect(documentoEtapa2CompletoPvh(memorando, assinaturas)).toBe(true);

    expect(
      documentoEtapa2CompletoPvh(
        {
          ...memorando,
          dados: { ...memorando.dados, encaminhado_ses_uap_apa: false },
        },
        assinaturas,
      ),
    ).toBe(false);

    expect(SLOTS_MEMORANDO_PVH.map((slot) => slot.key)).toEqual(["fiscal", "gestao"]);
  });
});

describe("Textos-base da Portaria Municipal do PVH", () => {
  it("gera a Minuta com competência, atos e Anexo I", () => {
    const gerado = gerarMinutaPortariaPvh({
      competencia: "09/2026",
      dataDocumento: "2026-09-23",
      autoridadeNome: "Daniela Aparecida Gregório França Cavalcante",
      autoridadeCargo: "Secretária da Saúde",
      normativaNumero: "416/CIB/2026",
      normativaData: "2026-06-17",
      portariaEstadualNumero: "SES Nº 3186",
      portariaEstadualData: "2026-09-21",
      portariaGeralNumero: "195/2026/SES",
      portariaGeralSei: "30392890",
      linhas: [
        { cnes: "2521296", nome: "Hospital Bethesda", valor: 1240000 },
        { cnes: "2436469", nome: "Hospital Municipal São José", valor: 1775502.09 },
      ],
    });

    expect(gerado.texto).toContain("Deliberação nº 416/CIB/2026");
    expect(gerado.texto).toContain("Portaria SES nº 3186");
    expect(gerado.texto).toContain("R$ 3.015.502,09");
    expect(gerado.html).toContain("2436469");
  });

  it("gera o Memorando sem duplicar o ano dos números SEI", () => {
    const gerado = gerarMemorandoPortariaPvh({
      competencia: "09/2026",
      dataDocumento: "2026-09-23",
      numeroMemorandoSei: "30999337/2026",
      numeroMinutaSei: "30999330/2026",
      normativaNumero: "416/CIB/2026",
      normativaData: "2026-06-17",
      portariaEstadualNumero: "3186",
      portariaEstadualData: "2026-09-21",
      portariaGeralNumero: "195/2026/SES",
      portariaGeralSei: "30392890",
      memorandoPgmNumero: "0020700582/2024",
      memorandoSapNumero: "0020731294/2024",
      processoReferencia: "23.0.271636-6",
      destinatarios: [
        { unidade: "SES.UAP", nome: "Ana Paula Baraúna", cargo: "Gerente" },
        { unidade: "SES.UAP.APA", nome: "Renata Mira", cargo: "Coordenadora" },
      ],
    });

    expect(gerado.texto).toContain("30999337/2026");
    expect(gerado.texto).not.toContain("30999337/2026/2026");
    expect(gerado.texto).toContain("À SES.UAP e SES.UAP.APA");
    expect(gerado.texto).toContain("0020700582/2024");
    expect(gerado.texto).toContain("23.0.271636-6");
  });
});
