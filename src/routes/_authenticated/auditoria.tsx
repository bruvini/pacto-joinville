import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SeiButton } from "@/components/inputs/SeiLink";
import { linkValido as isSafeUrl } from "@/lib/sei";
import { HelpTip } from "@/components/HelpTip";
import { brl } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { gerarRelatorioPrestacaoContas } from "@/lib/relatorio";
import logoAsset from "@/assets/joinville-logo.png.asset.json";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { RotateCcw, Link2Off, ShieldCheck, Filter, FileText, FileDown, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria de Anulações — SMS Joinville" }] }),
  component: Auditoria,
});

const anoAtual = new Date().getFullYear();

function Auditoria() {
  const { profile } = useAuth();
  const [filtros, setFiltros] = useState({ prestador: "all", convenio: "all", mes: "" });

  const { data: prestadores = [] } = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("id, nome_instituicao").order("nome_instituicao")).data ?? [],
  });
  const { data: convenios = [] } = useQuery({
    queryKey: ["convenios"],
    queryFn: async () => (await supabase.from("convenios").select("id, objeto, prestador_id").order("created_at", { ascending: false })).data ?? [],
  });
  const conveniosOpcoes = (convenios as any[]).filter((c) => filtros.prestador === "all" || c.prestador_id === filtros.prestador);

  const { data: lancs = [] } = useQuery({
    queryKey: ["auditoria-lancs"],
    queryFn: async () =>
      (await supabase
        .from("lancamentos_pagamento")
        .select("*, prestadores(nome_instituicao), convenios(numero_processo_sei_mae)")
        .order("competencia", { ascending: false })).data ?? [],
  });

  // Apenas lançamentos com recurso anulado (atestado < solicitado, já atestado).
  const anulacoes = useMemo(() => (lancs as any[]).filter((l) => Number(l.valor_atestado) > 0 && Number(l.valor_anulado) > 0), [lancs]);

  const totalAnoCorrente = useMemo(
    () => anulacoes.filter((l) => (l.competencia ?? "").includes(`/${anoAtual}`)).reduce((s, l) => s + Number(l.valor_anulado ?? 0), 0),
    [anulacoes],
  );
  const linkPendentes = useMemo(() => anulacoes.filter((l) => !isSafeUrl(l.link_anulacao_sei)).length, [anulacoes]);
  const qtdAno = useMemo(() => anulacoes.filter((l) => (l.competencia ?? "").includes(`/${anoAtual}`)).length, [anulacoes]);

  const filtrados = useMemo(
    () =>
      anulacoes.filter((l) => {
        if (filtros.prestador !== "all" && l.prestador_id !== filtros.prestador) return false;
        if (filtros.convenio !== "all" && l.convenio_id !== filtros.convenio) return false;
        if (filtros.mes && !(l.competencia ?? "").includes(filtros.mes)) return false;
        return true;
      }),
    [anulacoes, filtros],
  );

  const emitirRelatorio = async () => {
    const prestadorNome = filtros.prestador === "all"
      ? "Consolidado geral"
      : ((prestadores as any[]).find((p) => p.id === filtros.prestador)?.nome_instituicao ?? "—");
    const linhas = filtrados.map((l) => ({
      prestador: l.prestadores?.nome_instituicao ?? "—",
      competencia: l.competencia ?? "—",
      sei: l.convenios?.numero_processo_sei_mae ?? "—",
      solicitado: Number(l.valor_solicitado ?? 0),
      atestado: Number(l.valor_atestado ?? 0),
      anulado: Number(l.valor_anulado ?? 0),
      temLink: isSafeUrl(l.link_anulacao_sei),
    }));
    const ok = gerarRelatorioPrestacaoContas(linhas, {
      prestador: prestadorNome,
      mes: filtros.mes || "Todas",
      logoUrl: logoAsset.url,
      emissor: profile?.nome,
    });
    if (!ok) { toast.error("Habilite pop-ups no navegador para gerar o relatório."); return; }
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("historico_logs").insert({
      usuario_id: u.user?.id,
      usuario_nome: profile?.nome ?? u.user?.email,
      acao: "Relatório de prestação de contas emitido",
      detalhes: { recorte: prestadorNome, competencia: filtros.mes || "Todas", anulacoes: linhas.length },
    });
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary leading-tight">Auditoria de Anulações</h1>
            <p className="text-sm text-muted-foreground">Recursos devolvidos ao orçamento da Saúde · Exercício {anoAtual}</p>
          </div>
        </div>
        <Button onClick={emitirRelatorio} className="shadow-sm">
          <FileDown className="h-4 w-4 mr-2" />Gerar Relatório de Prestação de Contas (PDF)
        </Button>
      </div>

      {/* Cards informativos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          tone="primary"
          icon={RotateCcw}
          titulo="Recursos Anulados (Ano Corrente)"
          valor={brl(totalAnoCorrente)}
          legenda={`${qtdAno} anulação(ões) em ${anoAtual}`}
          help={`Soma de todos os valores anulados (Solicitado − Atestado) cuja competência é de ${anoAtual}. É o recurso devolvido ao orçamento da Saúde neste exercício.`}
        />
        <StatCard
          tone={linkPendentes > 0 ? "warning" : "success"}
          icon={Link2Off}
          titulo="Anulações com Link Pendente"
          valor={String(linkPendentes)}
          legenda={linkPendentes > 0 ? "Falta anexar o link do SEI" : "Tudo documentado"}
          help="Quantidade de anulações (valor anulado > 0) que ainda não têm o link da nota de anulação do SEI anexado. Devem ser regularizadas para a prestação de contas."
        />
        <StatCard
          tone="aco"
          icon={FileText}
          titulo="Total de Anulações Registradas"
          valor={String(anulacoes.length)}
          legenda="Em todo o histórico"
          help="Número total de lançamentos com algum valor anulado, considerando todo o histórico (todos os exercícios)."
        />
      </div>

      {/* Tabela de auditoria rápida */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Auditoria rápida · {filtrados.length} registro(s)</CardTitle>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-48">
                <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />Prestador</Label>
                <Select value={filtros.prestador} onValueChange={(v) => setFiltros({ ...filtros, prestador: v, convenio: "all" })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os prestadores</SelectItem>
                    {(prestadores as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-48">
                <Label className="text-xs">Convênio</Label>
                <Select value={filtros.convenio} onValueChange={(v) => setFiltros({ ...filtros, convenio: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os convênios</SelectItem>
                    {conveniosOpcoes.map((c) => <SelectItem key={c.id} value={c.id}>{c.objeto ?? "(sem objeto)"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <Label className="text-xs">Mês (competência)</Label>
                <Input className="h-9" placeholder="MM/AAAA" value={filtros.mes} onChange={(e) => setFiltros({ ...filtros, mes: e.target.value })} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b bg-card">
                <tr>
                  <th className="py-3 px-4">Prestador</th>
                  <th className="px-2">Competência</th>
                  <th className="px-2">Processo SEI</th>
                  <th className="px-2 text-right">Solicitado</th>
                  <th className="px-2 text-right">Atestado</th>
                  <th className="px-2 text-right">Anulado</th>
                  <th className="px-4 text-center">Link Anulação</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-accent/40 transition-colors">
                    <td className="py-3 px-4 font-medium">
                      <Link to="/lancamentos/$id" params={{ id: l.id }} className="text-primary hover:underline">
                        {l.prestadores?.nome_instituicao ?? "—"}
                      </Link>
                    </td>
                    <td className="px-2 text-muted-foreground">{l.competencia ?? "—"}</td>
                    <td className="px-2 text-muted-foreground">{l.convenios?.numero_processo_sei_mae ?? "—"}</td>
                    <td className="px-2 text-right tabular-nums">{brl(Number(l.valor_solicitado))}</td>
                    <td className="px-2 text-right tabular-nums">{brl(Number(l.valor_atestado))}</td>
                    <td className="px-2 text-right tabular-nums font-semibold text-primary">{brl(Number(l.valor_anulado))}</td>
                    <td className="px-4 text-center">
                      {isSafeUrl(l.link_anulacao_sei)
                        ? <div className="flex justify-center"><SeiButton href={l.link_anulacao_sei} label="Abrir" /></div>
                        : <Badge variant="outline" className="border-warning/50 text-warning-foreground gap-1"><Clock className="h-3 w-3" />Pendente</Badge>}
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Nenhuma anulação encontrada para o filtro atual.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const TONES: Record<string, { strip: string; chip: string }> = {
  primary: { strip: "from-primary to-acp", chip: "bg-primary/10 text-primary" },
  aco: { strip: "from-aco to-primary", chip: "bg-aco/10 text-aco" },
  warning: { strip: "from-warning to-amber-400", chip: "bg-warning/15 text-warning-foreground" },
  success: { strip: "from-success to-emerald-400", chip: "bg-success/10 text-success" },
};

function StatCard({ tone, icon: Icon, titulo, valor, legenda, help }: { tone: string; icon: any; titulo: string; valor: string; legenda: string; help?: string }) {
  const t = TONES[tone] ?? TONES.primary;
  return (
    <Card className="overflow-hidden relative group">
      <div className={`h-1.5 w-full bg-gradient-to-r ${t.strip}`} />
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground max-w-[70%] flex items-center gap-1">{titulo}{help && <HelpTip text={help} />}</span>
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.chip} transition-transform group-hover:scale-110`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 text-3xl font-bold tabular-nums tracking-tight">{valor}</div>
        <div className="mt-1 text-xs text-muted-foreground">{legenda}</div>
      </CardContent>
    </Card>
  );
}
