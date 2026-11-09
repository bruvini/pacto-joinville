import { etapa1ProntaPvh } from "./etapa1";
import { linkValido } from "@/lib/sei";

type ValoresCompetencia = {
  portaria_estadual_numero?: string | null;
  portaria_estadual_data?: string | null;
  portaria_estadual_url?: string | null;
  status?: string | null;
};

type Participante = {
  id: string;
  valor_estadual?: number | null;
  valor_municipal?: number | null;
};

type Alocacao = {
  participante_id: string;
  valor_alocado?: number | null;
  pvh_empenhos?: {
    numero_ne?: string | null;
    status?: string | null;
  } | Array<{ numero_ne?: string | null; status?: string | null }> | null;
};

export function acessosCompetenciaPvh({
  competencia, participantes, alocacoes, concluidas, reconferir,
}: {
  competencia: ValoresCompetencia;
  participantes: Participante[];
  alocacoes: Alocacao[];
  concluidas: Record<string, boolean>;
  reconferir: number[];
}): Record<number, boolean> {
  if (competencia.status === "encerrada") {
    return Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i + 1, true]));
  }

  const etapa1Preenchida = etapa1ProntaPvh({
    numeroPortaria: competencia.portaria_estadual_numero ?? "",
    dataPortaria: competencia.portaria_estadual_data ?? "",
    linkOficial: linkValido(competencia.portaria_estadual_url)
      ? competencia.portaria_estadual_url ?? "" : "",
    valores: participantes.map((p) => Number(p.valor_estadual ?? 0)),
  });
  // A Etapa 4 pode ser preparada antes do ingresso no FMS, mas só quando
  // a cobertura está INTEGRAL, por instituição, usando NEs efetivamente emitidas.
  // Duas NEs complementares podem compor o mesmo valor oficial.
  const todosComNe = participantes.length > 0 &&
    participantes.every((p) => {
      const devido = Number(p.valor_municipal ?? p.valor_estadual ?? 0);
      if (devido <= 0) return false;
      const coberto = alocacoes.reduce((total, a) => {
        if (a.participante_id !== p.id || Number(a.valor_alocado ?? 0) <= 0) return total;
        const ne = Array.isArray(a.pvh_empenhos) ? a.pvh_empenhos[0] : a.pvh_empenhos;
        if (ne?.status !== "ativo" || !ne.numero_ne?.trim()) return total;
        return total + Number(a.valor_alocado ?? 0);
      }, 0);
      return Math.abs(coberto - devido) < 0.01;
    });

  const etapasValidas = (numeros: number[]) => numeros.every((etapa) =>
    concluidas[String(etapa)] === true && !reconferir.includes(etapa),
  );

  const etapa4Concluida = etapasValidas([4]);
  return {
    1: true,
    2: etapa1Preenchida,
    3: true,
    4: todosComNe,
    5: etapa4Concluida,
    6: etapa4Concluida,
    7: etapasValidas([1, 2, 3, 4, 5, 6]),
  };
}

export const justificativasAcessoPvh: Record<number, string> = {
  1: "",
  2: "Preencha e salve a Portaria estadual, a data, o link oficial e todos os valores da Etapa 1.",
  3: "",
  4: "A cobertura de cada instituição deve estar integralmente vinculada a NEs emitidas para preparar os subempenhos.",
  5: "Conclua e confirme a Etapa 4 para liberar pagamentos e comunicação.",
  6: "Conclua e confirme a Etapa 4 para liberar pagamentos e comunicação.",
  7: "Conclua as seis etapas anteriores, sem reconferências pendentes.",
};
