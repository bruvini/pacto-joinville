import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { CadeiaSubempenhoPvh } from "@/components/pvh/CadeiaSubempenhoPvh";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { linkValido } from "@/lib/sei";

export function EtapaSubempenhosPvh({
  competenciaId,
  participantes,
  concluidas,
  reconferir,
  podeEditar,
  recursoFmsCompleto,
}: {
  competenciaId: string;
  competencia: string;
  participantes: any[];
  concluidas: Record<string, boolean>;
  reconferir: number[];
  podeEditar: boolean;
  recursoFmsCompleto: boolean;
}) {
  const qc = useQueryClient();
  const autoConclusaoEmCurso = useRef(false);
  const participanteIds = participantes.map((item) => item.id);

  const alocacoes = useQuery({
    queryKey: ["pvh_alocacoes_competencia", competenciaId],
    enabled: participanteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_empenho_alocacoes")
        .select(
          "*,pvh_empenhos(id,numero_ne,valor_total,prestador_id),pvh_participantes(id,prestador_id,valor_estadual,valor_municipal,prestadores(id,nome_instituicao)),pvh_subempenhos(*)",
        )
        .in("participante_id", participanteIds)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const idsSub = (alocacoes.data ?? []).flatMap((alocacao: any) =>
    (alocacao.pvh_subempenhos ?? []).map((sub: any) => sub.id),
  );

  const assinaturas = useQuery({
    queryKey: ["pvh_subempenho_assinaturas", competenciaId, idsSub.join("|")],
    enabled: idsSub.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_subempenho_assinaturas")
        .select("*")
        .in("subempenho_id", idsSub)
        .order("assinado_em");
      if (error) throw error;
      return data ?? [];
    },
  });

  const pool = useQuery({
    queryKey: ["assinaturas_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assinaturas_config")
        .select("*")
        .eq("ativo", true)
        .order("ordem")
        .order("nome_servidor");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["pvh_alocacoes_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_subempenho_assinaturas"] });
    qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
  };

  const assinaturaComissao = (
    subId: string,
    documentoTipo: "solicitacao" | "movimento_liquidacao",
  ) =>
    (assinaturas.data ?? []).some(
      (item: any) =>
        item.subempenho_id === subId &&
        item.documento_tipo === documentoTipo &&
        item.slot === "comissao" &&
        !item.revogado_em,
    );

  const cadeiaCompleta = (sub: any) =>
    Boolean(
      sub?.solicitacao_sei_numero?.trim() &&
        linkValido(sub?.solicitacao_sei_link) &&
        assinaturaComissao(sub.id, "solicitacao") &&
        sub?.movimento_liquidacao_sei_numero?.trim() &&
        linkValido(sub?.movimento_liquidacao_sei_link) &&
        assinaturaComissao(sub.id, "movimento_liquidacao") &&
        sub?.movimento_liquidacao_encaminhado_sefaz === true &&
        sub?.movimento_subempenho_sei_numero?.trim() &&
        linkValido(sub?.movimento_subempenho_sei_link),
    );

  const alocacoesCompletas =
    (alocacoes.data ?? []).length > 0 &&
    (alocacoes.data ?? []).every((alocacao: any) => {
      const subs = alocacao.pvh_subempenhos ?? [];
      const total = subs.reduce(
        (soma: number, sub: any) => soma + Number(sub.valor ?? 0),
        0,
      );
      return (
        subs.length > 0 &&
        Math.abs(total - Number(alocacao.valor_alocado ?? 0)) < 0.01 &&
        subs.every(cadeiaCompleta)
      );
    });

  const concluir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("pvh_concluir_etapa4", {
        p_comp: competenciaId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success(
        reconferir.includes(4)
          ? "Etapa 4 reconferida."
          : "Etapa 4 concluída para todas as instituições.",
      );
    },
    onError: (error: any) => {
      autoConclusaoEmCurso.current = false;
      toast.error(error.message);
    },
  });

  useEffect(() => {
    const jaConcluidaSemReconferencia =
      concluidas["4"] === true && !reconferir.includes(4);

    if (jaConcluidaSemReconferencia) {
      autoConclusaoEmCurso.current = false;
      return;
    }

    if (reconferir.includes(4)) {
      autoConclusaoEmCurso.current = false;
    }

    if (
      !podeEditar ||
      !recursoFmsCompleto ||
      !alocacoesCompletas ||
      concluir.isPending ||
      autoConclusaoEmCurso.current
    ) {
      return;
    }

    autoConclusaoEmCurso.current = true;
    concluir.mutate();
  }, [
    podeEditar,
    recursoFmsCompleto,
    alocacoesCompletas,
    concluidas["4"],
    reconferir,
    concluir.isPending,
  ]);

  const carregando =
    alocacoes.isLoading || assinaturas.isLoading || pool.isLoading;
  const erro = alocacoes.isError || assinaturas.isError || pool.isError;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Etapa 4 · Subempenho e liquidação
        </CardTitle>
        <CardDescription className="max-w-4xl text-xs">
          Para cada instituição, acompanhe a cadeia da Solicitação de
          Subempenho/Liquidação até o Aviso de Movimento — Subempenho. Quando
          houver mais de uma NE na competência, cada cobertura mantém sua
          própria cadeia documental.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!recursoFmsCompleto && (
          <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
            O crédito no FMS ainda não está completo na Etapa 2. A cadeia pode
            ser consultada, mas a Etapa 4 só pode ser concluída depois desse
            marco financeiro.
          </div>
        )}

        {erro ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            A estrutura operacional da Etapa 4 ainda não está disponível no banco.
            Aplique a migration mais recente do PVH.
          </div>
        ) : carregando ? (
          <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            Carregando cadeias de subempenho…
          </div>
        ) : (alocacoes.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            Nenhuma cobertura de empenho foi vinculada a esta competência.
          </div>
        ) : (
          participantes.map((participante) => {
            const prestador = Array.isArray(participante.prestadores)
              ? participante.prestadores[0]
              : participante.prestadores;
            const itens = (alocacoes.data ?? []).filter(
              (alocacao: any) => alocacao.participante_id === participante.id,
            );
            if (!itens.length) return null;

            const valorCoberto = itens.reduce(
              (soma: number, item: any) =>
                soma + Number(item.valor_alocado ?? 0),
              0,
            );
            const completo = itens.every((item: any) => {
              const subs = item.pvh_subempenhos ?? [];
              const total = subs.reduce(
                (soma: number, sub: any) => soma + Number(sub.valor ?? 0),
                0,
              );
              return (
                subs.length > 0 &&
                Math.abs(total - Number(item.valor_alocado ?? 0)) < 0.01 &&
                subs.every(cadeiaCompleta)
              );
            });

            return (
              <section key={participante.id} className="rounded-xl border">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 p-4">
                  <div>
                    <div className="font-semibold">
                      {prestador?.nome_instituicao ?? "Instituição"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Cobertura da competência: {brl(valorCoberto)}
                    </div>
                  </div>
                  <Badge variant={completo ? "default" : "outline"}>
                    {completo ? "Instituição completa" : "Pendente"}
                  </Badge>
                </div>

                <div className="space-y-3 p-4">
                  {itens.flatMap((alocacao: any) => {
                    const subs = alocacao.pvh_subempenhos ?? [];
                    if (!subs.length) {
                      return [
                        <CadeiaSubempenhoPvh
                          key={alocacao.id}
                          alocacao={alocacao}
                          assinaturas={assinaturas.data ?? []}
                          pool={pool.data ?? []}
                          podeEditar={podeEditar}
                          onChange={invalidar}
                        />,
                      ];
                    }

                    return subs.map((sub: any) => (
                      <CadeiaSubempenhoPvh
                        key={sub.id}
                        alocacao={alocacao}
                        subempenho={sub}
                        assinaturas={assinaturas.data ?? []}
                        pool={pool.data ?? []}
                        podeEditar={podeEditar}
                        onChange={invalidar}
                      />
                    ));
                  })}
                </div>
              </section>
            );
          })
        )}

        {podeEditar && !erro && alocacoesCompletas && recursoFmsCompleto && (
          <div className="border-t pt-3 text-right text-xs text-muted-foreground">
            {concluir.isPending
              ? "Todas as cadeias estão completas. Concluindo a Etapa 4 automaticamente…"
              : concluidas["4"] === true && !reconferir.includes(4)
                ? "Etapa 4 concluída automaticamente."
                : "Todas as cadeias estão completas; a conclusão será registrada automaticamente."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
