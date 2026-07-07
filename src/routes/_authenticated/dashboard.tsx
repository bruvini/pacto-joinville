import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpTip } from "@/components/HelpTip";
import { brl } from "@/lib/format";
import { useMemo, useState } from "react";
import { Filter, Target, CheckCircle2, Clock, AlertTriangle, FileText } from "lucide-react";

import { linkValido as isSafeUrl } from "@/lib/sei";
import {
  ETAPA_PIPELINE,
  etapaCorrenteLabel,
  etapaCorrenteLabelRetro,
  emAtraso,
  vencendoEmBreve,
  completudeConvenio,
  statusParcelas,
  primeiraCompetencia,
} from "@/lib/etapa";
import { pagamentoLiberado, situacaoPrestacao } from "@/lib/prestacao";
import { useAuth } from "@/hooks/useAuth";

import { BarraAtencao, type AtencaoItem } from "@/components/dashboard/BarraAtencao";
import { FluxoExecucaoCard } from "@/components/dashboard/FluxoExecucaoCard";
import { EsteiraProcesso, type EsteiraColuna } from "@/components/dashboard/EsteiraProcesso";
import { AgingList, type AgingItem } from "@/components/dashboard/AgingList";
import { EvolucaoExecucaoChart, type EvolucaoPonto } from "@/components/dashboard/EvolucaoExecucaoChart";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Painel de Acompanhamento — Convênios SMS Joinville" }] }),
  component: Dashboard,
});

const compKey = (c: string | null) => {
  const m = (c ?? "").split(",")[0].trim().match(/(\d{2})\/(\d{4})/);
  return m ? Number(m[2]) * 100 + Number(m[1]) : 0;
};
const compLabel = (c: string | null) => (c ?? "").split(",")[0].trim() || "—";

/** Rótulo de subtítulo em Aging: convênios pontuais mostram "Nº X" no lugar da competência. */
function rotuloParcela(l: any, conv: any): string {
  if (conv?.pagamento_pontual) {
    const num = String(l.parcela ?? "").trim();
    return num ? `Nº ${num}` : "Pagamento pontual";
  }
  const comp = compLabel(l.competencia);
  const par = String(l.parcela ?? "").trim();
  return par ? `Comp. ${comp} · Parc. ${par}` : `Comp. ${comp}`;
}

function tituloLanc(l: any, conv: any): string {
  const prest = l.prestadores?.nome_instituicao ?? "—";
  const obj = conv?.objeto ? ` · ${conv.objeto}` : "";
  return `${prest}${obj}`;
}

function getMotivoEAtrasoProcesso(l: any, convenio: any, hoje: Date = new Date()) {
  const c = primeiraCompetencia(l.competencia);
  if (!c) return { dias: 0, label: "Lançamento pendente" };
  const fim = Number(convenio?.dia_fim_execucao ?? 30) || 30;
  const prazo = new Date(c.ano, c.mes - 1, fim);
  
  const dPrazo = new Date(prazo.getFullYear(), prazo.getMonth(), prazo.getDate());
  const dHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diffTime = dHoje.getTime() - dPrazo.getTime();
  const dias = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

  const label = etapaCorrenteLabel(l);
  let acao = "no Lançamento/Envio do Empenho";
  if (label === "Análise de Orçamento") {
    acao = "na Análise de Orçamento";
  } else if (label === "Assinaturas e Envio") {
    acao = "nas Assinaturas / Envio do Empenho";
  } else if (label === "Liberação de Orçamento") {
    acao = "na Liberação do Empenho";
  } else if (label === "Liberação de Recurso") {
    if (Number(l.valor_atestado ?? 0) > 0 && !l.link_relatorio_tecnico_sei) {
      acao = "na Assinatura do Relatório Técnico";
    } else {
      acao = "na Liberação do Recurso / Pagamento";
    }
  } else if (label === "Anulação de Empenho") {
    acao = "na Anulação de Empenho";
  }

  return { dias, label: `${dias}d de atraso ${acao}` };
}

function getParcelaCompLabel(conv: any, num: number) {
  if (!conv.data_inicio_vigencia) return `P${num}`;
  const start = new Date(conv.data_inicio_vigencia + "T12:00:00");
  start.setMonth(start.getMonth() + num - 1);
  const mm = String(start.getMonth() + 1).padStart(2, "0");
  const yy = String(start.getFullYear()).slice(-2);
  return `${mm}/${yy}`;
}

function Dashboard() {
  const { profile } = useAuth();
  const [prestador, setPrestador] = useState("all");
  const [termo, setTermo] = useState("all");
  const [convFiltro, setConvFiltro] = useState("all");

  const { data: cfgRetro } = useQuery({
    queryKey: ["cfg-retroativo"],
    queryFn: async () =>
      (await supabase.from("sistema_config").select("valor").eq("chave", "modo_retroativo").maybeSingle()).data,
  });
  const modoRetro = cfgRetro?.valor === "1";

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
    queryFn: async () =>
      (await supabase
        .from("convenios")
        .select(
          "id, prestador_id, objeto, teto_mensal, total_parcelas, data_inicio_vigencia, dia_inicio_execucao, dia_fim_execucao, prazo_prestacao_contas_dias, exige_prestacao_contas, pagamento_pontual, prestadores(nome_instituicao)",
        )
        .order("created_at")).data ?? [],
  });
  const { data: termos = [] } = useQuery({
    queryKey: ["termos_aditivos"],
    queryFn: async () => (await supabase.from("termos_aditivos").select("*").order("identificador")).data ?? [],
  });
  const { data: prestacoes = [] } = useQuery({
    queryKey: ["prestacoes-all"],
    queryFn: async () => (await supabase.from("prestacoes_contas").select("*")).data ?? [],
  });

  const convById = useMemo(() => Object.fromEntries((convenios as any[]).map((c) => [c.id, c])), [convenios]);
  const pcByLanc = useMemo(() => Object.fromEntries((prestacoes as any[]).map((p) => [p.lancamento_id, p])), [prestacoes]);
  const termosFiltrados = useMemo(
    () => (prestador === "all" ? (termos as any[]) : (termos as any[]).filter((t) => convById[t.convenio_id]?.prestador_id === prestador)),
    [termos, prestador, convById],
  );

  // Conjunto filtrado (recorte selecionado)
  const f = useMemo(
    () =>
      (lancs as any[]).filter((l) => {
        if (prestador !== "all" && l.prestador_id !== prestador) return false;
        if (convFiltro !== "all" && l.convenio_id !== convFiltro) return false;
        if (termo === "none" && l.termo_aditivo_id) return false;
        if (termo !== "all" && termo !== "none" && l.termo_aditivo_id !== termo) return false;
        return true;
      }),
    [lancs, prestador, termo, convFiltro],
  );
  const conveniosOpcoes = (convenios as any[]).filter((c) => prestador === "all" || c.prestador_id === prestador);
  const convSelecionado = convFiltro !== "all" ? (convById[convFiltro] as any) : null;
  const completude = convSelecionado ? completudeConvenio(convSelecionado, lancs as any[]) : null;
  const parcelas = convSelecionado ? statusParcelas(convSelecionado, lancs as any[]) : [];

  const isParent = (l: any) => !l.parent_id && (l.competencia ?? "").split(",").map((s: any) => s.trim()).filter(Boolean).length > 1;
  const isChild = (l: any) => !!l.parent_id;
  const fSemPais = useMemo(() => f.filter((l) => !isParent(l)), [f]);
  const fSemFilhos = useMemo(() => f.filter((l) => !isChild(l)), [f]);
  const all = lancs as any[];
  const allSemPais = useMemo(() => all.filter((l) => !isParent(l)), [all]);

  // ----- KPIs financeiros (recorte) -----
  const soma = (arr: any[], k: string) => arr.reduce((s, l) => s + Number(l[k] ?? 0), 0);
  const totalEmp = soma(fSemFilhos, "valor_solicitado");
  const totalAtest = soma(fSemPais, "valor_atestado");
  const totalAnul = (fSemPais as any[]).reduce(
    (s, l) => s + (Number(l.valor_atestado) > 0 ? Math.max(0, Number(l.valor_solicitado ?? 0) - Number(l.valor_atestado ?? 0)) : 0),
    0,
  );
  const totalComp = (fSemPais as any[]).reduce(
    (s, l) => s + Math.max(0, Number(l.valor_atestado ?? 0) - Number(l.valor_solicitado ?? 0)),
    0,
  );

  // ----- Etapa efetiva (respeitando Modo Retroativo) -----
  const etapaDe = useMemo(
    () => (l: any) => (modoRetro && !l.concluido ? etapaCorrenteLabelRetro(l) : etapaCorrenteLabel(l)),
    [modoRetro],
  );

  // ----- Alertas base (COMPLETA) -----
  const tetoMensalDe = (taId: string | null) => Number((termos as any[]).find((t) => t.id === taId)?.valor_total ?? 0);
  const atrasados = allSemPais.filter((l) => emAtraso(l, convById[l.convenio_id]));
  const linkPendentes = allSemPais.filter(
    (l) => Number(l.valor_anulado) > 0 && Number(l.valor_atestado) > 0 && !isSafeUrl(l.link_anulacao_sei),
  );
  const vencendo = allSemPais.filter((l) => vencendoEmBreve(l, convById[l.convenio_id]));
  const saldo = useMemo(() => {
    let estourado = 0, critico = 0;
    allSemPais.forEach((l) => {
      const teto = tetoMensalDe(l.termo_aditivo_id);
      if (!teto) return;
      const v = Number(l.valor_solicitado ?? 0);
      if (v > teto) estourado++;
      else if (teto > 0 && v / teto >= 0.85) critico++;
    });
    return { estourado, critico };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termos, allSemPais]);

  // ----- Prestação de contas (guarda: só convênios que exigem) -----
  const exigePc = (l: any) => convById[l.convenio_id]?.exige_prestacao_contas !== false;
  const prests = useMemo(() => {
    return allSemPais
      .filter((l) => pagamentoLiberado(l) && exigePc(l))
      .map((l) => {
        const pc = pcByLanc[l.id] ?? null;
        return { l, pc, sit: situacaoPrestacao(l, convById[l.convenio_id], pc), status: pc?.status ?? "aguardando" };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSemPais, convById, pcByLanc]);

  const pAtrasadas = prests.filter((r) => r.sit.nivel === "grave" && r.status !== "reprovada");
  const pVencendo = prests.filter((r) => r.sit.nivel === "alerta");

  const prestsFiltradas = useMemo(() => {
    return fSemPais
      .filter((l) => pagamentoLiberado(l) && exigePc(l))
      .map((l) => {
        const pc = pcByLanc[l.id] ?? null;
        return { l, pc, sit: situacaoPrestacao(l, convById[l.convenio_id], pc), status: pc?.status ?? "aguardando" };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fSemPais, convById, pcByLanc]);

  const metricasPc = useMemo(() => {
    const pendentes = prestsFiltradas.filter((p) => p.status === "aguardando" || p.status === "reprovada").length;
    const emAnalise = prestsFiltradas.filter((p) => p.status === "recebida").length;
    const aprovadas = prestsFiltradas.filter((p) => p.status === "aprovada").length;
    const total = prestsFiltradas.length;
    const taxa = total > 0 ? Math.round((aprovadas / total) * 100) : 100;
    return { pendentes, emAnalise, aprovadas, total, taxa };
  }, [prestsFiltradas]);

  const exibirBlocoPc = convFiltro === "all" || (convSelecionado && convSelecionado.exige_prestacao_contas !== false);

  // ============ ZONA A · Barra de Atenção ============
  const barraItens: AtencaoItem[] = ([
    { n: atrasados.length, severidade: "critico", label: "empenho(s) em atraso", to: "/lancamentos", search: { status: "atrasados" } },
    { n: pAtrasadas.length, severidade: "critico", label: "prestação(ões) atrasada(s)", to: "/prestacao-contas" },
    { n: saldo.estourado, severidade: "critico", label: "parcela(s) acima do teto", to: "/lancamentos" },
    { n: linkPendentes.length, severidade: "alerta", label: "anulação(ões) sem link SEI", to: "/auditoria" },
    { n: vencendo.length, severidade: "alerta", label: "empenho(s) vencendo ≤3d", to: "/lancamentos" },
    { n: pVencendo.length, severidade: "alerta", label: "prestação(ões) vencendo ≤7d", to: "/prestacao-contas" },
    { n: saldo.critico, severidade: "alerta", label: "contrato(s) saldo ≥85%", to: "/convenios" },
  ] as AtencaoItem[]).filter((a) => a.n > 0);

  // ============ ZONA C · Esteira ============
  const colunas: EsteiraColuna[] = useMemo(() => {
    const base: Record<string, EsteiraColuna> = Object.fromEntries(
      ETAPA_PIPELINE.map((p) => [p.slug, { ...p, n: 0, valor: 0, atrasados: 0, vencendo: 0 }]),
    );
    const alvo = fSemFilhos; // recorte + sem pais duplicados
    alvo.forEach((l) => {
      const label = etapaDe(l);
      const p = ETAPA_PIPELINE.find((x) => x.label === label) ?? ETAPA_PIPELINE[0];
      const col = base[p.slug];
      col.n += 1;
      col.valor += Number(l.valor_solicitado ?? 0);
      if (!l.concluido) {
        if (emAtraso(l, convById[l.convenio_id])) col.atrasados += 1;
        else if (vencendoEmBreve(l, convById[l.convenio_id])) col.vencendo += 1;
      }
    });
    return ETAPA_PIPELINE.map((p) => base[p.slug]);
  }, [fSemFilhos, convById, etapaDe]);

  // ============ ZONA D · Aging List ============
  const agingItens: AgingItem[] = useMemo(() => {
    const lancamentosFiltrados = allSemPais;
    const primeiraCompetencia = lancamentosFiltrados.length > 0 
      ? lancamentosFiltrados.map(l => l.competencia).sort()[0] 
      : "01/2026";

    const itens: AgingItem[] = [];
    const hoje = new Date();
    const hojeMs = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();

    // 1) Empenhos em atraso ou vencendo (Zona F respeita filtro; Aging usa base completa)
    allSemPais.forEach((l) => {
      const conv = convById[l.convenio_id];
      const fim = Number(conv?.dia_fim_execucao ?? 0);
      const emA = emAtraso(l, conv);
      const emV = vencendoEmBreve(l, conv);
      if (!emA && !emV) return;
      // dias de desvio (referência: dia_fim_execucao do mês corrente)
      let dias = 0;
      if (fim) {
        const ref = new Date(hoje.getFullYear(), hoje.getMonth(), fim).getTime();
        dias = Math.floor((ref - hojeMs) / 86400000);
      }
      if (emA && dias > 0) dias = -Math.max(1, Math.abs(dias));
      const sev: AgingItem["severidade"] = emA ? "critico" : dias <= 2 ? "alerta" : "preventivo";
      itens.push({
        id: `emp-${l.id}`,
        href: "/lancamentos/$id",
        hrefParams: { id: l.id },
        titulo: tituloLanc(l, conv),
        subtitulo: rotuloParcela(l, conv),
        motivo: emA ? getMotivoEAtrasoProcesso(l, conv, hoje).label : `Empenho vence em ${dias}d`,
        dias,
        severidade: sev,
      });
    });

    // 2) Prestação de contas — SOMENTE convênios que exigem
    prests.forEach((r) => {
      if (r.sit.nivel !== "grave" && r.sit.nivel !== "alerta") return;
      const conv = convById[r.l.convenio_id];
      const dias = r.sit.dias ?? 0;
      const sev: AgingItem["severidade"] =
        r.sit.nivel === "grave" ? "critico" : dias <= 2 ? "alerta" : "preventivo";
      itens.push({
        id: `pc-${r.l.id}`,
        href: "/prestacao-contas",
        titulo: tituloLanc(r.l, conv),
        subtitulo: rotuloParcela(r.l, conv),
        motivo: dias < 0
          ? `${-dias}d de atraso na Entrega da Prestação de Contas`
          : dias === 0
          ? "Vence hoje a Entrega da Prestação de Contas"
          : `Vence em ${dias}d a Entrega da Prestação de Contas`,
        dias,
        severidade: sev,
      });
    });

    return itens;
  }, [allSemPais, convById, prests, etapaDe]);

  // ============ ZONA E · Evolução ============
  const evolucao: EvolucaoPonto[] = useMemo(() => {
    const map = new Map<number, EvolucaoPonto & { key: number }>();
    fSemFilhos.forEach((l) => {
      const k = compKey(l.competencia);
      if (!k) return;
      let atestado = Number(l.valor_atestado ?? 0);
      const children = (lancs as any[]).filter((c) => c.parent_id === l.id);
      if (children.length > 0) atestado = children.reduce((s, c) => s + Number(c.valor_atestado ?? 0), 0);
      const solicitado = Number(l.valor_solicitado ?? 0);
      const cur = map.get(k) ?? { key: k, comp: compLabel(l.competencia), atestado: 0, glosa: 0, solicitado: 0, taxa: 0 };
      cur.solicitado += solicitado;
      cur.atestado += atestado;
      cur.glosa += Math.max(0, solicitado - atestado);
      map.set(k, cur);
    });
    return [...map.values()]
      .sort((a, b) => a.key - b.key)
      .map((p) => ({ ...p, taxa: p.solicitado > 0 ? Math.round((p.atestado / p.solicitado) * 100) : 0 }));
  }, [fSemFilhos, lancs]);

  return (
    <div className="space-y-4">
      {/* Cabeçalho + filtros globais */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">Painel de Acompanhamento</h1>
          <p className="text-sm text-muted-foreground">
            Cockpit de gestão à vista{profile?.nome ? ` · olá, ${profile.nome.split(" ")[0]}` : ""}
            {modoRetro && <span className="ml-2 text-xs font-medium text-warning-foreground">· Modo retroativo ativo</span>}
          </p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-52">
            <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />Prestador</Label>
            <Select value={prestador} onValueChange={(v) => { setPrestador(v); setTermo("all"); setConvFiltro("all"); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Consolidado geral</SelectItem>
                {(prestadores as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52">
            <Label className="text-xs">Convênio / Objeto</Label>
            <Select value={convFiltro} onValueChange={setConvFiltro}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os convênios</SelectItem>
                {conveniosOpcoes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.objeto ?? "(sem objeto)"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
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

      {/* ===== ZONA A · Barra de Atenção ===== */}
      <BarraAtencao itens={barraItens} />

      {/* ===== ZONA B · Fluxo de Execução ===== */}
      <FluxoExecucaoCard
        empenhado={totalEmp}
        atestado={totalAtest}
        glosa={totalAnul}
        complementar={totalComp}
        qtd={f.length}
      />

      {/* ===== ZONA C · Esteira ===== */}
      <EsteiraProcesso colunas={colunas} />

      {/* ===== ZONA DE PRESTAÇÃO DE CONTAS (CONDICIONAL) ===== */}
      {exibirBlocoPc && (
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
              <FileText className="h-3.5 w-3.5" />
              Indicadores de Prestação de Contas
              <HelpTip text="Visão consolidada das prestações de contas exigidas para os lançamentos de pagamento realizados no recorte atual." />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Card 1: Pendentes / Atrasadas */}
              <div className="bg-muted/30 p-3 rounded-lg border border-border/20">
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide font-semibold">
                  Pendentes / Atrasadas
                </span>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-bold tabular-nums text-destructive">
                    {metricasPc.pendentes}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">lançamento(s)</span>
                </div>
              </div>

              {/* Card 2: Entregues / Em Análise */}
              <div className="bg-muted/30 p-3 rounded-lg border border-border/20">
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide font-semibold">
                  Entregues / Em Análise
                </span>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-bold tabular-nums text-amber-500">
                    {metricasPc.emAnalise}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">em análise</span>
                </div>
              </div>

              {/* Card 3: Aprovadas / Concluídas */}
              <div className="bg-muted/30 p-3 rounded-lg border border-border/20">
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide font-semibold">
                  Aprovadas / Concluídas
                </span>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-bold tabular-nums text-success">
                    {metricasPc.aprovadas}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">concluída(s)</span>
                </div>
              </div>

              {/* Card 4: Taxa de Conformidade */}
              <div className="bg-muted/30 p-3 rounded-lg border border-border/20">
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide font-semibold">
                  Taxa de Conformidade
                </span>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className={`text-xl sm:text-2xl font-bold tabular-nums ${metricasPc.taxa >= 90 ? "text-success" : metricasPc.taxa >= 70 ? "text-primary" : "text-destructive"}`}>
                    {metricasPc.taxa}%
                  </span>
                  <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden self-center ml-1">
                    <div 
                      className={`h-full transition-all duration-300 ${metricasPc.taxa >= 90 ? "bg-success" : metricasPc.taxa >= 70 ? "bg-primary" : "bg-destructive"}`} 
                      style={{ width: `${metricasPc.taxa}%` }} 
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== ZONA E · Evolução ===== */}
      <div className="w-full">
        <EvolucaoExecucaoChart data={evolucao} />
      </div>

      {/* ===== ZONA D · Aging List ===== */}
      <div className="w-full">
        <AgingList itens={agingItens} />
      </div>

      {/* ===== ZONA F · Acompanhamento do contrato (convênio selecionado) ===== */}
      {convSelecionado && completude && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide">Acompanhamento do contrato</h2>
            <span className="text-xs text-muted-foreground">· {convSelecionado.objeto ?? "Convênio selecionado"}</span>
          </div>
          <Card>
            <CardContent className="pt-4 space-y-4">
              {/* Indicador de completude: barra linear Progress fina e elegante */}
              <div className="space-y-2">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-primary tabular-nums">{completude.taxa === null ? "—" : `${completude.taxa}%`}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                      Completude do Contrato
                      <HelpTip text="Parcelas concluídas ÷ parcelas que já deveriam estar concluídas até hoje (não conta o 1º mês de vigência nem meses futuros). Uma parcela só conta como concluída após o clique em 'Concluir processo'." />
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{completude.concluidas} de {completude.esperadas} esperada(s) concluída(s) · {completude.total} na vigência</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${(completude.taxa ?? 0) >= 100 ? "bg-success" : (completude.taxa ?? 0) >= 60 ? "bg-primary" : "bg-warning"}`} 
                    style={{ width: `${Math.min(100, completude.taxa ?? 0)}%` }} 
                  />
                </div>
              </div>

              {/* Calendário de Execução / Linha do tempo compacta por pills */}
              {parcelas.length === 0 ? (
                <div className="text-sm text-muted-foreground pt-1">
                  {convSelecionado.pagamento_pontual
                    ? "Convênio com pagamentos pontuais — lançamentos gerados sob demanda."
                    : "Defina o nº de parcelas no cadastro do convênio para acompanhar."}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-wrap gap-2">
                    {parcelas.map((p) => {
                      const isConcluida = p.status === "concluido";
                      const isAtrasada = p.num <= completude.esperadas && p.status !== "concluido";
                      const isAndamento = p.status === "andamento";
                      const label = getParcelaCompLabel(convSelecionado, p.num);
                      
                      let bgClass = "bg-muted text-muted-foreground border-transparent";
                      let dotClass = "bg-muted-foreground/40";
                      let statusText = "Futura / Sem lançamento";
                      
                      if (isConcluida) {
                        bgClass = "bg-success/10 text-success border-success/10";
                        dotClass = "bg-success";
                        statusText = "Concluída em dia";
                      } else if (isAtrasada) {
                        bgClass = "bg-destructive/10 text-destructive border-destructive/10";
                        dotClass = "bg-destructive";
                        statusText = "Pendente (passou do prazo)";
                      } else if (isAndamento) {
                        bgClass = "bg-acp/10 text-acp border-acp/10";
                        dotClass = "bg-acp";
                        statusText = `Em andamento (${p.etapa || "Liberação"})`;
                      }

                      return (
                        <div 
                          key={p.num} 
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${bgClass} transition-all hover:scale-[1.03]`}
                          title={`Parcela ${p.num} (${label}) · ${statusText}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                          <span className="tabular-nums">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />Concluída em dia</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-acp" />Em andamento</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" />Pendente (passou do prazo)</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" />Futura / sem lançamento</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {barraItens.length === 0 && agingItens.length === 0 && (
        <div className="flex items-center gap-3 rounded-md border border-success/30 bg-success/5 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          <div className="text-sm">
            <span className="font-semibold text-success">Tudo sob controle.</span>{" "}
            <span className="text-muted-foreground">Nenhum desvio ativo no recorte atual.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ParcelaTile({ num, status, etapa, esperada }: { num: number; status: string; etapa: string; esperada: boolean }) {
  const cfg =
    status === "concluido"
      ? { cls: "border-success/50 bg-success/15 text-success", icon: CheckCircle2, label: "Concluída" }
      : status === "andamento"
      ? { cls: "border-primary/50 bg-primary/10 text-primary", icon: Clock, label: etapa || "Em andamento" }
      : esperada
      ? { cls: "border-destructive/50 bg-destructive/10 text-destructive", icon: AlertTriangle, label: "Pendente" }
      : { cls: "border-border bg-muted/40 text-muted-foreground", icon: Clock, label: "Sem lançamento" };
  const Icon = cfg.icon;
  return (
    <div className={`rounded-md border px-1.5 py-1 flex items-center justify-center gap-1 ${cfg.cls}`} title={`Parcela ${num} · ${cfg.label}`}>
      <span className="text-xs font-bold tabular-nums">{num}</span>
      <Icon className="h-3 w-3 shrink-0" />
    </div>
  );
}
