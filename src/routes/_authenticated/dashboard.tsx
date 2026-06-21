import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@tanstack/react-router";
import { brl, brlCompact, etapaLabel } from "@/lib/format";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area,
} from "recharts";
import {
  AlertTriangle, TrendingUp, FileCheck, XCircle, Link2Off, Clock, Gauge,
  CheckCircle2, Filter, BadgeCheck, TrendingDown,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Painel BI — Convênios SMS Joinville" }] }),
  component: Dashboard,
});

const isSafeUrl = (u: any) => !!u && /^https?:\/\//i.test(String(u).trim());
const compKey = (c: string | null) => {
  const m = (c ?? "").split(",")[0].trim().match(/(\d{2})\/(\d{4})/);
  return m ? Number(m[2]) * 100 + Number(m[1]) : 0;
};
const compLabel = (c: string | null) => (c ?? "").split(",")[0].trim() || "—";

function Dashboard() {
  const [prestador, setPrestador] = useState("all");
  const [termo, setTermo] = useState("all");

  const { data: lancs = [] } = useQuery({
    queryKey: ["dash-lancs"],
    queryFn: async () =>
      (await supabase.from("lancamentos_pagamento").select("*, prestadores(nome_instituicao)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: prestadores = [] } = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("id, nome_instituicao").order("nome_instituicao")).data ?? [],
  });
  const { data: convenios = [] } = useQuery({
    queryKey: ["convenios-min"],
    queryFn: async () => (await supabase.from("convenios").select("id, prestador_id, valor_total").order("created_at")).data ?? [],
  });
  const { data: termos = [] } = useQuery({
    queryKey: ["termos_aditivos"],
    queryFn: async () => (await supabase.from("termos_aditivos").select("*").order("identificador")).data ?? [],
  });

  const convById = useMemo(() => Object.fromEntries((convenios as any[]).map((c) => [c.id, c])), [convenios]);
  const termosFiltrados = useMemo(
    () => (prestador === "all" ? (termos as any[]) : (termos as any[]).filter((t) => convById[t.convenio_id]?.prestador_id === prestador)),
    [termos, prestador, convById],
  );

  // Conjunto filtrado (storytelling do escopo selecionado)
  const f = useMemo(
    () =>
      (lancs as any[]).filter((l) => {
        if (prestador !== "all" && l.prestador_id !== prestador) return false;
        if (termo === "none" && l.termo_aditivo_id) return false;
        if (termo !== "all" && termo !== "none" && l.termo_aditivo_id !== termo) return false;
        return true;
      }),
    [lancs, prestador, termo],
  );

  const soma = (arr: any[], k: string) => arr.reduce((s, l) => s + Number(l[k] ?? 0), 0);
  const totalSolic = soma(f, "valor_solicitado");
  const totalEmp = soma(f, "valor_empenho_liquido");
  const totalAtest = soma(f, "valor_atestado");
  const totalAnul = soma(f, "valor_anulado");
  const taxaExec = totalEmp > 0 ? Math.round((totalAtest / totalEmp) * 100) : 0;

  // ----- Alertas (sempre sobre o conjunto COMPLETO p/ nunca passar despercebido) -----
  const all = lancs as any[];
  const atrasados = all.filter((l) => l.data_limite && new Date(l.data_limite) < new Date() && !l.concluido);
  const linkPendentes = all.filter((l) => Number(l.valor_anulado) > 0 && !isSafeUrl(l.link_anulacao_sei));
  const empenhoExcede = all.filter((l) => Number(l.valor_empenho_liquido) > Number(l.valor_solicitado) && Number(l.valor_solicitado) > 0);

  const saldo = useMemo(() => {
    let estourado = 0, critico = 0;
    (termos as any[]).forEach((t) => {
      const teto = Number(t.valor_total ?? 0);
      if (!teto) return;
      const usado = all.filter((l) => l.termo_aditivo_id === t.id).reduce((s, l) => s + Number(l.valor_empenho_liquido ?? 0), 0);
      if (usado > teto) estourado++;
      else if (usado / teto >= 0.85) critico++;
    });
    (convenios as any[]).forEach((c) => {
      const teto = Number(c.valor_total ?? 0);
      if (!teto) return;
      const usado = all.filter((l) => l.convenio_id === c.id && !l.termo_aditivo_id).reduce((s, l) => s + Number(l.valor_empenho_liquido ?? 0), 0);
      if (usado > teto) estourado++;
      else if (usado / teto >= 0.85) critico++;
    });
    return { estourado, critico };
  }, [termos, convenios, all]);

  const alertas = [
    { id: "saldo", grave: saldo.estourado > 0, n: saldo.estourado, label: "Teto de saldo estourado", desc: "Empenhos acima do teto do contrato", icon: Gauge },
    { id: "excede", grave: empenhoExcede.length > 0, n: empenhoExcede.length, label: "Empenho acima do solicitado", desc: "Valor empenhado maior que o pedido", icon: TrendingDown },
    { id: "atraso", grave: atrasados.length > 0, n: atrasados.length, label: "Processos em atraso", desc: "Passaram do prazo (SLA)", icon: Clock },
    { id: "links", grave: false, n: linkPendentes.length, label: "Anulações sem link SEI", desc: "Falta anexar o documento", icon: Link2Off },
    { id: "saldocrit", grave: false, n: saldo.critico, label: "Saldo crítico (≥85%)", desc: "Contrato perto do teto", icon: AlertTriangle },
  ].filter((a) => a.n > 0);

  // ----- Gráficos -----
  const pieData = [
    { name: "Empenhado", value: totalEmp, color: "var(--primary)" },
    { name: "Atestado", value: totalAtest, color: "var(--success)" },
  ];

  const barData = useMemo(() => {
    const map = new Map<string, { prestador: string; empenhado: number; atestado: number }>();
    all.forEach((l) => {
      const nome = l.prestadores?.nome_instituicao ?? "—";
      const cur = map.get(nome) ?? { prestador: nome, empenhado: 0, atestado: 0 };
      cur.empenhado += Number(l.valor_empenho_liquido ?? 0);
      cur.atestado += Number(l.valor_atestado ?? 0);
      map.set(nome, cur);
    });
    return [...map.values()].sort((a, b) => b.empenhado - a.empenhado).slice(0, 8);
  }, [all]);

  const lineData = useMemo(() => {
    const map = new Map<number, { key: number; comp: string; solicitado: number; empenhado: number; atestado: number }>();
    f.forEach((l) => {
      const k = compKey(l.competencia);
      if (!k) return;
      const cur = map.get(k) ?? { key: k, comp: compLabel(l.competencia), solicitado: 0, empenhado: 0, atestado: 0 };
      cur.solicitado += Number(l.valor_solicitado ?? 0);
      cur.empenhado += Number(l.valor_empenho_liquido ?? 0);
      cur.atestado += Number(l.valor_atestado ?? 0);
      map.set(k, cur);
    });
    return [...map.values()].sort((a, b) => a.key - b.key);
  }, [f]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho + filtros globais */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">Painel de Gestão</h1>
          <p className="text-sm text-muted-foreground">Acompanhamento financeiro de convênios e parcerias · {f.length} lançamento(s) no recorte</p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-52">
            <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />Prestador</Label>
            <Select value={prestador} onValueChange={(v) => { setPrestador(v); setTermo("all"); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Consolidado geral</SelectItem>
                {(prestadores as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52">
            <Label className="text-xs">Termo aditivo</Label>
            <Select value={termo} onValueChange={setTermo}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os períodos</SelectItem>
                <SelectItem value="none">Sem aditivo (convênio mãe)</SelectItem>
                {termosFiltrados.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.identificador}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ===== PONTOS DE ATENÇÃO (bem visíveis) ===== */}
      {alertas.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
          <CheckCircle2 className="h-6 w-6 text-success shrink-0" />
          <div>
            <div className="font-semibold text-success">Tudo sob controle</div>
            <div className="text-sm text-muted-foreground">Nenhum alerta financeiro ou de prazo no momento. 👏</div>
          </div>
        </div>
      ) : (
        <div>
          <SectionTitle icon={AlertTriangle} title="Pontos de atenção" hint="Itens que precisam de ação" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {alertas.map((a) => <AlertaCard key={a.id} {...a} />)}
          </div>
        </div>
      )}

      {/* ===== VISÃO GERAL (KPIs) ===== */}
      <div>
        <SectionTitle icon={BadgeCheck} title="Visão geral do recorte" hint="Valores do filtro selecionado" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Total Solicitado" value={brl(totalSolic)} icon={TrendingUp} tone="acp" />
          <KpiCard title="Empenhado Líquido" value={brl(totalEmp)} icon={FileCheck} tone="primary" />
          <KpiCard title="Atestado" value={brl(totalAtest)} icon={CheckCircle2} tone="success" foot={`Execução: ${taxaExec}% do empenhado`} />
          <KpiCard title="Anulado (devolvido)" value={brl(totalAnul)} icon={XCircle} tone="warning" />
        </div>
      </div>

      {/* ===== EMPENHADO × ATESTADO + EVOLUÇÃO ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-base">Empenhado × Atestado</CardTitle></CardHeader>
          <CardContent>
            {totalEmp + totalAtest === 0 ? (
              <Empty />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3} strokeWidth={0}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <ReTooltip formatter={(v: any) => brl(Number(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <p className="text-center text-xs text-muted-foreground -mt-2">
                  Taxa de execução: <span className="font-semibold text-foreground">{taxaExec}%</span> do empenhado foi atestado
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Evolução por competência</CardTitle></CardHeader>
          <CardContent>
            {lineData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={lineData} margin={{ left: 4, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="gEmp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} /><stop offset="95%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gAt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--success)" stopOpacity={0.35} /><stop offset="95%" stopColor="var(--success)" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="comp" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={brlCompact} tick={{ fontSize: 11 }} width={70} />
                  <ReTooltip formatter={(v: any) => brl(Number(v))} />
                  <Legend />
                  <Area type="monotone" dataKey="solicitado" name="Solicitado" stroke="var(--acp)" fill="transparent" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="empenhado" name="Empenhado" stroke="var(--primary)" fill="url(#gEmp)" strokeWidth={2} />
                  <Area type="monotone" dataKey="atestado" name="Atestado" stroke="var(--success)" fill="url(#gAt)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== COMPARATIVO POR PRESTADOR ===== */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Comparativo por prestador</CardTitle>
          <p className="text-xs text-muted-foreground">Empenhado vs. atestado — visão consolidada (independe do filtro)</p>
        </CardHeader>
        <CardContent>
          {barData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="prestador" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={50} />
                <YAxis tickFormatter={brlCompact} tick={{ fontSize: 11 }} width={70} />
                <ReTooltip formatter={(v: any) => brl(Number(v))} />
                <Legend />
                <Bar dataKey="empenhado" name="Empenhado" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="atestado" name="Atestado" fill="var(--success)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ===== PROCESSOS EM ATRASO + ÚLTIMOS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-destructive" />Processos em atraso</CardTitle></CardHeader>
          <CardContent>
            {atrasados.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum processo em atraso. 👍</p>
            ) : (
              <ul className="space-y-2">
                {atrasados.slice(0, 6).map((l) => (
                  <li key={l.id} className="flex justify-between items-center text-sm border-l-4 border-destructive bg-destructive/5 px-3 py-2 rounded">
                    <Link to="/lancamentos/$id" params={{ id: l.id }} className="font-medium hover:underline truncate">
                      {l.prestadores?.nome_instituicao ?? "—"} · {l.descricao ?? "Lançamento"}
                    </Link>
                    <Badge variant="destructive" className="shrink-0">{etapaLabel[l.etapa_atual]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Últimos lançamentos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                  <tr><th className="py-2 px-4">Prestador</th><th>Comp.</th><th>Etapa</th><th className="text-right pr-4">Empenho</th></tr>
                </thead>
                <tbody>
                  {(lancs as any[]).slice(0, 7).map((l) => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-accent/40">
                      <td className="py-2 px-4"><Link to="/lancamentos/$id" params={{ id: l.id }} className="hover:underline font-medium text-primary">{l.prestadores?.nome_instituicao ?? "—"}</Link></td>
                      <td className="text-muted-foreground">{compLabel(l.competencia)}</td>
                      <td><Badge variant="outline" className="text-xs">{etapaLabel[l.etapa_atual]}</Badge></td>
                      <td className="text-right pr-4 tabular-nums">{brl(Number(l.valor_empenho_liquido))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, hint }: { icon: any; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h2>
      {hint && <span className="text-xs text-muted-foreground">· {hint}</span>}
    </div>
  );
}

function AlertaCard({ grave, n, label, desc, icon: Icon }: { grave: boolean; n: number; label: string; desc: string; icon: any }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border p-3 ${grave ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10"}`}>
      <div className="flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${grave ? "bg-destructive/15 text-destructive" : "bg-warning/20 text-warning-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className={`text-2xl font-bold tabular-nums ${grave ? "text-destructive" : "text-warning-foreground"}`}>{n}</span>
      </div>
      <div className="mt-2 text-xs font-semibold leading-tight">{label}</div>
      <div className="text-[11px] text-muted-foreground leading-tight">{desc}</div>
      {grave && <div className="absolute inset-x-0 bottom-0 h-1 bg-destructive animate-pulse" />}
    </div>
  );
}

const KPI_TONE: Record<string, string> = {
  acp: "from-acp to-acp/70",
  primary: "from-primary to-acp",
  success: "from-success to-emerald-400",
  warning: "from-warning to-amber-400",
};
function KpiCard({ title, value, icon: Icon, tone, foot }: { title: string; value: string; icon: any; tone: string; foot?: string }) {
  return (
    <Card className="overflow-hidden">
      <div className={`h-1.5 w-full bg-gradient-to-r ${KPI_TONE[tone] ?? KPI_TONE.primary}`} />
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
        {foot && <div className="mt-1 text-[11px] text-muted-foreground">{foot}</div>}
      </CardContent>
    </Card>
  );
}

function Empty() {
  return <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">Sem dados para exibir neste recorte.</div>;
}
