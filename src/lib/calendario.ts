export type FeriadoInstitucional = {
  data: string;
  nome: string;
  esfera: "nacional" | "estadual" | "municipal";
};

const chaveData = (data: Date) =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(
    data.getDate(),
  ).padStart(2, "0")}`;

const somarDias = (data: Date, dias: number) => {
  const nova = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  nova.setDate(nova.getDate() + dias);
  return nova;
};

/**
 * Algoritmo gregoriano de Meeus/Jones/Butcher.
 * Retorna o Domingo de Páscoa no calendário civil.
 */
export function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

const domingoSubsequente = (data: Date) => {
  const diasAteDomingo = data.getDay() === 0 ? 7 : 7 - data.getDay();
  return somarDias(data, diasAteDomingo);
};

/**
 * Feriados que impactam o expediente da SMS Joinville.
 *
 * Inclui:
 * - feriados nacionais previstos em lei;
 * - Data Magna de SC (11/08), transferida por lei ao domingo subsequente;
 * - feriados municipais de Joinville: aniversário, Sexta-Feira da Paixão e Corpus Christi.
 *
 * Pontos facultativos NÃO entram aqui de propósito. Eles podem ser adicionados
 * futuramente como calendário administrativo separado sem confundir feriado com
 * suspensão de expediente por decreto anual.
 */
export function feriadosInstitucionaisJoinville(
  ano: number,
): FeriadoInstitucional[] {
  const feriados: FeriadoInstitucional[] = [];

  const adicionar = (
    data: Date,
    nome: string,
    esfera: FeriadoInstitucional["esfera"],
  ) => feriados.push({ data: chaveData(data), nome, esfera });

  // Nacionais
  adicionar(new Date(ano, 0, 1), "Confraternização Universal", "nacional");
  adicionar(new Date(ano, 3, 21), "Tiradentes", "nacional");
  adicionar(new Date(ano, 4, 1), "Dia do Trabalho", "nacional");
  adicionar(new Date(ano, 8, 7), "Independência do Brasil", "nacional");
  adicionar(new Date(ano, 9, 12), "Nossa Senhora Aparecida", "nacional");
  adicionar(new Date(ano, 10, 2), "Finados", "nacional");
  adicionar(new Date(ano, 10, 15), "Proclamação da República", "nacional");
  adicionar(
    new Date(ano, 10, 20),
    "Dia Nacional de Zumbi e da Consciência Negra",
    "nacional",
  );
  adicionar(new Date(ano, 11, 25), "Natal", "nacional");

  // Santa Catarina: a Data Magna é transferida para o domingo subsequente.
  adicionar(
    domingoSubsequente(new Date(ano, 7, 11)),
    "Dia do Estado de Santa Catarina (Data Magna transferida)",
    "estadual",
  );

  // Joinville
  const domingoPascoa = pascoa(ano);
  adicionar(new Date(ano, 2, 9), "Aniversário de Joinville", "municipal");
  adicionar(
    somarDias(domingoPascoa, -2),
    "Sexta-Feira da Paixão",
    "municipal",
  );
  adicionar(
    somarDias(domingoPascoa, 60),
    "Corpus Christi",
    "municipal",
  );

  return feriados.sort((a, b) => a.data.localeCompare(b.data));
}

export function ehFeriadoInstitucionalJoinville(data: Date): boolean {
  const chave = chaveData(data);
  return feriadosInstitucionaisJoinville(data.getFullYear()).some(
    (feriado) => feriado.data === chave,
  );
}

export function ehDiaUtilJoinville(data: Date): boolean {
  const diaSemana = data.getDay();
  if (diaSemana === 0 || diaSemana === 6) return false;
  return !ehFeriadoInstitucionalJoinville(data);
}

export function nthDiaUtilJoinville(
  ano: number,
  mes: number,
  n: number,
): Date {
  const data = new Date(ano, mes - 1, 1);
  let uteis = 0;

  while (data.getMonth() === mes - 1) {
    if (ehDiaUtilJoinville(data)) {
      uteis += 1;
      if (uteis === n) return new Date(data);
    }
    data.setDate(data.getDate() + 1);
  }

  return new Date(ano, mes, 0);
}
