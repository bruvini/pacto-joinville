export type ParticipanteStatusInput = {
  data_envio?: string | null;
  data_retorno?: string | null;
  sem_elegiveis?: boolean | null;
  auditoria_resumo?: { linhas?: number } | null;
};

export type StatusParticipantePiso = {
  codigo:
    | "aguardando_envio"
    | "aguardando_retorno"
    | "retorno_sem_elegiveis"
    | "aguardando_planilha"
    | "ocorrencias"
    | "planilha_auditada";
  rotulo: string;
  tom: "neutro" | "alerta" | "sucesso" | "erro";
};

/** Situação exibida é sempre derivada dos fatos operacionais. */
export function statusParticipantePiso(
  participante: ParticipanteStatusInput,
  possuiPlanilha: boolean,
  ocorrencias: number,
): StatusParticipantePiso {
  if (!participante.data_envio)
    return { codigo: "aguardando_envio", rotulo: "Aguardando envio", tom: "neutro" };
  if (!participante.data_retorno)
    return { codigo: "aguardando_retorno", rotulo: "Aguardando retorno", tom: "alerta" };
  if (participante.sem_elegiveis)
    return { codigo: "retorno_sem_elegiveis", rotulo: "Retorno sem elegíveis", tom: "neutro" };
  if (!possuiPlanilha || !participante.auditoria_resumo)
    return { codigo: "aguardando_planilha", rotulo: "Aguardando planilha", tom: "alerta" };
  if (ocorrencias > 0)
    return {
      codigo: "ocorrencias",
      rotulo: `${ocorrencias} ocorrência(s) registrada(s)`,
      tom: "erro",
    };
  return { codigo: "planilha_auditada", rotulo: "Planilha auditada", tom: "sucesso" };
}

export function situacaoCanonicaPiso(
  participante: ParticipanteStatusInput,
): "aguardando_envio" | "enviado" | "retornado" | "sem_elegiveis" {
  if (!participante.data_envio) return "aguardando_envio";
  if (!participante.data_retorno) return "enviado";
  return participante.sem_elegiveis ? "sem_elegiveis" : "retornado";
}
