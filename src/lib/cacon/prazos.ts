import { ordemCompetenciaCacon } from "@/lib/cacon/etapas";

export type PendenciaCompetenciaCacon = {
  id: string;
  prestadorId: string;
  prestadorNome: string;
  competencia: string;
  prazo: Date;
  dias: number;
  severidade: "critico" | "alerta" | "preventivo";
  motivo: string;
};

const soData = (data: Date) =>
  new Date(data.getFullYear(), data.getMonth(), data.getDate());

const diasEntre = (de: Date, ate: Date) =>
  Math.floor((soData(ate).getTime() - soData(de).getTime()) / 86_400_000);

const compParaIndice = (comp: string) => {
  const [mes, ano] = String(comp ?? "").split("/").map(Number);
  if (!mes || !ano) return null;
  return ano * 12 + (mes - 1);
};

const indiceParaComp = (indice: number) => {
  const ano = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  return `${String(mes).padStart(2, "0")}/${ano}`;
};

const fimMesIndice = (indice: number) => {
  const ano = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  return new Date(ano, mes, 0);
};

/**
 * Uma instituição que já entrou no fluxo CACON passa a ter competência mensal.
 * Lacuna de mês encerrado = crítica. Mês corrente ausente = preventivo e,
 * nos últimos 7 dias do mês, alerta.
 */
export function pendenciasCompetenciasCaconMensais(
  competencias: any[],
  hoje: Date = new Date(),
): PendenciaCompetenciaCacon[] {
  const grupos = new Map<
    string,
    { nome: string; indices: Set<number>; primeiro: number }
  >();

  for (const registro of competencias ?? []) {
    const indice = compParaIndice(registro.competencia);
    if (indice == null || !registro.prestador_id) continue;

    const nome =
      registro.prestadores?.nome_instituicao ??
      registro.prestador_nome ??
      "Instituição";
    const atual = grupos.get(registro.prestador_id);

    if (!atual) {
      grupos.set(registro.prestador_id, {
        nome,
        indices: new Set([indice]),
        primeiro: indice,
      });
    } else {
      atual.indices.add(indice);
      atual.primeiro = Math.min(atual.primeiro, indice);
      if (atual.nome === "Instituição" && nome !== "Instituição") atual.nome = nome;
    }
  }

  const indiceAtual = hoje.getFullYear() * 12 + hoje.getMonth();
  const saida: PendenciaCompetenciaCacon[] = [];

  for (const [prestadorId, grupo] of grupos) {
    for (let indice = grupo.primeiro; indice <= indiceAtual; indice += 1) {
      if (grupo.indices.has(indice)) continue;

      const competencia = indiceParaComp(indice);
      const prazo = fimMesIndice(indice);
      const dias = diasEntre(hoje, prazo);
      const passado = indice < indiceAtual;
      const severidade = passado
        ? "critico"
        : dias <= 7
          ? "alerta"
          : "preventivo";

      saida.push({
        id: `cacon-abertura-${prestadorId}-${competencia}`,
        prestadorId,
        prestadorNome: grupo.nome,
        competencia,
        prazo,
        dias,
        severidade,
        motivo: passado
          ? `A competência ${competencia} encerrou sem registro da Dieta CACON`
          : `Abrir a competência ${competencia} da Dieta CACON até o fim do mês`,
      });
    }
  }

  return saida.sort((a, b) => {
    const comp =
      ordemCompetenciaCacon(a.competencia) - ordemCompetenciaCacon(b.competencia);
    return comp || a.prestadorNome.localeCompare(b.prestadorNome, "pt-BR");
  });
}
