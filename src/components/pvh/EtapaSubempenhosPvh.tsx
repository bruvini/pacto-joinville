import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { CadeiaSubempenhoPvh } from "@/components/pvh/CadeiaSubempenhoPvh";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import {
  cadeiaSubempenhoCompletaPvh,
  coberturaSubempenhoFechadaPvh,
  fluxoUnicoSubempenhoPvh,
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
  const [fluxoAberto, setFluxoAberto] = useState<string | null>(null);
  const preparacaoExecutada = useRef(false);
  const participanteIds = participantes.map((item) => item.id);

  const alocacoes = useQuery({
    queryKey: ["pvh_alocacoes_competencia", competenciaId],
    enabled: participanteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_empenho_alocacoes")
        .select(
          "*,pvh_empenhos(id,numero_ne,valor_total,prestador_id,solicitacao_competencia_id),pvh_participantes(id,prestador_id,valor_estadual,valor_municipal,prestadores(id,nome_instituicao)),pvh_subempenhos(*)",
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
    qc.invalidateQueries({
      queryKey: ["pvh_alocacoes_competencia", competenciaId],
    });
    qc.invalidateQueries({ queryKey: ["pvh_subempenho_assinaturas"] });
    qc.invalidateQueries({ queryKey: ["pvh_empenhos"] });
    qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
  };

  const preparar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("pvh_preparar_etapa4", {
        p_comp: competenciaId,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (error: any) => {
      toast.error(
        error.message ??
          "Não foi possível sincronizar as Notas de Empenho da Etapa 4.",
      );
    },
  });

  useEffect(() => {
    if (!podeEditar || preparacaoExecutada.current) return;
    preparacaoExecutada.current = true;
    preparar.mutate();
  }, [podeEditar, competenciaId]);


  const alocacaoCompleta = (alocacao: any) => {
    const subs = alocacao.pvh_subempenhos ?? [];
    const sub = fluxoUnicoSubempenhoPvh(subs);
    return Boolean(
      sub &&
        coberturaSubempenhoFechadaPvh(
          Number(alocacao.valor_alocado ?? 0),
          subs,
        ) &&
        cadeiaSubempenhoCompletaPvh(sub, assinaturas.data ?? []),
    );
  };

  const alocacoesCompletas =
    (alocacoes.data ?? []).length > 0 &&
    (alocacoes.data ?? []).every(alocacaoCompleta);

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
    onError: (error: any) => toast.error(error.message),
  });

  const carregando =
    preparar.isPending ||
    alocacoes.isLoading ||
    assinaturas.isLoading ||
    pool.isLoading;
  const erro = alocacoes.isError || assinaturas.isError || pool.isError;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Etapa 4 · Subempenho e liquidação
        </CardTitle>
        <CardDescription className="max-w-4xl text-xs">
          Cada Nota de Empenho utilizada na competência gera exatamente uma
          cadeia de Subempenho/Liquidação. Quando uma instituição utiliza duas
          NEs, aparecem dois fluxos independentes — um para cada NE — e nunca
          dois fluxos internos da mesma nota.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!recursoFmsCompleto && (
          <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
            O crédito no FMS ainda não está completo na Etapa 2. A cadeia pode
            ser preenchida, mas a conclusão da Etapa 4 depende desse marco
            financeiro.
          </div>
        )}

        {erro ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            A estrutura operacional da Etapa 4 ainda não está disponível no
            banco. Aplique a migration mais recente do PVH.
          </div>
        ) : carregando ? (
          <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            Sincronizando as Notas de Empenho e as cadeias de Subempenho…
          </div>
        ) : (alocacoes.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            Nenhuma Nota de Empenho está vinculada à cobertura desta
            competência.
          </div>
        ) : (
          participantes.map((participante) => {
            const prestador = Array.isArray(participante.prestadores)
              ? participante.prestadores[0]
              : participante.prestadores;
            const itens = (alocacoes.data ?? []).filter(
              (alocacao: any) =>
                alocacao.participante_id === participante.id,
            );
            if (!itens.length) return null;

            const valorCoberto = itens.reduce(
              (soma: number, item: any) =>
                soma + Number(item.valor_alocado ?? 0),
              0,
            );
            const completo = itens.every(alocacaoCompleta);
            return (
              <section
                key={participante.id}
                className="overflow-hidden rounded-xl border"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                  <div>
                    <div className="font-semibold">
                      {prestador?.nome_instituicao ?? "Instituição"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {itens.length} Nota{itens.length === 1 ? "" : "s"} de
                      Empenho · cobertura {brl(valorCoberto)}
                    </div>
                  </div>
                  <Badge variant={completo ? "default" : "outline"}>
                    {completo ? "Instituição completa" : "Pendente"}
                  </Badge>
                </div>

                <Accordion
                  type="single"
                  collapsible
                  value={
                    fluxoAberto &&
                    itens.some((item: any) => item.id === fluxoAberto)
                      ? fluxoAberto
                      : undefined
                  }
                  onValueChange={(value) =>
                    setFluxoAberto(value || null)
                  }
                  className="px-4"
                >
                  {itens.map((alocacao: any) => {
                    const empenho = Array.isArray(alocacao.pvh_empenhos)
                      ? alocacao.pvh_empenhos[0]
                      : alocacao.pvh_empenhos;
                    const subs = alocacao.pvh_subempenhos ?? [];
                    const sub = fluxoUnicoSubempenhoPvh(subs);
                    const completoNe = alocacaoCompleta(alocacao);
                    const duplicado = subs.length > 1;

                    return (
                      <AccordionItem key={alocacao.id} value={alocacao.id}>
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 pr-3 text-left">
                            <div>
                              <div className="text-sm font-semibold">
                                NE {empenho?.numero_ne ?? "—"}
                              </div>
                              <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                                Subempenho desta competência:{" "}
                                {brl(Number(alocacao.valor_alocado ?? 0))}
                              </div>
                            </div>
                            <Badge
                              variant={
                                duplicado
                                  ? "destructive"
                                  : completoNe
                                    ? "default"
                                    : "outline"
                              }
                            >
                              {duplicado
                                ? "Revisão necessária"
                                : completoNe
                                  ? "Completo"
                                  : "Pendente"}
                            </Badge>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent className="pb-4">
                          {duplicado ? (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                              Esta NE ainda possui mais de um fluxo legado. O
                              sistema não apagará documentos automaticamente.
                              A migration tenta redistribuir fluxos
                              complementares para a NE correta; se esta mensagem
                              permanecer, revise os vínculos antes de concluir a
                              Etapa 4.
                            </div>
                          ) : !sub ? (
                            <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                              A cadeia desta NE ainda está sendo preparada.
                              Recarregue a competência após a sincronização.
                            </div>
                          ) : (
                            <CadeiaSubempenhoPvh
                              alocacao={alocacao}
                              subempenho={sub}
                              assinaturas={assinaturas.data ?? []}
                              pool={pool.data ?? []}
                              podeEditar={podeEditar}
                              aberto={fluxoAberto === alocacao.id}
                              onChange={invalidar}
                            />
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </section>
            );
          })
        )}

        {podeEditar && !erro && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="max-w-xl text-xs text-muted-foreground">
              {!alocacoesCompletas
                ? "Conclua as três subetapas de cada Nota de Empenho antes de prosseguir."
                : !recursoFmsCompleto
                  ? "Confirme o crédito no FMS na Etapa 2 antes da conclusão."
                  : "Todas as cadeias foram preenchidas. Confirme a conclusão para avançar à Etapa 5."}
            </p>
            <Button
              disabled={
                carregando ||
                !alocacoesCompletas ||
                !recursoFmsCompleto ||
                concluidas["2"] !== true ||
                concluidas["3"] !== true ||
                reconferir.includes(2) ||
                reconferir.includes(3) ||
                concluir.isPending ||
                (concluidas["4"] === true && !reconferir.includes(4))
              }
              onClick={() => concluir.mutate()}
            >
              <Check className="mr-2 h-4 w-4" />
              {concluidas["4"] === true && !reconferir.includes(4)
                ? "Etapa 4 concluída"
                : reconferir.includes(4)
                  ? "Reconferir e concluir Etapa 4"
                  : concluir.isPending
                    ? "Concluindo Etapa 4…"
                    : "Concluir Etapa 4"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
