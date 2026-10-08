import { Check, Cloud, Landmark } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiLink } from "@/components/inputs/SeiLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { linkValido } from "@/lib/sei";
import { cn } from "@/lib/utils";

type FormRecursoFms = {
  recurso_fms_data: string;
  recurso_fms_valor: number | null;
  recurso_fms_referencia: string;
  recurso_fms_link: string;
};

export function EtapaRecursoFmsPvh({
  competenciaId,
  competencia,
  participantes,
  concluidas,
  reconferir,
  podeEditar,
  embedded = false,
}: {
  competenciaId: string;
  competencia: any;
  participantes: any[];
  concluidas: Record<string, boolean>;
  reconferir: number[];
  podeEditar: boolean;
  embedded?: boolean;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormRecursoFms>({
    recurso_fms_data: "",
    recurso_fms_valor: null,
    recurso_fms_referencia: "",
    recurso_fms_link: "",
  });

  useEffect(() => {
    setForm({
      recurso_fms_data: competencia.recurso_fms_data ?? "",
      recurso_fms_valor:
        competencia.recurso_fms_valor == null
          ? null
          : Number(competencia.recurso_fms_valor),
      recurso_fms_referencia: competencia.recurso_fms_referencia ?? "",
      recurso_fms_link: competencia.recurso_fms_link ?? "",
    });
  }, [
    competencia.id,
    competencia.updated_at,
    competencia.recurso_fms_data,
    competencia.recurso_fms_valor,
    competencia.recurso_fms_referencia,
    competencia.recurso_fms_link,
  ]);

  const esperado = useMemo(
    () => participantes.reduce((soma, participante) => soma + Number(participante.valor_estadual ?? 0), 0),
    [participantes],
  );

  const recebido = Number(form.recurso_fms_valor ?? 0);
  const diferenca = recebido - esperado;
  const fecha = esperado > 0 && Math.abs(diferenca) < 0.01;
  const linkOk = linkValido(form.recurso_fms_link);
  const concluidoSemReconferencia =
    concluidas["4"] === true && !reconferir.includes(4);
  const camposCompletos = Boolean(
    form.recurso_fms_data &&
      recebido > 0 &&
      form.recurso_fms_referencia.trim() &&
      linkOk,
  );

  const dadosAlterados = useMemo(() => {
    const valorAtual =
      competencia.recurso_fms_valor == null
        ? null
        : Number(competencia.recurso_fms_valor);
    const valorNovo = form.recurso_fms_valor == null ? null : Number(form.recurso_fms_valor);
    const valorMudou =
      valorAtual === null || valorNovo === null
        ? valorAtual !== valorNovo
        : Math.abs(valorAtual - valorNovo) >= 0.01;

    return (
      (form.recurso_fms_data || null) !== (competencia.recurso_fms_data ?? null) ||
      valorMudou ||
      (form.recurso_fms_referencia.trim() || null) !==
        (competencia.recurso_fms_referencia ?? null) ||
      (form.recurso_fms_link.trim() || null) !== (competencia.recurso_fms_link ?? null)
    );
  }, [competencia, form]);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
  };

  const salvar = useMutation({
    mutationFn: async ({
      concluir,
      silencioso = false,
    }: {
      concluir: boolean;
      silencioso?: boolean;
    }) => {
      if (!dadosAlterados && !concluir) return { concluir, silencioso, noop: true };

      if (concluir) {
        if (!form.recurso_fms_data)
          throw new Error("Informe a data efetiva do crédito no Fundo Municipal de Saúde.");
        if (recebido <= 0) throw new Error("Informe o valor recebido no FMS.");
        if (!form.recurso_fms_referencia.trim())
          throw new Error("Informe o número SEI que comprova o recebimento do recurso.");
        if (!linkOk) throw new Error("Informe um Link SEI válido para a evidência do crédito.");
        if (!fecha)
          throw new Error(
            `O valor recebido diverge do total estadual em ${brl(Math.abs(diferenca))}. Confira antes de concluir.`,
          );
      }

      const { error } = await supabase
        .from("pvh_competencias")
        .update({
          recurso_fms_data: form.recurso_fms_data || null,
          recurso_fms_valor: recebido > 0 ? recebido : null,
          recurso_fms_referencia: form.recurso_fms_referencia.trim() || null,
          recurso_fms_link: form.recurso_fms_link.trim() || null,
        })
        .eq("id", competenciaId);
      if (error) throw error;

      if (concluidas["4"] === true && dadosAlterados) {
        const { error: recError } = await supabase.rpc("pvh_marcar_reconferencia", {
          p_comp: competenciaId,
          p_etapa: 4,
        });
        if (recError) throw recError;
      }

      if (concluir) {
        const { data: estadoAtual, error: estadoError } = await supabase
          .from("pvh_competencias")
          .select("etapas_concluidas,etapas_reconferir")
          .eq("id", competenciaId)
          .single();
        if (estadoError) throw estadoError;

        const etapasAtuais = (estadoAtual?.etapas_concluidas ?? {}) as Record<string, boolean>;
        const reconferenciaAtual = (estadoAtual?.etapas_reconferir ?? []) as number[];

        const { error: concluirError } = await supabase
          .from("pvh_competencias")
          .update({
            etapas_concluidas: { ...etapasAtuais, "4": true },
            etapas_reconferir: reconferenciaAtual.filter((etapa) => etapa !== 4),
          })
          .eq("id", competenciaId);
        if (concluirError) throw concluirError;
      }

      return { concluir, silencioso, noop: false };
    },
    onSuccess: (resultado) => {
      if (!resultado || resultado.noop) return;
      invalidar();
      if (!resultado.silencioso) {
        toast.success(
          resultado.concluir
            ? "Recebimento no FMS concluído."
            : "Dados do FMS salvos.",
        );
      }
    },
    onError: (error: any) => toast.error(error.message),
  });

  const salvarAoSair = () => {
    if (!podeEditar || salvar.isPending || !dadosAlterados) return;
    salvar.mutate({ concluir: false, silencioso: true });
  };

  const corpo = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            <h3 className={cn("font-semibold", embedded ? "text-sm" : "text-base")}>
              Recebimento do recurso no FMS
            </h3>
          </div>
          <p className="mt-1 max-w-4xl text-[11px] text-muted-foreground">
            Registre o crédito efetivo no Fundo Municipal de Saúde. Esta data é o marco para a
            contagem do prazo de repasse aos hospitais.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Cloud className="h-3.5 w-3.5" />
          Salva ao sair do campo
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[180px_190px_180px_minmax(260px,1fr)]">
        <div>
          <Label className="text-xs">Data do crédito no FMS</Label>
          <Input
            className="mt-1 h-9"
            type="date"
            value={form.recurso_fms_data}
            onChange={(e) => setForm({ ...form, recurso_fms_data: e.target.value })}
            onBlur={salvarAoSair}
            disabled={!podeEditar}
          />
        </div>

        <div>
          <Label className="text-xs">Valor recebido no FMS</Label>
          <div className="mt-1" onBlur={salvarAoSair}>
            <CurrencyInput
              className="h-9"
              value={form.recurso_fms_valor}
              onChange={(valor) =>
                setForm({ ...form, recurso_fms_valor: valor > 0 ? valor : null })
              }
              disabled={!podeEditar}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Número SEI</Label>
          <Input
            className="mt-1 h-9"
            value={form.recurso_fms_referencia}
            onChange={(e) =>
              setForm({ ...form, recurso_fms_referencia: e.target.value })
            }
            onBlur={salvarAoSair}
            disabled={!podeEditar}
            placeholder="Ex.: 31024567"
          />
        </div>

        <div>
          <Label className="text-xs">Link SEI</Label>
          <div className="mt-1" onBlur={salvarAoSair}>
            <SeiLink
              value={form.recurso_fms_link}
              editable={podeEditar}
              onChange={(value) => setForm({ ...form, recurso_fms_link: value })}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="text-[11px] text-muted-foreground">
          {recebido > 0 && !fecha ? (
            <span className="text-amber-700">
              Valor informado difere do total estadual em {brl(Math.abs(diferenca))}.
            </span>
          ) : camposCompletos && fecha ? (
            <span>Dados completos e valor compatível com o total estadual da competência.</span>
          ) : (
            <span>Preencha data, valor, Número SEI e Link SEI para concluir este marco.</span>
          )}
        </div>

        {podeEditar && (
          <Button
            size="sm"
            disabled={
              !camposCompletos ||
              !fecha ||
              concluidoSemReconferencia ||
              salvar.isPending
            }
            onClick={() => salvar.mutate({ concluir: true })}
          >
            <Check className="mr-2 h-4 w-4" />
            {concluidas["4"] && !reconferir.includes(4)
              ? "Recebimento concluído"
              : reconferir.includes(4)
                ? "Reconferir recebimento"
                : "Concluir recebimento"}
          </Button>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return <section className="rounded-xl border bg-muted/5 p-4">{corpo}</section>;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Etapa 4 · Recebimento do recurso no FMS</CardTitle>
        <CardDescription className="text-xs">
          Este mesmo registro passa a aparecer também dentro da Etapa 2, assim que a Portaria
          Municipal publicada estiver completa.
        </CardDescription>
      </CardHeader>
      <CardContent>{corpo}</CardContent>
    </Card>
  );
}
