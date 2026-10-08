const UNIDADES = [
  "",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
];

const DEZ_A_DEZENOVE = [
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];

const DEZENAS = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];

const CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function ate999(valor: number) {
  const n = Math.floor(valor);
  if (n === 0) return "";
  if (n === 100) return "cem";

  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;

  if (c) partes.push(CENTENAS[c]);

  if (resto >= 10 && resto <= 19) {
    partes.push(DEZ_A_DEZENOVE[resto - 10]);
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    if (d) partes.push(DEZENAS[d]);
    if (u) partes.push(UNIDADES[u]);
  }

  return partes.filter(Boolean).join(" e ");
}

export function numeroInteiroPorExtensoPvh(valor: number) {
  const n = Math.max(0, Math.floor(Number(valor) || 0));
  if (n === 0) return "zero";

  const bilhoes = Math.floor(n / 1_000_000_000);
  const milhoes = Math.floor((n % 1_000_000_000) / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1_000);
  const unidades = n % 1_000;
  const partes: string[] = [];

  if (bilhoes) {
    partes.push(
      bilhoes === 1 ? "um bilhão" : `${ate999(bilhoes)} bilhões`,
    );
  }

  if (milhoes) {
    partes.push(
      milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`,
    );
  }

  if (milhares) {
    partes.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
  }

  if (unidades) partes.push(ate999(unidades));

  if (partes.length <= 1) return partes[0] ?? "zero";

  const ultimo = partes.pop()!;
  return `${partes.join(", ")} e ${ultimo}`;
}

export function valorPorExtensoBrlPvh(valor: number) {
  const centavosTotais = Math.round((Number(valor) || 0) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;

  const partes: string[] = [];
  if (reais > 0) {
    partes.push(
      `${numeroInteiroPorExtensoPvh(reais)} ${reais === 1 ? "real" : "reais"}`,
    );
  }
  if (centavos > 0) {
    partes.push(
      `${numeroInteiroPorExtensoPvh(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`,
    );
  }
  return partes.length ? partes.join(" e ") : "zero reais";
}

function brl(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor) || 0);
}

export function montarComunicacaoPvh({
  competencia,
  valor,
  empenhos,
  portariaMunicipal,
  usuarioNome,
}: {
  competencia: string;
  valor: number;
  empenhos: string[];
  portariaMunicipal?: string | null;
  usuarioNome: string;
}) {
  const listaEmpenhos = [...new Set(empenhos.filter(Boolean))];
  const rotuloEmpenho = listaEmpenhos.length > 1 ? "Empenhos nº" : "Empenho nº";
  const textoEmpenhos = listaEmpenhos.length
    ? listaEmpenhos.join(", ")
    : "[número do empenho]";

  return {
    assunto: `Programa de Valorização dos Hospitais - PVH - ${competencia}`,
    corpo: [
      "Prezados,",
      "",
      `Encaminhamos por meio deste, comprovante do repasse referente à competência de ${competencia} do Programa de Valorização dos Hospitais, da Portaria no valor de ${brl(valor)} (${valorPorExtensoBrlPvh(valor)}), para inclusão na Prestação de Contas, conforme:`,
      `- ${rotuloEmpenho} ${textoEmpenhos}`,
      `- Portaria nº ${portariaMunicipal || "[número da Portaria Municipal]"}`,
      "- Aviso de Movimento - Sub-empenho",
      "",
      "Atenciosamente,",
      "",
      usuarioNome || "Usuário logado",
      "Área de Convênios e Parcerias",
      "Secretaria de Saúde de Joinville",
    ].join("\n"),
  };
}
