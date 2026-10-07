import { AlertTriangle, Check, Equal, Scale } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DocumentoMunicipalPvh } from "@/components/pvh/DocumentoMunicipalPvh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import {
  conciliacaoEtapa2Pvh,
  etapa2ProntaPvh,
} from "@/lib/pvh/etapa2";
import {
  mascaraColagemMoedaBrl,
  mascaraMoedaBrl,
  moedaBrlDeNumero,
  numeroMoedaBrl,
} from "@/lib/pvh/moeda";

export function EtapaPortariaMunicipalPvh({
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
  const [valoresMunicipais, setValoresMunicipais] = useState<Record<string, string>>({});
  const [justificativa, setJustificativa] = useState(
    competencia.justificativa_divergencia ?? "",
  );

  useEffect(() => {
    setValoresMunicipais(
      Object.fromEntries(
        participantes.map((participante) => [
          participante.id,
          Number(participante.valor_municipal ?? 0) > 0
            ? moedaBrlDeNumero(Number(participante.valor_municipal))
            : "",
        ]),
      ),
    );
  }, [competenciaId]);

  useEffect(() => {
    setJustificativa(competencia.justificativa_divergencia ?? "");
  }, [competenciaId, competencia.justificativa_divergencia]);

  const tipos = useQuery({
    queryKey: ["pvh_documento_tipos", 2],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_documento_tipos")
        .select("*")
        .eq("etapa", 2)
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });

  const documentos = useQuery({
    queryKey: ["pvh_documentos", competenciaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_documentos")
        .select("*")
        .eq("competencia_id", competenciaId)
        .is("participante_id", null)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const assinaturas = useQuery({
    queryKey: ["pvh_documento_assinaturas", competenciaId],
    enabled: documentos.isSuccess,
    queryFn: async () => {
      const ids = (documentos.data ?? []).map((documento) => documento.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("pvh_documento_assinaturas")
        .select("*")
        .in("documento_id", ids)
        .order("assinado_em");
      if (error) throw error;
      return data ?? [];
    },
  });

  const normativas = useQuery({
    queryKey: ["pvh_normativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_normativas")
        .select("id,titulo,codigo,vigencia_inicio,vigencia_fim,ativa")
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const participantesComRascunho = useMemo(
    () =>
      participantes.map((participante) => ({
        ...participante,
        valor_municipal: numeroMoedaBrl(valoresMunicipais[participante.id] ?? ""),
      })),
    [participantes, valoresMunicipais],
  );

  const conciliacao = useMemo(
    () => conciliacaoEtapa2Pvh(participantesComRascunho),
    [participantesComRascunho],
  );

  const prontaParaConcluir = etapa2ProntaPvh({
    participantes: participantesComRascunho,
    documentos: documentos.data ?? [],
    assinaturas: assinaturas.data ?? [],
    justificativaDivergencia: justificativa,
  });

  const concluidaSemReconferencia =
    concluidas["2"] === true && !reconferir.includes(2);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["pvh_documentos", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_documento_assinaturas", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_participantes", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
  };

  const salvarValorMunicipal = async (participanteId: string) => {
    const numero = numeroMoedaBrl(valoresMunicipais[participanteId] ?? "");
    const atual = participantes.find((item) => item.id === participanteId);
    const valorAtual = Number(atual?.valor_municipal ?? 0);

    if (Math.abs(numero - valorAtual) < 0.01) return;

    const { error } = await supabase
      .from("pvh_participantes")
      .update({ valor_municipal: numero > 0 ? numero : null })
      .eq("id", participanteId)
      .eq("competencia_id", competenciaId);

    if (error) {
      toast.error(error.message);
      return;
    }
    invalidar();
  };

  const salvarJustificativa = async () => {
    const atual = competencia.justificativa_divergencia ?? "";
    if (justificativa.trim() === atual.trim()) return;

    const { error } = await supabase
      .from("pvh_competencias")
      .update({ justificativa_divergencia: justificativa.trim() || null })
      .eq("id", competenciaId);

    if (error) {
      toast.error(error.message);
      return;
    }
    invalidar();
  };

  const concluir = useMutation({
    mutationFn: async () => {
      for (const participante of participantes) {
        const numero = numeroMoedaBrl(valoresMunicipais[participante.id] ?? "");
        const atual = Number(participante.valor_municipal ?? 0);
        if (Math.abs(numero - atual) >= 0.01) {
          const { error } = await supabase
            .from("pvh_participantes")
            .update({ valor_municipal: numero > 0 ? numero : null })
            .eq("id", participante.id)
            .eq("competencia_id", competenciaId);
          if (error) throw error;
        }
      }

      if ((competencia.justificativa_divergencia ?? "") !== justificativa.trim()) {
        const { error } = await supabase
          .from("pvh_competencias")
          .update({ justificativa_divergencia: justificativa.trim() || null })
          .eq("id", competenciaId);
        if (error) throw error;
      }

      const { error } = await supabase.rpc("pvh_concluir_etapa2", {
        p_comp: competenciaId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success(
        reconferir.includes(2)
          ? "Etapa 2 reconferida. Marcações posteriores foram preservadas quando aplicáveis."
          : "Etapa 2 concluída.",
      );
    },
    onError: (error: any) => toast.error(error.message),
  });

  if (tipos.isError || documentos.isError || assinaturas.isError || normativas.isError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-6 text-sm text-destructive">
          A estrutura documental da Etapa 2 ainda não está disponível no banco. Aplique a migration
          da Portaria Municipal e recarregue a competência.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              Execução da Etapa 2 · Portaria Municipal
            </CardTitle>
            <CardDescription className="mt-1 max-w-4xl text-xs">
              Formalize o repasse municipal, preserve Minuta/Memorando/assinaturas e confira cada
              instituição contra o valor publicado pelo Estado antes de considerar o ato concluído.
            </CardDescription>
          </div>
          <Badge variant={prontaParaConcluir ? "default" : "outline"}>
            {prontaParaConcluir ? "Pronta para concluir" : "Em preparação"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <section>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Conciliação Estado × Município</h3>
              <p className="text-[11px] text-muted-foreground">
                A conferência é feita por instituição; diferenças que se compensam no total não são
                escondidas.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span>
                Estado <b className="tabular-nums">{brl(conciliacao.totalEstadual)}</b>
              </span>
              <span>
                Município <b className="tabular-nums">{brl(conciliacao.totalMunicipal)}</b>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/25 text-left text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Instituição</th>
                  <th className="px-3 py-2 text-right">Estado</th>
                  <th className="px-3 py-2">Valor municipal</th>
                  <th className="px-3 py-2 text-right">Diferença</th>
                  <th className="w-28 px-3 py-2 text-center">Conferência</th>
                </tr>
              </thead>
              <tbody>
                {participantes.map((participante) => {
                  const prestador = Array.isArray(participante.prestadores)
                    ? participante.prestadores[0]
                    : participante.prestadores;
                  const item = conciliacao.itens.find((linha) => linha.id === participante.id);
                  const diferenca = item?.diferenca ?? 0;

                  return (
                    <tr key={participante.id} className="border-b last:border-0">
                      <td className="px-3 py-2.5 font-medium">
                        {prestador?.nome_instituicao ?? "Instituição"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {brl(Number(participante.valor_estadual ?? 0))}
                      </td>
                      <td className="px-3 py-2">
                        <Label className="sr-only">
                          Valor municipal de {prestador?.nome_instituicao ?? "instituição"}
                        </Label>
                        <Input
                          inputMode="numeric"
                          className="h-8 min-w-[150px] text-right font-medium tabular-nums"
                          value={valoresMunicipais[participante.id] ?? ""}
                          onChange={(e) =>
                            setValoresMunicipais((atuais) => ({
                              ...atuais,
                              [participante.id]: mascaraMoedaBrl(e.target.value),
                            }))
                          }
                          onPaste={(e) => {
                            const texto = e.clipboardData.getData("text");
                            if (!texto) return;
                            e.preventDefault();
                            setValoresMunicipais((atuais) => ({
                              ...atuais,
                              [participante.id]: mascaraColagemMoedaBrl(texto),
                            }));
                          }}
                          onBlur={() => void salvarValorMunicipal(participante.id)}
                          placeholder="0,00"
                          disabled={!podeEditar}
                        />
                      </td>
                      <td
                        className={
                          "px-3 py-2.5 text-right tabular-nums " +
                          (Math.abs(diferenca) >= 0.01 ? "text-destructive" : "text-success")
                        }
                      >
                        {diferenca > 0 ? "+" : ""}
                        {brl(diferenca)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {item?.conciliado ? (
                          <Badge className="bg-success text-success-foreground">
                            <Equal className="mr-1 h-3 w-3" />
                            Conciliado
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Divergente</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {conciliacao.possuiDivergencia && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-start gap-2">
                <Scale className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <Label className="text-xs text-destructive">
                    Justificativa formal da divergência
                  </Label>
                  <Textarea
                    className="mt-1 min-h-20 bg-background"
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                    onBlur={() => void salvarJustificativa()}
                    placeholder="Explique a diferença entre o valor estadual e o valor publicado pelo Município e indique o documento que a fundamenta."
                    disabled={!podeEditar}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Obrigatória para concluir quando qualquer instituição divergir, mesmo que o total
                    geral coincida.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold">Cadeia documental da Portaria Municipal</h3>
            <p className="text-[11px] text-muted-foreground">
              Minuta → Memorando → assinaturas por papel/função → Portaria publicada. Alterações
              posteriores ficam auditadas e podem exigir reconferência.
            </p>
          </div>

          {(tipos.data ?? []).map((tipo: any) => {
            const documento = (documentos.data ?? []).find(
              (item: any) => item.tipo_codigo === tipo.codigo,
            );
            return (
              <DocumentoMunicipalPvh
                key={tipo.codigo}
                competenciaId={competenciaId}
                competencia={competencia.competencia}
                normativaCompetenciaId={competencia.normativa_id}
                tipo={tipo}
                documento={documento}
                assinaturas={assinaturas.data ?? []}
                normativas={normativas.data ?? []}
                podeEditar={podeEditar}
                onChange={invalidar}
              />
            );
          })}
        </section>

        {podeEditar && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              {!prontaParaConcluir && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>
                {prontaParaConcluir
                  ? "Valores, documentos e assinaturas mínimas estão registrados. A validação final também será refeita no servidor."
                  : "Para concluir: valores municipais positivos, Minuta e Memorando com Nº SEI/link e assinatura ativa, Portaria publicada com número/data/link e justificativa se houver divergência."}
              </span>
            </div>

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
                ? "Etapa 2 concluída"
                : reconferir.includes(2)
                  ? "Reconferir e concluir Etapa 2"
                  : "Concluir Etapa 2"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
