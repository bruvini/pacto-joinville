import {
  mediaSlaEtapas,
  type SlaModulo,
  type SlaSignatario,
} from "./modulos";

/**
 * Exportação gerencial da mesma amostra temporal usada nos cards do dashboard.
 * Não infere atraso, culpa, setor de lotação nem tempo exclusivo do signatário.
 */
export type ContextoExportacaoSla = {
  prestador: string;
  modulo?: string;
  convenio: string;
  termo: string;
  meses: string;
  ano: string;
};
export type DadosExportacaoSla = {
  modulos: SlaModulo[];
  assinaturasConsolidadas: SlaSignatario[];
  leadTime: { media: number | null; n: number; real?: boolean;
    porModulo?: Array<{id:string;nome:string;media:number|null;n:number}> };
  incluirLeadTime?: boolean;
  contexto: ContextoExportacaoSla;
  geradoEm?: string;
};

export const COLUNAS_CSV_SLA = [
  "tipo_registro", "modulo", "etapa", "signatario", "cargos_informados",
  "quantidade_amostras", "tempo_medio_dias", "tempo_medio_horas",
  "tempo_medio_minutos", "situacao", "base_temporal",
  "observacao_metodologica", "filtro_prestador", "filtro_modulo", "filtro_convenio",
  "filtro_termo", "filtro_meses", "filtro_ano", "exportado_em",
] as const;

type RegistroCsv = Record<(typeof COLUNAS_CSV_SLA)[number], string | number>;

const FONTE_ETAPAS: Record<SlaModulo["id"], string> = {
  convenios: "Marcos de tempo dos lançamentos",
  piso: "Transições de conclusão registradas no histórico do Piso",
  cacon: "Eventos de recebimento, auditoria e encaminhamento do CACON",
  pvh: "Transições de conclusão auditadas no histórico do PVH",
};

function numero(valor: number | null) {
  return valor != null && Number.isFinite(valor)
    ? valor.toFixed(6).replace(".", ",")
    : "";
}

function linha(
  tipo: string, modulo: string, etapa: string, signatario: string,
  n: number, mediaDias: number | null,
  situacao: string, fonte: string, nota: string,
  contexto: ContextoExportacaoSla, geradoEm: string,
  cargos = "",
): RegistroCsv {
  return {
    tipo_registro: tipo,
    modulo,
    etapa,
    signatario,
    cargos_informados: cargos,
    quantidade_amostras: n,
    tempo_medio_dias: numero(mediaDias),
    tempo_medio_horas: numero(mediaDias == null ? null : mediaDias * 24),
    tempo_medio_minutos: numero(mediaDias == null ? null : mediaDias * 1440),
    situacao,
    base_temporal: fonte,
    observacao_metodologica: nota,
    filtro_prestador: contexto.prestador || "Todos",
    filtro_modulo: contexto.modulo || "Todos",
    filtro_convenio: contexto.convenio === "all" ? "Todos" : contexto.convenio,
    filtro_termo: contexto.termo === "all" ? "Todos" : contexto.termo,
    filtro_meses: contexto.meses || "Todos",
    filtro_ano: contexto.ano === "all" ? "Todos" : contexto.ano,
    exportado_em: geradoEm,
  };
}

export function linhasRelatorioSla(entrada: DadosExportacaoSla): RegistroCsv[] {
  const { modulos, assinaturasConsolidadas, leadTime, contexto } = entrada;
  const assinaturasPorModulo = assinaturasConsolidadas.flatMap(item =>
    (item.porModulo ?? []).map(parte => ({
      modulo: parte.modulo, signatario: item.signatario,
      media: parte.media, n: parte.n, cargos: (parte.cargos ?? []).join(" · "),
    })),
  );
  const geradoEm = entrada.geradoEm ?? new Date().toISOString();
  const linhas: RegistroCsv[] = [];

  if (entrada.incluirLeadTime !== false) linhas.push(linha(
    "LEAD_TIME_GERAL", contexto.modulo && contexto.modulo !== "Todos" ? contexto.modulo : "Todos os módulos", "", "",
    leadTime.n, leadTime.media,
    leadTime.n ? (leadTime.real ? "Medido" : "Estimado (proxy)") : "Sem amostras",
    "Criação até conclusão/encerramento registrado, por processo",
    "Média ponderada pela quantidade de processos concluídos válidos de cada módulo, não pela quantidade de etapas. Não inclui processos em andamento.",
    contexto, geradoEm,
  ));

  if (entrada.incluirLeadTime !== false) {
    for (const item of leadTime.porModulo ?? []) {
      linhas.push(linha(
        "LEAD_TIME_MODULO", item.nome, "", "",
        item.n, item.media, item.n ? "Medido" : "Sem amostras",
        item.id === "convenios" ? "Marcos de criação e conclusão" :
          item.id === "cacon" ? "Criação e encaminhamento conclusivo à UFI" :
          "Criação e encerramento registrado",
        "Um processo concluído corresponde a uma amostra; competências em andamento e datas inválidas são excluídas.",
        contexto, geradoEm,
      ));
    }
  }

  for (const modulo of modulos) {
    const n = modulo.etapas.reduce((s, etapa) => s + etapa.n, 0);
    linhas.push(linha(
      "RESUMO_MODULO", modulo.nome, "", "",
      n, mediaSlaEtapas(modulo.etapas),
      n ? "Medido" : "Sem amostras",
      FONTE_ETAPAS[modulo.id],
      "Média ponderada pelas amostras de cada etapa; não representa tempo total do processo.",
      contexto, geradoEm,
    ));
    for (const etapa of modulo.etapas) {
      linhas.push(linha(
        "ETAPA", modulo.nome, etapa.etapa, "",
        etapa.n, etapa.media, etapa.n ? "Medido" : "Sem amostras",
        FONTE_ETAPAS[modulo.id],
        "Intervalo observado entre marcos de liberação e conclusão; atividades paralelas não são somadas.",
        contexto, geradoEm,
      ));
    }
  }

  for (const item of [...assinaturasPorModulo].sort(
    (a, b) => a.modulo.localeCompare(b.modulo, "pt-BR") ||
      a.signatario.localeCompare(b.signatario, "pt-BR"),
  )) {
    linhas.push(linha(
      "ASSINATURA_MODULO", item.modulo, "", item.signatario,
      item.n, item.media, item.n ? "Medido" : "Sem amostras",
      "Intervalo entre o marco inicial/documento/assinatura anterior e a assinatura registrada",
      "Não atribui responsabilidade exclusiva ao signatário/setor. Assinaturas lançadas em lote usam horário do cadastro, que pode ser posterior à assinatura no SEI; não é prazo normativo.",
      contexto, geradoEm, item.cargos,
    ));
  }

  for (const item of [...assinaturasConsolidadas].sort(
    (a, b) => a.signatario.localeCompare(b.signatario, "pt-BR"),
  )) {
    linhas.push(linha(
      "ASSINATURA_GERAL", item.modulo, "", item.signatario,
      item.n, item.media, item.n ? "Medido" : "Sem amostras",
      "Assinaturas dos módulos do recorte, agrupadas por nome do signatário",
      "Média ponderada por registro. Assinaturas lançadas em lote usam horário do cadastro; conferir evidências SEI antes de inferir atraso individual ou de setor.",
      contexto, geradoEm,
    ));
  }
  return linhas;
}

/** CSV para Excel pt-BR: ;, BOM UTF-8, CRLF e proteção contra fórmulas. */
function escaparCelula(valor: unknown): string {
  const t = String(valor ?? "");
  // Não permitir que dados de texto (nomes, filtros, etc.) executem fórmulas no Excel.
  const seguro = /^[\s\u0000-\u001f]*[=+@\-]/.test(t) ? "'" + t : t;
  return '"' + seguro.replace(/"/g, '""') + '"';
}

export function gerarCsvSla(entrada: DadosExportacaoSla): string {
  const linhas = linhasRelatorioSla(entrada);
  const cabecalho = COLUNAS_CSV_SLA.map(escaparCelula).join(";");
  const conteudo = linhas.map(registro =>
    COLUNAS_CSV_SLA.map(chave => escaparCelula(registro[chave])).join(";"),
  );
  return "\uFEFF" + [cabecalho, ...conteudo].join("\r\n") + "\r\n";
}
