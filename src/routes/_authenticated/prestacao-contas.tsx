import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpTip } from "@/components/HelpTip";
import { SeiButton } from "@/components/inputs/SeiLink";
import { pagamentoLiberado, situacaoPrestacao, STATUS_PRESTACAO_LABEL } from "@/lib/prestacao";
import { useMemo, useState } from "react";
import { ClipboardCheck, AlertTriangle, Clock, CheckCircle2, Search, Filter } from "lucide-react";

export const Route = createFileRoute("/_authenticated/prestacao-contas")({
  head: () => ({ meta: [{ title: "Prestação de Contas" }] }),
  component: PrestacaoContasPage,
});

const NIVEL_BADGE: Record<string, string> = {
  ok: "bg-success text-success-foreground",
  info: "bg-acp text-acp-foreground",
  alerta: "bg-warning text-warning-foreground",
  grave: "bg-destructive text-destructive-foreground",
  neutro: "bg-muted text-muted-foreground",
};

function PrestacaoContasPage() {
  const [fStatus, setFStatus] = useState("all");
  const [fPrestador, setFPrestador] = useState("all");

  const { data: lancs = [] } = useQuery({
    queryKey: ["pc-lancs"],
    queryFn: async () => (await supabase.from("lancamentos_pagamento").select("*, prestadores(nome_instituicao)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: convenios = [] } = useQuery({
    queryKey: ["convenios-pc"],
    queryFn: async () => (await supabase.from("convenios").select("id, objeto, prazo_prestacao_contas_dias")).data ?? [],
  });
  const { data: pcs = [] } = useQuery({
    queryKey: ["prestacoes-all"],
    queryFn: async () => (await supabase.from("prestacoes_contas").select("*")).data ?? [],
  });
  const { data: prestadores = [] } = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("id, nome_instituicao").order("nome_instituicao")).data ?? [],
  });

  const convById = useMemo(() => Object.fromEntries((convenios as any[]).map((c) => [c.id, c])), [convenios]);
  const pcByLanc = useMemo(() => Object.fromEntries((pcs as any[]).map((p) => [p.lancamento_id, p])), [pcs]);

  // Universo: lançamentos com pagamento liberado (a prestação de contas começa aí).
  const linhas = useMemo(() => {
    const pesoNivel: Record<string, number> = { grave: 0, alerta: 1, info: 2, neutro: 3, ok: 4 };
    return (lancs as any[])
      .filter((l) => pagamentoLiberado(l))
      .map((l) => {
        const conv = convById[l.convenio_id];
        const pc = pcByLanc[l.id] ?? null;
        const sit = situacaoPrestacao(l, conv, pc);
        return { l, conv, pc, sit, status: pc?.status ?? "aguardando" };
      })
      .filter((r) => fPrestador === "all" || r.l.prestador_id === fPrestador)
      .filter((r) => {
        if (fStatus === "all") return true;
        if (fStatus === "atrasadas") return r.sit.nivel === "grave" && r.status !== "reprovada";
        return r.status === fStatus;
      })
      .sort((a, b) => (pesoNivel[a.sit.nivel] - pesoNivel[b.sit.nivel]) || ((a.sit.dias ?? 9999) - (b.sit.dias ?? 9999)));
  }, [lancs, convById, pcByLanc, fStatus, fPrestador]);

  const todas = (lancs as any[]).filter((l) => pagamentoLiberado(l)).map((l) => {
    const pc = pcByLanc[l.id] ?? null;
    return { sit: situacaoPrestacao(l, convById[l.convenio_id], pc), status: pc?.status ?? "aguardando" };
  });
  const nAtrasadas = todas.filter((r) => r.sit.nivel === "grave" && r.status !== "reprovada").length;
  const nVencendo = todas.filter((r) => r.sit.nivel === "alerta").length;
  const nAnalise = todas.filter((r) => r.status === "recebida").length;
  const nReprovadas = todas.filter((r) => r.status === "reprovada").length;
  const nAprovadas = todas.filter((r) => r.status === "aprovada").length;

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><ClipboardCheck className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-primary leading-tight">Prestação de Contas</h1>
            <p className="text-sm text-muted-foreground">Acompanhamento das prestações após a liberação do pagamento, conforme o prazo de cada convênio</p>
          </div>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-52">
            <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />Prestador</Label>
            <Select value={fPrestador} onValueChange={setFPrestador}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(prestadores as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-56">
            <Label className="text-xs">Situação</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="atrasadas">Atrasadas</SelectItem>
                <SelectItem value="aguardando">Aguardando prestador</SelectItem>
                <SelectItem value="recebida">Em análise</SelectItem>
                <SelectItem value="aprovada">Aprovadas</SelectItem>
                <SelectItem value="reprovada">Reprovadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <ResumoCard n={nAtrasadas} label="Atrasadas" icon={AlertTriangle} tone={nAtrasadas > 0 ? "grave" : "neutro"} />
        <ResumoCard n={nVencendo} label="Vencendo em ≤7 dias" icon={Clock} tone={nVencendo > 0 ? "alerta" : "neutro"} />
        <ResumoCard n={nAnalise} label="Em análise" icon={Search} tone="info" />
        <ResumoCard n={nReprovadas} label="Com pendências" icon={AlertTriangle} tone={nReprovadas > 0 ? "grave" : "neutro"} />
        <ResumoCard n={nAprovadas} label="Aprovadas" icon={CheckCircle2} tone="ok" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="py-2 px-4">Prestador · Objeto</th>
                  <th>Competência</th>
                  <th>Prazo limite <HelpTip text="Fim do mês da competência + prazo (dias) cadastrado no convênio." /></th>
                  <th>Situação</th>
                  <th>Status</th>
                  <th className="pr-4">Documentos</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ l, conv, pc, sit, status }) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="py-2.5 px-4">
                      <Link to="/lancamentos/$id" params={{ id: l.id }} className="font-medium text-primary hover:underline">
                        {l.prestadores?.nome_instituicao ?? "—"}
                      </Link>
                      <div className="text-xs text-muted-foreground line-clamp-1">{conv?.objeto ?? l.descricao ?? "—"}</div>
                    </td>
                    <td className="text-muted-foreground whitespace-nowrap">{(l.competencia ?? "—").split(",")[0]}</td>
                    <td className="whitespace-nowrap">{sit.prazo ? sit.prazo.toLocaleDateString("pt-BR") : <span className="text-muted-foreground">sem prazo</span>}</td>
                    <td><Badge className={`${NIVEL_BADGE[sit.nivel]} whitespace-nowrap`}>{sit.label}</Badge></td>
                    <td className="text-xs text-muted-foreground whitespace-nowrap">{STATUS_PRESTACAO_LABEL[status]}</td>
                    <td className="pr-4">
                      <div className="flex gap-1.5 flex-wrap">
                        {pc?.link_prestacao_sei && <SeiButton href={pc.link_prestacao_sei} label="Prestação" />}
                      </div>
                    </td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Nenhuma prestação de contas neste recorte. As prestações aparecem aqui quando o pagamento do lançamento é liberado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const TONE_CARD: Record<string, string> = {
  grave: "border-destructive/40 bg-destructive/10 text-destructive",
  alerta: "border-warning/40 bg-warning/10 text-warning-foreground",
  info: "border-acp/40 bg-acp/10 text-acp",
  ok: "border-success/40 bg-success/10 text-success",
  neutro: "border-border bg-muted/30 text-muted-foreground",
};
function ResumoCard({ n, label, icon: Icon, tone }: { n: number; label: string; icon: any; tone: string }) {
  return (
    <div className={`rounded-xl border p-3 ${TONE_CARD[tone]}`}>
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4" />
        <span className="text-2xl font-bold tabular-nums">{n}</span>
      </div>
      <div className="mt-1 text-xs font-semibold leading-tight">{label}</div>
    </div>
  );
}
