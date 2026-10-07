export type DadosCaconEditaveis = {
  total_unidades: number | null;
  valor_medio_unitario: number | null;
  valor_medio_dia: number | null;
  valor_fornecido: number | null;
  pacientes_oral: number | null;
  dias_oral: number | null;
  pacientes_enteral: number | null;
  dias_enteral: number | null;
};

export type OcorrenciaCacon = {
  severidade: "critica" | "alerta" | "info";
  regra: string;
  descricao: string;
};

const quaseIgual = (a: number, b: number, tolerancia = 0.03) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerancia;

export function auditarDadosCacon(dados: DadosCaconEditaveis) {
  const ocorrencias: OcorrenciaCacon[] = [];
  const add = (
    severidade: OcorrenciaCacon["severidade"],
    regra: string,
    descricao: string,
  ) => ocorrencias.push({ severidade, regra, descricao });

  const unidades = Number(dados.total_unidades ?? 0);
  const fornecido = Number(dados.valor_fornecido ?? 0);
  const mediaUnitariaInformada = Number(dados.valor_medio_unitario ?? 0);
  const mediaDiaInformada = Number(dados.valor_medio_dia ?? 0);

  if (!(unidades > 0))
    add("critica", "total_unidades", "O total de frascos/latas deve ser maior que zero.");
  if (!(fornecido > 0))
    add("critica", "valor_fornecido", "O valor fornecido deve ser maior que zero.");
  if (!(mediaUnitariaInformada > 0))
    add("critica", "valor_medio_unitario", "O valor médio unitário deve ser maior que zero.");
  if (!(mediaDiaInformada > 0))
    add("critica", "valor_medio_dia", "O valor médio por dia deve ser maior que zero.");

  if (unidades > 0 && fornecido > 0 && mediaUnitariaInformada > 0) {
    const calculada = fornecido / unidades;
    if (!quaseIgual(calculada, mediaUnitariaInformada, 0.03))
      add(
        "alerta",
        "media_unitaria",
        `Valor médio unitário informado (R$ ${mediaUnitariaInformada.toFixed(2)}) não fecha exatamente com valor fornecido ÷ unidades (R$ ${calculada.toFixed(2)}).`,
      );
  }

  const dias =
    Number(dados.dias_oral ?? 0) + Number(dados.dias_enteral ?? 0);
  if (dias > 0 && fornecido > 0 && mediaDiaInformada > 0) {
    const calculada = fornecido / dias;
    if (!quaseIgual(calculada, mediaDiaInformada, 0.03))
      add(
        "alerta",
        "media_dia",
        `Valor médio por dia informado (R$ ${mediaDiaInformada.toFixed(2)}) não fecha exatamente com valor fornecido ÷ dias de suplementação (R$ ${calculada.toFixed(2)}).`,
      );
  } else {
    add(
      "alerta",
      "dias_nao_informados",
      "Os dias de suplementação não foram informados; não foi possível validar o valor médio por dia.",
    );
  }

  const pacientes =
    Number(dados.pacientes_oral ?? 0) + Number(dados.pacientes_enteral ?? 0);
  if (pacientes <= 0)
    add(
      "alerta",
      "pacientes_nao_informados",
      "Os quantitativos de pacientes não foram informados ou resultaram em zero.",
    );

  add(
    "info",
    "origem_manual",
    "Os dados estruturados foram conferidos/preenchidos manualmente pelo usuário responsável.",
  );

  return {
    criticas: ocorrencias.filter((item) => item.severidade === "critica").length,
    alertas: ocorrencias.filter((item) => item.severidade === "alerta").length,
    informacoes: ocorrencias.filter((item) => item.severidade === "info").length,
    ocorrencias,
  };
}
