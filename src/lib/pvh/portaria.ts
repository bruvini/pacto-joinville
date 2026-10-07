export type PortariaSesExtraida = {
  numero: string;
  data: string | null;
};

function dataIsoValida(dia: number, mes: number, ano: number) {
  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function extrairPortariaSes(valor: string): PortariaSesExtraida | null {
  const texto = valor.trim();
  if (!texto) return null;

  const numeroMatch =
    texto.match(/\bPORTARIA(?:\s+SES)?\s*(?:N\s*[º°o.]?\s*)?(\d{1,7})\b/i) ??
    texto.match(/\bSES\s*(?:N\s*[º°o.]?\s*)?(\d{1,7})\b/i) ??
    texto.match(/\bN\s*[º°o.]\s*(\d{1,7})\b/i);

  if (!numeroMatch) return null;

  const dataMatch = texto.match(/\b(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{4})\b/);
  const data = dataMatch
    ? dataIsoValida(Number(dataMatch[1]), Number(dataMatch[2]), Number(dataMatch[3]))
    : null;

  return {
    numero: `SES Nº ${Number(numeroMatch[1])}`,
    data,
  };
}

export function normalizarEntradaPortariaSes(valor: string, dataAtual = "") {
  const extraida = extrairPortariaSes(valor);
  if (!extraida) return { numero: valor, data: dataAtual, reconhecida: false };
  return {
    numero: extraida.numero,
    data: extraida.data ?? dataAtual,
    reconhecida: true,
  };
}
