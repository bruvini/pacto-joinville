import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpenCheck, ExternalLink, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EsteiraCompetenciaPvh } from "@/components/pvh/EsteiraCompetenciaPvh";
import { EtapaEmpenhosPvh } from "@/components/pvh/EtapaEmpenhosPvh";
import { EtapaPortariaEstadualPvh } from "@/components/pvh/EtapaPortariaEstadualPvh";
import { EtapaRecursoFmsPvh } from "@/components/pvh/EtapaRecursoFmsPvh";
import { EtapaSubempenhosPvh } from "@/components/pvh/EtapaSubempenhosPvh";
import { GuiaEtapaPvh } from "@/components/pvh/GuiaEtapaPvh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { brl } from "@/lib/format";
import {
  PVH_ETAPAS,
  STATUS_PVH,
  etapaNavegavelPvh,
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

  const competencia = useQuery({
    queryKey: ["pvh_competencia", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_competencias")
        .select("*,pvh_normativas(id,titulo,codigo,vigencia_inicio,url_oficial,observacao)")
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

  useEffect(() => {
    if (
      comp &&
      !etapaNavegavelPvh(etapaSelecionada, concluidas, reconferir, comp.status)
    ) {
      setEtapaSelecionada(principal);
    }
  }, [comp, concluidas, etapaSelecionada, principal, reconferir]);

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
  const etapaPodeEditar =
    podeEditar &&
    etapaNavegavelPvh(etapaSelecionada, concluidas, reconferir, comp.status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/pvh"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar às competências
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-primary">PVH · {comp.competencia}</h1>
            <Badge variant={comp.status === "encerrada" ? "secondary" : "outline"}>
              {STATUS_PVH[comp.status] ?? comp.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Processo mensal do Programa de Valorização dos Hospitais.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/pvh/configuracoes">
            <Settings2 className="mr-2 h-4 w-4" />
            Configurações PVH
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Publicado pelo Estado</div>
            <div className="mt-1 text-xl font-bold text-primary">
              {totais.estadual ? brl(totais.estadual) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Portaria Municipal</div>
            <div className="mt-1 text-xl font-bold text-primary">
              {totais.municipal ? brl(totais.municipal) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Pago</div>
            <div className="mt-1 text-xl font-bold text-primary">
              {totais.pago ? brl(totais.pago) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Instituições</div>
            <div className="mt-1 text-xl font-bold text-primary">
              {(participantes.data ?? []).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <EsteiraCompetenciaPvh
        concluidas={concluidas}
        reconferir={reconferir}
        status={comp.status}
        etapaSelecionada={etapaSelecionada}
        onSelecionar={setEtapaSelecionada}
      />

      {norma && (
        <Card className="border-primary/15 bg-muted/15">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Base normativa da competência</div>
              <div className="font-semibold">{norma.titulo}</div>
              {norma.observacao && (
                <div className="mt-1 text-xs text-muted-foreground">{norma.observacao}</div>
              )}
            </div>
            {norma.url_oficial && (
              <Button asChild size="sm" variant="outline">
                <a href={norma.url_oficial} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir fonte oficial
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

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
          podeEditar={etapaPodeEditar}
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
                  As Etapas 1, 3, 4 e 5 já são operacionais. Use o botão de ajuda acima para consultar
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
