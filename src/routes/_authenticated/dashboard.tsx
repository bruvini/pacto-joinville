import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@tanstack/react-router";
import { HelpTip } from "@/components/HelpTip";
import { brl, brlCompact, etapaLabel } from "@/lib/format";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area,
} from "recharts";
import {
  AlertTriangle, TrendingUp, FileCheck, XCircle, Link2Off, Clock, Gauge,
  CheckCircle2, Filter, BadgeCheck, TrendingDown, Trophy, Sparkles, Medal, Crown, Swords,
  Landmark, RotateCcw, Target, Rocket, Star, ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Painel BI — Convênios SMS Joinville" }] }),
  component: Dashboard,
});

import { linkValido as isSafeUrl } from "@/lib/sei";
import { etapaCorrenteLabel, emAtraso, vencendoEmBreve } from "@/lib/etapa";

const HELP_META = {
  documentadas: "Proporção de anulações (valor anulado > 0) que já têm o link da nota de anulação do SEI anexado. Meta: 100%.",
  concluidos: "Proporção de processos com todas as etapas finalizadas em relação ao total de lançamentos.",
  execucao: "Quanto do valor empenhado já foi efetivamente atestado (executado). Mede a aderência da execução ao planejado.",
};
const HELP_KPI = {
  solicitado: "Soma dos valores que a ACP solicitou empenho, no recorte de filtro selecionado.",
  empenhado: "Soma dos valores empenhados (valor solicitado na nota de empenho) no recorte.",
  atestado: "Soma dos valores atestados (executados) no recorte. A taxa de execução compara atestado / empenhado.",
  anulado: "Soma dos valores devolvidos ao orçamento (Solicitado − Atestado) no recorte.",
};
const HELP_CHART = {
  pizza: "Compara, no recorte, quanto foi empenhado (azul) e quanto foi efetivamente atestado (verde).",
  evolucao: "Evolução mês a mês dos valores solicitado, empenhado e atestado, pela competência do lançamento.",
  barras: "Total empenhado vs. atestado por prestador (8 maiores). É uma visão geral e não muda com o filtro acima.",
  placar: "Compara o desempenho de prazo (SLA) das equipes ACP e ACO nos processos em andamento sob responsabilidade de cada uma.",
  conquistas: "Selos que a equipe desbloqueia ao atingir boas práticas de gestão. Conquistas em cinza ainda não foram alcançadas.",
};
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
    queryFn: async () => (await supabase.from("convenios").select("id, prestador_id, teto_mensal, dia_inicio_execucao, dia_fim_execucao").order("created_at")).data ?? [],
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
  const totalEmp = totalSolic; // empenhado = valor solicitado (nota de empenho)
  const totalAtest = soma(f, "valor_atestado");
  const totalAnul = soma(f, "valor_anulado");
  const taxaExec = totalEmp > 0 ? Math.round((totalAtest / totalEmp) * 100) : 0;

  // ----- Alertas (sempre sobre o conjunto COMPLETO p/ nunca passar despercebido) -----
  const all = lancs as any[];
  const tetoMensalDe = (taId: string | null) => Number((termos as any[]).find((t) => t.id === taId)?.valor_total ?? 0);
  const atrasados = all.filter((l) => emAtraso(l, convById[l.convenio_id]));
  const linkPendentes = all.filter((l) => Number(l.valor_anulado) > 0 && Number(l.valor_atestado) > 0 && !isSafeUrl(l.link_anulacao_sei));
  const vencendo = all.filter((l) => vencendoEmBreve(l, convById[l.convenio_id]));

  // Saldo com teto MENSAL: parcela que excede (ou chega perto de) o teto do mês.
  const saldo = useMemo(() => {
    let estourado = 0, critico = 0;
    all.forEach((l) => {
      const teto = tetoMensalDe(l.termo_aditivo_id);
      if (!teto) return;
      const v = Number(l.valor_solicitado ?? 0);
      if (v > teto) estourado++;
      else if (teto > 0 && v / teto >= 0.85) critico++;
    });
    return { estourado, critico };
  }, [termos, all]);

  // ----- Metas & conquistas da equipe (gamificação responsável) -----
  const totalEmpAll = all.reduce((s, l) => s + Number(l.valor_solicitado ?? 0), 0);
  const totalAtestAll = all.reduce((s, l) => s + Number(l.valor_atestado ?? 0), 0);
  const anulAll = all.filter((l) => Number(l.valor_anulado) > 0);
  const execPctG = totalEmpAll > 0 ? Math.round((totalAtestAll / totalEmpAll) * 100) : 0;
  const concluidosN = all.filter((l) => l.concluido).length;
  const metas = [
    { label: "Anulações documentadas", desc: "% das anulações com link do SEI anexado", pct: anulAll.length ? Math.round((anulAll.filter((l) => isSafeUrl(l.link_anulacao_sei)).length / anulAll.length) * 100) : null, alvo: 100, help: HELP_META.documentadas },
    { label: "Processos concluídos", desc: "% de processos finalizados", pct: all.length ? Math.round((concluidosN / all.length) * 100) : null, alvo: 80, help: HELP_META.concluidos },
    { label: "Execução orçamentária", desc: "% do empenhado já atestado", pct: totalEmpAll > 0 ? execPctG : null, alvo: 90, help: HELP_META.execucao },
  ];

  // ----- Placar de SLA por equipe (ACP × ACO) -----
  const placar = (["acp", "aco"] as const).map((s) => {
    const ativos = all.filter((l) => l.responsavel_atual === s && !l.concluido);
    const atras = ativos.filter((l) => emAtraso(l, convById[l.convenio_id])).length;
    const emDia = ativos.length - atras;
    return { setor: s.toUpperCase(), ativos: ativos.length, emDia, atras, pct: ativos.length ? Math.round((emDia / ativos.length) * 100) : null };
  });
  const lider =
    placar[0].pct === null && placar[1].pct === null ? null
    : (placar[0].pct ?? -1) > (placar[1].pct ?? -1) ? placar[0].setor
    : (placar[1].pct ?? -1) > (placar[0].pct ?? -1) ? placar[1].setor
    : placar[0].atras <= placar[1].atras ? placar[0].setor : placar[1].setor;

  // ----- Mural de conquistas (selos) -----
  const temTeto = (termos as any[]).some((t) => Number(t.valor_total) > 0) || (convenios as any[]).some((c) => Number(c.valor_total) > 0);
  const conquistas = [
    { label: "Início de jornada", desc: "Primeiro lançamento criado", earned: all.length >= 1, icon: Sparkles },
    { label: "Carteira ativa", desc: "5+ convênios cadastrados", earned: Object.keys(convById).length >= 5, icon: Landmark },
    { label: "Documentação impecável", desc: "100% das anulações com link do SEI", earned: anulAll.length > 0 && anulAll.every((l) => isSafeUrl(l.link_anulacao_sei)), icon: BadgeCheck },
    { label: "Recuperador", desc: "Recurso devolvido ao orçamento (anulação)", earned: anulAll.length >= 1, icon: RotateCcw },
    { label: "Zero atrasos", desc: "Nenhum processo em atraso", earned: all.length > 0 && atrasados.length === 0, icon: Clock },
    { label: "Pontualidade", desc: "Nada em atraso nem vencendo", earned: all.length > 0 && atrasados.length === 0 && vencendo.length === 0, icon: Target },
    { label: "Meio caminho", desc: "50%+ dos processos concluídos", earned: all.length > 0 && concluidosN / all.length >= 0.5, icon: Rocket },
    { label: "Time afiado", desc: "5+ processos concluídos", earned: concluidosN >= 5, icon: Star },
    { label: "Maratonista", desc: "10+ processos concluídos", earned: concluidosN >= 10, icon: Medal },
    { label: "Execução de ouro", desc: "≥ 90% do empenhado atestado", earned: totalEmpAll > 0 && execPctG >= 90, icon: Trophy },
    { label: "Guardião do saldo", desc: "Nenhum teto estourado", earned: temTeto && saldo.estourado === 0, icon: Gauge },
    { label: "Cofre protegido", desc: "Sem teto estourado nem crítico", earned: temTeto && saldo.estourado === 0 && saldo.critico === 0, icon: ShieldCheck },
  ];
  const conquistadas = conquistas.filter((c) => c.earned).length;

  const alertas = [
    { id: "saldo", grave: saldo.estourado > 0, n: saldo.estourado, label: "Parcela acima do teto mensal", desc: "Valor solicitado excede o teto do mês", icon: Gauge },
    { id: "atraso", grave: atrasados.length > 0, n: atrasados.length, label: "Processos em atraso", desc: "Passaram do prazo (SLA)", icon: Clock },
    { id: "links", grave: false, n: linkPendentes.length, label: "Anulações sem link SEI", desc: "Falta anexar o documento", icon: Link2Off },
    { id: "saldocrit", grave: false, n: saldo.critico, label: "Saldo crítico (≥85%)", desc: "Contrato perto do teto", icon: AlertTriangle },
    { id: "vencendo", grave: false, n: vencendo.length, label: "Vencendo em ≤3 dias", desc: "Aja antes de atrasar", icon: Clock },
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
      cur.empenhado += Number(l.valor_solicitado ?? 0);
      cur.atestado += Number(l.valor_atestado ?? 0);
      map.set(nome, cur);
    });
    return [...map.values()].sort((a, b) => b.empenhado - a.empenhado).slice(0, 8);
  }, [all]);

  const lineData = useMemo(() => {
    const map = new Map<number, { key: number; comp: string; solicitado: number; atestado: number }>();
    f.forEach((l) => {
      const k = compKey(l.competencia);
      if (!k) return;
      const cur = map.get(k) ?? { key: k, comp: compLabel(l.competencia), solicitado: 0, atestado: 0 };
      cur.solicitado += Number(l.valor_solicitado ?? 0);
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
          <KpiCard title="Total Solicitado" value={brl(totalSolic)} icon={TrendingUp} tone="acp" help={HELP_KPI.solicitado} />
          <KpiCard title="Empenhado" value={brl(totalEmp)} icon={FileCheck} tone="primary" help={HELP_KPI.empenhado} />
          <KpiCard title="Atestado" value={brl(totalAtest)} icon={CheckCircle2} tone="success" foot={`Execução: ${taxaExec}% do empenhado`} help={HELP_KPI.atestado} />
          <KpiCard title="Anulado (devolvido)" value={brl(totalAnul)} icon={XCircle} tone="warning" help={HELP_KPI.anulado} />
        </div>
      </div>

      {/* ===== METAS & CONQUISTAS ===== */}
      <div>
        <SectionTitle icon={Trophy} title="Metas & conquistas da equipe" hint="Progresso rumo às metas (toda a base)" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {metas.map((m) => <MetaCard key={m.label} {...m} />)}
        </div>
      </div>

      {/* ===== EMPENHADO × ATESTADO + EVOLUÇÃO ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-1">Empenhado × Atestado <HelpTip text={HELP_CHART.pizza} /></CardTitle></CardHeader>
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
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-1">Evolução por competência <HelpTip text={HELP_CHART.evolucao} /></CardTitle></CardHeader>
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
                  <Area type="monotone" dataKey="solicitado" name="Solicitado/Empenhado" stroke="var(--primary)" fill="url(#gEmp)" strokeWidth={2} />
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
          <CardTitle className="text-base flex items-center gap-1">Comparativo por prestador <HelpTip text={HELP_CHART.barras} /></CardTitle>
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

      {/* ===== PLACAR & CONQUISTAS (gamificação) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Swords className="h-4 w-4 text-primary" />Placar de SLA · ACP × ACO <HelpTip text={HELP_CHART.placar} /></CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {placar.map((p) => (
              <div key={p.setor} className={`rounded-xl border p-4 ${lider === p.setor ? "border-primary/50 bg-primary/5" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-primary">{p.setor}</span>
                  {lider === p.setor && <Crown className="h-4 w-4 text-warning" />}
                </div>
                <div className="mt-2 text-3xl font-bold tabular-nums">{p.pct === null ? "—" : `${p.pct}%`}</div>
                <div className="text-[11px] text-muted-foreground">em dia</div>
                <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${(p.pct ?? 0) >= 80 ? "bg-success" : (p.pct ?? 0) >= 50 ? "bg-warning" : "bg-destructive"}`} style={{ width: `${p.pct ?? 0}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                  <span>{p.ativos} ativo(s)</span>
                  <span>{p.atras} atrasado(s)</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-warning" />Conquistas da equipe
              <span className="text-xs font-normal text-muted-foreground">({conquistadas}/{conquistas.length})</span>
              <HelpTip text={HELP_CHART.conquistas} />
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {conquistas.map((c) => (
              <div key={c.label} className={`rounded-xl border p-3 text-center transition-colors ${c.earned ? "border-warning/40 bg-warning/10" : "opacity-55 grayscale"}`} title={c.desc}>
                <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full ${c.earned ? "bg-warning/25 text-warning-foreground" : "bg-muted text-muted-foreground"}`}>
                  <c.icon className="h-5 w-5" />
                </div>
                <div className="mt-1.5 text-xs font-semibold leading-tight">{c.label}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">{c.desc}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

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
                    <Badge variant="destructive" className="shrink-0">{etapaCorrenteLabel(l)}</Badge>
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
                      <td><Badge variant="outline" className="text-xs">{etapaCorrenteLabel(l)}</Badge></td>
                      <td className="text-right pr-4 tabular-nums">{brl(Number(l.valor_solicitado))}</td>
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
function KpiCard({ title, value, icon: Icon, tone, foot, help }: { title: string; value: string; icon: any; tone: string; foot?: string; help?: string }) {
  return (
    <Card className="overflow-hidden">
      <div className={`h-1.5 w-full bg-gradient-to-r ${KPI_TONE[tone] ?? KPI_TONE.primary}`} />
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">{title}{help && <HelpTip text={help} />}</span>
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

function MetaCard({ label, desc, pct, alvo, help }: { label: string; desc: string; pct: number | null; alvo: number; help?: string }) {
  const semDados = pct === null;
  const atingida = !semDados && pct >= alvo;
  const cor = atingida ? "bg-success" : !semDados && pct >= alvo * 0.6 ? "bg-primary" : "bg-warning";
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold flex items-center gap-1">{label}{help && <HelpTip text={help} />}</div>
            <div className="text-[11px] text-muted-foreground">{desc}</div>
          </div>
          {semDados ? (
            <Badge variant="outline" className="text-muted-foreground">Sem dados</Badge>
          ) : atingida ? (
            <Badge className="bg-success text-success-foreground gap-1"><Trophy className="h-3 w-3" />Meta batida</Badge>
          ) : (
            <span className="text-xs text-muted-foreground shrink-0">meta {alvo}%</span>
          )}
        </div>
        <div className="mt-3 flex items-end justify-between">
          <span className="text-2xl font-bold tabular-nums">{semDados ? "—" : `${pct}%`}</span>
        </div>
        <div className="mt-1 h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${cor} transition-all`} style={{ width: `${semDados ? 0 : Math.min(100, pct)}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}
