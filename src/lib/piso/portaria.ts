export interface DadosPortariaGm {
  numero: string | null;
  data_ato: string | null;
  data_publicacao: string | null;
  edicao: string | null;
  secao: string | null;
  pagina: string | null;
  valor_homologado: number | null;
  desconto_saldo: number | null;
  acerto_contas: number | null;
  valor_transferido: number | null;
  joinville_localizada: boolean;
  campos_nao_extraidos: string[];
}

const MESES: Record<string, string> = {
  janeiro: "01",
  fevereiro: "02",
  marco: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const moeda = (s?: string): number | null =>
  s ? Number(s.replace(/\./g, "").replace(",", ".")) : null;

function dataExtenso(texto: string): string | null {
  const m = normalizar(texto).match(
    /(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i,
  );
  return m ? `${m[3]}-${MESES[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}` : null;
}

function dataNumerica(texto: string): string | null {
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function extrairDadosPortariaGm(textoOriginal: string): DadosPortariaGm {
  const texto = normalizar(textoOriginal);
  const numero = texto.match(/PORTARIA\s+GM\/?MS\s+(?:N[Oº°.]?\s*)?([\d.]+)/i)?.[1] ?? null;
  const trechoAto =
    texto.match(/PORTARIA\s+GM\/?MS[^,\n]*(?:,|\s)\s*DE\s+(.{5,45}?\d{4})/i)?.[1] ?? "";
  const data_ato = dataExtenso(trechoAto) ?? dataNumerica(trechoAto);
  const publicacaoTrecho =
    texto.match(/(?:PUBLICA(?:CAO|ÇÃO)|PUBLICADO\s+EM)\s*:?\s*([^|;]{5,35})/i)?.[1] ?? "";
  const data_publicacao = dataNumerica(publicacaoTrecho) ?? dataExtenso(publicacaoTrecho);
  const edicao = texto.match(/EDI(?:CAO|ÇÃO)\s*:?\s*([\dA-Z.-]+)/i)?.[1] ?? null;
  const secao = texto.match(/SE(?:CAO|ÇÃO)\s*:?\s*([\dA-Z.-]+)/i)?.[1] ?? null;
  const pagina = texto.match(/P(?:A|\u00c1)GINA\s*:?\s*([\dA-Z.-]+)/i)?.[1] ?? null;
  const linhaJoinville =
    texto.match(/SC\s+420910\s+JOINVILLE\s+MUNICIPAL\s+([^\n]{0,400})/i)?.[1] ??
    texto.match(/420910\s+JOINVILLE\s+MUNICIPAL\s+(.{0,400})/i)?.[1] ??
    "";
  const valores = [...linhaJoinville.matchAll(/-?\s*\d{1,3}(?:\.\d{3})*,\d{2}/g)].map((m) =>
    moeda(m[0].replace(/\s/g, "")),
  );
  const campos: Array<[keyof DadosPortariaGm, unknown]> = [
    ["numero", numero],
    ["data_ato", data_ato],
    ["data_publicacao", data_publicacao],
    ["valor_homologado", valores[0]],
    ["desconto_saldo", valores[1]],
    ["acerto_contas", valores[2]],
    ["valor_transferido", valores[3]],
  ];
  return {
    numero,
    data_ato,
    data_publicacao,
    edicao,
    secao,
    pagina,
    valor_homologado: valores[0] ?? null,
    desconto_saldo: valores[1] ?? null,
    acerto_contas: valores[2] ?? null,
    valor_transferido: valores[3] ?? null,
    joinville_localizada: valores.length >= 4,
    campos_nao_extraidos: campos
      .filter(([, valor]) => valor === null || valor === undefined)
      .map(([campo]) => campo),
  };
}

export async function extrairTextoPdf(arquivo: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) })
    .promise;
  const paginas: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const conteudo = await (await pdf.getPage(n)).getTextContent();
    paginas.push(conteudo.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return paginas.join("\n");
}
