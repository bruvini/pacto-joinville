function dataLocal(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

const FERIADOS_NACIONAIS_FIXOS = [
  "01-01",
  "04-21",
  "05-01",
  "09-07",
  "10-12",
  "11-02",
  "11-15",
  "11-20",
  "12-25",
] as const;

export function feriadosNacionaisFixos(ano: number): string[] {
  return FERIADOS_NACIONAIS_FIXOS.map((mesDia) => `${ano}-${mesDia}`);
}

export function diaUtil(data: Date, feriados: Set<string>): boolean {
  const dia = data.getDay();
  return dia !== 0 && dia !== 6 && !feriados.has(data.toISOString().slice(0, 10));
}

export function enesimoDiaUtilCompetencia(
  competencia: string,
  n: number,
  feriadosIso: string[] = [],
): string | null {
  const [mes, ano] = competencia.split("/").map(Number);
  if (!mes || !ano || n < 1) return null;
  const feriados = new Set([...feriadosNacionaisFixos(ano), ...feriadosIso]);
  const data = new Date(ano, mes - 1, 1, 12);
  let contador = 0;
  while (data.getMonth() === mes - 1) {
    if (diaUtil(data, feriados)) contador++;
    if (contador === n) return data.toISOString().slice(0, 10);
    data.setDate(data.getDate() + 1);
  }
  return null;
}

export const dataDepois = (posterior?: string | null, anterior?: string | null) =>
  Boolean(posterior && anterior && dataLocal(posterior).getTime() < dataLocal(anterior).getTime());

export function atraso(
  dataInformada: string | null | undefined,
  prazo: string | null,
  hoje = new Date().toISOString().slice(0, 10),
): boolean {
  if (!prazo) return false;
  const referencia = dataInformada || hoje;
  return referencia > prazo;
}

export function formatarDataIso(data?: string | null): string {
  return data ? dataLocal(data).toLocaleDateString("pt-BR") : "—";
}


/** Data-calendário fixa dentro do mês da competência (MM/AAAA). */
export function diaCalendarioCompetencia(
  competencia: string,
  dia: number,
): string | null {
  const [mes, ano] = competencia.split("/").map(Number);
  if (!mes || !ano || mes < 1 || mes > 12 || dia < 1) return null;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  if (dia > ultimoDia) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function prazosEtapa1Piso(competencia: string) {
  return {
    envioInstituicoes: diaCalendarioCompetencia(competencia, 5),
    retornoInstituicoes: diaCalendarioCompetencia(competencia, 10),
    envioInvestsus: diaCalendarioCompetencia(competencia, 15),
  };
}

export type PendenciaPrazoPiso = {
  id: string;
  competenciaId: string;
  competencia: string;
  participanteId?: string;
  prestadorNome?: string;
  tipo: "envio_instituicao" | "retorno_instituicao" | "envio_investsus";
  prazo: string;
  dias: number;
  severidade: "critico" | "alerta" | "preventivo";
  motivo: string;
};

const dataIsoLocal = (data: Date) => {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
};

const diasAteIso = (hoje: Date, prazo: string) => {
  const inicio = dataLocal(dataIsoLocal(hoje)).getTime();
  const fim = dataLocal(prazo).getTime();
  return Math.floor((fim - inicio) / 86_400_000);
};

const severidadePrazo = (
  dias: number,
): PendenciaPrazoPiso["severidade"] | null => {
  if (dias < 0) return "critico";
  if (dias <= 3) return "alerta";
  if (dias <= 7) return "preventivo";
  return null;
};

/**
 * Gatilhos operacionais da Etapa 1 do Piso.
 *
 * Os prazos são datas corridas e fixas do mês da competência:
 * - dia 5: envio às instituições;
 * - dia 10: retorno das instituições;
 * - dia 15: envio ao InvestSUS.
 *
 * Fim de semana e feriado NÃO deslocam essas datas.
 */
export function pendenciasPrazosEtapa1Piso(
  competencias: any[],
  hoje: Date = new Date(),
): PendenciaPrazoPiso[] {
  const saida: PendenciaPrazoPiso[] = [];

  for (const competencia of competencias ?? []) {
    if (!competencia?.id || !competencia?.competencia) continue;
    if (competencia.status === "encerrada") continue;

    const prazos = prazosEtapa1Piso(competencia.competencia);
    if (
      !prazos.envioInstituicoes ||
      !prazos.retornoInstituicoes ||
      !prazos.envioInvestsus
    )
      continue;

    for (const participante of competencia.piso_participantes ?? []) {
      const nome =
        participante.prestadores?.nome_instituicao ??
        participante.nome_instituicao ??
        "Instituição";

      if (!participante.data_envio) {
        const dias = diasAteIso(hoje, prazos.envioInstituicoes);
        const severidade = severidadePrazo(dias);
        if (severidade)
          saida.push({
            id: `piso-envio-${competencia.id}-${participante.id ?? participante.prestador_id}`,
            competenciaId: competencia.id,
            competencia: competencia.competencia,
            participanteId: participante.id,
            prestadorNome: nome,
            tipo: "envio_instituicao",
            prazo: prazos.envioInstituicoes,
            dias,
            severidade,
            motivo: `Enviar Planilha de Carga para ${nome} até dia 5`,
          });
        continue;
      }

      if (!participante.data_retorno) {
        const dias = diasAteIso(hoje, prazos.retornoInstituicoes);
        const severidade = severidadePrazo(dias);
        if (severidade)
          saida.push({
            id: `piso-retorno-${competencia.id}-${participante.id ?? participante.prestador_id}`,
            competenciaId: competencia.id,
            competencia: competencia.competencia,
            participanteId: participante.id,
            prestadorNome: nome,
            tipo: "retorno_instituicao",
            prazo: prazos.retornoInstituicoes,
            dias,
            severidade,
            motivo: `Receber Planilha de Carga de ${nome} até dia 10`,
          });
      }
    }

    if (!competencia.investsus_carga_em) {
      const dias = diasAteIso(hoje, prazos.envioInvestsus);
      const severidade = severidadePrazo(dias);
      if (severidade)
        saida.push({
          id: `piso-investsus-${competencia.id}`,
          competenciaId: competencia.id,
          competencia: competencia.competencia,
          tipo: "envio_investsus",
          prazo: prazos.envioInvestsus,
          dias,
          severidade,
          motivo: "Enviar as Planilhas de Carga ao InvestSUS até dia 15",
        });
    }
  }

  return saida.sort((a, b) => {
    if (a.dias !== b.dias) return a.dias - b.dias;
    return a.motivo.localeCompare(b.motivo, "pt-BR");
  });
}
