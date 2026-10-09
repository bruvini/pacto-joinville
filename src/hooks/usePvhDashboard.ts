import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calcularSlaPvh, pendenciasPvh } from "@/lib/dashboard/pvh";

export function usePvhDashboard({
  prestador,
  convFiltro,
  termo,
  mesesSel,
  anoSel,
}: {
  prestador: string;
  convFiltro: string;
  termo: string;
  mesesSel: string[];
  anoSel: string;
}) {
  const competencias = useQuery({
    queryKey: ["dash-pvh-competencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_competencias")
        .select(
          "*,pvh_participantes(id,prestador_id,valor_estadual,valor_municipal,valor_pago,exige_prestacao_contas,notificar_email,prestadores(nome_instituicao))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Consulta dedicada: os 5.000 logs gerais do Dashboard incluem outros
  // módulos e podem eliminar conclusões antigas do PVH por truncamento.
  // Paginação estável mantém o histórico completo da competência no recorte.
  const historicoSla = useQuery({
    queryKey: ["dash-pvh-historico-sla"],
    queryFn: async () => {
      const lote = 1000;
      const todas: Array<{
        pvh_competencia_id: string | null;
        data_hora: string;
        acao: string;
        detalhes: unknown;
      }> = [];
      for (let pagina = 0; pagina < 100; pagina++) {
        const inicio = pagina * lote;
        const { data, error } = await supabase
          .from("historico_logs")
          .select("pvh_competencia_id,data_hora,acao,detalhes")
          .not("pvh_competencia_id", "is", null)
          .order("data_hora", { ascending: true })
          .order("id", { ascending: true })
          .range(inicio, inicio + lote - 1);
        if (error) throw error;
        todas.push(...(data ?? []));
        if ((data?.length ?? 0) < lote) return todas;
      }
      throw new Error("Histórico PVH muito extenso para cálculo integral do SLA.");
    },
  });

  const documentosAssinaturas = useQuery({
    queryKey: ["dash-pvh-documento-assinaturas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_documento_assinaturas")
        .select(
          "assinante_nome,cargo,assinado_em,revogado_em,pvh_documentos(competencia_id,created_at)",
        )
        .is("revogado_em", null)
        .order("assinado_em");
      if (error) throw error;
      return data ?? [];
    },
  });

  const empenhoAssinaturas = useQuery({
    queryKey: ["dash-pvh-empenho-assinaturas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_empenho_solicitacao_assinaturas")
        .select(
          "servidor_nome,cargo,assinado_em,revogado_em,pvh_empenhos(solicitacao_competencia_id,created_at)",
        )
        .is("revogado_em", null)
        .order("assinado_em");
      if (error) throw error;
      return data ?? [];
    },
  });

  const subempenhoAssinaturas = useQuery({
    queryKey: ["dash-pvh-subempenho-assinaturas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_subempenho_assinaturas")
        .select(
          "assinante_nome,cargo,assinado_em,revogado_em,pvh_subempenhos(created_at,pvh_empenho_alocacoes(pvh_participantes(competencia_id)))",
        )
        .is("revogado_em", null)
        .order("assinado_em");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtrado = useMemo(
    () =>
      (competencias.data ?? []).filter((competencia: any) => {
        if (convFiltro !== "all" || termo !== "all") return false;

        const participantes = competencia.pvh_participantes ?? [];
        if (
          prestador !== "all" &&
          !participantes.some((p: any) => p.prestador_id === prestador)
        ) {
          return false;
        }

        const [mes, ano] = String(competencia.competencia ?? "").split("/");
        if (mesesSel.length && !mesesSel.includes(mes)) return false;
        if (anoSel !== "all" && ano !== anoSel) return false;
        return true;
      }),
    [competencias.data, prestador, convFiltro, termo, mesesSel, anoSel],
  );

  const ids = useMemo(
    () => new Set(filtrado.map((competencia: any) => competencia.id)),
    [filtrado],
  );

  const totalPublicado = useMemo(
    () =>
      filtrado.reduce(
        (soma: number, competencia: any) =>
          soma +
          (competencia.pvh_participantes ?? []).reduce(
            (subtotal: number, participante: any) =>
              subtotal + Number(participante.valor_estadual ?? 0),
            0,
          ),
        0,
      ),
    [filtrado],
  );

  const totalPago = useMemo(
    () =>
      filtrado.reduce(
        (soma: number, competencia: any) =>
          soma +
          (competencia.pvh_participantes ?? []).reduce(
            (subtotal: number, participante: any) =>
              subtotal + Number(participante.valor_pago ?? 0),
            0,
          ),
        0,
      ),
    [filtrado],
  );

  const totalPrestacaoObrigatoria = useMemo(
    () =>
      filtrado.reduce(
        (soma: number, competencia: any) =>
          soma +
          (competencia.pvh_participantes ?? []).filter(
            (participante: any) =>
              participante.exige_prestacao_contas === true,
          ).length,
        0,
      ),
    [filtrado],
  );

  const pendencias = useMemo(() => pendenciasPvh(filtrado), [filtrado]);

  const assinaturasSla = useMemo(() => {
    const lista: Array<{
      competencia_id: string;
      origem_em?: string | null;
      cargo?: string | null;
      servidor_nome?: string | null;
      assinado_em?: string | null;
    }> = [];

    for (const assinatura of documentosAssinaturas.data ?? []) {
      const documento = Array.isArray((assinatura as any).pvh_documentos)
        ? (assinatura as any).pvh_documentos[0]
        : (assinatura as any).pvh_documentos;

      if (!documento?.competencia_id || !ids.has(documento.competencia_id))
        continue;

      lista.push({
        competencia_id: documento.competencia_id,
        origem_em: documento.created_at,
        cargo: (assinatura as any).cargo,
        servidor_nome: (assinatura as any).assinante_nome,
        assinado_em: (assinatura as any).assinado_em,
      });
    }

    for (const assinatura of empenhoAssinaturas.data ?? []) {
      const empenho = Array.isArray((assinatura as any).pvh_empenhos)
        ? (assinatura as any).pvh_empenhos[0]
        : (assinatura as any).pvh_empenhos;

      const competenciaId = empenho?.solicitacao_competencia_id;
      if (!competenciaId || !ids.has(competenciaId)) continue;

      lista.push({
        competencia_id: competenciaId,
        origem_em: empenho.created_at,
        cargo: (assinatura as any).cargo,
        servidor_nome: (assinatura as any).servidor_nome,
        assinado_em: (assinatura as any).assinado_em,
      });
    }

    for (const assinatura of subempenhoAssinaturas.data ?? []) {
      const sub = Array.isArray((assinatura as any).pvh_subempenhos)
        ? (assinatura as any).pvh_subempenhos[0]
        : (assinatura as any).pvh_subempenhos;
      const alocacao = Array.isArray(sub?.pvh_empenho_alocacoes)
        ? sub.pvh_empenho_alocacoes[0]
        : sub?.pvh_empenho_alocacoes;
      const participante = Array.isArray(alocacao?.pvh_participantes)
        ? alocacao.pvh_participantes[0]
        : alocacao?.pvh_participantes;
      const competenciaId = participante?.competencia_id;

      if (!competenciaId || !ids.has(competenciaId)) continue;

      lista.push({
        competencia_id: competenciaId,
        origem_em: sub?.created_at,
        cargo: (assinatura as any).cargo,
        servidor_nome: (assinatura as any).assinante_nome,
        assinado_em: (assinatura as any).assinado_em,
      });
    }

    return lista;
  }, [
    documentosAssinaturas.data,
    empenhoAssinaturas.data,
    subempenhoAssinaturas.data,
    ids,
  ]);

  return {
    competencias: competencias.data ?? [],
    filtrado,
    ids,
    totalPublicado,
    totalPago,
    totalPrestacaoObrigatoria,
    pendencias,
    assinaturasSla,
    historicoSla: historicoSla.data ?? [],
    calcularSla: () => calcularSlaPvh(filtrado, historicoSla.data ?? []),
    isLoading:
      competencias.isLoading ||
      documentosAssinaturas.isLoading ||
      empenhoAssinaturas.isLoading ||
      subempenhoAssinaturas.isLoading ||
      historicoSla.isLoading,
    isError:
      competencias.isError ||
      documentosAssinaturas.isError ||
      empenhoAssinaturas.isError ||
      subempenhoAssinaturas.isError ||
      historicoSla.isError,
  };
}
