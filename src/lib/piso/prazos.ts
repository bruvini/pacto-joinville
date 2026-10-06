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
