import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Plus, Trash2, AlertTriangle, History, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { PISO_ETAPAS, STATUS_COMPETENCIA, etapaAtualPiso } from "@/lib/piso/etapas";
import { cn } from "@/lib/utils";
import { type CtxPiso } from "@/lib/piso/regras";
import { EtapaPiso } from "@/components/piso/EtapasPiso";
import { gerarRelatorioExecutivoPiso } from "@/lib/piso/relatorio";
import { formatarDataHoraEvento, formatarEventoPiso } from "@/lib/piso/historico";
import { statusParticipantePiso } from "@/lib/piso/status";

import { consultarFonte, reunirFontes } from "@/lib/piso/carregamento";
import { pendenciasConclusao, validarConclusao, etapaAposConclusao } from "@/lib/piso/conclusao";
import { Skeleton } from "@/components/ui/skeleton";
import { SeiButton } from "@/components/inputs/SeiLink";
import { calcularReconferencia, reconferenciaMudou } from "@/lib/piso/reconferencia";

// A tabela aditiva ainda não consta nos tipos gerados do Supabase.
type CnesPrestador = {
  id: string;
  prestador_id: string;
  cnes: string;
  nome_estabelecimento: string | null;
  created_at: string;
};
type BancoPiso = Database & {
  public: {
    Tables: {
      prestador_cnes: {
        Row: CnesPrestador;
        Insert: Partial<CnesPrestador> & Pick<CnesPrestador, "prestador_id" | "cnes">;
        Update: Partial<CnesPrestador>;
        Relationships: [];
      };
    };
  };
};
const clienteCnes = supabase as SupabaseClient<BancoPiso>;
const PISO_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
} as const;

export const Route = createFileRoute("/_authenticated/piso/$id")({
  head: () => ({
    meta: [
      { title: "Competência — Piso da Enfermagem" },
      {
        name: "description",
        content: "Esteira das 8 etapas da competência do Piso da Enfermagem.",
      },
    ],
  }),
  component: PisoCompetencia,
});

function PisoCompetencia() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { roles, profile } = useAuth();
  const podeEditar = hasRole(roles, "acp") || hasRole(roles, "aco");
  const [novoPrestador, setNovoPrestador] = useState("");
  const [linhaDoTempoAberta, setLinhaDoTempoAberta] = useState(false);

  const comp = useQuery({
    queryKey: ["piso_competencia", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("piso_competencias")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
    ...PISO_QUERY_OPTIONS,
  });
  const parts = useQuery({
    queryKey: ["piso_participantes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("piso_participantes")
        .select("*, prestadores(nome_instituicao, cnpj)")
        .eq("competencia_id", id);
      if (error) throw error;
      return data ?? [];
    },
    ...PISO_QUERY_OPTIONS,
  });
  const prestadores = useQuery({
    queryKey: ["prestadores-piso-inclusao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prestadores")
        .select("id,nome_instituicao,status")
        .eq("status", "ativo")
        .order("nome_instituicao");
      if (error) throw error;
      return data ?? [];
    },
    ...PISO_QUERY_OPTIONS,
  });
  const logs = useQuery({
    queryKey: ["piso_logs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historico_logs")
        .select("*")
        .eq("piso_competencia_id", id)
        .order("data_hora", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    ...PISO_QUERY_OPTIONS,
  });
  const extra = useQuery({
    queryKey: ["piso_extra", id],
    queryFn: async () => {
      const participantes = await consultarFonte(
        "piso_participantes",
        supabase.from("piso_participantes").select("id,prestador_id").eq("competencia_id", id),
      );
      const partIds = participantes.map((p) => p.id);
      const prestadorIds = participantes.map((p) => p.prestador_id);
      const fontes = await reunirFontes({
        // Verifica também o schema usado nas gravações; select('*') sozinho não
        // detecta migrations ausentes e deixa os formulários falharem depois.
        esquema: consultarFonte(
          "piso_competencias (migration operacional v2)",
          supabase
            .from("piso_competencias")
            .select(
              "investsus_ocorrencia,investsus_auditoria,portaria_gm_secao,portaria_gm_pagina,desconto_identificacao,acerto_identificacao,credito_fms_referencia,credito_fms_link,municipal_config,relatorio_gerado_em,conclusao_ocorrencia",
            )
            .eq("id", id)
            .single(),
        ),
        docs: consultarFonte(
          "piso_documentos",
          supabase.from("piso_documentos").select("*").eq("competencia_id", id),
        ),
        matriz: consultarFonte(
          "piso_assinatura_matriz",
          supabase.from("piso_assinatura_matriz").select("*"),
        ),
        obrigs: partIds.length
          ? consultarFonte(
              "piso_obrigacoes",
              supabase
                .from("piso_obrigacoes")
                .select(
                  "*,exercicio,cr_dotacao,data_solicitacao_liquidacao,data_movimento_liquidacao,movimento_transmitido,data_programacao",
                )
                .in("participante_id", partIds)
                .order("created_at")
                .overrideTypes<CtxPiso["obrigs"], { merge: false }>(),
            )
          : Promise.resolve([]),
        arquivos: consultarFonte(
          "piso_arquivos",
          supabase
            .from("piso_arquivos")
            .select("*")
            .eq("competencia_id", id)
            .order("enviado_em", { ascending: false }),
        ),
        ocorrencias: consultarFonte(
          "piso_ocorrencias",
          supabase
            .from("piso_ocorrencias")
            .select("*,categoria,cpf_mascarado,cnes,instituicao_nome,dados")
            .eq("competencia_id", id)
            .order("created_at", { ascending: false })
            .overrideTypes<NonNullable<CtxPiso["ocorrencias"]>, { merge: false }>(),
        ),
        cnes: prestadorIds.length
          ? consultarFonte(
              "prestador_cnes",
              clienteCnes.from("prestador_cnes").select("*").in("prestador_id", prestadorIds),
            )
          : Promise.resolve([]),
      });
      const docIds = fontes.docs.map((d) => d.id);
      const documentos = await reunirFontes({
        assinaturas: docIds.length
          ? consultarFonte(
              "piso_documento_assinaturas",
              supabase.from("piso_documento_assinaturas").select("*").in("documento_id", docIds),
            )
          : Promise.resolve([]),
        encaminhamentos: docIds.length
          ? consultarFonte(
              "piso_encaminhamentos",
              supabase.from("piso_encaminhamentos").select("*").in("documento_id", docIds),
            )
          : Promise.resolve([]),
      });
      return {
        ...fontes,
        ...documentos,
        docs: fontes.docs.map((doc) => ({
          ...doc,
          dados:
            doc.dados && typeof doc.dados === "object" && !Array.isArray(doc.dados)
              ? doc.dados
              : undefined,
        })),
      };
    },
    ...PISO_QUERY_OPTIONS,
  });
  // Fontes auxiliares têm seus próprios estados: falhas não apagam a etapa.
  const pool = useQuery({
    queryKey: ["piso_pool"],
    queryFn: () =>
      consultarFonte("assinaturas_config", supabase.from("assinaturas_config").select("*")),
    ...PISO_QUERY_OPTIONS,
  });
  const feriados = useQuery({
    queryKey: ["piso_feriados"],
    queryFn: () =>
      consultarFonte("piso_feriados", supabase.from("piso_feriados").select("*").order("data")),
    ...PISO_QUERY_OPTIONS,
  });
  const [aberta, setAberta] = useState<number | null>(null);

  const ctx: CtxPiso | null =
    comp.data &&
    parts.data &&
    extra.data &&
    ![comp, parts, extra].some((q) => q.isLoading || q.isError)
      ? {
          comp: comp.data,
          parts: parts.data,
          obrigs: extra.data.obrigs,
          docs: extra.data.docs,
          assinaturas: extra.data.assinaturas,
          matriz: extra.data.matriz,
          encaminhamentos: extra.data.encaminhamentos,
          arquivos: extra.data.arquivos,
          ocorrencias: extra.data.ocorrencias,
          cnes: extra.data.cnes,
        }
      : null;
  const [scrollPainel, setScrollPainel] = useState(0);
  const selecionarEtapa = (n: number) => {
    setAberta(n);
    setScrollPainel((v) => v + 1);
  };
  useEffect(() => {
    if (scrollPainel)
      document
        .getElementById("piso-etapa-detalhe")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [aberta, scrollPainel]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["piso_competencia", id] });
    qc.invalidateQueries({ queryKey: ["piso_participantes", id] });
    qc.invalidateQueries({ queryKey: ["piso_logs", id] });
    qc.invalidateQueries({ queryKey: ["piso_extra", id] });
    qc.invalidateQueries({ queryKey: ["piso_competencias"] });
  };
  const onErr = (e: any) => toast.error(e.message);

  const reconferenciaCalculada = ctx
    ? calcularReconferencia(ctx)
    : (comp.data?.etapas_reconferir ?? []);
  const precisaSalvarReconferencia =
    ctx && reconferenciaMudou(ctx.comp.etapas_reconferir, reconferenciaCalculada);
  const tentativaReconferencia = useRef<string | null>(null);
  const tentativaConclusaoAutomatica = useRef<string | null>(null);
  const toggleEmAndamento = useRef(false);
  const salvarReconferencia = useMutation({
    mutationFn: async ({ contexto, etapas }: { contexto: CtxPiso; etapas: number[] }) => {
      if (!podeEditar) throw new Error("Você não tem permissão para registrar reconferência.");
      const { data, error } = await supabase
        .from("piso_competencias")
        .update({
          etapas_reconferir: etapas,
          // A guarda do banco exige reabrir uma competência encerrada antes de alterar.
          // Preserva etapas_concluidas e todo o histórico da conclusão anterior.
          ...(contexto.comp.status === "encerrada" ? { status: "em_andamento" } : {}),
        })
        .eq("id", id)
        .eq("updated_at", contexto.comp.updated_at)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      // Sem linha retornada = outro usuário alterou o registro. Recarregue e recalcule.
      return Boolean(data);
    },
    onSuccess: refresh,
  });
  const { mutate: registrarReconferencia, isPending: registrandoReconferencia } =
    salvarReconferencia;
  const assinaturaReconferencia = precisaSalvarReconferencia
    ? JSON.stringify([
        id,
        ctx.comp.updated_at,
        ctx.comp.etapas_concluidas,
        ctx.comp.etapas_reconferir,
        reconferenciaCalculada,
        parts.dataUpdatedAt,
        extra.dataUpdatedAt,
      ])
    : null;
  useEffect(() => {
    if (
      !ctx ||
      !podeEditar ||
      !assinaturaReconferencia ||
      registrandoReconferencia ||
      toggleEmAndamento.current ||
      tentativaReconferencia.current === assinaturaReconferencia
    )
      return;
    tentativaReconferencia.current = assinaturaReconferencia;
    registrarReconferencia({ contexto: ctx, etapas: calcularReconferencia(ctx) });
  }, [ctx, podeEditar, assinaturaReconferencia, registrandoReconferencia, registrarReconferencia]);

  const addPart = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("piso_participantes")
        .insert({ competencia_id: id, prestador_id: novoPrestador });
      if (error) throw error.code === "23505" ? new Error("Instituição já incluída.") : error;
    },
    onSuccess: () => {
      setNovoPrestador("");
      refresh();
    },
    onError: onErr,
  });
  const delPart = useMutation({
    mutationFn: async (pid: string) => {
      const { error } = await supabase.from("piso_participantes").delete().eq("id", pid);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: onErr,
  });
  const toggleEtapa = useMutation({
    mutationFn: async (n: number) => {
      if (!podeEditar) throw new Error("Você não tem permissão para alterar etapas.");
      if (salvarReconferencia.isPending) throw new Error("Aguarde o registro da reconferência.");
      if (!comp.data || comp.isError || comp.isFetching)
        throw new Error("Aguarde o carregamento da competência antes de alterar etapas.");
      const concluindo =
        !comp.data.etapas_concluidas?.[String(n)] ||
        (ctx ? calcularReconferencia(ctx) : (comp.data.etapas_reconferir ?? [])).includes(n);
      let competencia = comp.data;
      let reconferencia = ctx ? calcularReconferencia(ctx) : (competencia.etapas_reconferir ?? []);
      if (concluindo) {
        validarConclusao(n, ctx);
        // Revalida a partir do banco antes de gravar, inclusive quando a mutation
        // for chamada sem passar pelo botão ou quando o cache estiver desatualizado.
        const [novaComp, novosParts, novosExtra] = await Promise.all([
          comp.refetch({ throwOnError: true }),
          parts.refetch({ throwOnError: true }),
          extra.refetch({ throwOnError: true }),
        ]);
        if (!novaComp.data || !novosParts.data || !novosExtra.data)
          throw new Error("Não foi possível carregar o contexto completo para validar a etapa.");
        competencia = novaComp.data;
        const contextoAtualizado = {
          comp: competencia,
          parts: novosParts.data,
          ...novosExtra.data,
        };
        reconferencia = calcularReconferencia(contextoAtualizado);
        validarConclusao(n, contextoAtualizado);
        if (competencia.etapas_concluidas?.[String(n)] && !reconferencia.includes(n))
          throw new Error("Esta etapa já foi concluída. Atualize a competência.");
      }
      const atual = { ...(competencia.etapas_concluidas ?? {}) };
      atual[String(n)] = concluindo;
      const reconf = reconferencia.filter((x: number) => x !== n);
      const status =
        atual["8"] && reconf.length === 0
          ? "encerrada"
          : Object.values(atual).some(Boolean)
            ? "em_andamento"
            : "aberta";
      const { error } = await supabase
        .from("piso_competencias")
        .update({ etapas_concluidas: atual, etapas_reconferir: reconf, status })
        .eq("id", id);
      if (error) throw error;
      return { n, concluindo };
    },
    onMutate: () => {
      toggleEmAndamento.current = true;
    },
    onSettled: () => {
      toggleEmAndamento.current = false;
    },
    onSuccess: ({ n, concluindo }) => {
      if (concluindo) selecionarEtapa(etapaAposConclusao(n));
      refresh();
    },
    onError: (erro) =>
      toast.error("Não foi possível alterar a etapa", {
        description: erro.message,
        duration: 10000,
      }),
  });
  const alvoConclusaoAutomatica =
    ctx && comp.data
      ? (calcularReconferencia(ctx)[0] ?? etapaAtualPiso(comp.data.etapas_concluidas))
      : null;
  const precisaConclusaoAutomatica =
    alvoConclusaoAutomatica != null &&
    Boolean(
      !comp.data?.etapas_concluidas?.[String(alvoConclusaoAutomatica)] ||
        (ctx ? calcularReconferencia(ctx) : []).includes(alvoConclusaoAutomatica),
    );
  const pendenciasConclusaoAutomatica =
    alvoConclusaoAutomatica != null ? pendenciasConclusao(alvoConclusaoAutomatica, ctx) : [];
  const assinaturaConclusaoAutomatica =
    alvoConclusaoAutomatica != null && precisaConclusaoAutomatica
      ? JSON.stringify([
          alvoConclusaoAutomatica,
          comp.data?.updated_at,
          pendenciasConclusaoAutomatica,
          extra.dataUpdatedAt,
          parts.dataUpdatedAt,
        ])
      : null;
  useEffect(() => {
    if (
      !podeEditar ||
      !alvoConclusaoAutomatica ||
      !precisaConclusaoAutomatica ||
      pendenciasConclusaoAutomatica.length > 0 ||
      toggleEtapa.isPending ||
      salvarReconferencia.isPending ||
      comp.isFetching ||
      !assinaturaConclusaoAutomatica ||
      tentativaConclusaoAutomatica.current === assinaturaConclusaoAutomatica
    )
      return;
    tentativaConclusaoAutomatica.current = assinaturaConclusaoAutomatica;
    toggleEtapa.mutate(alvoConclusaoAutomatica);
  }, [
    podeEditar,
    alvoConclusaoAutomatica,
    precisaConclusaoAutomatica,
    assinaturaConclusaoAutomatica,
    pendenciasConclusaoAutomatica.length,
    toggleEtapa.isPending,
    salvarReconferencia.isPending,
    comp.isFetching,
  ]);
  if (comp.isError)
    return (
      <Card role="alert">
        <CardContent className="pt-6">
          Não foi possível carregar a competência. {comp.error.message}
          <Button variant="outline" onClick={() => comp.refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  if (comp.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!comp.data) return <p className="text-sm">Competência não encontrada.</p>;
  const c = comp.data;
  const concl = c.etapas_concluidas ?? {};
  const atual = etapaAtualPiso(concl);
  const reconf: number[] = reconferenciaCalculada;
  const lista = parts.data ?? [];
  const jaIncluidos = new Set(lista.map((p: any) => p.prestador_id));
  const disponiveis = (prestadores.data ?? []).filter((p: any) => !jaIncluidos.has(p.id));
  const etapaSel = aberta ?? reconf[0] ?? atual;
  const etapaFeitaSel = Boolean(concl[String(etapaSel)]);
  const etapaReconferirSel = reconf.includes(etapaSel);
  const pendenciasSel = pendenciasConclusao(etapaSel, ctx);

  return (
    <div className="space-y-4">
      <Link
        to="/piso"
        className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-4 w-4" />
        Competências
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-primary">Piso da Enfermagem · {c.competencia}</h1>
        <Badge variant="outline">{STATUS_COMPETENCIA[c.status] ?? c.status}</Badge>
        {c.link_processo_sei && (
          <SeiButton
            href={c.link_processo_sei}
            label={c.processo_sei ? `SEI ${c.processo_sei}` : "Abrir processo no SEI"}
          />
        )}
        <Dialog open={linhaDoTempoAberta} onOpenChange={setLinhaDoTempoAberta}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              <History className="mr-2 h-4 w-4" />
              Linha do tempo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Linha do tempo · {c.competencia}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Registro auditável de data, hora, responsável e ação realizada nesta competência.
            </p>
            {logs.isError ? (
              <div
                role="alert"
                className="my-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              >
                Não foi possível carregar o histórico. {(logs.error as Error).message}
              </div>
            ) : (logs.data ?? []).length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground text-center">Sem registros ainda.</p>
            ) : (
              <ol className="mt-2 space-y-3 border-l-2 border-primary/20 pl-5">
                {(logs.data ?? []).map((l: any) => {
                  const evento = formatarEventoPiso(l);
                  return (
                    <li key={l.id} className="relative text-sm">
                      <span className="absolute -left-[1.78rem] top-1 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                      <p className="font-medium">{evento.titulo}</p>
                      <p className="text-muted-foreground">
                        {formatarDataHoraEvento(l.data_hora)} · {l.usuario_nome || "Sistema"}
                      </p>
                      {evento.linhas.length > 0 && (
                        <ul className="mt-1 space-y-1 rounded bg-muted p-2 text-xs text-muted-foreground">
                          {evento.linhas.map((linha) => (
                            <li key={linha}>{linha}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </DialogContent>
        </Dialog>
        <Button
          variant="outline"
          size="sm"
          disabled={!ctx || pool.isError || feriados.isError || feriados.isFetching}
          onClick={async () => {
            if (!ctx) return;
            const ok = gerarRelatorioExecutivoPiso(
              c,
              lista,
              extra.data?.obrigs ?? [],
              extra.data?.docs ?? [],
              logs.data ?? [],
              profile?.nome,
              {
                arquivos: extra.data?.arquivos ?? [],
                ocorrencias: extra.data?.ocorrencias ?? [],
                feriados: feriados.data ?? [],
              },
            );
            if (ok) {
              await (supabase as any)
                .from("piso_competencias")
                .update({ relatorio_gerado_em: new Date().toISOString() })
                .eq("id", id);
              refresh();
            }
          }}
        >
          <FileDown className="mr-2 h-4 w-4" />
          Relatório executivo
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Esteira da competência</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto pb-5">
          <ol className="flex min-w-[900px] items-start px-2">
            {PISO_ETAPAS.map((e, index) => {
              const feito = !!concl[String(e.n)] && !reconf.includes(e.n);
              const reconferir = reconf.includes(e.n);
              const corrente = e.n === (reconf[0] ?? atual) && !feito;
              const acessivel = feito || reconferir || corrente;
              const pend = ctx && acessivel ? pendenciasConclusao(e.n, ctx).length : 0;
              return (
                <li key={e.n} className="relative flex flex-1 flex-col items-center text-center">
                  {index < PISO_ETAPAS.length - 1 && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-1/2 top-4 h-1 w-full",
                        feito ? "bg-success" : "bg-muted",
                      )}
                    />
                  )}
                  <button
                    type="button"
                    disabled={!acessivel}
                    aria-current={etapaSel === e.n ? "step" : undefined}
                    title={!acessivel ? "Esta etapa será liberada quando as anteriores forem concluídas." : e.desc}
                    onClick={() => selecionarEtapa(e.n)}
                    className={cn(
                      "relative z-10 grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-bold transition",
                      feito && "border-success bg-success text-success-foreground",
                      corrente && "border-primary bg-primary text-primary-foreground",
                      reconferir && !corrente && "border-primary bg-primary text-primary-foreground",
                      !acessivel && "cursor-not-allowed border-muted bg-muted text-muted-foreground",
                      etapaSel === e.n && acessivel && "ring-4 ring-primary/15",
                    )}
                  >
                    {feito ? <Check className="h-4 w-4" /> : e.n}
                  </button>
                  <span
                    className={cn(
                      "relative z-10 mt-2 max-w-[110px] text-[11px] font-medium leading-tight",
                      !acessivel && "text-muted-foreground",
                    )}
                  >
                    {e.titulo}
                  </span>
                  {corrente && pend > 0 && (
                    <span className="mt-1 text-[10px] text-destructive">{pend} pend.</span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Verde = concluída automaticamente · azul = etapa atual · cinza = ainda não liberada.
          </p>
        </CardContent>
      </Card>

      {salvarReconferencia.isError && (
        <Card role="alert" className="border-destructive/40">
          <CardContent className="space-y-2 pt-6">
            <p>
              Não foi possível registrar a reconferência no banco. O avanço permanece bloqueado.
            </p>
            <p className="text-sm text-destructive">{salvarReconferencia.error.message}</p>
            <Button
              variant="outline"
              disabled={!ctx || salvarReconferencia.isPending}
              onClick={() => {
                if (ctx)
                  salvarReconferencia.mutate({ contexto: ctx, etapas: calcularReconferencia(ctx) });
              }}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      <Card
        id="piso-etapa-detalhe"
        className="scroll-mt-20"
        aria-busy={extra.isLoading || parts.isLoading}
      >
        <CardHeader>
          <CardTitle className="text-base">
            Etapa {etapaSel} — {PISO_ETAPAS[etapaSel - 1].titulo}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {extra.isError || parts.isError ? (
            <div
              role="alert"
              className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
            >
              <p className="font-medium">
                Não foi possível carregar os dados operacionais desta competência.
              </p>
              <p className="whitespace-pre-wrap break-words text-sm text-destructive">
                {[extra.error?.message, parts.error?.message].filter(Boolean).join("\n")}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  extra.refetch();
                  parts.refetch();
                }}
              >
                Tentar novamente
              </Button>
            </div>
          ) : !ctx || !extra.data ? (
            <div role="status" className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Carregando dados operacionais da etapa…
              </p>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              {[pool, feriados].map(
                (fonte, i) =>
                  fonte.isError && (
                    <div
                      key={i}
                      role="alert"
                      className="mb-3 rounded-md border border-destructive/40 p-3 text-sm"
                    >
                      <p>
                        {i === 0
                          ? "Lista de servidores indisponível. As assinaturas já registradas permanecem válidas."
                          : "Calendário de feriados indisponível. Os prazos exibidos consideram apenas fins de semana."}
                      </p>
                      <p className="break-words text-destructive">{fonte.error.message}</p>
                      <Button variant="outline" size="sm" onClick={() => fonte.refetch()}>
                        Tentar novamente
                      </Button>
                    </div>
                  ),
              )}
              <EtapaPiso
                key={etapaSel}
                n={etapaSel}
                ctx={ctx}
                arquivos={extra.data.arquivos}
                pool={pool.data ?? []}
                cnes={extra.data.cnes}
                feriados={feriados.data ?? []}
                ocorrencias={extra.data.ocorrencias}
                canEdit={podeEditar && c.status !== "encerrada"}
                onChange={refresh}
              />
              <div
                className={`mt-6 rounded-md border p-3 text-sm ${
                  pendenciasSel.length
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-success/30 bg-success/5"
                }`}
              >
                <p className="font-semibold">
                  {pendenciasSel.length
                    ? `Bloqueios para avançar (${pendenciasSel.length})`
                    : etapaFeitaSel && !etapaReconferirSel
                      ? "Etapa concluída"
                      : "Validação concluída"}
                </p>
                {pendenciasSel.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive">
                    {pendenciasSel.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-success">
                    Sem pendências — a etapa está pronta para conclusão.
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-4">
                <Button
                  variant="outline"
                  disabled={etapaSel === 1}
                  onClick={() => selecionarEtapa(Math.max(1, etapaSel - 1))}
                >
                  ← Etapa anterior
                </Button>
                <div className="mr-auto text-[11px] text-muted-foreground">
                  A etapa é concluída automaticamente quando todos os requisitos obrigatórios estiverem completos.
                </div>
                {etapaFeitaSel && etapaSel < 8 && (
                  <Button onClick={() => selecionarEtapa(etapaSel + 1)}>Próxima etapa →</Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {etapaSel === 1 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
            <CardTitle className="text-base mr-auto">
              Instituições participantes ({lista.length})
            </CardTitle>
          {podeEditar && (
            <>
              <Select
                value={novoPrestador}
                onValueChange={setNovoPrestador}
                disabled={prestadores.isError}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Selecionar prestador" />
                </SelectTrigger>
                <SelectContent>
                  {disponiveis.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome_instituicao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!novoPrestador || addPart.isPending}
                onClick={() => addPart.mutate()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Incluir
              </Button>
            </>
          )}
        </CardHeader>
        <CardContent>
          {prestadores.isError && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              Não foi possível carregar os prestadores ativos para inclusão. As instituições já
              vinculadas permanecem abaixo. {(prestadores.error as Error).message}
            </div>
          )}
          {parts.isError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              Não foi possível carregar as instituições vinculadas a esta competência.{" "}
              {(parts.error as Error).message}
            </div>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma instituição incluída.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="py-2">Instituição</th>
                  <th>Situação</th>
                  <th>Envio</th>
                  <th>Retorno</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p: any) =>
                  (() => {
                    const arquivosPart = (extra.data?.arquivos ?? []).filter(
                      (a: any) => a.participante_id === p.id && a.categoria === "planilha_carga",
                    );
                    const ultimo = arquivosPart.sort((a: any, b: any) =>
                      b.enviado_em.localeCompare(a.enviado_em),
                    )[0];
                    const ocorrencias = (extra.data?.ocorrencias ?? []).filter(
                      (o: any) =>
                        o.participante_id === p.id && (!ultimo || o.arquivo_id === ultimo.id),
                    ).length;
                    const status = statusParticipantePiso(p, Boolean(ultimo), ocorrencias);
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{p.prestadores?.nome_instituicao}</td>
                        <td>
                          <Badge
                            variant={
                              status.tom === "erro"
                                ? "destructive"
                                : status.tom === "sucesso"
                                  ? "default"
                                  : "outline"
                            }
                          >
                            {status.rotulo}
                          </Badge>
                        </td>
                        <td>
                          {p.data_envio
                            ? new Date(p.data_envio + "T12:00").toLocaleDateString("pt-BR")
                            : "—"}
                        </td>
                        <td>
                          {p.data_retorno
                            ? new Date(p.data_retorno + "T12:00").toLocaleDateString("pt-BR")
                            : "—"}
                        </td>
                        <td className="text-right">
                          {podeEditar && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                confirm("Remover instituição?") && delPart.mutate(p.id)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })(),
                )}
              </tbody>
            </table>
          )}
        </CardContent>
        </Card>
      )}
    </div>
  );
}
