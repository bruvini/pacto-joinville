import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HelpTip } from "@/components/HelpTip";
import { SeiButton } from "@/components/inputs/SeiLink";
import { PrestacaoContas } from "@/components/PrestacaoContas";
import { pagamentoLiberado, situacaoPrestacao, STATUS_PRESTACAO_LABEL } from "@/lib/prestacao";
import { gerarRelatorioPendentes, type LinhaPendente } from "@/lib/relatorio-mensal";
import { registrarAcesso } from "@/lib/acesso";
import { brl } from "@/lib/format";
import { useAuth, hasRole } from "@/hooks/useAuth";
import logoAsset from "@/assets/joinville-logo.png.asset.json";
import { toast } from "sonner";
import { useMemo, useState, Fragment } from "react";
import { ClipboardCheck, AlertTriangle, Clock, CheckCircle2, Search, Filter, FileDown, Settings2 } from "lucide-react";

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

const primeiraComp = (c: string | null) => (c ?? "").split(",")[0].trim();

function PrestacaoContasPage() {
  const { roles, profile } = useAuth();
  const canEdit = hasRole(roles, "acp");
  const [fStatus, setFStatus] = useState("all");
  const [fPrestador, setFPrestador] = useState("all");
  const [selLanc, setSelLanc] = useState<any | null>(null);

  const { data: lancs = [] } = useQuery({
    queryKey: ["pc-lancs"],
    queryFn: async () => (await supabase.from("lancamentos_pagamento").select("*, prestadores(nome_instituicao)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: convenios = [] } = useQuery({
    queryKey: ["convenios-pc"],
    queryFn: async () => (await supabase.from("convenios").select("id, objeto, prazo_prestacao_contas_dias, exige_prestacao_contas, pagamento_pontual")).data ?? [],
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

  // Universo: lançamentos pagos de convênios que EXIGEM prestação de contas.
  const linhas = useMemo(() => {
    const pesoNivel: Record<string, number> = { grave: 0, alerta: 1, info: 2, neutro: 3, ok: 4 };
    const isParent = (l: any) => !l.parent_id && (l.competencia ?? "").split(",").map((s: any) => s.trim()).filter(Boolean).length > 1;
    return (lancs as any[])
      .filter((l) => !isParent(l) && pagamentoLiberado(l) && convById[l.convenio_id]?.exige_prestacao_contas !== false)
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

  const todas = useMemo(() => {
    const isParent = (l: any) => !l.parent_id && (l.competencia ?? "").split(",").map((s: any) => s.trim()).filter(Boolean).length > 1;
    return (lancs as any[]).filter((l) => !isParent(l) && pagamentoLiberado(l) && convById[l.convenio_id]?.exige_prestacao_contas !== false).map((l) => {
      const pc = pcByLanc[l.id] ?? null;
      return { pc, sit: situacaoPrestacao(l, convById[l.convenio_id], pc), status: pc?.status ?? "aguardando" };
    });
  }, [lancs, convById, pcByLanc]);

  const nAtrasadas = todas.filter((r) => r.sit.nivel === "grave" && r.status !== "reprovada").length;
  const nVencendo = todas.filter((r) => r.sit.nivel === "alerta").length;
  const nAnalise = todas.filter((r) => r.status === "recebida").length;
  const nReprovadas = todas.filter((r) => r.status === "reprovada").length;
  const nAprovadas = todas.filter((r) => r.status === "aprovada").length;
  const totalGlosas = todas.reduce((s, r) => s + Number(r.pc?.valor_glosado ?? 0), 0);

  const emitirRelatorioPendentes = () => {
    const isParent = (l: any) => !l.parent_id && (l.competencia ?? "").split(",").map((s: any) => s.trim()).filter(Boolean).length > 1;
    
    // O relatório dinâmico inclui todos os lançamentos que exigem prestação de contas E não foram entregues/aprovados (pc?.status !== "aprovada")
    const pendentes = (lancs as any[])
      .filter((l) => !isParent(l) && pagamentoLiberado(l) && convById[l.convenio_id]?.exige_prestacao_contas === true)
      .filter((l) => pcByLanc[l.id]?.status !== "aprovada")
      .filter((l) => fPrestador === "all" || l.prestador_id === fPrestador);

    if (pendentes.length === 0) {
      return toast.error("Nenhuma prestação de contas pendente ou a vencer encontrada para o prestador selecionado.");
    }

    const linhasRel: LinhaPendente[] = pendentes.map((l) => {
      const conv = convById[l.convenio_id];
      const pc = pcByLanc[l.id] ?? null;
      const sit = situacaoPrestacao(l, conv, pc);

      const dias = sit.dias;
      let bloco: "vencidas" | "hoje" | "avencer" | "outros" = "outros";
      let situacaoLabel = sit.label;

      if (dias !== null && dias < 0) {
        bloco = "vencidas";
        situacaoLabel = `Atrasado há ${-dias} dia(s)`;
      } else if (dias !== null && dias === 0) {
        bloco = "hoje";
        situacaoLabel = "Vence Hoje";
      } else if (dias !== null && dias <= 7) {
        bloco = "avencer";
        situacaoLabel = `Vence em ${dias} dia(s)`;
      } else if (dias !== null && dias > 7) {
        bloco = "outros";
        situacaoLabel = `Vence em ${dias} dia(s)`;
      } else {
        bloco = "outros";
        situacaoLabel = "Sem prazo";
      }

      return {
        prestador: l.prestadores?.nome_instituicao ?? "—",
        convenio: conv?.objeto ?? "—",
        objeto: conv?.objeto ?? l.descricao ?? "—",
        parcela: l.parcela ? String(l.parcela) : "—",
        competencia: primeiraComp(l.competencia) || "—",
        atestado: Number(l.valor_atestado ?? 0),
        dataPagamento: l.data_pagamento ? new Date(`${String(l.data_pagamento).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—",
        prazoPrestacao: sit.prazo ? sit.prazo.toLocaleDateString("pt-BR") : "—",
        diasRestantes: dias,
        situacaoLabel,
        bloco,
      };
    });

    const ordemBloco = { vencidas: 0, hoje: 1, avencer: 2, outros: 3 };
    linhasRel.sort((a, b) => {
      if (ordemBloco[a.bloco] !== ordemBloco[b.bloco]) {
        return ordemBloco[a.bloco] - ordemBloco[b.bloco];
      }
      return (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999);
    });

    const nomePrest = fPrestador === "all" ? "Todos os prestadores" : ((prestadores as any[]).find((p) => p.id === fPrestador)?.nome_instituicao ?? "—");
    if (!gerarRelatorioPendentes(linhasRel, { prestador: nomePrest, logoUrl: logoAsset.url, emissor: profile?.nome ?? undefined })) {
      return toast.error("Habilite pop-ups para gerar o PDF.");
    }
    void registrarAcesso("relatorio", { detalhe: `Relatório de pendências de prestação de contas · ${nomePrest}` });
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><ClipboardCheck className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-primary leading-tight">Prestação de Contas</h1>
            <p className="text-sm text-muted-foreground">Prazo conta a partir da data do pagamento · alertas D-7, D-3 e vencimento para a APC</p>
          </div>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-48">
            <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />Prestador</Label>
            <Select value={fPrestador} onValueChange={setFPrestador}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(prestadores as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52">
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
          <Button variant="outline" className="h-9" onClick={emitirRelatorioPendentes}><FileDown className="h-4 w-4 mr-1.5" />Relatório de Pendências</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <ResumoCard n={nAtrasadas} label="Atrasadas" icon={AlertTriangle} tone={nAtrasadas > 0 ? "grave" : "neutro"} />
        <ResumoCard n={nVencendo} label="Vencendo em ≤7 dias" icon={Clock} tone={nVencendo > 0 ? "alerta" : "neutro"} />
        <ResumoCard n={nAnalise} label="Em análise" icon={Search} tone="info" />
        <ResumoCard n={nReprovadas} label="Com pendências" icon={AlertTriangle} tone={nReprovadas > 0 ? "grave" : "neutro"} />
        <ResumoCard n={nAprovadas} label="Aprovadas" icon={CheckCircle2} tone="ok" />
        <ResumoCard n={brl(totalGlosas)} label="Total de glosas" icon={AlertTriangle} tone={totalGlosas > 0 ? "alerta" : "neutro"} small />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="py-2 px-4">Prestador · Objeto</th>
                  <th>Competência</th>
                  <th>Pagamento</th>
                  <th>Prazo limite <HelpTip text="Data do pagamento + prazo (dias) cadastrado no convênio. Sem data de pagamento, usa o fim do mês da competência." /></th>
                  <th>Situação</th>
                  <th>Glosa</th>
                  <th className="pr-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {BLOCKS_CONFIG.map((b) => {
                  const items = linhas.filter((r) => {
                    if (r.status === "aprovada") return b.id === "aprovada";
                    const dias = r.sit.dias;
                    if (dias !== null && dias < 0) return b.id === "vencidas";
                    if (dias !== null && dias === 0) return b.id === "hoje";
                    if (dias !== null && dias <= 7) return b.id === "avencer";
                    return b.id === "outros";
                  });
                  
                  if (items.length === 0) return null;

                  return (
                    <Fragment key={b.id}>
                      <tr className={`border-y ${b.bg}`}>
                        <td colSpan={7} className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold text-xs uppercase tracking-wider ${b.text}`}>
                              {b.label}
                            </span>
                            <Badge variant="secondary" className="text-[10px] font-medium py-0 px-1.5 h-4">
                              {items.length} {items.length === 1 ? "registro" : "registros"}
                            </Badge>
                          </div>
                        </td>
                      </tr>
                      {items.map(({ l, conv, pc, sit }) => (
                        <tr key={l.id} className="border-b last:border-0 hover:bg-accent/40 cursor-pointer" onClick={() => setSelLanc({ l, conv })}>
                          <td className="py-2.5 px-4">
                            <span className="font-medium text-primary">{l.prestadores?.nome_instituicao ?? "—"}</span>
                            <div className="text-xs text-muted-foreground line-clamp-1">{conv?.objeto ?? l.descricao ?? "—"}{l.parcela ? ` · parcela ${l.parcela}` : ""}</div>
                          </td>
                          <td className="text-muted-foreground whitespace-nowrap">{primeiraComp(l.competencia) || "—"}</td>
                          <td className="text-muted-foreground whitespace-nowrap">{l.data_pagamento ? new Date(`${String(l.data_pagamento).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td>
                          <td className="whitespace-nowrap">{sit.prazo ? sit.prazo.toLocaleDateString("pt-BR") : <span className="text-muted-foreground">sem prazo</span>}</td>
                          <td><Badge className={`${NIVEL_BADGE[sit.nivel]} whitespace-nowrap`}>{sit.label}</Badge></td>
                          <td className="whitespace-nowrap">{Number(pc?.valor_glosado) > 0 ? <span className="text-destructive font-medium tabular-nums">{brl(Number(pc.valor_glosado))}</span> : <span className="text-muted-foreground">—</span>}</td>
                          <td className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1.5 justify-end items-center">
                              {pc?.link_prestacao_sei && <SeiButton href={pc.link_prestacao_sei} label="SEI" />}
                              <Button variant="outline" size="sm" onClick={() => setSelLanc({ l, conv })}><Settings2 className="h-4 w-4 mr-1.5" />Gerenciar</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                {linhas.length === 0 && (
                  <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Nenhuma prestação de contas neste recorte. As prestações aparecem aqui quando o pagamento do lançamento é liberado (Etapa 6).</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selLanc && (
        <Dialog open onOpenChange={(o) => !o && setSelLanc(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span>{selLanc.l.prestadores?.nome_instituicao ?? "—"}</span>
                <Badge variant="secondary">Competência {primeiraComp(selLanc.l.competencia) || "—"}</Badge>
                {selLanc.l.parcela && <Badge variant="secondary">Parcela {selLanc.l.parcela}</Badge>}
                <Badge variant="secondary">Atestado {brl(Number(selLanc.l.valor_atestado ?? 0))}</Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="text-xs text-muted-foreground -mt-2 mb-1 flex items-center gap-2">
              {selLanc.conv?.objeto ?? selLanc.l.descricao ?? ""}
              <Link to="/lancamentos/$id" params={{ id: selLanc.l.id }} className="text-primary hover:underline shrink-0">Abrir processo de empenho →</Link>
            </div>
            <PrestacaoContas lanc={selLanc.l} convenio={selLanc.conv} canEdit={canEdit} userName={profile?.nome} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

const BLOCKS_CONFIG = [
  { id: "vencidas", label: "🔴 Prestações de Contas Vencidas (Crítico)", bg: "bg-destructive/10 dark:bg-destructive/20 border-destructive/20", text: "text-destructive" },
  { id: "hoje", label: "🟠 Vencendo Hoje (Alerta Máximo)", bg: "bg-warning/10 dark:bg-warning/20 border-warning/20", text: "text-warning-foreground" },
  { id: "avencer", label: "🟡 A Vencer nos Próximos 7 Dias (Preventivo)", bg: "bg-acp/10 dark:bg-acp/20 border-acp/20", text: "text-acp" },
  { id: "outros", label: "⚪ Outros Prazos e Pendências", bg: "bg-muted/40 border-muted-foreground/20", text: "text-muted-foreground" },
  { id: "aprovada", label: "🟢 Prestações de Contas Aprovadas", bg: "bg-success/10 dark:bg-success/20 border-success/20", text: "text-success" },
] as const;

const TONE_CARD: Record<string, string> = {
  grave: "border-destructive/40 bg-destructive/10 text-destructive",
  alerta: "border-warning/40 bg-warning/10 text-warning-foreground",
  info: "border-acp/40 bg-acp/10 text-acp",
  ok: "border-success/40 bg-success/10 text-success",
  neutro: "border-border bg-muted/30 text-muted-foreground",
};
function ResumoCard({ n, label, icon: Icon, tone, small }: { n: number | string; label: string; icon: any; tone: string; small?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${TONE_CARD[tone]}`}>
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4" />
        <span className={`font-bold tabular-nums ${small ? "text-base" : "text-2xl"}`}>{n}</span>
      </div>
      <div className="mt-1 text-xs font-semibold leading-tight">{label}</div>
    </div>
  );
}
