import { linkValido } from "@/lib/sei";

export const TIPO_MINUTA_PVH = "minuta_portaria_municipal";
export const TIPO_MEMORANDO_PVH = "memorando_portaria_municipal";
export const TIPO_PORTARIA_MUNICIPAL_PVH = "portaria_municipal_publicada";

export type ParticipanteEtapa2Pvh = {
  id: string;
  prestador_id?: string | null;
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
  dados?: any;
};

export type AssinaturaDocumentoPvh = {
  documento_id: string;
  slot?: string | null;
  cargo?: string | null;
  papel_funcao?: string | null;
  revogado_em?: string | null;
};

export type SlotAssinaturaPvh = {
  key: string;
  label: string;
  cargos: string[];
  opcional?: boolean;
  qualquer?: boolean;
};

export const SLOTS_MINUTA_PVH: SlotAssinaturaPvh[] = [
  {
    key: "fiscal",
    label: "Fiscal",
    cargos: ["Fiscal"],
    opcional: true,
  },
  {
    key: "gestao",
    label: "Gerente ou Coordenador",
    cargos: ["Gerente", "Coordenador ACP", "Coordenador"],
    qualquer: true,
  },
  {
    key: "diretor_servicos_complementares",
    label: "Diretor de Serviços Complementares",
    cargos: ["Diretor de Serviços Complementares"],
  },
];

export const SLOTS_MEMORANDO_PVH: SlotAssinaturaPvh[] = [
  {
    key: "fiscal",
    label: "Fiscal",
    cargos: ["Fiscal"],
  },
  {
    key: "gestao",
    label: "Gerente ou Coordenador",
    cargos: ["Gerente", "Coordenador ACP", "Coordenador"],
    qualquer: true,
  },
];

const valor = (n: number | string | null | undefined) => {
  const numero = Number(n ?? 0);
  return Number.isFinite(numero) ? numero : 0;
};

function assinaturaAtivaNoSlot(
  assinaturas: AssinaturaDocumentoPvh[],
  documentoId: string,
  slot: string,
) {
  return assinaturas.some(
    (assinatura) =>
      assinatura.documento_id === documentoId &&
      assinatura.slot === slot &&
      !assinatura.revogado_em,
  );
}

export function assinaturasDocumentoCompletasPvh(
  documentoId: string,
  assinaturas: AssinaturaDocumentoPvh[],
  slots: SlotAssinaturaPvh[],
) {
  return slots
    .filter((slot) => !slot.opcional)
    .every((slot) => assinaturaAtivaNoSlot(assinaturas, documentoId, slot.key));
}

export function documentoEtapa2CompletoPvh(
  documento: DocumentoEtapa2Pvh | undefined,
  assinaturas: AssinaturaDocumentoPvh[],
) {
  if (!documento) return false;

  if (documento.tipo_codigo === TIPO_MINUTA_PVH) {
    const dados = (documento.dados ?? {}) as Record<string, any>;
    const cnes = (dados.cnes_por_prestador ?? {}) as Record<string, string>;
    return Boolean(
      documento.numero_sei?.trim() &&
        documento.data_documento &&
        linkValido(documento.link_documento) &&
        String(dados.autoridade_nome ?? "").trim() &&
        String(dados.autoridade_cargo ?? "").trim() &&
        String(dados.portaria_geral_numero ?? "").trim() &&
        String(dados.portaria_geral_sei ?? "").trim() &&
        Object.values(cnes).some((item) => String(item ?? "").trim()) &&
        assinaturasDocumentoCompletasPvh(
          documento.id,
          assinaturas,
          SLOTS_MINUTA_PVH,
        ),
    );
  }

  if (documento.tipo_codigo === TIPO_MEMORANDO_PVH) {
    const dados = (documento.dados ?? {}) as Record<string, any>;
    const destinatarios = Array.isArray(dados.destinatarios) ? dados.destinatarios : [];
    const destinatariosOk =
      destinatarios.length >= 2 &&
      destinatarios.every(
        (item: any) =>
          String(item?.unidade ?? "").trim() &&
          String(item?.nome ?? "").trim() &&
          String(item?.cargo ?? "").trim(),
      );

    return Boolean(
      documento.numero_sei?.trim() &&
        documento.data_documento &&
        linkValido(documento.link_documento) &&
        destinatariosOk &&
        String(dados.memorando_pgm_numero ?? "").trim() &&
        String(dados.memorando_sap_numero ?? "").trim() &&
        String(dados.processo_referencia ?? "").trim() &&
        dados.encaminhado_ses_uap === true &&
        dados.encaminhado_ses_uap_apa === true &&
        assinaturasDocumentoCompletasPvh(
          documento.id,
          assinaturas,
          SLOTS_MEMORANDO_PVH,
        ),
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
}: {
  participantes: ParticipanteEtapa2Pvh[];
  documentos: DocumentoEtapa2Pvh[];
  assinaturas: AssinaturaDocumentoPvh[];
}) {
  if (!participantes.length) return false;
  if (participantes.some((participante) => valor(participante.valor_estadual) <= 0)) {
    return false;
  }

  const minuta = documentos.find((item) => item.tipo_codigo === TIPO_MINUTA_PVH);
  const cnesPorPrestador = ((minuta?.dados ?? {}) as Record<string, any>)
    .cnes_por_prestador as Record<string, string> | undefined;
  if (
    participantes.some(
      (participante) =>
        !participante.prestador_id ||
        !String(cnesPorPrestador?.[participante.prestador_id] ?? "").trim(),
    )
  ) {
    return false;
  }

  return [
    TIPO_MINUTA_PVH,
    TIPO_MEMORANDO_PVH,
    TIPO_PORTARIA_MUNICIPAL_PVH,
  ].every((tipo) =>
    documentoEtapa2CompletoPvh(
      documentos.find((item) => item.tipo_codigo === tipo),
      assinaturas,
    ),
  );
}

export function recursoFmsCompletoEtapa2Pvh({
  participantes,
  competencia,
}: {
  participantes: ParticipanteEtapa2Pvh[];
  competencia: {
    recurso_fms_data?: string | null;
    recurso_fms_valor?: number | null;
    recurso_fms_referencia?: string | null;
    recurso_fms_link?: string | null;
  };
}) {
  const esperado = participantes.reduce(
    (soma, participante) => soma + valor(participante.valor_estadual),
    0,
  );
  const recebido = valor(competencia.recurso_fms_valor);

  return Boolean(
    esperado > 0 &&
      competencia.recurso_fms_data &&
      recebido > 0 &&
      Math.abs(recebido - esperado) < 0.01 &&
      String(competencia.recurso_fms_referencia ?? "").trim() &&
      linkValido(competencia.recurso_fms_link),
  );
}

export function etapa2CompletaPvh({
  participantes,
  documentos,
  assinaturas,
  competencia,
}: {
  participantes: ParticipanteEtapa2Pvh[];
  documentos: DocumentoEtapa2Pvh[];
  assinaturas: AssinaturaDocumentoPvh[];
  competencia: {
    recurso_fms_data?: string | null;
    recurso_fms_valor?: number | null;
    recurso_fms_referencia?: string | null;
    recurso_fms_link?: string | null;
  };
}) {
  return (
    etapa2ProntaPvh({ participantes, documentos, assinaturas }) &&
    recursoFmsCompletoEtapa2Pvh({ participantes, competencia })
  );
}

// Mantido por compatibilidade com telas/relatórios legados. Na Etapa 2 nova,
// valor municipal é herdado do valor estadual ao concluir a Portaria Municipal.
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

function competenciaAPartirDeJulho2026(competencia: string) {
  const match = competencia.match(/^(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const indice = Number(match[2]) * 12 + Number(match[1]);
  return indice >= 2026 * 12 + 7;
}

// Compatibilidade com o componente antigo enquanto o histórico documental ainda
// puder exibir referências textuais já persistidas.
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
