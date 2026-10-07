import { Check, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const n = (value: string) => {
  const clean = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
};

const moneyInput = (value: number | null | undefined) =>
  value == null
    ? ""
    : Number(value).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

export function EtapaRecursoFmsPvh({
  competenciaId,
  competencia,
  participantes,
  concluidas,
  reconferir,
  podeEditar,
}: {
  competenciaId: string;
  competencia: any;
  participantes: any[];
  concluidas: Record<string, boolean>;
  reconferir: number[];
  podeEditar: boolean;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    recurso_fms_data: "",
    recurso_fms_valor: "",
    recurso_fms_referencia: "",
    recurso_fms_link: "",
  });

  useEffect(() => {
    setForm({
      recurso_fms_data: competencia.recurso_fms_data ?? "",
      recurso_fms_valor: moneyInput(competencia.recurso_fms_valor),
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
    () => participantes.reduce((s, p) => s + Number(p.valor_estadual ?? 0), 0),
    [participantes],
  );

  const recebido = n(form.recurso_fms_valor);
  const diferenca = recebido - esperado;
  const fecha = esperado > 0 && Math.abs(diferenca) < 0.01;

  const salvar = useMutation({
    mutationFn: async ({ concluir }: { concluir: boolean }) => {
      if (concluir) {
        if (!form.recurso_fms_data)
          throw new Error("Informe a data em que o recurso efetivamente entrou no FMS.");
        if (recebido <= 0) throw new Error("Informe o valor recebido no FMS.");
        if (!form.recurso_fms_referencia.trim())
          throw new Error("Informe a referência do crédito, documento ou lançamento que comprova a entrada.");
        if (!fecha)
          throw new Error(
            "O valor recebido não fecha com o total estadual da competência. Confira antes de concluir.",
          );
      }

      if (concluidas["4"] === true) {
        const { error: recError } = await supabase.rpc("pvh_marcar_reconferencia", {
          p_comp: competenciaId,
          p_etapa: 4,
        });
        if (recError) throw recError;
      }

      const etapas = { ...concluidas, ...(concluir ? { "4": true } : {}) };
      const novaReconferencia = concluir ? (reconferir ?? []).filter((x) => x !== 4) : reconferir;

      const { error } = await supabase
        .from("pvh_competencias")
        .update({
          recurso_fms_data: form.recurso_fms_data || null,
          recurso_fms_valor: recebido || null,
          recurso_fms_referencia: form.recurso_fms_referencia.trim() || null,
          recurso_fms_link: form.recurso_fms_link.trim() || null,
          etapas_concluidas: etapas,
          etapas_reconferir: novaReconferencia,
        })
        .eq("id", competenciaId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
      qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
      toast.success(vars.concluir ? "Etapa 4 concluída." : "Dados do recurso salvos.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Etapa 4 · Recebimento do recurso no FMS</CardTitle>
        <CardDescription>
          Registre a entrada efetiva do recurso. É esta data — e não a data da Portaria estadual —
          que serve de marco para acompanhar o prazo de repasse aos hospitais.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs uppercase text-muted-foreground">Esperado pela Portaria</div>
            <div className="mt-1 text-lg font-bold text-primary">
              {esperado ? brl(esperado) : "—"}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs uppercase text-muted-foreground">Recebido no FMS</div>
            <div className="mt-1 text-lg font-bold text-primary">
              {recebido ? brl(recebido) : "—"}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs uppercase text-muted-foreground">Conciliação</div>
            <div
              className={
                "mt-1 text-lg font-bold " +
                (fecha ? "text-emerald-700" : recebido ? "text-amber-700" : "text-muted-foreground")
              }
            >
              {recebido
                ? fecha
                  ? "Valores conciliados"
                  : (diferenca > 0 ? "+" : "") + brl(diferenca)
                : "Aguardando crédito"}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-4 text-sm leading-relaxed text-sky-950 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100">
          <b>Qual data informar?</b> A data em que o recurso efetivamente foi creditado no Fundo
          Municipal de Saúde, conforme a evidência financeira utilizada pelo setor. O sistema
          utilizará esse marco para a régua de prazo do pagamento do PVH.
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Data efetiva do crédito no FMS</Label>
            <Input
              type="date"
              value={form.recurso_fms_data}
              onChange={(e) => setForm({ ...form, recurso_fms_data: e.target.value })}
              disabled={!podeEditar}
            />
          </div>

          <div>
            <Label>Valor recebido no FMS (R$)</Label>
            <Input
              inputMode="decimal"
              value={form.recurso_fms_valor}
              onChange={(e) => setForm({ ...form, recurso_fms_valor: e.target.value })}
              placeholder="0,00"
              disabled={!podeEditar}
            />
          </div>

          <div>
            <Label>Referência do crédito / documento</Label>
            <Input
              value={form.recurso_fms_referencia}
              onChange={(e) => setForm({ ...form, recurso_fms_referencia: e.target.value })}
              placeholder="Ex.: Informação SEI, extrato, lançamento bancário…"
              disabled={!podeEditar}
            />
          </div>

          <div>
            <Label>Link da evidência (SEI ou documento)</Label>
            <Input
              value={form.recurso_fms_link}
              onChange={(e) => setForm({ ...form, recurso_fms_link: e.target.value })}
              placeholder="https://..."
              disabled={!podeEditar}
            />
          </div>
        </div>

        {podeEditar && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={salvar.isPending}
              onClick={() => salvar.mutate({ concluir: false })}
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar rascunho
            </Button>
            <Button
              disabled={!fecha || salvar.isPending}
              onClick={() => salvar.mutate({ concluir: true })}
            >
              <Check className="mr-2 h-4 w-4" />
              {reconferir.includes(4) ? "Reconferir e concluir Etapa 4" : "Concluir Etapa 4"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
