/**
 * Simulação técnica da 13ª AFC do Piso por CNES a partir de valores
 * mensais homologados. Nunca calcula direito individual nem define pagamento.
 *
 * Regra validada: FAQ SGTES/MS, publicado em 08/12/2025:
 * soma dos 11 valores atualizados e homologados de janeiro a novembro / 11.
 * https://www.gov.br/saude/pt-br/composicao/sgtes/piso-da-enfermagem/afc/faq/faq/qual-o-parametro-para-o
 *
 * O ato/regra da 13ª de 2026 ainda não está validado aqui: bloqueado.
 */
export const METODOS_CONFIRMADOS_13_PISO: Record<number, { meses: number[]; divisor: number; fonte: string }> = {
  2025: {
    meses: Array.from({ length: 11 }, (_, i) => i + 1),
    divisor: 11,
    fonte: "FAQ Ministério da Saúde de 08/12/2025, referência 2025",
  },
};

export type FonteMensalPiso = {
  id: string;
  competencia: string;
  tipo_parcela?: string | null;
  valor_homologado?: number | null;
  portaria_gm_numero?: string | null;
  etapas_concluidas?: Record<string, boolean> | null;
  investsus_resumo?: {
    por_cnes?: Record<string, number | string | null>;
    origem_calculo?: string;
    arquivo_id?: string;
  } | null;
};

export type CnesInstituicaoPiso = { prestador_id: string; cnes: string; nome_instituicao?: string };
export type ValorCnes13 = {
  prestador_id: string;
  cnes: string;
  valores_centesimos: number[];
  media_centesimos: number;
};
export type Simulacao13Piso = {
  disponivel: boolean;
  problemas: string[];
  mesesExigidos: string[];
  valores: ValorCnes13[];
  porInstituicao: Array<{ prestador_id: string; cnes: ValorCnes13[]; total_centesimos: number }>;
  regra?: { divisor: number; fonte: string };
};

const periodo = (m: number, ano: number) => `${String(m).padStart(2, "0")}/${ano}`;
const cnesNormalizado = (v: string) => v.replace(/\D/g, "");
const cents = (valor: unknown): number | null => {
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  if (typeof valor === "string" && !/^\d+([.]\d{1,2})?$/.test(valor.trim())) return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0 || Math.abs(numero * 100 - Math.round(numero * 100)) > 0.01)
    return null;
  return Math.round(numero * 100);
};

export function simular13PorCnes(
  exercicio: number,
  competencias: FonteMensalPiso[],
  cnesInstituicoes: CnesInstituicaoPiso[],
): Simulacao13Piso {
  const regra = METODOS_CONFIRMADOS_13_PISO[exercicio];
  const mesesExigidos = Array.from({ length: 11 }, (_, i) => periodo(i + 1, exercicio));
  const problemas: string[] = [];
  const dados = new Map<string, FonteMensalPiso>();
  const referencias = new Map<string, CnesInstituicaoPiso>();

  if (!regra) problemas.push(
    `A metodologia da 13ª de ${exercicio} ainda não foi confirmada por ato ou FAQ federal. Simulação bloqueada.`,
  );
  for (const item of cnesInstituicoes) {
    const cn = cnesNormalizado(item.cnes);
    if (!/^\d{7}$/.test(cn)) problemas.push(`CNES inválido: ${item.cnes}.`);
    const anterior = referencias.get(cn);
    if (anterior && anterior.prestador_id !== item.prestador_id)
      problemas.push(`CNES ${cn} vinculado a mais de uma instituição.`);
    referencias.set(cn, { ...item, cnes: cn });
  }
  if (!referencias.size) problemas.push("Não há CNES cadastrados para as instituições participantes.");
  for (const periodoMes of mesesExigidos) {
    const registros = competencias.filter(c => c.competencia === periodoMes && c.tipo_parcela !== "decimo_terceiro");
    if (registros.length !== 1) {
      problemas.push(registros.length ? `Competência ${periodoMes}: registro mensal duplicado.`
        : `Cadastre e processe a competência mensal ${periodoMes}.`);
      continue;
    }
    const fonte = registros[0];
    if (fonte.investsus_resumo?.origem_calculo !== "edge_function" ||
      !fonte.investsus_resumo?.arquivo_id || !fonte.investsus_resumo?.por_cnes ||
      !Object.keys(fonte.investsus_resumo.por_cnes).length) {
      problemas.push(`Competência ${periodoMes}: falta memória homologada por CNES processada no PACTO.`);
      continue;
    }
    if (fonte.valor_homologado == null || !fonte.portaria_gm_numero ||
      !fonte.etapas_concluidas?.["2"]) {
      problemas.push(`Competência ${periodoMes}: Portaria mensal não homologada/concluída no PACTO.`);
      continue;
    }
    const valores = Object.values(fonte.investsus_resumo.por_cnes);
    if (valores.some(x => cents(x) === null) ||
      Math.abs(valores.reduce((soma: number, x) => soma + (cents(x) ?? 0), 0) -
        Math.round(fonte.valor_homologado * 100)) > 1) {
      problemas.push(`Competência ${periodoMes}: valores CNES divergentes do homologado mensal.`);
      // Preserva o mês em diagnóstico, para também apontar o CNES específico
      // que desapareceu. A presença de problemas impede o cálculo final.
    }
    dados.set(periodoMes, fonte);
  }
  for (const cnes of referencias.keys()) {
    for (const periodoMes of mesesExigidos) {
      const f = dados.get(periodoMes);
      if (!f) continue;
      const raw = f.investsus_resumo?.por_cnes?.[cnes];
      if (raw === undefined || raw === null)
        problemas.push(`CNES ${cnes}, ${periodoMes}: sem valor homologado registrado (zero não é presumido).`);
      else if (cents(raw) === null)
        problemas.push(`CNES ${cnes}, ${periodoMes}: valor financeiro inválido.`);
    }
  }
  if (problemas.length || !regra) return {
    disponivel: false, problemas, mesesExigidos, valores: [], porInstituicao: [],
  };

  const valores: ValorCnes13[] = [];
  for (const c of referencias.values()) {
    const historico = regra.meses.map(m =>
      cents(dados.get(periodo(m, exercicio))!.investsus_resumo!.por_cnes![c.cnes])!,
    );
    valores.push({
      prestador_id: c.prestador_id, cnes: c.cnes, valores_centesimos: historico,
      media_centesimos: Math.round(historico.reduce((a, b) => a + b, 0) / regra.divisor),
    });
  }
  const ids = [...new Set(valores.map(v => v.prestador_id))];
  return {
    disponivel: true, problemas: [], mesesExigidos, valores,
    porInstituicao: ids.map(id => {
      const linhas = valores.filter(v => v.prestador_id === id);
      return { prestador_id: id, cnes: linhas,
        total_centesimos: linhas.reduce((acc, v) => acc + v.media_centesimos, 0) };
    }),
    regra: { divisor: regra.divisor, fonte: regra.fonte },
  };
}
