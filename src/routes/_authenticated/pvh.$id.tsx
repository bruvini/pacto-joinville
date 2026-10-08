import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CabecalhoCompetenciaPvh } from "@/components/pvh/CabecalhoCompetenciaPvh";
import { EtapaEmpenhosPvh } from "@/components/pvh/EtapaEmpenhosPvh";
import { EtapaPortariaEstadualPvh } from "@/components/pvh/EtapaPortariaEstadualPvh";
import { EtapaPortariaMunicipalPvh } from "@/components/pvh/EtapaPortariaMunicipalPvh";
import { EtapaSubempenhosPvh } from "@/components/pvh/EtapaSubempenhosPvh";
import { EtapaPagamentosPvh } from "@/components/pvh/EtapaPagamentosPvh";
import { EtapaComunicacaoPvh } from "@/components/pvh/EtapaComunicacaoPvh";
import { EtapaEncerramentoPvh } from "@/components/pvh/EtapaEncerramentoPvh";
import { GuiaEtapaPvh } from "@/components/pvh/GuiaEtapaPvh";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { gerarRelatorioExecutivoPvh } from "@/lib/pvh/relatorio";
import { formatarEventoHistoricoPvh } from "@/lib/pvh/historico";
import { dateTime } from "@/lib/format";
import {
  PVH_ETAPAS,
  etapaPrincipalPvh,
} from "@/lib/pvh/etapas";

export const Route = createFileRoute("/_authenticated/pvh/$id")({
  head: () => ({ meta: [{ title: "Competência PVH — SMS Joinville" }] }),
  component: PvhCompetenciaPage,
});

function PvhCompetenciaPage() {
  const { id } = Route.useParams();
  const { roles, profile } = useAuth();
  const [linhaTempoAberta, setLinhaTempoAberta] = useState(false);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);

  const podeEditar =
    hasRole(roles, "acp") ||
    hasRole(roles, "aco") ||
    hasRole(roles, "admin");
  const podeEditarPortariaMunicipal =
    hasRole(roles, "acp") || hasRole(roles, "admin");

  const competencia = useQuery({
    queryKey: ["pvh_competencia", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_competencias")
        .select(
          "*,pvh_normativas(id,titulo,codigo,numero,data_ato,vigencia_inicio,url_oficial,observacao)",
        )
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

  const logs = useQuery({
    queryKey: ["pvh_logs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historico_logs")
        .select("*")
        .eq("pvh_competencia_id", id)
        .order("data_hora", { ascending: false })
        .limit(120);
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
      estadual: lista.reduce(
        (s, item) => s + Number(item.valor_estadual ?? 0),
        0,
      ),
      municipal: lista.reduce(
        (s, item) => s + Number(item.valor_municipal ?? 0),
        0,
      ),
      pago: lista.reduce((s, item) => s + Number(item.valor_pago ?? 0), 0),
    };
  }, [participantes.data]);

  if (competencia.isLoading || participantes.isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Carregando competência PVH…
      </div>
    );
  }

  if (competencia.isError || !comp) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        Não foi possível abrir a competência PVH. Verifique se as migrations do
        módulo foram aplicadas.
      </div>
    );
  }

  const norma = Array.isArray(comp.pvh_normativas)
    ? comp.pvh_normativas[0]
    : comp.pvh_normativas;
  const guia = PVH_ETAPAS[etapaSelecionada - 1] ?? PVH_ETAPAS[0];

  // Todas as etapas permanecem abertas para usuários autorizados.
  // Dependências ausentes devem aparecer como pendência/placeholder, nunca
  // como informação inferida de outra etapa.
  const etapaPodeEditar = podeEditar && comp.status !== "encerrada";
  const podeEncerrar = (hasRole(roles, "acp") || hasRole(roles, "admin"));

  const recursoFmsCompleto = Boolean(
    comp.recurso_fms_data &&
      Number(comp.recurso_fms_valor ?? 0) > 0 &&
      comp.recurso_fms_referencia?.trim() &&
      comp.recurso_fms_link?.trim() &&
      totais.estadual > 0 &&
      Math.abs(Number(comp.recurso_fms_valor ?? 0) - totais.estadual) < 0.01,
  );

  const gerarRelatorio = async () => {
    setGerandoRelatorio(true);
    try {
      const [
        { data: documentos, error: erroDocs },
        { data: empenhosOrigem, error: erroEmpOrigem },
        { data: alocacoes, error: erroAlocacoes },
        { data: pagamentos, error: erroPag },
        { data: notificacoes, error: erroNotif },
      ] = await Promise.all([
        supabase
          .from("pvh_documentos")
          .select("*")
          .eq("competencia_id", id)
          .order("created_at"),
        supabase
          .from("pvh_empenhos")
          .select("*,prestadores(nome_instituicao)")
          .eq("solicitacao_competencia_id", id)
          .neq("status", "cancelado")
          .order("created_at"),
        supabase
          .from("pvh_empenho_alocacoes")
          .select(
            "id,participante_id,valor_alocado,pvh_empenhos(*,prestadores(nome_instituicao)),pvh_participantes(prestadores(nome_instituicao)),pvh_subempenhos(*)",
          )
          .in(
            "participante_id",
            (participantes.data ?? []).map((participante: any) => participante.id),
          )
          .order("created_at"),
        supabase
          .from("pvh_pagamentos")
          .select("*")
          .eq("competencia_id", id)
          .order("created_at"),
        supabase
          .from("pvh_notificacoes_email")
          .select("*")
          .eq("competencia_id", id)
          .order("created_at"),
      ]);

      const erro =
        erroDocs || erroEmpOrigem || erroAlocacoes || erroPag || erroNotif;
      if (erro) throw erro;

      const empenhosMap = new Map<string, any>();

      for (const empenho of empenhosOrigem ?? []) {
        empenhosMap.set(empenho.id, {
          ...empenho,
          valor_alocado_competencia: 0,
        });
      }

      for (const alocacao of alocacoes ?? []) {
        const empenho = Array.isArray((alocacao as any).pvh_empenhos)
          ? (alocacao as any).pvh_empenhos[0]
          : (alocacao as any).pvh_empenhos;
        if (!empenho) continue;

        empenhosMap.set(empenho.id, {
          ...(empenhosMap.get(empenho.id) ?? empenho),
          ...empenho,
          valor_alocado_competencia:
            Number(
              empenhosMap.get(empenho.id)?.valor_alocado_competencia ?? 0,
            ) + Number((alocacao as any).valor_alocado ?? 0),
        });
      }

      const empenhosRelatorio = [...empenhosMap.values()].sort(
        (a, b) =>
          new Date(a.created_at ?? 0).getTime() -
          new Date(b.created_at ?? 0).getTime(),
      );

      const subempenhosRelatorio = (alocacoes ?? []).flatMap((alocacao: any) => {
        const empenho = Array.isArray(alocacao.pvh_empenhos)
          ? alocacao.pvh_empenhos[0]
          : alocacao.pvh_empenhos;
        const participante = Array.isArray(alocacao.pvh_participantes)
          ? alocacao.pvh_participantes[0]
          : alocacao.pvh_participantes;
        const prestador = Array.isArray(participante?.prestadores)
          ? participante.prestadores[0]
          : participante?.prestadores;

        return (alocacao.pvh_subempenhos ?? []).map((subempenho: any) => ({
          ...subempenho,
          numero_ne: empenho?.numero_ne ?? null,
          instituicao: prestador?.nome_instituicao ?? null,
          valor_alocado: Number(alocacao.valor_alocado ?? 0),
        }));
      });

      const ok = gerarRelatorioExecutivoPvh({
        competencia: comp,
        participantes: participantes.data ?? [],
        documentos: documentos ?? [],
        empenhos: empenhosRelatorio,
        subempenhos: subempenhosRelatorio,
        pagamentos: pagamentos ?? [],
        notificacoes: notificacoes ?? [],
        logs: logs.data ?? [],
        geradoPor: profile?.nome,
      });
      if (!ok) {
        toast.error("O navegador bloqueou a abertura do relatório.");
      }
    } catch (error: any) {
      toast.error(error.message ?? "Não foi possível gerar o relatório executivo.");
    } finally {
      setGerandoRelatorio(false);
    }
  };

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
        onAbrirLinhaTempo={() => setLinhaTempoAberta(true)}
        onGerarRelatorio={gerarRelatorio}
        relatorioDisabled={gerandoRelatorio}
      />

      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-sm text-muted-foreground">
          Etapa selecionada ·{" "}
          <span className="font-medium text-foreground">{guia.titulo}</span>
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
          podeEditar={podeEditarPortariaMunicipal && etapaPodeEditar}
          podeEditarFms={etapaPodeEditar}
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
        <EtapaSubempenhosPvh
          competenciaId={id}
          competencia={comp.competencia}
          participantes={participantes.data ?? []}
          concluidas={concluidas}
          reconferir={reconferir}
          podeEditar={etapaPodeEditar}
          recursoFmsCompleto={recursoFmsCompleto}
        />
      ) : etapaSelecionada === 5 ? (
        <EtapaPagamentosPvh
          competenciaId={id}
          participantes={participantes.data ?? []}
          concluidas={concluidas}
          reconferir={reconferir}
          podeEditar={etapaPodeEditar}
        />
      ) : etapaSelecionada === 6 ? (
        <EtapaComunicacaoPvh
          competenciaId={id}
          competencia={comp.competencia}
          portariaMunicipalNumero={comp.portaria_municipal_numero}
          participantes={participantes.data ?? []}
          concluidas={concluidas}
          reconferir={reconferir}
          podeEditar={etapaPodeEditar}
        />
      ) : (
        <EtapaEncerramentoPvh
          competenciaId={id}
          competencia={comp}
          participantes={participantes.data ?? []}
          concluidas={concluidas}
          reconferir={reconferir}
          podeEncerrar={podeEncerrar}
          onSelecionarEtapa={setEtapaSelecionada}
        />
      )}

      <Dialog open={linhaTempoAberta} onOpenChange={setLinhaTempoAberta}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Linha do tempo · PVH {comp.competencia}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Registro auditável das alterações, responsáveis e eventos da competência.
          </p>
          {logs.isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Não foi possível carregar o histórico.
            </div>
          ) : (logs.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sem registros ainda.
            </p>
          ) : (
            <ol className="mt-2 space-y-3 border-l-2 border-primary/20 pl-5">
              {(logs.data ?? []).map((log: any) => {
                const evento = formatarEventoHistoricoPvh(log, {
                  competencia: comp,
                  participantes: participantes.data ?? [],
                });

                return (
                  <li key={log.id} className="relative text-sm">
                    <span className="absolute -left-[1.78rem] top-1 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                    <p className="font-medium">{evento.titulo}</p>
                    {evento.detalhes.length > 0 && (
                      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {evento.detalhes.map((detalhe, index) => (
                          <p key={`${log.id}-detalhe-${index}`}>• {detalhe}</p>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dateTime(log.data_hora)} · {log.usuario_nome || "Sistema"}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
