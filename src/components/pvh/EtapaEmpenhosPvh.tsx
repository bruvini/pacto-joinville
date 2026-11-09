import { ArrowRight, Check, FileDown, Pencil, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SeiButton } from "@/components/inputs/SeiLink";
import { SolicitacaoEmpenhoModalPvh } from "@/components/pvh/SolicitacaoEmpenhoModalPvh";
import { ReutilizarEmpenhoDialogPvh } from "@/components/pvh/ReutilizarEmpenhoDialogPvh";
import { AnulacaoResidualPvh } from "@/components/pvh/AnulacaoResidualPvh";
import { construirExtratoNePvh } from "@/lib/pvh/anulacao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import {
  assinaturasSolicitacaoEmpenhoCompletasPvh,
  empenhoDisponivelParaReaproveitamentoPvh,
  empenhoRelacionadoCompetenciaPvh,
  empenhoAbrangeMesPvh,
  saldoDisponivelEmpenhoPvh,
  solicitacaoEmpenhoProntaPvh,
  totalAlocadoEmpenhoPvh,
} from "@/lib/pvh/empenhos";
import { linkValido } from "@/lib/sei";

type ModalContexto = {
  prestadorId: string;
  participanteId: string;
  instituicaoNome: string;
  empenhoId?: string;
};

type ReutilizarContexto = {
  prestadorId: string;
  participanteId: string;
  instituicaoNome: string;
  restante: number;
  necessidadeInformada: boolean;
};

export function EtapaEmpenhosPvh({
  competenciaId,
  competencia,
  participantes,
  concluidas,
  reconferir,
  podeEditar,
  podeAnular = false,
  onConcluida,
  onPreparada,
}: {
  competenciaId: string;
  competencia: string;
  participantes: any[];
  concluidas: Record<string, boolean>;
  reconferir: number[];
  podeEditar: boolean;
  podeAnular?: boolean;
  onConcluida?: () => void;
  onPreparada?: () => void;
}) {
  const qc = useQueryClient();
  const autoSincronizadoRef = useRef<string | null>(null);
  const [modal, setModal] = useState<ModalContexto | null>(null);
  const [reutilizar, setReutilizar] = useState<ReutilizarContexto | null>(null);

  const prestadorIds = participantes.map((participante) => participante.prestador_id);

  const empenhos = useQuery({
    queryKey: ["pvh_empenhos", competenciaId, prestadorIds],
    enabled: prestadorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_empenhos")
        .select(
          "*,prestadores(nome_instituicao),pvh_processos_anuais(id,numero_sei,link_sei,ano,tipo),pvh_competencias!pvh_empenhos_solicitacao_competencia_id_fkey(id,competencia),pvh_empenho_competencias(competencia,origem_vinculo),pvh_empenho_anulacoes(valor_anulado,data_anulacao,numero_sei,link_sei,motivo),pvh_empenho_alocacoes(id,participante_id,valor_alocado,observacao,created_at)",
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
    queryKey: ["pvh_empenho_solicitacao_assinaturas", competenciaId, prestadorIds],
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
    // Ao vincular ou utilizar saldo de uma NE, descarta também o
    // snapshot das alocações e a preparação da Etapa 4.
    qc.invalidateQueries({ queryKey: ["pvh_alocacoes_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_alocacoes_acesso", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_preparar_etapa4", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_empenho_solicitacao_assinaturas"] });
    qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_participantes", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
  };

  // Calcula apenas a cobertura faltante; não cria subempenhos automaticamente.
  // A RPC exige Portaria Estadual concluída e Portaria Municipal publicada.
  const alocarAutomaticamente = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc(
        "pvh_sincronizar_cobertura_competencia",
        { p_comp: competenciaId },
      );
      if (error) throw error;
      return data as { situacao?: string; alocado?: number; faltante?: number };
    },
    onSuccess: (data) => {
      if (Number(data?.alocado ?? 0) > 0) {
        invalidar();
        toast.success("Cobertura vinculada automaticamente pelas NEs mais antigas elegíveis.");
      }
    },
    onError: (error: any) => toast.error(
      "Não foi possível sincronizar as NEs previstas: " + error.message,
    ),
  });

  useEffect(() => {
    if (!podeEditar || !concluidas["1"] || reconferir.includes(1) ||
        participantes.length === 0 || autoSincronizadoRef.current === competenciaId) return;
    autoSincronizadoRef.current = competenciaId;
    alocarAutomaticamente.mutate();
  // Uma tentativa por montagem; mudanças da Portaria Municipal são conferidas pelo banco.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competenciaId, podeEditar, concluidas["1"], reconferir.includes(1), participantes.length]);

  const usarSaldo = useMutation({
    mutationFn: async ({
      empenhoId,
      participanteId,
    }: {
      empenhoId: string;
      participanteId: string;
    }) => {
      const { data, error } = await supabase.rpc("pvh_alocar_saldo_empenho", {
        p_empenho: empenhoId,
        p_participante: participanteId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (valor) => {
      invalidar();
      toast.success(
        valor > 0
          ? "Saldo da NE vinculado à competência."
          : "Não há saldo ou necessidade restante para vincular.",
      );
    },
    onError: (error: any) => toast.error(error.message),
  });

  const excluirFluxo = useMutation({
    mutationFn: async ({
      empenhoId,
    }: {
      empenhoId: string;
    }) => {
      const { error } = await supabase.rpc("pvh_excluir_fluxo_empenho", {
        p_empenho: empenhoId,
        p_comp: competenciaId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Fluxo de empenho excluído.");
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

  const excluirOrfao = useMutation({
    mutationFn: async (empenhoId: string) => {
      const { error } = await supabase.rpc("pvh_excluir_empenho_orfao", {
        p_empenho: empenhoId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Registro de empenho sem vínculo excluído.");
    },
    onError: (error: any) => toast.error(error.message),
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

  // Recupera competências com NEs emitidas mas sem alocações persistidas.
  // A RPC oficial reequilibra o valor sem duplicar saldos nem criar outra NE,
  // e prepara as cadeias de subempenho sem antecipar pagamento.
  const sincronizarCobertura = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("pvh_preparar_etapa4", {
        p_comp: competenciaId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pvh_alocacoes_acesso", competenciaId] }),
        qc.invalidateQueries({ queryKey: ["pvh_empenhos"] }),
        qc.invalidateQueries({ queryKey: ["pvh_alocacoes_competencia", competenciaId] }),
        qc.invalidateQueries({ queryKey: ["pvh_preparar_etapa4", competenciaId] }),
      ]);
      toast.success("Cobertura das NEs sincronizada. Etapa 4 preparada para lançamento.");
      onPreparada?.();
    },
    onError: (error: any) => toast.error(
      "Não foi possível vincular a cobertura: " + error.message,
    ),
  });

  const emissaoSemCobertura = !todosCobertos && participantes.some((participante) => {
    const devido = Number(participante.valor_municipal ?? participante.valor_estadual ?? 0);
    const coberto = coberturaPorParticipante.get(participante.id) ?? 0;
    return devido > coberto + 0.009 &&
      (empenhosPorPrestador.get(participante.prestador_id) ?? []).some((e) =>
        (e.solicitacao_competencia_id === competenciaId ||
          empenhoAbrangeMesPvh(e, competencia)) &&
        e.status === "ativo" && Boolean(e.numero_ne?.trim()) &&
        Number(e.valor_total ?? 0) > 0);
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
      onConcluida?.();
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

  const abrirReutilizacao = (participante: any, restante: number) => {
    const prestador = Array.isArray(participante.prestadores)
      ? participante.prestadores[0]
      : participante.prestadores;
    setReutilizar({
      prestadorId: participante.prestador_id,
      participanteId: participante.id,
      instituicaoNome: prestador?.nome_instituicao ?? "Instituição",
      restante,
      necessidadeInformada:
        Number(
          participante.valor_municipal ??
            participante.valor_estadual ??
            0,
        ) > 0,
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

  const exportarExtrato = () => {
    const ano = Number(competencia.slice(-4));
    const csv = construirExtratoNePvh(empenhos.data ?? [], ano);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pvh_extrato_ne_${ano}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Etapa 3 · Empenhos e alocações</CardTitle>
          <CardDescription className="max-w-4xl">
            Registre a Solicitação de Nota de Empenho, confirme o envio para SES.UFI.ACO, recolha as
            três assinaturas obrigatórias — Coordenador de Orçamentos, Comissão de Gestão e Controle
            de Despesa e Diretor Financeiro — e só então encaminhe para SEFAZ.UCG.AEO. Fiscal,
            Gerente/Coordenador e Diretor de Serviços Complementares permanecem opcionais. Ao registrar
            cada NE, o sistema usa somente o valor efetivamente emitido e as competências
            autorizadas na solicitação. A cobertura usa primeiro a NE mais antiga com saldo;
            se faltar, outra NE complementa. Vínculos já documentados não são redistribuídos
            automaticamente e nenhum valor é reservado antecipadamente para meses futuros.
          </CardDescription>
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" disabled={carregando || erro}
              onClick={exportarExtrato}>
              <FileDown className="mr-2 h-4 w-4" />
              Extrato consolidado das NEs (CSV)
            </Button>
          </div>
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
              const todosEmpenhosPrestador =
                empenhosPorPrestador.get(participante.prestador_id) ?? [];
              const lista = todosEmpenhosPrestador.filter((empenho) =>
                empenhoRelacionadoCompetenciaPvh(
                  empenho,
                  competenciaId,
                  participante.id,
                  competencia,
                ),
              );
              const disponiveis = todosEmpenhosPrestador.filter((empenho) =>
                empenhoDisponivelParaReaproveitamentoPvh(
                  empenho,
                  competenciaId,
                  participante.id,
                  competencia,
                ),
              );

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
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={disponiveis.length === 0}
                          onClick={() => abrirReutilizacao(participante, restante)}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Reutilizar nota
                          {disponiveis.length > 0 && (
                            <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                              {disponiveis.length}
                            </Badge>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => abrirNovo(participante)}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Cadastrar nova solicitação/nota
                        </Button>
                      </div>
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
                        const totalAlocado = totalAlocadoEmpenhoPvh(empenho);
                        const valorTotal = Number(empenho.valor_total ?? 0);
                        const saldo = saldoDisponivelEmpenhoPvh(empenho);
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
                        const solicitacaoPronta =
                          solicitacaoEmpenhoProntaPvh(empenho);
                        const neEmitida =
                          empenho.status === "ativo" &&
                          Boolean(empenho.numero_ne) &&
                          valorTotal > 0;
                        const podeUsarSaldo = neEmitida && envioOk && saldo > 0.009 && restante > 0.009;
                        const fluxoDaCompetencia =
                          empenho.solicitacao_competencia_id === competenciaId;

                        return (
                          <div key={empenho.id} className="rounded-lg border p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold">
                                    {neEmitida
                                      ? `NE ${empenho.numero_ne}`
                                      : empenho.solicitacao_sei_numero
                                        ? `Solicitação de NE · SEI ${empenho.solicitacao_sei_numero}`
                                        : "Solicitação de NE · rascunho"}
                                  </span>

                                  {neEmitida ? (
                                    <Badge className="bg-success text-success-foreground">
                                      NE emitida
                                    </Badge>
                                  ) : !solicitacaoPronta ? (
                                    <Badge variant="outline">Em preenchimento</Badge>
                                  ) : empenho.solicitacao_enviada_sefaz ? (
                                    <Badge variant="secondary">Aguardando NE</Badge>
                                  ) : assinaturasOk ? (
                                    <Badge variant="outline">Pronta para SEFAZ</Badge>
                                  ) : empenho.solicitacao_enviada_aco ? (
                                    <Badge variant="outline">Em assinaturas</Badge>
                                  ) : (
                                    <Badge variant="outline">Aguardando ACO</Badge>
                                  )}

                                  {neEmitida && !atual && empenhoAbrangeMesPvh(empenho, competencia) && (
                                    <Badge variant="outline">NE prevista para {competencia}</Badge>
                                  )}

                                  {novoFluxo && neEmitida && !envioOk && (
                                    <Badge variant="destructive">Reconfirmar solicitação</Badge>
                                  )}
                                </div>

                                <div className="mt-1 text-xs text-muted-foreground">
                                  Dotação/CR: {empenho.cr_dotacao ?? "—"} · Fonte:{" "}
                                  {empenho.fonte_recurso ?? "—"}
                                </div>

                                <div className="mt-1 text-xs text-muted-foreground">
                                  Valor solicitado: {empenho.valor_solicitado == null
                                    ? "Não informado (registro anterior)"
                                    : brl(Number(empenho.valor_solicitado))}
                                  {" · "}Meses previstos: {(empenho.pvh_empenho_competencias ?? [])
                                    .map((m: { competencia: string }) => m.competencia)
                                    .sort().join(", ") || "Não registrados"}
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
                                  <AnulacaoResidualPvh
                                    empenho={empenho}
                                    podeAnular={podeAnular}
                                    onRegistrada={invalidar}
                                  />
                                </div>
                              </div>

                              {podeEditar && fluxoDaCompetencia && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => abrirEdicao(empenho, participante)}
                                  >
                                    {neEmitida ? (
                                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                    ) : (
                                      <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    {neEmitida ? "Editar fluxo" : "Continuar progresso"}
                                  </Button>

                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                      >
                                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                        Excluir solicitação/NE
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>
                                          Excluir esta Solicitação/Nota de Empenho?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                          A Solicitação, suas assinaturas e a Nota de Empenho serão
                                          removidas desta origem. Se a NE já tiver sido utilizada em
                                          outra competência ou possuir subempenho vinculado, o banco
                                          bloqueará a exclusão para preservar o histórico financeiro.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          disabled={excluirFluxo.isPending}
                                          onClick={() =>
                                            excluirFluxo.mutate({
                                              empenhoId: empenho.id,
                                            })
                                          }
                                        >
                                          Excluir solicitação/NE
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              )}
                            </div>

                            <div className="mt-3 rounded-md bg-muted/20 p-3">
                              {!neEmitida ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Send className="h-4 w-4 shrink-0" />
                                  {!solicitacaoPronta
                                    ? "Rascunho salvo. Continue o preenchimento da Solicitação de NE."
                                    : empenho.solicitacao_enviada_sefaz
                                      ? "Solicitação enviada à SEFAZ.UCG.AEO; aguardando a Nota de Empenho."
                                      : empenho.solicitacao_enviada_aco
                                        ? "Solicitação na etapa de assinaturas antes do envio à SEFAZ.UCG.AEO."
                                        : "Confirme primeiro o encaminhamento da Solicitação para SES.UFI.ACO."}
                                </div>
                              ) : !envioOk ? (
                                <div className="text-sm text-destructive">
                                  A Solicitação foi alterada após o envio. Reconfirme o encaminhamento
                                  antes de usar esta NE.
                                </div>
                              ) : atual ? (
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="text-sm">
                                    Cobertura nesta competência: <b>{brl(atual.valor_alocado)}</b>
                                    {fluxoDaCompetencia && saldo > 0.009 && (
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        · saldo da NE preservado para outras competências: {brl(saldo)}
                                      </span>
                                    )}
                                  </div>

                                  {podeEditar && !fluxoDaCompetencia && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      disabled={removerAlocacao.isPending}
                                      onClick={() => removerAlocacao.mutate(atual.id)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Remover vínculo
                                    </Button>
                                  )}
                                </div>
                              ) : podeEditar && podeUsarSaldo && !fluxoDaCompetencia ? (
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="text-sm text-muted-foreground">
                                    Esta NE possui {brl(saldo)} de saldo disponível. O sistema usará
                                    automaticamente até {brl(Math.min(saldo, restante))} para esta competência.
                                  </div>
                                  <Button
                                    size="sm"
                                    disabled={usarSaldo.isPending}
                                    onClick={() =>
                                      usarSaldo.mutate({
                                        empenhoId: empenho.id,
                                        participanteId: participante.id,
                                      })
                                    }
                                  >
                                    Usar saldo nesta competência
                                  </Button>
                                </div>
                              ) : (
                                <div className="text-sm text-muted-foreground">
                                  {fluxoDaCompetencia
                                    ? "Esta NE está emitida, mas ainda não possui alocação nesta competência. Use 'Sincronizar cobertura e abrir Etapa 4' para atualizar o vínculo sem mexer em utilizações anteriores."
                                    : "Esta NE não possui saldo utilizável nesta competência."}
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
                emitidas e rastreadas. A conclusão desta etapa independe do crédito no FMS,
                mas exige a Portaria Municipal publicada e conferida. Solicitações ainda
                aguardando emissão não entram na cobertura.
              </p>
              {emissaoSemCobertura && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={sincronizarCobertura.isPending || carregando}
                  onClick={() => sincronizarCobertura.mutate()}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {sincronizarCobertura.isPending
                    ? "Sincronizando cobertura..."
                    : "Sincronizar cobertura e abrir Etapa 4"}
                </Button>
              )}
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

      {reutilizar && (
        <ReutilizarEmpenhoDialogPvh
          open={Boolean(reutilizar)}
          onOpenChange={(aberto) => {
            if (!aberto) setReutilizar(null);
          }}
          instituicao={reutilizar.instituicaoNome}
          competencia={competencia}
          restante={reutilizar.restante}
          necessidadeInformada={reutilizar.necessidadeInformada}
          empenhos={(empenhosPorPrestador.get(reutilizar.prestadorId) ?? []).filter(
            (empenho) =>
              empenhoDisponivelParaReaproveitamentoPvh(
                empenho,
                competenciaId,
                reutilizar.participanteId,
                competencia,
              ),
          )}
          carregando={empenhos.isLoading}
          onReutilizar={(empenho) => {
            usarSaldo.mutate(
              {
                empenhoId: empenho.id,
                participanteId: reutilizar.participanteId,
              },
              {
                onSuccess: () => setReutilizar(null),
              },
            );
          }}
          onExcluirOrfao={(empenho) => excluirOrfao.mutate(empenho.id)}
        />
      )}

      {modal && (
        <SolicitacaoEmpenhoModalPvh
          open={Boolean(modal)}
          onOpenChange={(aberto) => {
            if (!aberto) setModal(null);
          }}
          competenciaId={competenciaId}
          competencia={competencia}
          prestadorId={modal.prestadorId}
          participanteId={modal.participanteId}
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
