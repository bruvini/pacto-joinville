import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { CadeiaSubempenhoPvh } from "@/components/pvh/CadeiaSubempenhoPvh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { linkValido } from "@/lib/sei";
import {
  coberturaSubempenhoFechadaPvh,
  saldoSubempenharPvh,
  totalSubempenhadoPvh,
} from "@/lib/pvh/subempenhos";

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

  const criarFluxo = useMutation({
    mutationFn: async ({
      alocacaoId,
      valor,
    }: {
      alocacaoId: string;
      valor: number;
    }) => {
      if (!Number.isFinite(valor) || valor <= 0.009) {
        throw new Error("Não existe saldo de alocação disponível para um novo fluxo.");
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("pvh_subempenhos").insert({
        alocacao_id: alocacaoId,
        valor,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Fluxo de subempenho criado para a Nota de Empenho.");
    },
    onError: (error: any) => toast.error(error.message),
  });

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
      return (
        coberturaSubempenhoFechadaPvh(
          Number(alocacao.valor_alocado ?? 0),
          subs,
        ) && subs.every(cadeiaCompleta)
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
          Cada Nota de Empenho utilizada na competência precisa de sua própria
          cadeia de Subempenho/Liquidação. Se a instituição utilizar duas NEs,
          a etapa exigirá dois fluxos independentes. Uma mesma NE também pode
          ter mais de um fluxo quando o valor for fracionado; a soma dos fluxos
          deve fechar exatamente o valor alocado daquela NE.
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
              return (
                coberturaSubempenhoFechadaPvh(
                  Number(item.valor_alocado ?? 0),
                  subs,
                ) && subs.every(cadeiaCompleta)
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

                <div className="space-y-4 p-4">
                  {itens.map((alocacao: any) => {
                    const empenho = Array.isArray(alocacao.pvh_empenhos)
                      ? alocacao.pvh_empenhos[0]
                      : alocacao.pvh_empenhos;
                    const subs = [...(alocacao.pvh_subempenhos ?? [])].sort(
                      (a: any, b: any) =>
                        new Date(a.created_at).getTime() -
                        new Date(b.created_at).getTime(),
                    );
                    const valorAlocado = Number(alocacao.valor_alocado ?? 0);
                    const totalSubempenhado = totalSubempenhadoPvh(subs);
                    const restanteAlocacao = saldoSubempenharPvh(
                      valorAlocado,
                      subs,
                    );

                    return (
                      <div
                        key={alocacao.id}
                        className="rounded-xl border bg-muted/10 p-3"
                      >
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">
                              NE {empenho?.numero_ne ?? "—"} · {brl(valorAlocado)}
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              Subempenhado nesta NE: {brl(totalSubempenhado)} ·
                              saldo a estruturar: {brl(restanteAlocacao)}
                            </div>
                          </div>
                          <Badge
                            variant={restanteAlocacao < 0.01 && subs.length > 0
                              ? "default"
                              : "outline"}
                          >
                            {subs.length === 0
                              ? "Fluxo não iniciado"
                              : restanteAlocacao < 0.01
                                ? `${subs.length} fluxo(s) · valor fechado`
                                : `${subs.length} fluxo(s) · saldo pendente`}
                          </Badge>
                        </div>

                        {subs.length === 0 ? (
                          <div className="rounded-lg border border-dashed bg-background p-4">
                            <p className="text-xs text-muted-foreground">
                              Esta Nota de Empenho ainda não possui fluxo de
                              Subempenho/Liquidação. A Etapa 4 não poderá ser
                              concluída enquanto cada NE utilizada não tiver sua
                              cadeia documental.
                            </p>
                            {podeEditar && (
                              <Button
                                className="mt-3"
                                size="sm"
                                variant="outline"
                                disabled={criarFluxo.isPending}
                                onClick={() =>
                                  criarFluxo.mutate({
                                    alocacaoId: alocacao.id,
                                    valor: valorAlocado,
                                  })
                                }
                              >
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                Iniciar fluxo desta NE
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {subs.map((sub: any, index: number) => (
                              <CadeiaSubempenhoPvh
                                key={sub.id}
                                alocacao={alocacao}
                                subempenho={sub}
                                indice={index + 1}
                                assinaturas={assinaturas.data ?? []}
                                pool={pool.data ?? []}
                                podeEditar={podeEditar}
                                onChange={invalidar}
                              />
                            ))}

                            {podeEditar && restanteAlocacao > 0.009 && (
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={criarFluxo.isPending}
                                  onClick={() =>
                                    criarFluxo.mutate({
                                      alocacaoId: alocacao.id,
                                      valor: restanteAlocacao,
                                    })
                                  }
                                >
                                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                                  Adicionar fluxo complementar · {brl(restanteAlocacao)}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
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
