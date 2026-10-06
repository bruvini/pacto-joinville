import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/HelpTip";
import { brl } from "@/lib/format";
import { useMemo, useState } from "react";
import { Filter, Target, CheckCircle2, Clock, AlertTriangle, FileText, ChevronDown, HeartPulse } from "lucide-react";

import { linkValido as isSafeUrl } from "@/lib/sei";
import {
  ETAPAS_AGRUPAMENTO,
  getEtapaAgrupamento,
  etapaCorrenteLabel,
  etapaCorrenteLabelRetro,
  emAtraso,
  vencendoEmBreve,
  statusPrazoLancamento,
  completudeConvenio,
  statusParcelas,
} from "@/lib/etapa";
import { pagamentoLiberado, situacaoPrestacao } from "@/lib/prestacao";
import { useAuth } from "@/hooks/useAuth";

import { BarraAtencao, type AtencaoItem } from "@/components/dashboard/BarraAtencao";
import { FluxoExecucaoCard } from "@/components/dashboard/FluxoExecucaoCard";
import { EsteiraProcesso, type EsteiraColuna } from "@/components/dashboard/EsteiraProcesso";
import { AgingList, type AgingItem } from "@/components/dashboard/AgingList";
import { EvolucaoExecucaoChart, type EvolucaoPonto } from "@/components/dashboard/EvolucaoExecucaoChart";
import { SlaScorecards, DistribuicaoSetorChart, AtividadeUsuarioChart, ACAO_TIPOS, classificarAcao } from "@/components/dashboard/DesempenhoSLA";
import { LimparFiltrosButton } from "@/components/LimparFiltrosButton";
import { PISO_ETAPAS, etapaAtualPiso } from "@/lib/piso/etapas";

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

function getParcelaCompLabel(conv: any, num: number) {
  if (!conv.data_inicio_vigencia) return `P${num}`;
  const start = new Date(conv.data_inicio_vigencia + "T12:00:00");
  start.setMonth(start.getMonth() + num - 1);
  const mm = String(start.getMonth() + 1).padStart(2, "0");
  const yy = String(start.getFullYear()).slice(-2);
  return `${mm}/${yy}`;
}

const MESES_LABEL: [string, string][] = [
  ["01", "Jan"], ["02", "Fev"], ["03", "Mar"], ["04", "Abr"], ["05", "Mai"], ["06", "Jun"],
  ["07", "Jul"], ["08", "Ago"], ["09", "Set"], ["10", "Out"], ["11", "Nov"], ["12", "Dez"],
];

function Dashboard() {
  const { profile } = useAuth();
  const [prestador, setPrestador] = useState("all");
  const [termo, setTermo] = useState("all");
  const [convFiltro, setConvFiltro] = useState("all");
  const [mesesSel, setMesesSel] = useState<string[]>([]); // meses de competência (MM) — múltipla escolha
  const [anoSel, setAnoSel] = useState("all"); // ano de competência (AAAA) — escolha única

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
  // Assinaturas (com timestamp do clique) — base dos SLAs de retenção por signatário.
  const { data: assinaturas = [] } = useQuery({
    queryKey: ["dash-assinaturas"],
    queryFn: async () => (await supabase.from("assinaturas_etapa").select("lancamento_id, cargo, assinado_em").order("assinado_em")).data ?? [],
  });
  // Marcos temporais (event sourcing) — base do Lead Time e do SLA real por etapa.
  const { data: marcos = [] } = useQuery({
    queryKey: ["dash-marcos"],
    queryFn: async () => (await supabase.from("lancamento_marco_tempo").select("lancamento_id, marco, ocorrido_em")).data ?? [],
  });
  // Logs de auditoria — base do gráfico de atividade por usuário.
  const { data: audLogs = [] } = useQuery({
    queryKey: ["dash-audit-logs"],
    queryFn: async () => (await supabase.from("historico_logs").select("usuario_nome, acao, lancamento_id, piso_competencia_id").order("data_hora", { ascending: false }).limit(3000)).data ?? [],
  });
  const { data: pisoCompetencias = [] } = useQuery({
    queryKey: ["dash-piso-competencias"],
    queryFn: async () =>
      (
        await supabase
          .from("piso_competencias")
          .select("*, piso_participantes(prestador_id)")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const convById = useMemo(() => Object.fromEntries((convenios as any[]).map((c) => [c.id, c])), [convenios]);
  const pcByLanc = useMemo(() => Object.fromEntries((prestacoes as any[]).map((p) => [p.lancamento_id, p])), [prestacoes]);
  const termosFiltrados = useMemo(
    () => (termos as any[]).filter((t) => {
      if (convFiltro !== "all") return t.convenio_id === convFiltro;
      return prestador === "all" || convById[t.convenio_id]?.prestador_id === prestador;
    }),
    [termos, prestador, convFiltro, convById],
  );

  // Anos de competência disponíveis (para o filtro de ano).
  const anosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (lancs as any[]).forEach((l) =>
      (l.competencia ?? "")
        .match(/\d{2}\/(\d{4})/g)
        ?.forEach((c: string) => set.add(c.slice(3))),
    );
    (pisoCompetencias as any[]).forEach((c) => {
      const ano = String(c.competencia ?? "").split("/")[1];
      if (ano) set.add(ano);
    });
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [lancs, pisoCompetencias]);

  const partesComp = (comp: string | null) =>
    (comp ?? "").split(",").map((s) => s.trim()).map((s) => s.match(/^(\d{2})\/(\d{4})$/)).filter(Boolean) as RegExpMatchArray[];

  // Conjunto filtrado (recorte selecionado)
  const f = useMemo(
    () =>
      (lancs as any[]).filter((l) => {
        if (prestador !== "all" && l.prestador_id !== prestador) return false;
        if (convFiltro !== "all" && l.convenio_id !== convFiltro) return false;
        // Termo aditivo só filtra quando há um convênio selecionado.
        if (convFiltro !== "all") {
          if (termo === "none" && l.termo_aditivo_id) return false;
          if (termo !== "all" && termo !== "none" && l.termo_aditivo_id !== termo) return false;
        }
        if (mesesSel.length || anoSel !== "all") {
          const partes = partesComp(l.competencia);
          if (mesesSel.length && !partes.some((m) => mesesSel.includes(m[1]))) return false;
          if (anoSel !== "all" && !partes.some((m) => m[2] === anoSel)) return false;
        }
        return true;
      }),
    [lancs, prestador, termo, convFiltro, mesesSel, anoSel],
  );
  const conveniosOpcoes = (convenios as any[]).filter((c) => prestador === "all" || c.prestador_id === prestador);
  const convSelecionado = convFiltro !== "all" ? (convById[convFiltro] as any) : null;
  const completude = convSelecionado ? completudeConvenio(convSelecionado, lancs as any[]) : null;
  const parcelas = convSelecionado ? statusParcelas(convSelecionado, lancs as any[]) : [];

  const isParent = (l: any) => !l.parent_id && (l.competencia ?? "").split(",").map((s: any) => s.trim()).filter(Boolean).length > 1;
  const isChild = (l: any) => !!l.parent_id;
  const fSemPais = useMemo(() => f.filter((l) => !isParent(l)), [f]);
  const fSemFilhos = useMemo(() => f.filter((l) => !isChild(l)), [f]);

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
  const pisoFiltrado = (pisoCompetencias as any[]).filter((c) => {
    // Convênio/termo são filtros exclusivos do fluxo contratual; quando ativos,
    // o Piso não entra no consolidado para evitar misturar recortes incompatíveis.
    if (convFiltro !== "all" || termo !== "all") return false;
    if (
      prestador !== "all" &&
      !(c.piso_participantes ?? []).some((p: any) => p.prestador_id === prestador)
    )
      return false;
    const [mes, ano] = String(c.competencia ?? "").split("/");
    return (!mesesSel.length || mesesSel.includes(mes)) && (anoSel === "all" || ano === anoSel);
  });
  const totalPisoHomologado = pisoFiltrado.reduce(
    (s, c) => s + Number(c.valor_homologado ?? 0),
    0,
  );
  const totalPisoTransferido = pisoFiltrado.reduce(
    (s, c) => s + Number(c.valor_transferido ?? 0),
    0,
  );
  const pisoAtivas = pisoFiltrado.filter((c) => c.status !== "encerrada");
  const pisoEncerradas = pisoFiltrado.filter((c) => c.status === "encerrada");
  const pisoReconferir = pisoFiltrado.filter((c) => (c.etapas_reconferir?.length ?? 0) > 0);
  const pisoEtapasResumo = PISO_ETAPAS.map((etapa) => ({
    etapa: etapa.n,
    titulo: etapa.titulo,
    desc: etapa.desc,
    quantidade: pisoAtivas.filter((c) => etapaAtualPiso(c.etapas_concluidas) === etapa.n).length,
  }));

  // ----- Etapa efetiva (respeitando Modo Retroativo) -----
  const etapaDe = useMemo(
    () => (l: any) => (modoRetro && !l.concluido ? etapaCorrenteLabelRetro(l) : etapaCorrenteLabel(l)),
    [modoRetro],
  );

  // ===== Engenharia de intralogística / SLA (Lei de Little, Teoria das Filas) =====
  const DIA = 86400000;
  // Distribuição de custódia por setor (ACP × UFI) dos processos ATIVOS (etapa atual).
  const distribuicaoSetor = useMemo(() => {
    let acp = 0, ufi = 0;
    (f as any[]).filter((l) => !l.concluido && !isParent(l)).forEach((l) => {
      if (l.responsavel_atual === "acp") acp += 1; else ufi += 1;
    });
    return [
      { setor: "ACP", nome: "Setor ACP (Acompanhamento e Prestação de Contas)", valor: acp },
      { setor: "UFI", nome: "Setor UFI (Gestão Financeira e Orçamentária)", valor: ufi },
    ];
  }, [f]);

  // Atividade por usuário (logs) — reage ao recorte do painel.
  const atividadeUsuario = useMemo(() => {
    const idsF = new Set((f as any[]).map((l) => l.id));
    const idsPiso = new Set(pisoFiltrado.map((c) => c.id));
    const semFiltro = prestador === "all" && convFiltro === "all" && termo === "all" && mesesSel.length === 0 && anoSel === "all";
    const porUser = new Map<string, Record<string, number>>();
    (audLogs as any[]).forEach((r) => {
      // Respeita o filtro: logs de lançamentos fora do recorte são ignorados
      // (logs globais, sem lancamento_id, aparecem sempre).
      if (!semFiltro && r.lancamento_id && !idsF.has(r.lancamento_id)) return;
      if (!semFiltro && r.piso_competencia_id && !idsPiso.has(r.piso_competencia_id)) return;
      const nome = (r.usuario_nome ?? "").trim() || "Sistema";
      const tipo = classificarAcao(r.acao);
      const o = porUser.get(nome) ?? Object.fromEntries(ACAO_TIPOS.map((t) => [t.key, 0]));
      o[tipo] = (o[tipo] ?? 0) + 1;
      porUser.set(nome, o);
    });
    return Array.from(porUser.entries())
      .map(([usuario, counts]) => ({
        usuario: usuario.length > 16 ? usuario.slice(0, 15) + "…" : usuario,
        total: Object.values(counts).reduce((s, n) => s + n, 0),
        ...counts,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [audLogs, f, pisoFiltrado, prestador, convFiltro, termo, mesesSel, anoSel]);

  // Lead Time (Lei de Little): ciclo de vida da despesa — criação → conclusão.
  const leadTime = useMemo(() => {
    const concl = (f as any[]).filter((l) => l.concluido && !isParent(l) && l.created_at);
    const sigsBy = new Map<string, any[]>();
    (assinaturas as any[]).forEach((a) => { (sigsBy.get(a.lancamento_id) ?? sigsBy.set(a.lancamento_id, []).get(a.lancamento_id))!.push(a); });
    const dias: number[] = [];
    concl.forEach((l) => {
      const marcos = [l.data_pagamento ? new Date(`${String(l.data_pagamento).slice(0, 10)}T12:00:00`).getTime() : 0,
        ...(sigsBy.get(l.id) ?? []).map((a) => new Date(a.assinado_em).getTime()),
        l.updated_at ? new Date(l.updated_at).getTime() : 0];
      const fim = Math.max(...marcos);
      const ini = new Date(l.created_at).getTime();
      if (fim > ini) dias.push((fim - ini) / DIA);
    });
    const media = dias.length ? dias.reduce((s, d) => s + d, 0) / dias.length : null;
    return { media, n: dias.length };
  }, [f, assinaturas]);

  // SLA de retenção por signatário/cargo (Teoria das Filas): tempo médio que o
  // processo aguardou antes de cada assinatura (proxy: gap desde o marco anterior).
  const slaCargos = useMemo(() => {
    const acc = new Map<string, { soma: number; n: number }>();
    const createdBy = new Map((f as any[]).map((l) => [l.id, l.created_at ? new Date(l.created_at).getTime() : 0]));
    const sigsBy = new Map<string, any[]>();
    (assinaturas as any[]).forEach((a) => {
      if (!createdBy.has(a.lancamento_id)) return;
      (sigsBy.get(a.lancamento_id) ?? sigsBy.set(a.lancamento_id, []).get(a.lancamento_id))!.push(a);
    });
    sigsBy.forEach((sigs, lancId) => {
      const ordenadas = [...sigs].filter((a) => a.assinado_em).sort((x, y) => new Date(x.assinado_em).getTime() - new Date(y.assinado_em).getTime());
      let prev = createdBy.get(lancId) || (ordenadas[0] ? new Date(ordenadas[0].assinado_em).getTime() : 0);
      ordenadas.forEach((a) => {
        const t = new Date(a.assinado_em).getTime();
        const cargo = a.cargo === "SEFAZ" ? "SEFAZ / Comissão" : (a.cargo || "Outros");
        const b = acc.get(cargo) ?? { soma: 0, n: 0 };
        if (t >= prev) { b.soma += (t - prev) / DIA; b.n += 1; acc.set(cargo, b); }
        prev = t;
      });
    });
    return Array.from(acc.entries())
      .map(([cargo, { soma, n }]) => ({ cargo, media: n ? soma / n : 0, n }))
      .sort((a, b) => b.media - a.media);
  }, [f, assinaturas]);

  // ----- Métricas REAIS a partir dos marcos temporais (event sourcing) -----
  const idsEscopo = useMemo(() => new Set((f as any[]).filter((l) => !isParent(l)).map((l) => l.id)), [f]);
  const marcosPorLanc = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    (marcos as any[]).forEach((r) => {
      const o = m.get(r.lancamento_id) ?? {};
      o[r.marco] = new Date(r.ocorrido_em).getTime();
      m.set(r.lancamento_id, o);
    });
    return m;
  }, [marcos]);

  // Lead Time real (Lei de Little): criação → conclusão, pelos marcos carimbados.
  const leadTimeReal = useMemo(() => {
    const dias: number[] = [];
    marcosPorLanc.forEach((mk, id) => {
      if (!idsEscopo.has(id)) return;
      if (mk.criado != null && mk.concluido != null && mk.concluido > mk.criado) dias.push((mk.concluido - mk.criado) / DIA);
    });
    return { media: dias.length ? dias.reduce((s, d) => s + d, 0) / dias.length : null, n: dias.length };
  }, [marcosPorLanc, idsEscopo]);
  // Usa o Lead Time real quando há marcos; senão, o proxy anterior.
  const leadTimeFinal = leadTimeReal.n > 0 ? { ...leadTimeReal, real: true } : { ...leadTime, real: false };

  // SLA real de retenção por etapa: intervalo entre marcos consecutivos.
  const slaEtapas = useMemo(() => {
    const pares: [string, string, string][] = [
      ["criado", "e1_analise", "Etapa 1 · Análise Orçamentária (UFI)"],
      ["e1_analise", "e2_solicitacao", "Etapa 2 · Solicitação (ACP)"],
      ["e2_solicitacao", "e3_revisao", "Etapa 3 · Revisão (UFI)"],
      ["e3_revisao", "e4_sefaz", "Etapa 4 · Assinaturas e Envio (ACP)"],
      ["e4_sefaz", "e5_empenho", "Etapa 5 · Liberação de Orçamento (UFI)"],
      ["e5_empenho", "e6_pagamento", "Etapa 6 · Liberação/Liquidação (ACP)"],
    ];
    return pares.map(([de, ate, etapa]) => {
      const ds: number[] = [];
      marcosPorLanc.forEach((mk, id) => {
        if (!idsEscopo.has(id)) return;
        if (mk[de] != null && mk[ate] != null && mk[ate] >= mk[de]) ds.push((mk[ate] - mk[de]) / DIA);
      });
      return { etapa, media: ds.length ? ds.reduce((s, d) => s + d, 0) / ds.length : null, n: ds.length };
    }).filter((s) => s.n > 0);
  }, [marcosPorLanc, idsEscopo]);

  // ----- Alertas base (COMPLETA) -----
  const tetoMensalDe = (taId: string | null) => Number((termos as any[]).find((t) => t.id === taId)?.valor_total ?? 0);
  const atrasados = fSemPais.filter((l) => emAtraso(l, convById[l.convenio_id]));
  const linkPendentes = fSemPais.filter(
    (l) => Number(l.valor_anulado) > 0 && Number(l.valor_atestado) > 0 && !isSafeUrl(l.link_anulacao_sei),
  );
  const vencendo = fSemPais.filter((l) => vencendoEmBreve(l, convById[l.convenio_id]));
  const saldo = useMemo(() => {
    let estourado = 0, critico = 0;
    fSemPais.forEach((l) => {
      const teto = tetoMensalDe(l.termo_aditivo_id);
      if (!teto) return;
      const v = Number(l.valor_solicitado ?? 0);
      if (v > teto) estourado++;
      else if (teto > 0 && v / teto >= 0.85) critico++;
    });
    return { estourado, critico };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termos, fSemPais]);

  // ----- Prestação de contas (guarda: só convênios que exigem) -----
  const exigePc = (l: any) => convById[l.convenio_id]?.exige_prestacao_contas !== false;
  const prests = useMemo(() => {
    return fSemPais
      .filter((l) => pagamentoLiberado(l) && exigePc(l))
      .map((l) => {
        const pc = pcByLanc[l.id] ?? null;
        return { l, pc, sit: situacaoPrestacao(l, convById[l.convenio_id], pc), status: pc?.status ?? "aguardando" };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fSemPais, convById, pcByLanc]);

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
    { n: atrasados.length, severidade: "critico", label: "processo(s) em atraso", to: "/lancamentos", search: { status: "atrasados" } },
    { n: pAtrasadas.length, severidade: "critico", label: "prestação(ões) atrasada(s)", to: "/prestacao-contas" },
    { n: saldo.estourado, severidade: "critico", label: "parcela(s) acima do teto", to: "/lancamentos" },
    { n: linkPendentes.length, severidade: "alerta", label: "anulação(ões) sem link SEI", to: "/auditoria" },
    { n: vencendo.length, severidade: "alerta", label: "processo(s) vencendo em breve", to: "/lancamentos" },
    { n: pVencendo.length, severidade: "alerta", label: "prestação(ões) vencendo ≤7d", to: "/prestacao-contas" },
    { n: saldo.critico, severidade: "alerta", label: "contrato(s) saldo ≥85%", to: "/convenios" },
    {
      n: pisoReconferir.length,
      severidade: "alerta",
      label: "competência(s) do Piso para reconferir",
      to: "/piso",
    },
  ] as AtencaoItem[]).filter((a) => a.n > 0);

  // ============ ZONA C · Esteira ============
  // Usa EXATAMENTE a mesma lógica de agrupamento da tabela de Lançamentos:
  // um processo-pai é contado uma vez em cada grupo onde tenha ≥1 competência
  // filha; um avulso conta no seu próprio grupo. Garante que as contagens da
  // esteira batam com os grupos da página de Lançamentos.
  const ESTEIRA_CURTO: Record<string, string> = {
    "Análise de Orçamento": "Análise",
    "Solicitação": "Solicitação",
    "Revisão": "Revisão",
    "Liberação de Orçamento": "Lib. Orçamento",
    "Liberação de Recurso": "Lib. Recurso",
    "Anulação": "Anulação",
    "Concluídos": "Concluídos",
  };
  const colunas: EsteiraColuna[] = useMemo(() => {
    const base: Record<string, EsteiraColuna> = Object.fromEntries(
      ETAPAS_AGRUPAMENTO.map((g) => [g, { slug: g, label: g, curto: ESTEIRA_CURTO[g] ?? g, n: 0, valor: 0, atrasados: 0, vencendo: 0 }]),
    );
    const processos = (f as any[]).filter((l) => !l.parent_id); // avulsos + pais do recorte
    processos.forEach((l) => {
      const kids = (lancs as any[]).filter((c) => c.parent_id === l.id);
      const conv = convById[l.convenio_id];
      if (kids.length > 0) {
        const porGrupo = new Map<string, any[]>();
        kids.forEach((c) => { const g = getEtapaAgrupamento(c); (porGrupo.get(g) ?? porGrupo.set(g, []).get(g))!.push(c); });
        porGrupo.forEach((kidsHere, g) => {
          const col = base[g]; if (!col) return;
          col.n += 1;
          col.valor += kidsHere.reduce((s, c) => s + Number(c.valor_solicitado ?? 0), 0);
          if (kidsHere.some((c) => !c.concluido && emAtraso(c, conv))) col.atrasados += 1;
          else if (kidsHere.some((c) => !c.concluido && vencendoEmBreve(c, conv))) col.vencendo += 1;
        });
      } else {
        const col = base[getEtapaAgrupamento(l)]; if (!col) return;
        col.n += 1;
        col.valor += Number(l.valor_solicitado ?? 0);
        if (!l.concluido && emAtraso(l, conv)) col.atrasados += 1;
        else if (!l.concluido && vencendoEmBreve(l, conv)) col.vencendo += 1;
      }
    });
    return [
      ...ETAPAS_AGRUPAMENTO.map((g) => base[g]),
      {
        slug: "Piso da Enfermagem",
        label: "Piso da Enfermagem",
        curto: "Piso Enfermagem",
        n: pisoFiltrado.filter((c) => c.status !== "encerrada").length,
        valor: totalPisoHomologado,
        atrasados: pisoFiltrado.filter((c) => (c.etapas_reconferir?.length ?? 0) > 0).length,
        vencendo: 0,
        href: "/piso" as const,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, lancs, convById, pisoFiltrado, totalPisoHomologado]);

  // ============ ZONA D · Aging List ============
  const agingItens: AgingItem[] = useMemo(() => {
    const lancamentosFiltrados = fSemPais;
    const primeiraCompetencia = lancamentosFiltrados.length > 0 
      ? lancamentosFiltrados.map(l => l.competencia).sort()[0] 
      : "01/2026";

    const itens: AgingItem[] = [];
    const hoje = new Date();

    // 1) Cronômetros por fase (empenho / pagamento / anulação) — só o que exige ação.
    fSemPais.forEach((l) => {
      const conv = convById[l.convenio_id];
      const st = statusPrazoLancamento(l, conv, hoje);
      if (st.nivel !== "critico" && st.nivel !== "alerta") return; // preventivo/ok/neutro não entram no Aging
      itens.push({
        id: `emp-${l.id}`,
        href: "/lancamentos/$id",
        hrefParams: { id: l.id },
        titulo: tituloLanc(l, conv),
        subtitulo: rotuloParcela(l, conv),
        motivo: st.motivo,
        dias: st.dias ?? 0,
        severidade: st.nivel === "critico" ? "critico" : "alerta",
      });
    });

    // 2) Prestação de contas — SOMENTE convênios que exigem
    prestsFiltradas.forEach((r) => {
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

    pisoReconferir.forEach((c) => {
      const etapa = etapaAtualPiso(c.etapas_concluidas);
      itens.push({
        id: `piso-${c.id}`,
        href: "/piso/$id",
        hrefParams: { id: c.id },
        titulo: `Piso da Enfermagem · ${c.competencia}`,
        subtitulo: `Etapa ${etapa} · ${PISO_ETAPAS[etapa - 1].titulo}`,
        motivo: "Competência possui etapa(s) marcada(s) para reconferência",
        dias: 0,
        severidade: "alerta",
      });
    });

    return itens;
  }, [fSemPais, convById, prestsFiltradas, etapaDe, pisoReconferir]);

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
            <Select value={convFiltro} onValueChange={(v) => { setConvFiltro(v); if (v === "all") setTermo("all"); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os convênios</SelectItem>
                {conveniosOpcoes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.objeto ?? "(sem objeto)"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <Label className="text-xs">Meses de competência</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 w-full justify-between font-normal">
                  <span className="truncate">{mesesSel.length === 0 ? "Todos os meses" : `${mesesSel.length} mês(es)`}</span>
                  <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-xs font-medium text-muted-foreground">Filtrar meses</span>
                  {mesesSel.length > 0 && <button className="text-[11px] text-primary hover:underline" onClick={() => setMesesSel([])}>Limpar</button>}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {MESES_LABEL.map(([num, label]) => (
                    <label key={num} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent cursor-pointer">
                      <Checkbox checked={mesesSel.includes(num)} onCheckedChange={(c) => setMesesSel((prev) => c ? [...prev, num] : prev.filter((m) => m !== num))} />
                      {label}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="w-32">
            <Label className="text-xs">Ano de competência</Label>
            <Select value={anoSel} onValueChange={setAnoSel}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os anos</SelectItem>
                {anosDisponiveis.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {convFiltro !== "all" && (
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
          )}
          <LimparFiltrosButton
            ativo={prestador !== "all" || convFiltro !== "all" || termo !== "all" || mesesSel.length > 0 || anoSel !== "all"}
            onClear={() => { setPrestador("all"); setConvFiltro("all"); setTermo("all"); setMesesSel([]); setAnoSel("all"); }}
          />
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div className="mr-auto">
              <p className="font-semibold">Piso da Enfermagem</p>
              <p className="text-sm text-muted-foreground">
                Integrado aos filtros, aos valores consolidados, à esteira e aos alertas do painel.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/piso">Abrir módulo do Piso</Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {[
              ["Competências ativas", pisoAtivas.length],
              ["Encerradas", pisoEncerradas.length],
              ["Para reconferir", pisoReconferir.length],
            ].map(([label, valor]) => (
              <div key={String(label)} className="rounded-lg border bg-background p-3">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </span>
                <b className="mt-1 block text-xl tabular-nums">{valor}</b>
              </div>
            ))}
            <div className="rounded-lg border bg-background p-3">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Homologado
              </span>
              <b className="mt-1 block text-lg tabular-nums">{brl(totalPisoHomologado)}</b>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Transferido ao município
              </span>
              <b className="mt-1 block text-lg tabular-nums">{brl(totalPisoTransferido)}</b>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Competências ativas por etapa
              </span>
              <span className="text-[11px] text-muted-foreground">
                {pisoFiltrado.length} competência(s) no recorte
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 lg:grid-cols-8">
              {pisoEtapasResumo.map((etapa) => (
                <Link
                  key={etapa.etapa}
                  to="/piso"
                  className="rounded-md border bg-background p-2 text-center transition hover:-translate-y-0.5 hover:border-primary hover:shadow-sm"
                  title={etapa.desc}
                >
                  <span className="block text-[10px] text-muted-foreground">Etapa {etapa.etapa}</span>
                  <b className="block text-lg tabular-nums">{etapa.quantidade}</b>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {etapa.titulo}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== ZONA A · Barra de Atenção (reage a todos os filtros do painel) ===== */}
      {barraItens.length === 0 ? (
        <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          Nenhuma ação necessária para os filtros aplicados.
        </div>
      ) : (
        <BarraAtencao itens={barraItens} />
      )}

      {/* ===== ZONA B · Fluxo de Execução ===== */}
      <FluxoExecucaoCard
        empenhado={totalEmp + totalPisoHomologado}
        atestado={totalAtest + totalPisoTransferido}
        glosa={totalAnul}
        complementar={totalComp}
        qtd={f.length + pisoFiltrado.length}
      />

      {/* ===== ZONA C · Esteira ===== */}
      <EsteiraProcesso colunas={colunas} />

      {/* ===== ZONA · Desempenho e SLA ===== */}
      <SlaScorecards leadTime={leadTimeFinal} slaEtapas={slaEtapas} slaCargos={slaCargos} />

      {/* ===== ZONA · Gráficos: Setor Responsável + Atividade por Usuário ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DistribuicaoSetorChart data={distribuicaoSetor} />
        <AtividadeUsuarioChart data={atividadeUsuario} />
      </div>

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
                      const label = `Parc. ${p.num}`;
                      const compRef = getParcelaCompLabel(convSelecionado, p.num);
                      
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
                          title={`Parcela ${p.num} (${compRef}) · ${statusText}`}
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
