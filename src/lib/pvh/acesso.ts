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
  // Só libera a 4 quando CADA instituição tem uma NE emitida e com
  // cobertura positiva. Não confunde solicitação pendente com NE emitida.
  const todosComNe = participantes.length > 0 &&
    participantes.every((p) => alocacoes.some((a) => {
      if (a.participante_id !== p.id || Number(a.valor_alocado ?? 0) <= 0) return false;
      const ne = Array.isArray(a.pvh_empenhos) ? a.pvh_empenhos[0] : a.pvh_empenhos;
      return ne?.status === "ativo" && Boolean(ne.numero_ne?.trim());
    }));

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
  4: "Todas as instituições precisam ter uma Nota de Empenho emitida e vinculada na Etapa 3.",
  5: "Conclua e confirme a Etapa 4 para liberar pagamentos e comunicação.",
  6: "Conclua e confirme a Etapa 4 para liberar pagamentos e comunicação.",
  7: "Conclua as seis etapas anteriores, sem reconferências pendentes.",
};
