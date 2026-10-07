import { AlertTriangle, Check } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MemorandoPortariaMunicipalPvh } from "@/components/pvh/MemorandoPortariaMunicipalPvh";
import { MinutaPortariaMunicipalPvh } from "@/components/pvh/MinutaPortariaMunicipalPvh";
import { PortariaMunicipalPublicadaPvh } from "@/components/pvh/PortariaMunicipalPublicadaPvh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  etapa2ProntaPvh,
  TIPO_MEMORANDO_PVH,
  TIPO_MINUTA_PVH,
  TIPO_PORTARIA_MUNICIPAL_PVH,
} from "@/lib/pvh/etapa2";

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

  const idsPrestadores = participantes.map((participante) => participante.prestador_id);
  const cnes = useQuery({
    queryKey: ["pvh_cnes", competenciaId, ...idsPrestadores],
    enabled: idsPrestadores.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prestador_cnes")
        .select("*")
        .in("prestador_id", idsPrestadores)
        .order("cnes");
      if (error) throw error;
      return data ?? [];
    },
  });

  const listaDocumentos = documentos.data ?? [];
  const listaAssinaturas = assinaturas.data ?? [];
  const minuta = listaDocumentos.find(
    (documento) => documento.tipo_codigo === TIPO_MINUTA_PVH,
  );
  const memorando = listaDocumentos.find(
    (documento) => documento.tipo_codigo === TIPO_MEMORANDO_PVH,
  );
  const portaria = listaDocumentos.find(
    (documento) => documento.tipo_codigo === TIPO_PORTARIA_MUNICIPAL_PVH,
  );

  const prontaParaConcluir = etapa2ProntaPvh({
    participantes,
    documentos: listaDocumentos,
    assinaturas: listaAssinaturas,
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

  const concluir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("pvh_concluir_etapa2", {
        p_comp: competenciaId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success(
        reconferir.includes(2)
          ? "Etapa 2 reconferida. Os valores municipais foram novamente sincronizados com a Portaria SES."
          : "Etapa 2 concluída. Os valores municipais foram herdados da Etapa 1.",
      );
    },
    onError: (error: any) => toast.error(error.message),
  });

  if (documentos.isLoading || assinaturas.isLoading || pool.isLoading || cnes.isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Carregando a cadeia documental da Portaria Municipal…
        </CardContent>
      </Card>
    );
  }

  if (documentos.isError || assinaturas.isError || pool.isError || cnes.isError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-6 text-sm text-destructive">
          A estrutura documental atualizada da Etapa 2 ainda não está disponível no banco. Aplique a
          migration mais recente do PVH e recarregue a competência.
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
              A Portaria Municipal reproduz os valores oficiais já conferidos na Etapa 1. O trabalho
              aqui é documental: construir a Minuta, encaminhar o Memorando e registrar a Portaria
              publicada.
            </CardDescription>
          </div>
          <Badge variant={prontaParaConcluir ? "default" : "outline"}>
            {prontaParaConcluir ? "Pronta para concluir" : "Em preparação"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Cadeia documental da Portaria Municipal</h3>
          <p className="text-[11px] text-muted-foreground">
            Minuta personalizada → Memorando alimentado pela Minuta → encaminhamento para SES.UAP e
            SES.UAP.APA → Portaria Municipal publicada.
          </p>
        </div>

        <MinutaPortariaMunicipalPvh
          competenciaId={competenciaId}
          competencia={competencia}
          participantes={participantes}
          documento={minuta}
          assinaturas={listaAssinaturas}
          pool={pool.data ?? []}
          cnes={cnes.data ?? []}
          podeEditar={podeEditar}
          onChange={invalidar}
        />

        <MemorandoPortariaMunicipalPvh
          competenciaId={competenciaId}
          competencia={competencia}
          documento={memorando}
          minuta={minuta}
          assinaturas={listaAssinaturas}
          pool={pool.data ?? []}
          podeEditar={podeEditar}
          onChange={invalidar}
        />

        <PortariaMunicipalPublicadaPvh
          competenciaId={competenciaId}
          documento={portaria}
          podeEditar={podeEditar}
          onChange={invalidar}
        />

        {podeEditar && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div className="flex max-w-4xl items-start gap-2 text-[11px] text-muted-foreground">
              {!prontaParaConcluir && (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>
                {prontaParaConcluir
                  ? "Minuta, Memorando, assinaturas, encaminhamentos e Portaria publicada estão completos. A validação final também será refeita no servidor."
                  : "Para concluir: Minuta com texto-base e assinaturas obrigatórias; Memorando com destinatários, referências, Fiscal + Gerente/Coordenador e confirmação de envio às duas unidades; Portaria Municipal com número, data e Link SEI."}
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
