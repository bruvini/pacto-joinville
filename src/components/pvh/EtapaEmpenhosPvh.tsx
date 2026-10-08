import { Check, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiButton } from "@/components/inputs/SeiLink";
import { SolicitacaoEmpenhoModalPvh } from "@/components/pvh/SolicitacaoEmpenhoModalPvh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { assinaturasSolicitacaoEmpenhoCompletasPvh } from "@/lib/pvh/empenhos";
import { linkValido } from "@/lib/sei";

type ModalContexto = {
  prestadorId: string;
  participanteId: string;
  instituicaoNome: string;
  empenhoId?: string;
};

export function EtapaEmpenhosPvh({
  competenciaId,
  competencia,
  participantes,
  concluidas,
  reconferir,
  podeEditar,
}: {
  competenciaId: string;
  competencia: string;
  participantes: any[];
  concluidas: Record<string, boolean>;
  reconferir: number[];
  podeEditar: boolean;
}) {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalContexto | null>(null);
  const [alocacoesInput, setAlocacoesInput] = useState<Record<string, number | null>>({});

  const prestadorIds = participantes.map((participante) => participante.prestador_id);

  const empenhos = useQuery({
    queryKey: ["pvh_empenhos", prestadorIds],
    enabled: prestadorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_empenhos")
        .select(
          "*,pvh_processos_anuais(id,numero_sei,link_sei,ano,tipo),pvh_empenho_alocacoes(id,participante_id,valor_alocado,observacao,created_at)",
        )
        .in("prestador_id", prestadorIds)
        .neq("status", "cancelado")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const processos = useQuery({
    queryKey: ["pvh_processos_anuais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_processos_anuais")
        .select("*")
        .eq("ativo", true)
        .order("ano", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const assinaturas = useQuery({
    queryKey: ["pvh_empenho_solicitacao_assinaturas", prestadorIds],
    enabled: empenhos.isSuccess && (empenhos.data ?? []).length > 0,
    queryFn: async () => {
      const ids = (empenhos.data ?? []).map((empenho) => empenho.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("pvh_empenho_solicitacao_assinaturas")
        .select("*")
        .in("empenho_id", ids)
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
    qc.invalidateQueries({ queryKey: ["pvh_empenhos"] });
    qc.invalidateQueries({ queryKey: ["pvh_empenho_solicitacao_assinaturas"] });
    qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_participantes", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
  };

  const alocar = useMutation({
    mutationFn: async ({
      empenho,
      participante,
    }: {
      empenho: any;
      participante: any;
    }) => {
      const valor = Number(alocacoesInput[empenho.id] ?? 0);
      if (valor <= 0) throw new Error("Informe o valor que esta NE cobrirá nesta competência.");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("pvh_empenho_alocacoes").insert({
        empenho_id: empenho.id,
        participante_id: participante.id,
        valor_alocado: valor,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      invalidar();
      setAlocacoesInput((atual) => ({ ...atual, [vars.empenho.id]: null }));
      toast.success("Valor da NE alocado à competência.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const removerAlocacao = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pvh_empenho_alocacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Alocação removida.");
    },
    onError: (error: any) =>
      toast.error(
        error.code === "23503"
          ? "A alocação já possui subempenho vinculado e não pode ser removida."
          : error.message,
      ),
  });

  const empenhosPorPrestador = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const empenho of empenhos.data ?? []) {
      const lista = map.get(empenho.prestador_id) ?? [];
      lista.push(empenho);
      map.set(empenho.prestador_id, lista);
    }
    return map;
  }, [empenhos.data]);

  const coberturaPorParticipante = useMemo(() => {
    const map = new Map<string, number>();
    for (const empenho of empenhos.data ?? []) {
      if (empenho.status !== "ativo") continue;
      for (const alocacao of empenho.pvh_empenho_alocacoes ?? []) {
        map.set(
          alocacao.participante_id,
          (map.get(alocacao.participante_id) ?? 0) +
            Number(alocacao.valor_alocado ?? 0),
        );
      }
    }
    return map;
  }, [empenhos.data]);

  const concluidaSemReconferencia =
    concluidas["3"] === true && !reconferir.includes(3);

  const todosCobertos =
    participantes.length > 0 &&
    participantes.every((participante) => {
      const devido = Number(participante.valor_municipal ?? participante.valor_estadual ?? 0);
      const coberto = coberturaPorParticipante.get(participante.id) ?? 0;
      return devido > 0 && Math.abs(coberto - devido) < 0.01;
    });

  const concluir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("pvh_concluir_etapa3", {
        p_comp: competenciaId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Etapa 3 concluída: cobertura de empenho fechada.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const abrirNovo = (participante: any) => {
    const prestador = Array.isArray(participante.prestadores)
      ? participante.prestadores[0]
      : participante.prestadores;
    setModal({
      prestadorId: participante.prestador_id,
      participanteId: participante.id,
      instituicaoNome: prestador?.nome_instituicao ?? "Instituição",
    });
  };

  const abrirEdicao = (empenho: any, participante: any) => {
    const prestador = Array.isArray(participante.prestadores)
      ? participante.prestadores[0]
      : participante.prestadores;
    setModal({
      prestadorId: participante.prestador_id,
      participanteId: participante.id,
      instituicaoNome: prestador?.nome_instituicao ?? "Instituição",
      empenhoId: empenho.id,
    });
  };

  const empenhoModal = modal?.empenhoId
    ? (empenhos.data ?? []).find((item) => item.id === modal.empenhoId)
    : undefined;

  const carregando =
    empenhos.isLoading || processos.isLoading || pool.isLoading || assinaturas.isLoading;
  const erro =
    empenhos.isError || processos.isError || pool.isError || assinaturas.isError;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Etapa 3 · Empenhos e alocações</CardTitle>
          <CardDescription className="max-w-4xl">
            Primeiro registre e assine a Solicitação de Nota de Empenho; após o envio à
            SEFAZ.UCG.AEO, registre a NE emitida. Só então o valor fica disponível para alocação na
            competência.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {erro ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar a estrutura da Etapa 3. Aplique a migration mais recente do
              PVH e recarregue a competência.
            </div>
          ) : carregando ? (
            <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              Carregando solicitações, empenhos e assinaturas…
            </div>
          ) : (
            participantes.map((participante) => {
              const prestador = Array.isArray(participante.prestadores)
                ? participante.prestadores[0]
                : participante.prestadores;
              const devido = Number(
                participante.valor_municipal ?? participante.valor_estadual ?? 0,
              );
              const coberto = coberturaPorParticipante.get(participante.id) ?? 0;
              const restante = Math.max(0, devido - coberto);
              const lista = empenhosPorPrestador.get(participante.prestador_id) ?? [];

              return (
                <div key={participante.id} className="rounded-xl border">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 p-4">
                    <div>
                      <div className="font-semibold">
                        {prestador?.nome_instituicao ?? "Instituição"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Necessidade da competência: <b>{devido ? brl(devido) : "não informada"}</b>
                      </div>
                      <div className="mt-1 text-xs">
                        Coberto: <b>{brl(coberto)}</b> · Restante:{" "}
                        <b className={restante > 0.009 ? "text-amber-700" : "text-emerald-700"}>
                          {brl(restante)}
                        </b>
                      </div>
                    </div>

                    {podeEditar && (
                      <Button size="sm" variant="outline" onClick={() => abrirNovo(participante)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nova solicitação de NE
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3 p-4">
                    {lista.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        Nenhuma Solicitação de NE ou Nota de Empenho cadastrada para esta instituição.
                      </div>
                    ) : (
                      lista.map((empenho) => {
                        const alocacoes = empenho.pvh_empenho_alocacoes ?? [];
                        const totalAlocado = alocacoes.reduce(
                          (soma: number, alocacao: any) =>
                            soma + Number(alocacao.valor_alocado ?? 0),
                          0,
                        );
                        const valorTotal = Number(empenho.valor_total ?? 0);
                        const saldo = Math.max(0, valorTotal - totalAlocado);
                        const atual = alocacoes.find(
                          (alocacao: any) => alocacao.participante_id === participante.id,
                        );
                        const assinaturasEmpenho = (assinaturas.data ?? []).filter(
                          (assinatura) => assinatura.empenho_id === empenho.id,
                        );
                        const assinaturasOk =
                          assinaturasSolicitacaoEmpenhoCompletasPvh(assinaturasEmpenho);
                        const novoFluxo = Boolean(empenho.solicitacao_competencia_id);
                        const envioOk =
                          !novoFluxo || empenho.solicitacao_enviada_sefaz === true;
                        const neEmitida =
                          empenho.status === "ativo" &&
                          Boolean(empenho.numero_ne) &&
                          valorTotal > 0;
                        const podeAlocar = neEmitida && envioOk;

                        return (
                          <div key={empenho.id} className="rounded-lg border p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold">
                                    {neEmitida
                                      ? `NE ${empenho.numero_ne}`
                                      : `Solicitação de NE · SEI ${empenho.solicitacao_sei_numero ?? "pendente"}`}
                                  </span>

                                  {neEmitida ? (
                                    <Badge className="bg-success text-success-foreground">
                                      NE emitida
                                    </Badge>
                                  ) : empenho.solicitacao_enviada_sefaz ? (
                                    <Badge variant="secondary">Aguardando NE</Badge>
                                  ) : assinaturasOk ? (
                                    <Badge variant="outline">Pronta para envio</Badge>
                                  ) : (
                                    <Badge variant="outline">Em preparação</Badge>
                                  )}

                                  {novoFluxo && neEmitida && !envioOk && (
                                    <Badge variant="destructive">Reconfirmar solicitação</Badge>
                                  )}
                                </div>

                                <div className="mt-1 text-xs text-muted-foreground">
                                  Dotação/CR: {empenho.cr_dotacao ?? "—"} · Fonte:{" "}
                                  {empenho.fonte_recurso ?? "—"}
                                </div>

                                {neEmitida && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    Valor total {brl(valorTotal)} · Alocado globalmente{" "}
                                    {brl(totalAlocado)} · Saldo {brl(saldo)}
                                  </div>
                                )}

                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {linkValido(empenho.solicitacao_sei_link) && (
                                    <SeiButton
                                      href={empenho.solicitacao_sei_link}
                                      label="Solicitação"
                                    />
                                  )}
                                  {linkValido(empenho.nota_empenho_sei_link) && (
                                    <SeiButton
                                      href={empenho.nota_empenho_sei_link}
                                      label="Nota de Empenho"
                                    />
                                  )}
                                </div>
                              </div>

                              {podeEditar && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => abrirEdicao(empenho, participante)}
                                >
                                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                  Editar fluxo
                                </Button>
                              )}
                            </div>

                            <div className="mt-3 rounded-md bg-muted/20 p-3">
                              {!neEmitida ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Send className="h-4 w-4 shrink-0" />
                                  {empenho.solicitacao_enviada_sefaz
                                    ? "Solicitação enviada à SEFAZ.UCG.AEO; aguardando a Nota de Empenho."
                                    : "Finalize as assinaturas e confirme o envio à SEFAZ.UCG.AEO."}
                                </div>
                              ) : !envioOk ? (
                                <div className="text-sm text-destructive">
                                  A Solicitação foi alterada após o envio. Reconfirme o encaminhamento
                                  antes de usar esta NE.
                                </div>
                              ) : atual ? (
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="text-sm">
                                    Alocação nesta competência: <b>{brl(atual.valor_alocado)}</b>
                                  </div>
                                  {podeEditar && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() =>
                                        confirm(
                                          "Remover esta alocação? Isso só é possível antes de existir subempenho vinculado.",
                                        ) && removerAlocacao.mutate(atual.id)
                                      }
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Remover
                                    </Button>
                                  )}
                                </div>
                              ) : podeEditar && podeAlocar ? (
                                <div className="flex flex-wrap items-end gap-2">
                                  <div className="min-w-52 flex-1">
                                    <Label className="text-xs">
                                      Valor desta NE para {competencia}
                                    </Label>
                                    <CurrencyInput
                                      value={alocacoesInput[empenho.id] ?? null}
                                      onChange={(valor) =>
                                        setAlocacoesInput({
                                          ...alocacoesInput,
                                          [empenho.id]: valor || null,
                                        })
                                      }
                                      placeholder={
                                        saldo > 0 && restante > 0
                                          ? brl(Math.min(saldo, restante))
                                          : "R$ 0,00"
                                      }
                                    />
                                  </div>
                                  <Button
                                    size="sm"
                                    disabled={
                                      saldo <= 0.009 ||
                                      Number(alocacoesInput[empenho.id] ?? 0) <= 0 ||
                                      alocar.isPending
                                    }
                                    onClick={() => alocar.mutate({ empenho, participante })}
                                  >
                                    Alocar à competência
                                  </Button>
                                </div>
                              ) : (
                                <div className="text-sm text-muted-foreground">
                                  Esta NE não possui alocação nesta competência.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}

          {podeEditar && !erro && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <p className="max-w-3xl text-[11px] text-muted-foreground">
                A Etapa 3 fecha quando todas as instituições estão integralmente cobertas por NEs
                emitidas e rastreadas. Solicitações ainda aguardando emissão não entram na cobertura.
              </p>
              <Button
                onClick={() => concluir.mutate()}
                disabled={!todosCobertos || concluidaSemReconferencia || concluir.isPending}
              >
                <Check className="mr-2 h-4 w-4" />
                {reconferir.includes(3)
                  ? "Reconferir e concluir Etapa 3"
                  : concluidas["3"]
                    ? "Etapa 3 concluída"
                    : "Concluir Etapa 3"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {modal && (
        <SolicitacaoEmpenhoModalPvh
          open={Boolean(modal)}
          onOpenChange={(aberto) => {
            if (!aberto) setModal(null);
          }}
          competenciaId={competenciaId}
          competencia={competencia}
          prestadorId={modal.prestadorId}
          instituicaoNome={modal.instituicaoNome}
          empenho={empenhoModal}
          processos={processos.data ?? []}
          assinaturas={assinaturas.data ?? []}
          pool={pool.data ?? []}
          podeEditar={podeEditar}
          onCreated={(id) =>
            setModal((atual) => (atual ? { ...atual, empenhoId: id } : atual))
          }
          onChange={invalidar}
        />
      )}
    </>
  );
}
