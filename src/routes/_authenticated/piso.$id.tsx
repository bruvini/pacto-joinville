import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Plus, Trash2, AlertTriangle, History, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { PISO_ETAPAS, SITUACAO_PARTICIPANTE, STATUS_COMPETENCIA, etapaAtualPiso } from "@/lib/piso/etapas";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { pendenciasEtapa, type CtxPiso } from "@/lib/piso/regras";
import { EtapaPiso } from "@/components/piso/EtapasPiso";
import { gerarRelatorioExecutivoPiso } from "@/lib/piso/relatorio";

export const Route = createFileRoute("/_authenticated/piso/$id")({
  head: () => ({
    meta: [
      { title: "Competência — Piso da Enfermagem" },
      { name: "description", content: "Esteira das 8 etapas da competência do Piso da Enfermagem." },
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
      const { data, error } = await supabase.from("piso_competencias").select("*").eq("id", id).single();
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
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("*").order("nome_instituicao")).data ?? [],
  });
  const logs = useQuery({
    queryKey: ["piso_logs", id],
    queryFn: async () =>
      (await supabase.from("historico_logs").select("*").eq("piso_competencia_id", id).order("data_hora", { ascending: false }).limit(50)).data ?? [],
  });
  const extra = useQuery({
    queryKey: ["piso_extra", id],
    queryFn: async () => {
      const partIds = (await supabase.from("piso_participantes").select("id").eq("competencia_id", id)).data?.map((p) => p.id) ?? [];
      const [docs, matriz, obrigs, arqs, pool] = await Promise.all([
        supabase.from("piso_documentos").select("*").eq("competencia_id", id),
        supabase.from("piso_assinatura_matriz").select("*"),
        partIds.length ? supabase.from("piso_obrigacoes").select("*").in("participante_id", partIds).order("created_at") : Promise.resolve({ data: [] as any[] }),
        supabase.from("piso_arquivos").select("*").eq("competencia_id", id).order("enviado_em", { ascending: false }),
        supabase.from("assinaturas_config").select("*"),
      ]);
      const docIds = (docs.data ?? []).map((d) => d.id);
      const [ass, encs] = docIds.length
        ? await Promise.all([
            supabase.from("piso_documento_assinaturas").select("*").in("documento_id", docIds),
            supabase.from("piso_encaminhamentos").select("*").in("documento_id", docIds),
          ])
        : [{ data: [] as any[] }, { data: [] as any[] }];
      return {
        docs: (docs.data ?? []) as any[], matriz: (matriz.data ?? []) as any[], obrigs: (obrigs.data ?? []) as any[],
        arquivos: (arqs.data ?? []) as any[], pool: (pool.data ?? []) as any[], assinaturas: (ass.data ?? []) as any[], encaminhamentos: (encs.data ?? []) as any[],
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
      const { error } = await supabase.from("piso_participantes").insert({ competencia_id: id, prestador_id: novoPrestador });
      if (error) throw error.code === "23505" ? new Error("Instituição já incluída.") : error;
    },
    onSuccess: () => { setNovoPrestador(""); refresh(); },
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
  const setSituacao = useMutation({
    mutationFn: async ({ pid, situacao }: { pid: string; situacao: string }) => {
      const hoje = new Date().toISOString().slice(0, 10);
      const patch: any = { situacao, sem_elegiveis: situacao === "sem_elegiveis" };
      if (situacao === "enviado") patch.data_envio = hoje;
      if (situacao === "retornado") patch.data_retorno = hoje;
      const { error } = await supabase.from("piso_participantes").update(patch).eq("id", pid);
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
      const status = atual["8"] ? "encerrada" : Object.values(atual).some(Boolean) ? "em_andamento" : "aberta";
      const { error } = await supabase
        .from("piso_competencias")
        .update({ etapas_concluidas: atual, etapas_reconferir: reconf, status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: onErr,
  });
  const salvarPrestacao = useMutation({
    mutationFn: async (patch: Record<string, string | null>) => {
      const { error } = await (supabase as any).from("piso_competencias").update(patch).eq("id", id);
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
  const disponiveis = (prestadores.data ?? []).filter((p: any) => p.status === "ativo" && !jaIncluidos.has(p.id));
  const etapaSel = aberta ?? atual;
  const ctx: CtxPiso | null = extra.data
    ? { comp: c, parts: lista, obrigs: extra.data.obrigs, docs: extra.data.docs, assinaturas: extra.data.assinaturas, matriz: extra.data.matriz, encaminhamentos: extra.data.encaminhamentos }
    : null;

  return (
    <div className="space-y-4">
      <Link to="/piso" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" />Competências
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-primary">Piso da Enfermagem · {c.competencia}</h1>
        <Badge variant="outline">{STATUS_COMPETENCIA[c.status] ?? c.status}</Badge>
        {c.link_processo_sei && (
          <a href={c.link_processo_sei} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
            SEI {c.processo_sei ?? ""}
          </a>
        )}
        <Dialog open={linhaDoTempoAberta} onOpenChange={setLinhaDoTempoAberta}>
          <DialogTrigger asChild><Button variant="outline" size="sm" className="ml-auto"><History className="mr-2 h-4 w-4" />Linha do tempo</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Linha do tempo · {c.competencia}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Registro auditável de data, hora, responsável e ação realizada nesta competência.</p>
            {(logs.data ?? []).length === 0 ? <p className="py-6 text-sm text-muted-foreground text-center">Sem registros ainda.</p> : (
              <ol className="mt-2 space-y-3 border-l-2 border-primary/20 pl-5">
                {(logs.data ?? []).map((l: any) => <li key={l.id} className="relative text-sm"><span className="absolute -left-[1.78rem] top-1 h-3 w-3 rounded-full border-2 border-primary bg-background" /><p className="font-medium">{l.acao}</p><p className="text-muted-foreground">{dateTime(l.data_hora)}{l.usuario_nome ? ` · ${l.usuario_nome}` : ""}</p>{l.detalhes && <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-xs text-muted-foreground">{JSON.stringify(l.detalhes, null, 2)}</pre>}</li>)}
              </ol>
            )}
          </DialogContent>
        </Dialog>
        <Button variant="outline" size="sm" onClick={() => gerarRelatorioExecutivoPiso(c, lista, extra.data?.obrigs ?? [], extra.data?.docs ?? [], logs.data ?? [], profile?.nome)}><FileDown className="mr-2 h-4 w-4" />Relatório executivo</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Esteira da competência</CardTitle></CardHeader>
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
                    <span className={cn("h-6 w-6 rounded-full grid place-items-center font-bold text-[11px] border",
                      feito ? "bg-success text-success-foreground border-success" : corrente ? "bg-primary text-primary-foreground border-primary" : "bg-muted")}>
                      {feito ? <Check className="h-3 w-3" /> : e.n}
                    </span>
                    <span className="font-semibold leading-tight">{e.titulo}</span>
                  </div>
                  <p className="text-muted-foreground leading-snug">{e.desc}</p>
                  {!feito && pend > 0 && <p className="text-destructive">{pend} pendência(s)</p>}
                  {reconf.includes(e.n) && (
                    <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Reconferir</Badge>
                  )}
                  {podeEditar && (
                    <Button size="sm" variant={feito ? "outline" : "default"} className="mt-auto w-full h-7 text-xs"
                      disabled={toggleEtapa.isPending || (!feito && (e.n > atual || pend > 0))}
                      title={!feito && pend > 0 ? "Resolva as pendências para concluir" : undefined}
                      onClick={(ev) => { ev.stopPropagation(); toggleEtapa.mutate(e.n); }}>
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
          <CardHeader><CardTitle className="text-base">Etapa {etapaSel} — {PISO_ETAPAS[etapaSel - 1].titulo}</CardTitle></CardHeader>
          <CardContent>
            <EtapaPiso n={etapaSel} ctx={ctx} arquivos={extra.data.arquivos} pool={extra.data.pool}
              canEdit={podeEditar && c.status !== "encerrada"} onChange={refresh} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Prestação de contas do Piso</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div><p className="mb-1 text-xs font-medium">Situação</p><Select value={(c as any).prestacao_status ?? "nao_iniciada"} disabled={!podeEditar} onValueChange={(v) => salvarPrestacao.mutate({ prestacao_status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao_iniciada">Não iniciada</SelectItem><SelectItem value="aguardando">Aguardando envio</SelectItem><SelectItem value="recebida">Recebida / em análise</SelectItem><SelectItem value="aprovada">Aprovada</SelectItem><SelectItem value="reprovada">Reprovada / diligência</SelectItem></SelectContent></Select></div>
          <label className="text-xs font-medium">Prazo<input type="date" defaultValue={(c as any).prestacao_prazo ?? ""} disabled={!podeEditar} onBlur={(e) => salvarPrestacao.mutate({ prestacao_prazo: e.target.value || null })} className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm" /></label>
          <label className="text-xs font-medium">Recebida em<input type="date" defaultValue={(c as any).prestacao_recebida_em ?? ""} disabled={!podeEditar} onBlur={(e) => salvarPrestacao.mutate({ prestacao_recebida_em: e.target.value || null })} className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm" /></label>
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
          <CardTitle className="text-base mr-auto">Instituições participantes ({lista.length})</CardTitle>
          {podeEditar && (
            <>
              <Select value={novoPrestador} onValueChange={setNovoPrestador}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Selecionar prestador" /></SelectTrigger>
                <SelectContent>
                  {disponiveis.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!novoPrestador || addPart.isPending} onClick={() => addPart.mutate()}>
                <Plus className="h-4 w-4 mr-1" />Incluir
              </Button>
            </>
          )}
        </CardHeader>
        <CardContent>
          {lista.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma instituição incluída.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr><th className="py-2">Instituição</th><th>Situação</th><th>Envio</th><th>Retorno</th><th></th></tr>
              </thead>
              <tbody>
                {lista.map((p: any) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{p.prestadores?.nome_instituicao}</td>
                    <td>
                      {podeEditar ? (
                        <Select value={p.situacao} onValueChange={(v) => setSituacao.mutate({ pid: p.id, situacao: v })}>
                          <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(SITUACAO_PARTICIPANTE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : SITUACAO_PARTICIPANTE[p.situacao] ?? p.situacao}
                    </td>
                    <td>{p.data_envio ? new Date(p.data_envio + "T12:00").toLocaleDateString("pt-BR") : "—"}</td>
                    <td>{p.data_retorno ? new Date(p.data_retorno + "T12:00").toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="text-right">
                      {podeEditar && (
                        <Button size="icon" variant="ghost" onClick={() => confirm("Remover instituição?") && delPart.mutate(p.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
