import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CabecalhoCompetenciaPvh } from "@/components/pvh/CabecalhoCompetenciaPvh";
import { EtapaEmpenhosPvh } from "@/components/pvh/EtapaEmpenhosPvh";
import { EtapaPortariaEstadualPvh } from "@/components/pvh/EtapaPortariaEstadualPvh";
import { EtapaPortariaMunicipalPvh } from "@/components/pvh/EtapaPortariaMunicipalPvh";
import { EtapaRecursoFmsPvh } from "@/components/pvh/EtapaRecursoFmsPvh";
import { EtapaSubempenhosPvh } from "@/components/pvh/EtapaSubempenhosPvh";
import { GuiaEtapaPvh } from "@/components/pvh/GuiaEtapaPvh";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth, hasRole } from "@/hooks/useAuth";
import {
  PVH_ETAPAS,
  etapaLiberadaPvh,
  etapaPrincipalPvh,
} from "@/lib/pvh/etapas";

export const Route = createFileRoute("/_authenticated/pvh/$id")({
  head: () => ({ meta: [{ title: "Competência PVH — SMS Joinville" }] }),
  component: PvhCompetenciaPage,
});

function PvhCompetenciaPage() {
  const { id } = Route.useParams();
  const { roles } = useAuth();
  const podeEditar = hasRole(roles, "acp") || hasRole(roles, "aco") || hasRole(roles, "admin");
  const podeEditarPortariaMunicipal = hasRole(roles, "acp") || hasRole(roles, "admin");

  const competencia = useQuery({
    queryKey: ["pvh_competencia", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_competencias")
        .select("*,pvh_normativas(id,titulo,codigo,numero,data_ato,vigencia_inicio,url_oficial,observacao)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const participantes = useQuery({
    queryKey: ["pvh_participantes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_participantes")
        .select("*,prestadores(id,nome_instituicao,cnpj)")
        .eq("competencia_id", id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const comp = competencia.data;
  const concluidas = (comp?.etapas_concluidas ?? {}) as Record<string, boolean>;
  const reconferir = (comp?.etapas_reconferir ?? []) as number[];
  const principal = comp
    ? etapaPrincipalPvh(concluidas, comp.status, reconferir)
    : 1;
  const [etapaSelecionada, setEtapaSelecionada] = useState(1);

  useEffect(() => {
    if (comp) setEtapaSelecionada(principal);
  }, [comp?.id, principal]);

  const totais = useMemo(() => {
    const lista = participantes.data ?? [];
    return {
      estadual: lista.reduce((s, item) => s + Number(item.valor_estadual ?? 0), 0),
      municipal: lista.reduce((s, item) => s + Number(item.valor_municipal ?? 0), 0),
      pago: lista.reduce((s, item) => s + Number(item.valor_pago ?? 0), 0),
    };
  }, [participantes.data]);

  if (competencia.isLoading || participantes.isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Carregando competência PVH…</div>;
  }

  if (competencia.isError || !comp) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        Não foi possível abrir a competência PVH. Verifique se as migrations do módulo foram aplicadas.
      </div>
    );
  }

  const norma = Array.isArray(comp.pvh_normativas) ? comp.pvh_normativas[0] : comp.pvh_normativas;
  const guia = PVH_ETAPAS[etapaSelecionada - 1];
  // Temporariamente todas as etapas podem ser abertas para inspeção visual.
  // A permissão de escrita continua respeitando os pré-requisitos atuais.
  const etapaPodeEditar =
    podeEditar &&
    etapaLiberadaPvh(etapaSelecionada, concluidas, reconferir);

  return (
    <div className="space-y-5">
      <CabecalhoCompetenciaPvh
        competencia={comp.competencia}
        status={comp.status}
        norma={norma}
        totais={totais}
        instituicoes={(participantes.data ?? []).length}
        concluidas={concluidas}
        reconferir={reconferir}
        etapaSelecionada={etapaSelecionada}
        onSelecionarEtapa={setEtapaSelecionada}
      />

      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-sm text-muted-foreground">
          Etapa selecionada · <span className="font-medium text-foreground">{guia.titulo}</span>
        </div>
        <GuiaEtapaPvh etapa={guia} />
      </div>

      {etapaSelecionada === 1 ? (
        <EtapaPortariaEstadualPvh
          competenciaId={id}
          competencia={comp}
          participantes={participantes.data ?? []}
          concluidas={concluidas}
          reconferir={reconferir}
          podeEditar={etapaPodeEditar}
        />
      ) : etapaSelecionada === 2 ? (
        <EtapaPortariaMunicipalPvh
          competenciaId={id}
          competencia={comp}
          participantes={participantes.data ?? []}
          concluidas={concluidas}
          reconferir={reconferir}
          podeEditar={
            podeEditarPortariaMunicipal &&
            etapaLiberadaPvh(2, concluidas, reconferir)
          }
        />
      ) : etapaSelecionada === 3 ? (
        <EtapaEmpenhosPvh
          competenciaId={id}
          competencia={comp.competencia}
          participantes={participantes.data ?? []}
          concluidas={concluidas}
          reconferir={reconferir}
          podeEditar={etapaPodeEditar}
        />
      ) : etapaSelecionada === 4 ? (
        <EtapaRecursoFmsPvh
          competenciaId={id}
          competencia={comp}
          participantes={participantes.data ?? []}
          concluidas={concluidas}
          reconferir={reconferir}
          podeEditar={etapaPodeEditar}
        />
      ) : etapaSelecionada === 5 ? (
        <EtapaSubempenhosPvh
          competenciaId={id}
          competencia={comp.competencia}
          participantes={participantes.data ?? []}
          concluidas={concluidas}
          reconferir={reconferir}
          podeEditar={etapaPodeEditar}
        />
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-7">
            <div className="flex items-start gap-3">
              <BookOpenCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold">
                  Manual operacional disponível · formulário ainda não implementado
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  As Etapas 1 a 5 já são operacionais. Use o botão de ajuda acima para consultar
                  o procedimento completo desta etapa enquanto seu formulário específico ainda não
                  foi incorporado ao módulo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
