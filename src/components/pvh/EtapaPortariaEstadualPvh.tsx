import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  Loader2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { etapa1ProntaPvh } from "@/lib/pvh/etapa1";
import {
  mascaraColagemMoedaBrl,
  mascaraMoedaBrl,
  moedaBrlDeNumero,
  numeroMoedaBrl,
} from "@/lib/pvh/moeda";
import { normalizarEntradaPortariaSes } from "@/lib/pvh/portaria";

type SnapshotEtapa1 = {
  numeroPortaria: string;
  dataPortaria: string;
  linkOficial: string;
  valores: Array<{ id: string; valor: number }>;
};

type EstadoAutosave = "salvo" | "pendente" | "salvando" | "erro";

function chaveSnapshot(snapshot: SnapshotEtapa1) {
  return JSON.stringify({
    numeroPortaria: snapshot.numeroPortaria.trim(),
    dataPortaria: snapshot.dataPortaria || "",
    linkOficial: snapshot.linkOficial.trim(),
    valores: snapshot.valores.map((item) => [item.id, item.valor]),
  });
}

export function EtapaPortariaEstadualPvh({
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
  const [ato, setAto] = useState({
    portaria_estadual_numero: "",
    portaria_estadual_data: "",
    portaria_estadual_url: "",
  });
  const [valoresEstado, setValoresEstado] = useState<Record<string, string>>({});
  const [estadoAutosave, setEstadoAutosave] = useState<EstadoAutosave>("salvo");
  const hidratadoRef = useRef(false);
  const ultimoSalvoRef = useRef("");
  const timerRef = useRef<number | null>(null);
  const filaRef = useRef<Promise<unknown>>(Promise.resolve());
  const snapshotAtualRef = useRef<SnapshotEtapa1 | null>(null);

  const origem = useMemo<SnapshotEtapa1>(
    () => ({
      numeroPortaria: competencia.portaria_estadual_numero ?? "",
      dataPortaria: competencia.portaria_estadual_data ?? "",
      linkOficial: competencia.portaria_estadual_url ?? "",
      valores: participantes.map((participante) => ({
        id: participante.id,
        valor: Number(participante.valor_estadual ?? 0),
      })),
    }),
    [
      competencia.id,
      competencia.updated_at,
      competencia.portaria_estadual_numero,
      competencia.portaria_estadual_data,
      competencia.portaria_estadual_url,
      participantes,
    ],
  );
  const chaveOrigem = useMemo(() => chaveSnapshot(origem), [origem]);

  useEffect(() => {
    hidratadoRef.current = false;
    setAto({
      portaria_estadual_numero: origem.numeroPortaria,
      portaria_estadual_data: origem.dataPortaria,
      portaria_estadual_url: origem.linkOficial,
    });
    setValoresEstado(
      Object.fromEntries(
        origem.valores.map((item) => [
          item.id,
          item.valor > 0 ? moedaBrlDeNumero(item.valor) : "",
        ]),
      ),
    );
    ultimoSalvoRef.current = chaveOrigem;
    setEstadoAutosave("salvo");
    hidratadoRef.current = true;
  }, [competencia.id]);

  const snapshotAtual = useMemo<SnapshotEtapa1>(
    () => ({
      numeroPortaria: ato.portaria_estadual_numero,
      dataPortaria: ato.portaria_estadual_data,
      linkOficial: ato.portaria_estadual_url,
      valores: participantes.map((participante) => ({
        id: participante.id,
        valor: numeroMoedaBrl(valoresEstado[participante.id] ?? ""),
      })),
    }),
    [ato, participantes, valoresEstado],
  );
  const chaveAtual = useMemo(() => chaveSnapshot(snapshotAtual), [snapshotAtual]);
  snapshotAtualRef.current = snapshotAtual;

  const prontaParaConcluir = etapa1ProntaPvh({
    numeroPortaria: snapshotAtual.numeroPortaria,
    dataPortaria: snapshotAtual.dataPortaria,
    linkOficial: snapshotAtual.linkOficial,
    valores: snapshotAtual.valores.map((item) => item.valor),
  });
  const concluidaSemReconferencia =
    concluidas["1"] === true && !reconferir.includes(1);

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

  const sincronizarConsultas = () => {
    qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_participantes", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
  };

  const persistirSnapshot = async (snapshot: SnapshotEtapa1) => {
    const chave = chaveSnapshot(snapshot);
    if (chave === ultimoSalvoRef.current) return { reconferenciaMarcada: false };

    const { error: compError } = await supabase
      .from("pvh_competencias")
      .update({
        portaria_estadual_numero: snapshot.numeroPortaria.trim() || null,
        portaria_estadual_data: snapshot.dataPortaria || null,
        portaria_estadual_url: snapshot.linkOficial.trim() || null,
      })
      .eq("id", competenciaId);
    if (compError) throw compError;

    for (const item of snapshot.valores) {
      const { error } = await supabase
        .from("pvh_participantes")
        .update({ valor_estadual: item.valor > 0 ? item.valor : null })
        .eq("id", item.id)
        .eq("competencia_id", competenciaId);
      if (error) throw error;
    }

    let reconferenciaMarcada = false;
    if (concluidas["1"] === true && !reconferir.includes(1)) {
      const { error: reconferenciaError } = await supabase.rpc("pvh_marcar_reconferencia", {
        p_comp: competenciaId,
        p_etapa: 1,
      });
      if (reconferenciaError) throw reconferenciaError;
      reconferenciaMarcada = true;
    }

    ultimoSalvoRef.current = chave;
    return { reconferenciaMarcada };
  };

  const enfileirarPersistencia = (snapshot: SnapshotEtapa1) => {
    const tarefa = filaRef.current
      .catch(() => undefined)
      .then(() => persistirSnapshot(snapshot));
    filaRef.current = tarefa.catch(() => undefined);
    return tarefa;
  };

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const snapshot = snapshotAtualRef.current;
      if (
        podeEditar &&
        hidratadoRef.current &&
        snapshot &&
        chaveSnapshot(snapshot) !== ultimoSalvoRef.current
      ) {
        void enfileirarPersistencia(snapshot).catch(() => undefined);
      }
    },
    [competenciaId],
  );

  useEffect(() => {
    if (!podeEditar || !hidratadoRef.current || chaveAtual === ultimoSalvoRef.current) return;

    if (timerRef.current) window.clearTimeout(timerRef.current);
    setEstadoAutosave("pendente");

    timerRef.current = window.setTimeout(() => {
      setEstadoAutosave("salvando");
      void enfileirarPersistencia(snapshotAtual)
        .then((resultado) => {
          setEstadoAutosave("salvo");

          qc.setQueryData(["pvh_competencia", competenciaId], (antigo: any) =>
            antigo
              ? {
                  ...antigo,
                  portaria_estadual_numero: snapshotAtual.numeroPortaria.trim() || null,
                  portaria_estadual_data: snapshotAtual.dataPortaria || null,
                  portaria_estadual_url: snapshotAtual.linkOficial.trim() || null,
                }
              : antigo,
          );
          qc.setQueryData(["pvh_participantes", competenciaId], (antigos: any[] | undefined) =>
            antigos?.map((participante) => {
              const valor = snapshotAtual.valores.find((item) => item.id === participante.id)?.valor;
              return valor === undefined
                ? participante
                : { ...participante, valor_estadual: valor > 0 ? valor : null };
            }),
          );
          qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
          if (resultado?.reconferenciaMarcada) {
            qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
          }
        })
        .catch((error: any) => {
          setEstadoAutosave("erro");
          toast.error("Não foi possível salvar automaticamente a Etapa 1: " + error.message);
        });
    }, 650);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [chaveAtual, podeEditar]);

  const concluir = useMutation({
    mutationFn: async () => {
      if (!prontaParaConcluir)
        throw new Error(
          "Preencha Portaria, data, link oficial e o valor estadual de todas as instituições.",
        );

      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      setEstadoAutosave("salvando");
      await enfileirarPersistencia(snapshotAtual);

      const { data: estadoAtual, error: estadoError } = await supabase
        .from("pvh_competencias")
        .select("etapas_concluidas,etapas_reconferir,status")
        .eq("id", competenciaId)
        .single();
      if (estadoError) throw estadoError;

      const etapasBanco = (estadoAtual.etapas_concluidas ?? {}) as Record<string, boolean>;
      const reconferenciaBanco = (estadoAtual.etapas_reconferir ?? []) as number[];

      const { error } = await supabase
        .from("pvh_competencias")
        .update({
          etapas_concluidas: { ...etapasBanco, "1": true },
          etapas_reconferir: reconferenciaBanco.filter((etapa) => etapa !== 1),
          status: estadoAtual.status === "preparacao" ? "ativa" : estadoAtual.status,
        })
        .eq("id", competenciaId);
      if (error) throw error;
    },
    onSuccess: () => {
      setEstadoAutosave("salvo");
      sincronizarConsultas();
      toast.success(reconferir.includes(1) ? "Etapa 1 reconferida." : "Etapa 1 concluída.");
    },
    onError: (error: any) => {
      setEstadoAutosave("erro");
      toast.error(error.message);
    },
  });

  const indicadorAutosave = {
    salvo: {
      icon: CheckCircle2,
      texto: "Salvo automaticamente",
      classe: "text-emerald-700 dark:text-emerald-400",
    },
    pendente: {
      icon: Cloud,
      texto: "Alterações aguardando salvamento",
      classe: "text-muted-foreground",
    },
    salvando: {
      icon: Loader2,
      texto: "Salvando…",
      classe: "text-primary",
    },
    erro: {
      icon: AlertTriangle,
      texto: "Falha no salvamento automático",
      classe: "text-destructive",
    },
  }[estadoAutosave];
  const IconeAutosave = indicadorAutosave.icon;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Execução da Etapa 1 · Portaria estadual e valores oficiais</CardTitle>
            <CardDescription className="mt-1 text-xs">
              Os campos são salvos automaticamente durante o preenchimento.
            </CardDescription>
          </div>
          {podeEditar && (
            <div className={"flex items-center gap-1.5 text-[11px] " + indicadorAutosave.classe}>
              <IconeAutosave
                className={"h-3.5 w-3.5 " + (estadoAutosave === "salvando" ? "animate-spin" : "")}
              />
              {indicadorAutosave.texto}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        <div className="grid gap-2.5 md:grid-cols-[minmax(230px,1.05fr)_170px_minmax(280px,1.45fr)]">
          <div>
            <Label className="text-xs">Número da Portaria SES</Label>
            <Input
              className="mt-1"
              value={ato.portaria_estadual_numero}
              onChange={(e) => normalizarPortaria(e.target.value)}
              onBlur={(e) => normalizarPortaria(e.target.value, true)}
              placeholder="Ex.: PORTARIA Nº 3186, DE 21/9/2026"
              disabled={!podeEditar}
            />
          </div>

          <div>
            <Label className="text-xs">Data da Portaria</Label>
            <Input
              className="mt-1"
              type="date"
              value={ato.portaria_estadual_data}
              onChange={(e) =>
                setAto((atual) => ({ ...atual, portaria_estadual_data: e.target.value }))
              }
              disabled={!podeEditar}
            />
          </div>

          <div>
            <Label className="text-xs">Link oficial</Label>
            <Input
              className="mt-1"
              value={ato.portaria_estadual_url}
              onChange={(e) =>
                setAto((atual) => ({ ...atual, portaria_estadual_url: e.target.value }))
              }
              placeholder="Publicação oficial da SES/SC"
              disabled={!podeEditar}
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium">Valores oficiais por instituição</div>
          <div className="grid gap-2 md:grid-cols-2">
            {participantes.map((participante) => {
              const prestador = Array.isArray(participante.prestadores)
                ? participante.prestadores[0]
                : participante.prestadores;

              return (
                <div
                  key={participante.id}
                  className="grid gap-2 rounded-lg border px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-center"
                >
                  <div className="min-w-0 truncate text-sm font-medium">
                    {prestador?.nome_instituicao ?? "Instituição"}
                  </div>
                  <div>
                    <Label className="sr-only">
                      Valor estadual de {prestador?.nome_instituicao ?? "instituição"}
                    </Label>
                    <Input
                      inputMode="numeric"
                      value={valoresEstado[participante.id] ?? ""}
                      onChange={(e) =>
                        setValoresEstado((atual) => ({
                          ...atual,
                          [participante.id]: mascaraMoedaBrl(e.target.value),
                        }))
                      }
                      onPaste={(e) => {
                        const texto = e.clipboardData.getData("text");
                        if (!texto) return;
                        e.preventDefault();
                        setValoresEstado((atual) => ({
                          ...atual,
                          [participante.id]: mascaraColagemMoedaBrl(texto),
                        }));
                      }}
                      placeholder="0,00"
                      className="h-9 text-right font-medium tabular-nums"
                      disabled={!podeEditar}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {podeEditar && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-[11px] text-muted-foreground">
              {!prontaParaConcluir
                ? "Para concluir: informe Portaria, data, link oficial e todos os valores estaduais."
                : concluidaSemReconferencia
                  ? "Etapa concluída. Qualquer alteração posterior será marcada para reconferência."
                  : "Todos os requisitos obrigatórios da Etapa 1 estão preenchidos."}
            </p>

            <Button
              size="sm"
              disabled={
                !prontaParaConcluir ||
                concluidaSemReconferencia ||
                concluir.isPending
              }
              onClick={() => concluir.mutate()}
            >
              <Check className="mr-2 h-4 w-4" />
              {concluidaSemReconferencia
                ? "Etapa 1 concluída"
                : reconferir.includes(1)
                  ? "Reconferir e concluir Etapa 1"
                  : "Concluir Etapa 1"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
