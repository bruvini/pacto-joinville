const formatadorBrl = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function mascaraMoedaBrl(entrada: string) {
  const digitos = String(entrada ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  return formatadorBrl.format(Number(digitos) / 100);
}

export function numeroMoedaBrl(entrada: string) {
  const limpo = String(entrada ?? "")
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : 0;
}

export function moedaBrlDeNumero(valor: number | null | undefined) {
  if (valor == null || !Number.isFinite(Number(valor))) return "";
  return formatadorBrl.format(Number(valor));
}

export function mascaraColagemMoedaBrl(entrada: string) {
  const texto = String(entrada ?? "").trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (!texto) return "";

  if (/^\d+$/.test(texto)) return formatadorBrl.format(Number(texto));

  if (texto.includes(",")) {
    return moedaBrlDeNumero(numeroMoedaBrl(texto));
  }

  const pontos = (texto.match(/\./g) ?? []).length;
  if (pontos === 1 && /\.\d{1,2}$/.test(texto)) {
    const valor = Number(texto);
    return Number.isFinite(valor) ? moedaBrlDeNumero(valor) : mascaraMoedaBrl(texto);
  }

  if (pontos > 0) {
    const valor = Number(texto.replace(/\./g, ""));
    return Number.isFinite(valor) ? moedaBrlDeNumero(valor) : mascaraMoedaBrl(texto);
  }

  return mascaraMoedaBrl(texto);
}
