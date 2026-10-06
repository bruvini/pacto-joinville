function dataLocal(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
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
  const feriados = new Set(feriadosIso);
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
