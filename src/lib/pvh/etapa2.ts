import { linkValido } from "@/lib/sei";

export const TIPO_MINUTA_PVH = "minuta_portaria_municipal";
export const TIPO_MEMORANDO_PVH = "memorando_portaria_municipal";
export const TIPO_PORTARIA_MUNICIPAL_PVH = "portaria_municipal_publicada";

export type ParticipanteEtapa2Pvh = {
  id: string;
  valor_estadual?: number | null;
  valor_municipal?: number | null;
};

export type DocumentoEtapa2Pvh = {
  id: string;
  tipo_codigo: string;
  numero?: string | null;
  numero_sei?: string | null;
  link_documento?: string | null;
  data_documento?: string | null;
  normativa_referenciada_id?: string | null;
  referencia_normativa_texto?: string | null;
};

export type AssinaturaDocumentoPvh = {
  documento_id: string;
  revogado_em?: string | null;
};

const valor = (n: number | string | null | undefined) => {
  const numero = Number(n ?? 0);
  return Number.isFinite(numero) ? numero : 0;
};

export function conciliacaoEtapa2Pvh(participantes: ParticipanteEtapa2Pvh[]) {
  const itens = participantes.map((participante) => {
    const estadual = valor(participante.valor_estadual);
    const municipal = valor(participante.valor_municipal);
    return {
      id: participante.id,
      estadual,
      municipal,
      diferenca: municipal - estadual,
      conciliado: estadual > 0 && municipal > 0 && Math.abs(municipal - estadual) < 0.01,
    };
  });

  const totalEstadual = itens.reduce((soma, item) => soma + item.estadual, 0);
  const totalMunicipal = itens.reduce((soma, item) => soma + item.municipal, 0);

  return {
    itens,
    totalEstadual,
    totalMunicipal,
    diferencaTotal: totalMunicipal - totalEstadual,
    possuiDivergencia: itens.some(
      (item) => item.estadual > 0 && item.municipal > 0 && Math.abs(item.diferenca) >= 0.01,
    ),
  };
}

export function documentoEtapa2CompletoPvh(
  documento: DocumentoEtapa2Pvh | undefined,
  assinaturas: AssinaturaDocumentoPvh[],
) {
  if (!documento) return false;

  if (documento.tipo_codigo === TIPO_MINUTA_PVH || documento.tipo_codigo === TIPO_MEMORANDO_PVH) {
    const assinaturaAtiva = assinaturas.some(
      (assinatura) => assinatura.documento_id === documento.id && !assinatura.revogado_em,
    );
    return Boolean(
      documento.numero_sei?.trim() &&
        linkValido(documento.link_documento) &&
        assinaturaAtiva,
    );
  }

  if (documento.tipo_codigo === TIPO_PORTARIA_MUNICIPAL_PVH) {
    return Boolean(
      documento.numero?.trim() &&
        documento.data_documento &&
        linkValido(documento.link_documento),
    );
  }

  return false;
}

export function etapa2ProntaPvh({
  participantes,
  documentos,
  assinaturas,
  justificativaDivergencia,
}: {
  participantes: ParticipanteEtapa2Pvh[];
  documentos: DocumentoEtapa2Pvh[];
  assinaturas: AssinaturaDocumentoPvh[];
  justificativaDivergencia?: string | null;
}) {
  if (!participantes.length) return false;
  if (
    participantes.some(
      (participante) =>
        valor(participante.valor_estadual) <= 0 || valor(participante.valor_municipal) <= 0,
    )
  ) {
    return false;
  }

  const tiposObrigatorios = [
    TIPO_MINUTA_PVH,
    TIPO_MEMORANDO_PVH,
    TIPO_PORTARIA_MUNICIPAL_PVH,
  ];

  if (
    tiposObrigatorios.some((tipo) => {
      const documento = documentos.find((item) => item.tipo_codigo === tipo);
      return !documentoEtapa2CompletoPvh(documento, assinaturas);
    })
  ) {
    return false;
  }

  const conciliacao = conciliacaoEtapa2Pvh(participantes);
  if (conciliacao.possuiDivergencia && !justificativaDivergencia?.trim()) return false;

  return true;
}

function competenciaAPartirDeJulho2026(competencia: string) {
  const match = competencia.match(/^(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const indice = Number(match[2]) * 12 + Number(match[1]);
  return indice >= 2026 * 12 + 7;
}

export function alertasNormativosDocumentoPvh({
  competencia,
  normativaCompetenciaId,
  normativaDocumentoId,
  referenciaTexto,
}: {
  competencia: string;
  normativaCompetenciaId?: string | null;
  normativaDocumentoId?: string | null;
  referenciaTexto?: string | null;
}) {
  const alertas: string[] = [];
  const texto = String(referenciaTexto ?? "").toUpperCase();

  if (
    normativaCompetenciaId &&
    normativaDocumentoId &&
    normativaCompetenciaId !== normativaDocumentoId
  ) {
    alertas.push("A base normativa registrada no documento difere da base vigente na competência.");
  }

  if (competenciaAPartirDeJulho2026(competencia) && /745\s*\/\s*CIB\s*\/\s*2023/.test(texto)) {
    alertas.push(
      "Documento novo pós-07/2026 cita a Deliberação 745/CIB/2023, revogada pela 416/CIB/2026.",
    );
  }

  if (
    /416\s*\/\s*CIB\s*\/\s*2026/.test(texto) &&
    /17\s*[\/.-]\s*0?7\s*[\/.-]\s*2026/.test(texto)
  ) {
    alertas.push(
      "A Deliberação 416/CIB/2026 foi deliberada em 17/06/2026; a referência 17/07/2026 reproduz um erro histórico.",
    );
  }

  return alertas;
}
