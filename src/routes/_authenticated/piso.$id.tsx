import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Plus, Trash2, AlertTriangle, History, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import { pendenciasEtapa, type CtxPiso } from "@/lib/piso/regras";
import { EtapaPiso } from "@/components/piso/EtapasPiso";
import { gerarRelatorioExecutivoPiso } from "@/lib/piso/relatorio";
import { formatarDataHoraEvento, formatarEventoPiso } from "@/lib/piso/historico";
import { statusParticipantePiso } from "@/lib/piso/status";

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
  });
  const extra = useQuery({
    queryKey: ["piso_extra", id],
    queryFn: async () => {
      const participantes = await supabase
        .from("piso_participantes")
        .select("id,prestador_id")
        .eq("competencia_id", id);
      if (participantes.error) throw participantes.error;
      const partIds = (participantes.data ?? []).map((p) => p.id);
      const prestadorIds = (participantes.data ?? []).map((p) => p.prestador_id);
      const [docs, matriz, obrigs, arqs, pool, ocorrencias, feriados, cnes] = await Promise.all([
        supabase.from("piso_documentos").select("*").eq("competencia_id", id),
        supabase.from("piso_assinatura_matriz").select("*"),
        partIds.length
          ? supabase
              .from("piso_obrigacoes")
              .select("*")
              .in("participante_id", partIds)
              .order("created_at")
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("piso_arquivos")
          .select("*")
          .eq("competencia_id", id)
          .order("enviado_em", { ascending: false }),
        supabase.from("assinaturas_config").select("*"),
        supabase
          .from("piso_ocorrencias")
          .select("*")
          .eq("competencia_id", id)
          .order("created_at", { ascending: false }),
        supabase.from("piso_feriados").select("*").order("data"),
        prestadorIds.length
          ? (supabase as any).from("prestador_cnes").select("*").in("prestador_id", prestadorIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      for (const resultado of [docs, matriz, obrigs, arqs, pool, ocorrencias, feriados, cnes]) {
        if ("error" in resultado && resultado.error) throw resultado.error;
      }
      const docIds = (docs.data ?? []).map((d) => d.id);
      const [ass, encs] = docIds.length
        ? await Promise.all([
            supabase.from("piso_documento_assinaturas").select("*").in("documento_id", docIds),
            supabase.from("piso_encaminhamentos").select("*").in("documento_id", docIds),
          ])
        : [{ data: [] as any[] }, { data: [] as any[] }];
      if ("error" in ass && ass.error) throw ass.error;
      if ("error" in encs && encs.error) throw encs.error;
      return {
        docs: (docs.data ?? []) as any[],
        matriz: (matriz.data ?? []) as any[],
        obrigs: (obrigs.data ?? []) as any[],
        arquivos: (arqs.data ?? []) as any[],
        pool: (pool.data ?? []) as any[],
        assinaturas: (ass.data ?? []) as any[],
        encaminhamentos: (encs.data ?? []) as any[],
        ocorrencias: (ocorrencias.data ?? []) as any[],
        feriados: (feriados.data ?? []) as any[],
        cnes: (cnes.data ?? []) as any[],
      };
    },
  });
  const [aberta, setAberta] = useState<number | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["piso_competencia", id] });
    qc.invalidateQueries({ queryKey: ["piso_participantes", id] });
    qc.invalidateQueries({ queryKey: ["piso_logs", id] });
    qc.invalidateQueries({ queryKey: ["piso_extra", id] });
    qc.invalidateQueries({ queryKey: ["piso_competencias"] });
  };
  const onErr = (e: any) => toast.error(e.message);

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
      const atual = { ...(comp.data?.etapas_concluidas ?? {}) };
      atual[String(n)] = !atual[String(n)];
      const reconf = (comp.data?.etapas_reconferir ?? []).filter((x: number) => x !== n);
      const status = atual["8"]
        ? "encerrada"
        : Object.values(atual).some(Boolean)
          ? "em_andamento"
          : "aberta";
      const { error } = await supabase
        .from("piso_competencias")
        .update({ etapas_concluidas: atual, etapas_reconferir: reconf, status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: onErr,
  });
  if (comp.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!comp.data) return <p className="text-sm">Competência não encontrada.</p>;
  const c = comp.data;
  const concl = c.etapas_concluidas ?? {};
  const atual = etapaAtualPiso(concl);
  const reconf: number[] = c.etapas_reconferir ?? [];
  const lista = parts.data ?? [];
  const jaIncluidos = new Set(lista.map((p: any) => p.prestador_id));
  const disponiveis = (prestadores.data ?? []).filter((p: any) => !jaIncluidos.has(p.id));
  const etapaSel = aberta ?? atual;
  const ctx: CtxPiso | null = extra.data
    ? {
        comp: c,
        parts: lista,
        obrigs: extra.data.obrigs,
        docs: extra.data.docs,
        assinaturas: extra.data.assinaturas,
        matriz: extra.data.matriz,
        encaminhamentos: extra.data.encaminhamentos,
        arquivos: extra.data.arquivos,
        ocorrencias: extra.data.ocorrencias,
      }
    : null;

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
          <a
            href={c.link_processo_sei}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline"
          >
            SEI {c.processo_sei ?? ""}
          </a>
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
          onClick={async () => {
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
                feriados: extra.data?.feriados ?? [],
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
        <CardContent>
          <ol className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            {PISO_ETAPAS.map((e) => {
              const feito = !!concl[String(e.n)];
              const corrente = !feito && e.n === atual;
              const pend = ctx ? pendenciasEtapa(e.n, ctx).length : 0;
              return (
                <li
                  key={e.n}
                  onClick={() => setAberta(e.n)}
                  className={cn(
                    "rounded-md border p-3 text-xs space-y-2 cursor-pointer hover:shadow-sm flex min-h-40 flex-col",
                    feito && "border-success bg-success/10",
                    corrente && "border-primary bg-primary/5",
                    etapaSel === e.n && "ring-2 ring-primary",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-6 w-6 rounded-full grid place-items-center font-bold text-[11px] border",
                        feito
                          ? "bg-success text-success-foreground border-success"
                          : corrente
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted",
                      )}
                    >
                      {feito ? <Check className="h-3 w-3" /> : e.n}
                    </span>
                    <span className="font-semibold leading-tight">{e.titulo}</span>
                  </div>
                  <p className="text-muted-foreground leading-snug">{e.desc}</p>
                  {!feito && pend > 0 && <p className="text-destructive">{pend} pendência(s)</p>}
                  {reconf.includes(e.n) && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Reconferir
                    </Badge>
                  )}
                  {podeEditar && (
                    <Button
                      size="sm"
                      variant={feito ? "outline" : "default"}
                      className="mt-auto w-full h-7 text-xs"
                      disabled={toggleEtapa.isPending || (!feito && (e.n > atual || pend > 0))}
                      title={!feito && pend > 0 ? "Resolva as pendências para concluir" : undefined}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        toggleEtapa.mutate(e.n);
                      }}
                    >
                      {feito ? "Reabrir" : "Concluir"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {ctx && extra.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Etapa {etapaSel} — {PISO_ETAPAS[etapaSel - 1].titulo}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EtapaPiso
              n={etapaSel}
              ctx={ctx}
              arquivos={extra.data.arquivos}
              pool={extra.data.pool}
              cnes={extra.data.cnes}
              feriados={extra.data.feriados}
              ocorrencias={extra.data.ocorrencias}
              canEdit={podeEditar && c.status !== "encerrada"}
              onChange={refresh}
            />
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
