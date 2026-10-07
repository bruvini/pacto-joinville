import { Check, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizarEntradaPortariaSes } from "@/lib/pvh/portaria";

const numero = (valor: string) => {
  const limpo = valor.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
};

const moneyInput = (value: number | null | undefined) =>
  value == null
    ? ""
    : Number(value).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

export function EtapaPortariaEstadualPvh({
  competenciaId,
  competencia,
  participantes,
  concluidas,
  podeEditar,
}: {
  competenciaId: string;
  competencia: any;
  participantes: any[];
  concluidas: Record<string, boolean>;
  podeEditar: boolean;
}) {
  const qc = useQueryClient();
  const [ato, setAto] = useState({
    portaria_estadual_numero: "",
    portaria_estadual_data: "",
    portaria_estadual_url: "",
  });
  const [valoresEstado, setValoresEstado] = useState<Record<string, string>>({});

  useEffect(() => {
    setAto({
      portaria_estadual_numero: competencia.portaria_estadual_numero ?? "",
      portaria_estadual_data: competencia.portaria_estadual_data ?? "",
      portaria_estadual_url: competencia.portaria_estadual_url ?? "",
    });
  }, [
    competencia.id,
    competencia.updated_at,
    competencia.portaria_estadual_numero,
    competencia.portaria_estadual_data,
    competencia.portaria_estadual_url,
  ]);

  useEffect(() => {
    const mapa: Record<string, string> = {};
    for (const participante of participantes) {
      mapa[participante.id] = moneyInput(participante.valor_estadual);
    }
    setValoresEstado(mapa);
  }, [participantes]);

  const valores = useMemo(
    () =>
      participantes.map((participante) => ({
        id: participante.id,
        valor: numero(valoresEstado[participante.id] ?? ""),
      })),
    [participantes, valoresEstado],
  );

  const normalizarPortaria = (valor: string, forcar = false) => {
    const normalizada = normalizarEntradaPortariaSes(valor, ato.portaria_estadual_data);
    const reconheceuExpressaoCompleta = normalizada.reconhecida && Boolean(normalizada.data);
    if (forcar || reconheceuExpressaoCompleta) {
      setAto((atual) => ({
        ...atual,
        portaria_estadual_numero: normalizada.numero,
        portaria_estadual_data: normalizada.data || atual.portaria_estadual_data,
      }));
      return;
    }
    setAto((atual) => ({ ...atual, portaria_estadual_numero: valor }));
  };

  const salvar = useMutation({
    mutationFn: async ({ concluir }: { concluir: boolean }) => {
      if (concluir) {
        if (!ato.portaria_estadual_numero.trim())
          throw new Error("Informe o número da Portaria estadual.");
        if (!ato.portaria_estadual_data)
          throw new Error("Informe a data da Portaria estadual.");
        if (!ato.portaria_estadual_url.trim())
          throw new Error("Informe o link oficial da Portaria estadual.");
        if (!valores.length || valores.some((item) => item.valor <= 0))
          throw new Error("Informe o valor estadual de todas as instituições antes de concluir.");
      }

      const etapas = {
        ...concluidas,
        ...(concluir ? { "1": true } : {}),
      };

      const { error: compError } = await supabase
        .from("pvh_competencias")
        .update({
          portaria_estadual_numero: ato.portaria_estadual_numero.trim() || null,
          portaria_estadual_data: ato.portaria_estadual_data || null,
          portaria_estadual_url: ato.portaria_estadual_url.trim() || null,
          etapas_concluidas: etapas,
          status: concluir && competencia.status === "preparacao" ? "ativa" : competencia.status,
        })
        .eq("id", competenciaId);
      if (compError) throw compError;

      for (const item of valores) {
        const { error } = await supabase
          .from("pvh_participantes")
          .update({ valor_estadual: item.valor || null })
          .eq("id", item.id)
          .eq("competencia_id", competenciaId);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
      qc.invalidateQueries({ queryKey: ["pvh_participantes", competenciaId] });
      qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
      toast.success(vars.concluir ? "Etapa 1 concluída." : "Rascunho da Etapa 1 salvo.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Etapa 1 · Portaria estadual e valores oficiais</CardTitle>
        <CardDescription>
          Registre a publicação oficial e os valores por instituição. A etapa pode permanecer em
          rascunho enquanto a competência estiver em preparação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Número da Portaria SES</Label>
            <Input
              value={ato.portaria_estadual_numero}
              onChange={(e) => normalizarPortaria(e.target.value)}
              onBlur={(e) => normalizarPortaria(e.target.value, true)}
              placeholder="Ex.: PORTARIA Nº 3186, DE 21/9/2026"
              disabled={!podeEditar}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Ao colar a identificação completa, o sistema normaliza para “SES Nº …” e aproveita a data publicada.
            </p>
          </div>
          <div>
            <Label>Data da Portaria</Label>
            <Input
              type="date"
              value={ato.portaria_estadual_data}
              onChange={(e) => setAto({ ...ato, portaria_estadual_data: e.target.value })}
              disabled={!podeEditar}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Link oficial</Label>
            <Input
              value={ato.portaria_estadual_url}
              onChange={(e) => setAto({ ...ato, portaria_estadual_url: e.target.value })}
              placeholder="Link da publicação oficial da SES/SC"
              disabled={!podeEditar}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 font-medium">Valores oficiais por instituição</div>
          <div className="divide-y rounded-lg border">
            {participantes.map((participante) => {
              const prestador = Array.isArray(participante.prestadores)
                ? participante.prestadores[0]
                : participante.prestadores;
              return (
                <div
                  key={participante.id}
                  className="grid gap-3 p-3 md:grid-cols-[1fr_220px] md:items-center"
                >
                  <div>
                    <div className="font-medium">
                      {prestador?.nome_instituicao ?? "Instituição"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>
                        E-mail: {participante.notificar_email ? "obrigatório" : "não aplicável"}
                      </span>
                      <span>·</span>
                      <span>
                        Prestação: {participante.exige_prestacao_contas ? "sim" : "não"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Valor estadual (R$)</Label>
                    <Input
                      inputMode="decimal"
                      value={valoresEstado[participante.id] ?? ""}
                      onChange={(e) =>
                        setValoresEstado({
                          ...valoresEstado,
                          [participante.id]: e.target.value,
                        })
                      }
                      placeholder="0,00"
                      disabled={!podeEditar}
                    />
                  </div>
                </div>
              );
            })}
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
              disabled={salvar.isPending}
              onClick={() => salvar.mutate({ concluir: true })}
            >
              <Check className="mr-2 h-4 w-4" />
              Concluir Etapa 1
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
