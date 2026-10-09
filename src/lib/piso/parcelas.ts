import { competenciaValida } from "./etapas";

export type TipoParcelaPiso = "mensal" | "decimo_terceiro";

export type IdentidadeParcelaPiso = {
  competencia: string;
  tipo_parcela: TipoParcelaPiso;
  exercicio_referencia: number;
};

/** A competência representa o mês do repasse; o exercício identifica a 13ª. */
export function exercicioDaCompetencia(competencia: string): number | null {
  return competenciaValida(competencia) ? Number(competencia.slice(-4)) : null;
}

export function parcelaPisoValida(
  item: IdentidadeParcelaPiso,
): string | null {
  if (!competenciaValida(item.competencia))
    return "Informe uma competência válida no formato MM/AAAA.";
  if (!Number.isInteger(item.exercicio_referencia) || item.exercicio_referencia < 2000 || item.exercicio_referencia > 2099)
    return "Informe um exercício de referência válido (2000 a 2099).";
  if (item.tipo_parcela !== "mensal" && item.tipo_parcela !== "decimo_terceiro")
    return "Selecione um tipo de parcela válido.";
  if (item.tipo_parcela === "mensal" && exercicioDaCompetencia(item.competencia) !== item.exercicio_referencia)
    return "Na parcela mensal o exercício precisa corresponder à competência.";
  return null;
}

export function identidadeParcelaPiso(
  item: Partial<IdentidadeParcelaPiso> & { competencia: string },
): IdentidadeParcelaPiso {
  return {
    competencia: item.competencia,
    tipo_parcela: item.tipo_parcela === "decimo_terceiro" ? "decimo_terceiro" : "mensal",
    exercicio_referencia: Number(item.exercicio_referencia ?? exercicioDaCompetencia(item.competencia) ?? 0),
  };
}

export function rotuloParcelaPiso(
  item: Partial<IdentidadeParcelaPiso> & { competencia: string },
): string {
  const p = identidadeParcelaPiso(item);
  return p.tipo_parcela === "decimo_terceiro"
    ? `13ª parcela · exercício ${p.exercicio_referencia} · repasse ${p.competencia}`
    : `${p.competencia} · Mensal`;
}

export function periodoAfcDocumentoPiso(
  item: Partial<IdentidadeParcelaPiso> & { competencia: string },
): string {
  const p = identidadeParcelaPiso(item);
  return p.tipo_parcela === "decimo_terceiro"
    ? `décima terceira parcela da AFC do exercício de ${p.exercicio_referencia}`
    : `competência ${p.competencia}`;
}

/**
 * Duplicidade mensal por MM/AAAA e duplicidade anual de 13ª por exercício.
 * O banco repete a garantia com índices únicos parciais, inclusive sob concorrência.
 */
export function conflitoParcelaPiso(
  existentes: Array<Partial<IdentidadeParcelaPiso> & { competencia: string; id?: string }>,
  candidata: IdentidadeParcelaPiso,
  ignorarId?: string,
): boolean {
  return existentes.some((x) => {
    if (x.id === ignorarId) return false;
    const item = identidadeParcelaPiso(x);
    return candidata.tipo_parcela === item.tipo_parcela &&
      (candidata.tipo_parcela === "mensal"
        ? candidata.competencia === item.competencia
        : candidata.exercicio_referencia === item.exercicio_referencia);
  });
}

/** No 13º não presume prazos mensais de carga; aguarda cronograma oficial. */
export function prazoMensalAplicavelPiso(tipo?: string | null): boolean {
  return tipo !== "decimo_terceiro";
}
