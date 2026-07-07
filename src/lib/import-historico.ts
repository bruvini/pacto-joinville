// =====================================================================
// Parsing e mapeamento da planilha manual de Prestação de Contas.
// Puro (sem I/O nem dependência de xlsx) para ser testável. A leitura do
// workbook fica em `import-historico-xlsx.ts`; o componente de UI cuida do
// upload, da confirmação e da gravação no Supabase.
// =====================================================================

export const norm = (s: any): string =>
  String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // remove pontuação
    .replace(/\s+/g, " ")
    .trim();

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/** "R$40.000,00" | 40000 | "40.000,00" → 40000 (number) | 0 */
export function parseMoeda(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Date | "10/09/2020" | serial Excel → "YYYY-MM-DD" | null (ignora "-"/vazio) */
export function parseData(v: any): string | null {
  if (v == null || v === "" || v === "-") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** ("Outubro", 2020) → "10/2020" | null */
export function parseCompetencia(mes: any, ano: any): string | null {
  const m = MESES[norm(mes)];
  const y = Number(String(ano ?? "").replace(/\D/g, "").slice(0, 4));
  if (!m || !y) return null;
  return `${String(m).padStart(2, "0")}/${y}`;
}

export function mapStatusCgm(v: any): string | null {
  const n = norm(v);
  if (!n) return null;
  if (n.includes("ressalva")) return "regular_ressalvas";
  if (n.includes("dilig")) return "diligencias";
  if (n.includes("irregular")) return "irregular";
  if (n.includes("regular")) return "regular";
  return null;
}

/** Coluna Y ("... com/sem baixa contábil ...") → situação + exercício. */
export function mapSituacaoBaixa(v: any): { situacao: "com_baixa" | "sem_baixa" | null; exercicio: number | null } {
  const n = norm(v);
  if (!n) return { situacao: null, exercicio: null };
  const ano = String(v).match(/(20\d{2})/);
  const exercicio = ano ? Number(ano[1]) : null;
  if (n.includes("sem baixa") || n.includes("em aberto")) return { situacao: "sem_baixa", exercicio };
  if (n.includes("com baixa") || n.includes("baixa contabil") || n.includes("aprovada") || n.includes("emitida")) return { situacao: "com_baixa", exercicio };
  return { situacao: null, exercicio };
}

export type LinhaImport = {
  linha: number;
  instituicao: string;
  termo: string;
  empenho: string;
  parcela: string;
  competencia: string | null;
  valor: number;
  dataPagamento: string | null;
  numeroProcessoPc: string;
  dataRecebimento: string | null;
  linkRelatorioAnalise: string;
  dataEnvioEntidade: string | null;
  dataRetornoEntidade: string | null;
  linkParecerSes: string;
  dataEncCgm: string | null;
  dataRetornoCgm: string | null;
  linkManifestacaoCgm: string;
  statusCgm: string | null;
  observacao: string;
  dataBaixaContabil: string | null;
  situacaoBaixa: "com_baixa" | "sem_baixa" | null;
  exercicioBaixa: number | null;
  responsavel: string;
  statusMacro: string;
  _erros: string[];
};

export const strv = (v: any) => (v == null || v === "-" ? "" : String(v).trim());

/**
 * Constrói uma LinhaImport a partir de um acessor de célula por chave lógica.
 * Mantido puro (sem xlsx) para ser testável; a leitura da planilha injeta o `get`.
 */
export function montarLinha(get: (chave: string) => any, linha: number): LinhaImport {
  const instituicao = strv(get("instituicao"));
  const empenho = strv(get("empenho"));
  const competencia = parseCompetencia(get("compMes"), get("compAno"));
  const baixa = mapSituacaoBaixa(get("situacaoBaixa"));
  const dataBaixa = parseData(get("baixaContabil"));
  const erros: string[] = [];
  if (!instituicao) erros.push("sem instituição");
  if (!competencia) erros.push("competência inválida");
  return {
    linha,
    instituicao,
    termo: strv(get("termo")),
    empenho,
    parcela: strv(get("parcela")),
    competencia,
    valor: parseMoeda(get("valor")),
    dataPagamento: parseData(get("ingresso")),
    numeroProcessoPc: strv(get("processoPc")),
    dataRecebimento: parseData(get("recebimento")),
    linkRelatorioAnalise: strv(get("relAnalise")),
    dataEnvioEntidade: parseData(get("envioEntidade")),
    dataRetornoEntidade: parseData(get("retornoEntidade")),
    linkParecerSes: strv(get("parecerSes")),
    dataEncCgm: parseData(get("encCgm")),
    dataRetornoCgm: parseData(get("retornoCgm")),
    linkManifestacaoCgm: strv(get("manifestacaoCgm")),
    statusCgm: mapStatusCgm(get("statusCgm")),
    observacao: strv(get("observacao")),
    dataBaixaContabil: dataBaixa,
    situacaoBaixa: baixa.situacao,
    exercicioBaixa: baixa.exercicio ?? (dataBaixa ? Number(dataBaixa.slice(0, 4)) : null),
    responsavel: strv(get("responsavel")),
    statusMacro: strv(get("statusMacro")),
    _erros: erros,
  };
}

/** Mapa de chaves lógicas → (cabeçalho exato normalizado, trecho alternativo). */
export const COLUNAS_PC: Record<string, [string, string?]> = {
  instituicao: ["instituicao"],
  termo: ["termo de colaboracao convenio", "termo de colaboracao"],
  empenho: ["empenho"],
  parcela: ["parcela"],
  ingresso: ["ingresso do recurso", "ingresso"],
  valor: ["valor do repasse", "valor do repasse"],
  compMes: ["competencia mes", "competencia mes"],
  compAno: ["competencia ano", "competencia ano"],
  processoPc: ["n processo prestacao de contas", "processo prestacao de contas"],
  recebimento: ["recebimento na unidade", "recebimento"],
  relAnalise: ["relatorio de analise oficio", "relatorio de analise"],
  envioEntidade: ["data do envio entidade", "envio entidade"],
  retornoEntidade: ["data do retorno", "data do retorno"],
  parecerSes: ["parecer tecnico fundamentado ses", "parecer tecnico"],
  encCgm: ["data enc a cgm", "enc a cgm"],
  retornoCgm: ["data retorno manifestacao cgm", "retorno manifestacao cgm"],
  manifestacaoCgm: ["manifestacao cgm", "manifestacao cgm"],
  statusCgm: ["status cgm", "status cgm"],
  observacao: ["observacao", "observacao"],
  baixaContabil: ["lancamento contabil", "lancamento contabil"],
  responsavel: ["responsavel", "responsavel"],
  statusMacro: ["status"],
  situacaoBaixa: ["situacao com ou sem baixa contabil", "com ou sem baixa"],
};

/** 4-estado do MVP derivado dos dados históricos da planilha. */
export function statusPcHistorico(l: LinhaImport): "aguardando" | "recebida" | "aprovada" | "reprovada" {
  const macro = norm(l.statusMacro);
  const encerrado = macro.includes("conclu") || macro.includes("encerr");
  if (l.situacaoBaixa === "com_baixa" || l.dataBaixaContabil || encerrado) return "aprovada";
  if (l.dataRecebimento || macro.includes("analise") || macro.includes("reanalise")) return "recebida";
  return "aguardando";
}
