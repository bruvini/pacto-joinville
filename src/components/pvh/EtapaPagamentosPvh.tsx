import { Check, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PagamentoPvhCard } from "@/components/pvh/PagamentoPvhCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { linkValido } from "@/lib/sei";

export function EtapaPagamentosPvh({
  competenciaId,
  participantes,
  concluidas,
  reconferir,
  podeEditar,
}: {
  competenciaId: string;
  participantes: any[];
  concluidas: Record<string, boolean>;
  reconferir: number[];
  podeEditar: boolean;
}) {
  const qc = useQueryClient();

  const pagamentos = useQuery({
    queryKey: ["pvh_pagamentos", competenciaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_pagamentos")
        .select("*")
        .eq("competencia_id", competenciaId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["pvh_pagamentos", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_participantes", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
  };

  const adicionar = useMutation({
    mutationFn: async (participanteId: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("pvh_pagamentos").insert({
        competencia_id: competenciaId,
        participante_id: participanteId,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Parcela de pagamento aberta.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const completoRegistro = (item: any) =>
    Boolean(
      item.programacao_sei_numero?.trim() &&
        linkValido(item.programacao_sei_link) &&
        item.comprovante_sei_numero?.trim() &&
        linkValido(item.comprovante_sei_link) &&
        item.data_programacao &&
        item.data_pagamento &&
        Number(item.valor_pago ?? 0) > 0,
    );

  const todosQuitados =
    participantes.length > 0 &&
    participantes.every((participante) => {
      const lista = (pagamentos.data ?? []).filter(
        (item: any) => item.participante_id === participante.id,
      );
      const devido = Number(
        participante.valor_municipal ?? participante.valor_estadual ?? 0,
      );
      const pago = lista.reduce(
        (soma: number, item: any) => soma + Number(item.valor_pago ?? 0),
        0,
      );
      return (
        devido > 0 &&
        lista.length > 0 &&
        lista.every(completoRegistro) &&
        Math.abs(pago - devido) < 0.01
      );
    });

  const concluir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("pvh_concluir_etapa5", {
        p_comp: competenciaId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success(
        reconferir.includes(5)
          ? "Etapa 5 reconferida."
          : "Etapa 5 concluída: pagamentos conciliados.",
      );
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Etapa 5 · Pagamento</CardTitle>
        <CardDescription className="max-w-4xl text-xs">
          Registre a Programação de Pagamento e o Comprovante de Pagamento de
          cada instituição. Se o repasse ocorrer em mais de uma parcela, abra
          registros adicionais sem sobrescrever os anteriores.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {pagamentos.isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            A estrutura da Etapa 5 ainda não está disponível no banco. Aplique
            a migration mais recente do PVH.
          </div>
        ) : pagamentos.isLoading ? (
          <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            Carregando pagamentos…
          </div>
        ) : (
          participantes.map((participante) => {
            const prestador = Array.isArray(participante.prestadores)
              ? participante.prestadores[0]
              : participante.prestadores;
            const lista = (pagamentos.data ?? []).filter(
              (item: any) => item.participante_id === participante.id,
            );
            const devido = Number(
              participante.valor_municipal ?? participante.valor_estadual ?? 0,
            );
            const pago = lista.reduce(
              (soma: number, item: any) => soma + Number(item.valor_pago ?? 0),
              0,
            );
            const saldo = devido - pago;
            const quitado =
              lista.length > 0 &&
              lista.every(completoRegistro) &&
              Math.abs(saldo) < 0.01;

            return (
              <section key={participante.id} className="rounded-xl border">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 p-4">
                  <div>
                    <div className="font-semibold">
                      {prestador?.nome_instituicao ?? "Instituição"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Devido {brl(devido)} · Pago {brl(pago)} · Saldo{" "}
                      <span className={Math.abs(saldo) < 0.01 ? "text-success" : "text-amber-700"}>
                        {brl(Math.max(0, saldo))}
                      </span>
                    </div>
                  </div>
                  <Badge variant={quitado ? "default" : "outline"}>
                    {quitado ? "Quitado" : lista.length ? "Pagamento em andamento" : "Pendente"}
                  </Badge>
                </div>

                <div className="space-y-3 p-4">
                  {lista.length ? (
                    lista.map((pagamento: any) => (
                      <PagamentoPvhCard
                        key={pagamento.id}
                        pagamento={pagamento}
                        podeEditar={podeEditar}
                        onChange={invalidar}
                      />
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Nenhum pagamento registrado para esta instituição.
                    </div>
                  )}

                  {podeEditar && saldo > 0.009 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={adicionar.isPending}
                      onClick={() => adicionar.mutate(participante.id)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {lista.length ? "Adicionar parcela" : "Registrar pagamento"}
                    </Button>
                  )}
                </div>
              </section>
            );
          })
        )}

        {podeEditar && !pagamentos.isError && (
          <div className="flex justify-end border-t pt-3">
            <Button
              disabled={
                !todosQuitados ||
                concluir.isPending ||
                (concluidas["5"] === true && !reconferir.includes(5))
              }
              onClick={() => concluir.mutate()}
            >
              <Check className="mr-2 h-4 w-4" />
              {concluidas["5"] === true && !reconferir.includes(5)
                ? "Etapa 5 concluída"
                : reconferir.includes(5)
                  ? "Reconferir e concluir Etapa 5"
                  : "Concluir Etapa 5"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
