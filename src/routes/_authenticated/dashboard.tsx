import { createFileRoute } from "@tanstack/react-router";
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
import { Filter, Target, CheckCircle2, Clock, AlertTriangle, FileText, ChevronDown } from "lucide-react";

import {
  ETAPAS_AGRUPAMENTO,
  getEtapaAgrupamento,
  emAtraso,
  vencendoEmBreve,
  statusPrazoLancamento,
  competenciaAberturaPendente,
  completudeConvenio,
  statusParcelas,
} from "@/lib/etapa";
import { pagamentoLiberado, situacaoPrestacao } from "@/lib/prestacao";
import { useAuth } from "@/hooks/useAuth";

import { BarraAtencao } from "@/components/dashboard/BarraAtencao";
import { FluxoExecucaoCard } from "@/components/dashboard/FluxoExecucaoCard";
import { EsteiraProcesso, type EsteiraColuna } from "@/components/dashboard/EsteiraProcesso";
import { AgingList, type AgingItem } from "@/components/dashboard/AgingList";
import { EvolucaoExecucaoChart } from "@/components/dashboard/EvolucaoExecucaoChart";
import { SlaScorecards, DistribuicaoSetorChart, AtividadeUsuarioChart } from "@/components/dashboard/DesempenhoSLA";
import { LimparFiltrosButton } from "@/components/LimparFiltrosButton";
import { PISO_ETAPAS, etapaAtualPiso } from "@/lib/piso/etapas";
import { CACON_ETAPAS, etapaAtualCacon } from "@/lib/cacon/etapas";
import {
  calcularAtividadeUsuarios,
  calcularSlaCacon,
  calcularSlaPiso,
  calcularSlaSignatarios,
} from "@/lib/dashboard/modulos";
import { carregarConveniosDashboard } from "@/lib/dashboard/convenios";
import { gerarAcoesNecessarias } from "@/lib/dashboard/alertas";
import { montarEvolucaoExecucao } from "@/lib/dashboard/evolucao";
import { montarEsteiraCacon, montarEsteiraPiso, montarEsteiraPvh } from "@/lib/dashboard/esteiras";
import { pendenciasCompetenciasCaconMensais } from "@/lib/cacon/prazos";
import { resumirProducaoCacon } from "@/lib/dashboard/cacon-financeiro";
import { pendenciasPrazosEtapa1Piso } from "@/lib/piso/prazos";
import { usePvhDashboard } from "@/hooks/usePvhDashboard";
import { calcularSlaPvh } from "@/lib/dashboard/pvh";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Painel de Acompanhamento — Convênios SMS Joinville" }] }),
  component: Dashboard,
});

const compLabel = (c: string | null) => (c ?? "").split(",")[0].trim() || "—";

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

  const pvh = usePvhDashboard({
    prestador,
    convFiltro,
    termo,
    mesesSel,
    anoSel,
  });

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
    queryFn: carregarConveniosDashboard,
  });
  const { data: termos = [] } = useQuery({
    queryKey: ["termos_aditivos"],
    queryFn: async () => (await supabase.from("termos_aditivos").select("*").order("identificador")).data ?? [],
  });
  const { data: prestacoes = [] } = useQuery({
    queryKey: ["prestacoes-all"],
    queryFn: async () => (await supabase.from("prestacoes_contas").select("*")).data ?? [],
  });
  const { data: assinaturas = [] } = useQuery({
    queryKey: ["dash-assinaturas"],
    queryFn: async () =>
      (
        await supabase
          .from("assinaturas_etapa")
          .select("lancamento_id, cargo, servidor_nome, assinado_em")
          .order("assinado_em")
      ).data ?? [],
  });
  const { data: marcos = [] } = useQuery({
    queryKey: ["dash-marcos"],
    queryFn: async () => (await supabase.from("lancamento_marco_tempo").select("lancamento_id, marco, ocorrido_em")).data ?? [],
  });
  const { data: audLogs = [] } = useQuery({
    queryKey: ["dash-audit-logs"],
    queryFn: async () =>
      (
        await supabase
          .from("historico_logs")
          .select(
            "usuario_nome, usuario_id, acao, lancamento_id, piso_competencia_id, pvh_competencia_id, data_hora, detalhes",
          )
          .order("data_hora", { ascending: false })
          .limit(5000)
      ).data ?? [],
  });
  const { data: pisoCompetencias = [] } = useQuery({
    queryKey: ["dash-piso-competencias"],
    queryFn: async () =>
      (
        await supabase
          .from("piso_competencias")
          .select("*, piso_participantes(id,prestador_id,data_envio,data_retorno,prestadores(nome_instituicao))")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });
  const { data: caconCompetencias = [] } = useQuery({
    queryKey: ["dash-cacon-competencias"],
    queryFn: async () =>
      (
        await supabase
          .from("cacon_competencias")
          .select("*, prestadores(id,nome_instituicao)")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });
  const { data: pisoDocumentos = [] } = useQuery({
    queryKey: ["dash-piso-documentos"],
    queryFn: async () =>
      (
        await supabase
          .from("piso_documentos")
          .select("id, competencia_id, created_at")
          .order("created_at")
      ).data ?? [],
  });
  const { data: pisoAssinaturas = [] } = useQuery({
    queryKey: ["dash-piso-assinaturas"],
    queryFn: async () =>
      (
        await supabase
          .from("piso_documento_assinaturas")
          .select("documento_id, cargo, servidor_nome, assinado_em")
          .order("assinado_em")
      ).data ?? [],
  });
  const { data: caconLogs = [] } = useQuery({
    queryKey: ["dash-cacon-logs"],
    queryFn: async () =>
      (
        await supabase
          .from("cacon_logs")
          .select("competencia_id, ocorrido_em, acao, detalhes, usuario_id, usuario_nome")
          .order("ocorrido_em", { ascending: false })
          .limit(5000)
      ).data ?? [],
  });
  const { data: caconAssinaturas = [] } = useQuery({
    queryKey: ["dash-cacon-assinaturas"],
    queryFn: async () =>
      (
        await supabase
          .from("cacon_assinaturas")
          .select("competencia_id, cargo, servidor_nome, assinado_em")
          .order("assinado_em")
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
    (caconCompetencias as any[]).forEach((c) => {
      const ano = String(c.competencia ?? "").split("/")[1];
      if (ano) set.add(ano);
    });
    (pvh.competencias as any[]).forEach((c) => {
      const ano = String(c.competencia ?? "").split("/")[1];
      if (ano) set.add(ano);
    });
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [lancs, pisoCompetencias, caconCompetencias, pvh.competencias]);

  const partesComp = (comp: string | null) =>
    (comp ?? "").split(",").map((s) => s.trim()).map((s) => s.match(/^(\d{2})\/(\d{4})$/)).filter(Boolean) as RegExpMatchArray[];

  const f = useMemo(
    () =>
      (lancs as any[]).filter((l) => {
        if (prestador !== "all" && l.prestador_id !== prestador) return false;
        if (convFiltro !== "all" && l.convenio_id !== convFiltro) return false;
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
    (s, competencia) => s + Number(competencia.valor_homologado ?? 0),
    0,
  );
  const totalPisoTransferido = pisoFiltrado.reduce(
    (s, competencia) => s + Number(competencia.valor_transferido ?? 0),
    0,
  );
  const pisoReconferir = pisoFiltrado.filter(
    (competencia) => (competencia.etapas_reconferir?.length ?? 0) > 0,
  );

  const pisoPrazosEtapa1 = useMemo(
    () => pendenciasPrazosEtapa1Piso(pisoFiltrado),
    [pisoFiltrado],
  );

  const caconFiltrado = (caconCompetencias as any[]).filter((competencia) => {
    if (convFiltro !== "all" || termo !== "all") return false;
    if (prestador !== "all" && competencia.prestador_id !== prestador) return false;
    const [mes, ano] = String(competencia.competencia ?? "").split("/");
    return (!mesesSel.length || mesesSel.includes(mes)) && (anoSel === "all" || ano === anoSel);
  });
  const caconComCritica = caconFiltrado.filter(
    (competencia) => Number(competencia.auditoria?.criticas ?? 0) > 0,
  );
  const resumoCacon = resumirProducaoCacon(caconFiltrado);
  const totalCaconProduzido = resumoCacon.totalAuditado;

  const caconPendenciasMensais = useMemo(() => {
    if (convFiltro !== "all" || termo !== "all") return [];
    const base = (caconCompetencias as any[]).filter(
      (competencia) => prestador === "all" || competencia.prestador_id === prestador,
    );
    return pendenciasCompetenciasCaconMensais(base).filter((pendencia) => {
      const [mes, ano] = pendencia.competencia.split("/");
      return (
        (!mesesSel.length || mesesSel.includes(mes)) &&
        (anoSel === "all" || anoSel === ano)
      );
    });
  }, [caconCompetencias, prestador, convFiltro, termo, mesesSel, anoSel]);

  const DIA = 86400000;
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

  const idsLancamentosAtividade = useMemo(
    () => new Set((f as any[]).map((lancamento) => lancamento.id)),
    [f],
  );
  const idsPiso = useMemo(() => new Set(pisoFiltrado.map((competencia) => competencia.id)), [pisoFiltrado]);
  const idsCacon = useMemo(
    () => new Set(caconFiltrado.map((competencia) => competencia.id)),
    [caconFiltrado],
  );
  const idsPvh = pvh.ids;
  const atividadeUsuario = useMemo(
    () =>
      calcularAtividadeUsuarios({
        historico: audLogs,
        caconLogs,
        idsLancamentos: idsLancamentosAtividade,
        idsPiso,
        idsCacon,
        idsPvh,
      }),
    [audLogs, caconLogs, idsLancamentosAtividade, idsPiso, idsCacon, idsPvh],
  );

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

  const leadTimeReal = useMemo(() => {
    const dias: number[] = [];
    marcosPorLanc.forEach((mk, id) => {
      if (!idsEscopo.has(id)) return;
      if (mk.criado != null && mk.concluido != null && mk.concluido > mk.criado) dias.push((mk.concluido - mk.criado) / DIA);
    });
    return { media: dias.length ? dias.reduce((s, d) => s + d, 0) / dias.length : null, n: dias.length };
  }, [marcosPorLanc, idsEscopo]);
  const leadTimeFinal = leadTimeReal.n > 0 ? { ...leadTimeReal, real: true } : { ...leadTime, real: false };

  const slaEtapas = useMemo(() => {
    const pares: [string, string, string][] = [
      ["criado", "e1_analise", "Etapa 1 · Análise Orçamentária (UFI)"],
      ["e1_analise", "e2_solicitacao", "Etapa 2 · Solicitação (ACP)"],
      ["e2_solicitacao", "e3_revisao", "Etapa 3 · Revisão (UFI)"],
      ["e3_revisao", "e4_sefaz", "Etapa 4 · Assinaturas e Envio (ACP)"],
      ["e4_sefaz", "e5_empenho", "Etapa 5 · Liberação de Orçamento (UFI)"],
      ["e5_empenho", "e6_pagamento", "Etapa 6 · Liberação/Liquidação (ACP)"],
      ["e6_pagamento", "concluido", "Etapa 7 · Conclusão"],
    ];
    return pares.map(([de, ate, etapa]) => {
      const ds: number[] = [];
      marcosPorLanc.forEach((mk, id) => {
        if (!idsEscopo.has(id)) return;
        if (mk[de] != null && mk[ate] != null && mk[ate] >= mk[de]) ds.push((mk[ate] - mk[de]) / DIA);
      });
      return { etapa, media: ds.length ? ds.reduce((s, d) => s + d, 0) / ds.length : null, n: ds.length };
    });
  }, [marcosPorLanc, idsEscopo]);

  const slaPiso = useMemo(
    () => calcularSlaPiso(pisoFiltrado, audLogs),
    [pisoFiltrado, audLogs],
  );
  const slaCacon = useMemo(
    () => calcularSlaCacon(caconFiltrado, caconLogs),
    [caconFiltrado, caconLogs],
  );
  const slaPvh = useMemo(
    () => calcularSlaPvh(pvh.filtrado, pvh.historicoSla),
    [pvh.filtrado, pvh.historicoSla],
  );
  const documentosPisoFiltrados = useMemo(
    () => pisoDocumentos.filter((documento) => idsPiso.has(documento.competencia_id)),
    [pisoDocumentos, idsPiso],
  );
  const idsDocumentosPiso = useMemo(
    () => new Set(documentosPisoFiltrados.map((documento) => documento.id)),
    [documentosPisoFiltrados],
  );
  const assinaturasPisoFiltradas = useMemo(
    () => pisoAssinaturas.filter((assinatura) => idsDocumentosPiso.has(assinatura.documento_id)),
    [pisoAssinaturas, idsDocumentosPiso],
  );
  const assinaturasCaconFiltradas = useMemo(
    () => caconAssinaturas.filter((assinatura) => idsCacon.has(assinatura.competencia_id)),
    [caconAssinaturas, idsCacon],
  );
  const slaSignatarios = useMemo(
    () =>
      calcularSlaSignatarios({
        lancamentos: (f as any[]).filter((lancamento) => !isParent(lancamento)),
        assinaturasConvenios: assinaturas,
        documentosPiso: documentosPisoFiltrados,
        assinaturasPiso: assinaturasPisoFiltradas,
        competenciasCacon: caconFiltrado,
        assinaturasCacon: assinaturasCaconFiltradas,
        assinaturasPvh: pvh.assinaturasSla,
      }),
    [
      f,
      assinaturas,
      documentosPisoFiltrados,
      assinaturasPisoFiltradas,
      caconFiltrado,
      assinaturasCaconFiltradas,
      pvh.assinaturasSla,
    ],
  );
  const slaModulos = [
    { id: "convenios" as const, nome: "Convênios / lançamentos", etapas: slaEtapas },
    { id: "piso" as const, nome: "Piso da Enfermagem", etapas: slaPiso },
    { id: "cacon" as const, nome: "Dieta CACON", etapas: slaCacon },
    { id: "pvh" as const, nome: "Programa de Valorização dos Hospitais", etapas: slaPvh },
  ];

  const aberturasPendentes = useMemo(() => {
    const hoje = new Date();
    return (convenios as any[])
      .filter((convenio) => {
        if (prestador !== "all" && convenio.prestador_id !== prestador) return false;
        if (convFiltro !== "all" && convenio.id !== convFiltro) return false;
        return true;
      })
      .map((convenio) => ({
        convenio,
        alerta: competenciaAberturaPendente(convenio, lancs as any[], hoje),
      }))
      .filter((item) => {
        if (!item.alerta) return false;
        const [mes, ano] = item.alerta.competencia.split("/");
        if (mesesSel.length && !mesesSel.includes(mes)) return false;
        if (anoSel !== "all" && anoSel !== ano) return false;
        return true;
      }) as Array<{
        convenio: any;
        alerta: NonNullable<ReturnType<typeof competenciaAberturaPendente>>;
      }>;
  }, [convenios, lancs, prestador, convFiltro, mesesSel, anoSel]);

  const conveniosAlertas = useMemo(
    () =>
      (convenios as any[]).filter((convenio) => {
        if (prestador !== "all" && convenio.prestador_id !== prestador) return false;
        if (convFiltro !== "all" && convenio.id !== convFiltro) return false;
        return true;
      }),
    [convenios, prestador, convFiltro],
  );

  const exigePc = (l: any) =>
    convById[l.convenio_id]?.exige_prestacao_contas !== false;

  const prestsFiltradas = useMemo(() => {
    return fSemPais
      .filter((l) => pagamentoLiberado(l) && exigePc(l))
      .map((l) => {
        const pc = pcByLanc[l.id] ?? null;
        return {
          l,
          pc,
          sit: situacaoPrestacao(l, convById[l.convenio_id], pc),
          status: pc?.status ?? "aguardando",
        };
      });
  }, [fSemPais, convById, pcByLanc]);

  const metricasPc = useMemo(() => {
    const pendentes = prestsFiltradas.filter(
      (p) => p.status === "aguardando" || p.status === "reprovada",
    ).length;
    const emAnalise = prestsFiltradas.filter(
      (p) => p.status === "recebida",
    ).length;
    const aprovadas = prestsFiltradas.filter(
      (p) => p.status === "aprovada",
    ).length;
    const total = prestsFiltradas.length;
    const taxa = total > 0 ? Math.round((aprovadas / total) * 100) : 100;
    return { pendentes, emAnalise, aprovadas, total, taxa };
  }, [prestsFiltradas]);

  const exibirBlocoPc =
    convFiltro === "all" ||
    (convSelecionado && convSelecionado.exige_prestacao_contas !== false);

  const ESTEIRA_CURTO: Record<string, string> = {
    "Análise de Orçamento": "Análise",
    "Solicitação": "Solicitação",
    "Revisão": "Revisão",
    "Liberação de Orçamento": "Lib. Orçamento",
    "Liberação de Recurso": "Lib. Recurso",
    "Anulação": "Anulação",
    "Concluídos": "Concluídos",
  };
  const colunasLancamentos: EsteiraColuna[] = useMemo(() => {
    const base: Record<string, EsteiraColuna> = Object.fromEntries(
      ETAPAS_AGRUPAMENTO.map((grupo) => [
        grupo,
        {
          slug: grupo,
          label: grupo,
          curto: ESTEIRA_CURTO[grupo] ?? grupo,
          n: 0,
          valor: 0,
          atrasados: 0,
          vencendo: 0,
        },
      ]),
    );
    const filhosPorPai = new Map<string, any[]>();
    for (const item of lancs as any[]) {
      if (!item.parent_id) continue;
      const filhos = filhosPorPai.get(item.parent_id) ?? [];
      filhos.push(item);
      filhosPorPai.set(item.parent_id, filhos);
    }
    const processos = (f as any[]).filter((lancamento) => !lancamento.parent_id);
    processos.forEach((lancamento) => {
      const filhos = filhosPorPai.get(lancamento.id) ?? [];
      const convenio = convById[lancamento.convenio_id];
      if (filhos.length > 0) {
        const porGrupo = new Map<string, any[]>();
        filhos.forEach((filho) => {
          const grupo = getEtapaAgrupamento(filho);
          const lista = porGrupo.get(grupo) ?? [];
          lista.push(filho);
          porGrupo.set(grupo, lista);
        });
        porGrupo.forEach((filhosGrupo, grupo) => {
          const coluna = base[grupo];
          if (!coluna) return;
          coluna.n += 1;
          coluna.valor += filhosGrupo.reduce(
            (s, filho) => s + Number(filho.valor_solicitado ?? 0),
            0,
          );
          if (filhosGrupo.some((filho) => !filho.concluido && emAtraso(filho, convenio)))
            coluna.atrasados += 1;
          else if (
            filhosGrupo.some((filho) => !filho.concluido && vencendoEmBreve(filho, convenio))
          )
            coluna.vencendo += 1;
        });
      } else {
        const coluna = base[getEtapaAgrupamento(lancamento)];
        if (!coluna) return;
        coluna.n += 1;
        coluna.valor += Number(lancamento.valor_solicitado ?? 0);
        if (!lancamento.concluido && emAtraso(lancamento, convenio)) coluna.atrasados += 1;
        else if (!lancamento.concluido && vencendoEmBreve(lancamento, convenio))
          coluna.vencendo += 1;
      }
    });
    return ETAPAS_AGRUPAMENTO.map((grupo) => base[grupo]);
  }, [f, lancs, convById]);

  const colunasPiso: EsteiraColuna[] = useMemo(
    () => montarEsteiraPiso(pisoFiltrado),
    [pisoFiltrado],
  );

  const colunasCacon: EsteiraColuna[] = useMemo(
    () => montarEsteiraCacon(caconFiltrado),
    [caconFiltrado],
  );
  const colunasPvh: EsteiraColuna[] = useMemo(
    () => montarEsteiraPvh(pvh.filtrado),
    [pvh.filtrado],
  );

  const agingItens: AgingItem[] = useMemo(() => {
    const itens: AgingItem[] = [];
    const hoje = new Date();
    const idadeComoAtraso = (valor?: string | null) => {
      if (!valor) return 0;
      const tempo = new Date(valor).getTime();
      if (!Number.isFinite(tempo)) return 0;
      return -Math.max(0, Math.floor((hoje.getTime() - tempo) / DIA));
    };

    aberturasPendentes.forEach(({ convenio, alerta }) => {
      itens.push({
        id: `abertura-${convenio.id}-${alerta.competencia}`,
        modulo: "convenios",
        href: "/lancamentos",
        titulo: `${convenio.prestadores?.nome_instituicao ?? "Prestador"}${convenio.objeto ? ` · ${convenio.objeto}` : ""}`,
        subtitulo: `Próxima competência · ${alerta.competencia}`,
        motivo: alerta.motivo,
        dias: -alerta.diasDesdeInicio,
        prazoLabel:
          alerta.diasDesdeInicio > 0
            ? `abrir · há ${alerta.diasDesdeInicio}d`
            : "abrir agora",
        severidade: "alerta",
      });
    });

    fSemPais.forEach((lancamento) => {
      const convenio = convById[lancamento.convenio_id];
      const status = statusPrazoLancamento(lancamento, convenio, hoje);
      if (status.nivel !== "critico" && status.nivel !== "alerta") return;
      itens.push({
        id: `emp-${lancamento.id}`,
        modulo: "convenios",
        href: "/lancamentos/$id",
        hrefParams: { id: lancamento.id },
        titulo: tituloLanc(lancamento, convenio),
        subtitulo: rotuloParcela(lancamento, convenio),
        motivo: status.motivo,
        dias: status.dias ?? 0,
        severidade: status.nivel === "critico" ? "critico" : "alerta",
      });
    });

    prestsFiltradas.forEach((registro) => {
      if (registro.sit.nivel !== "grave" && registro.sit.nivel !== "alerta") return;
      const convenio = convById[registro.l.convenio_id];
      const dias = registro.sit.dias ?? 0;
      const severidade: AgingItem["severidade"] =
        registro.sit.nivel === "grave" ? "critico" : dias <= 2 ? "alerta" : "preventivo";
      itens.push({
        id: `pc-${registro.l.id}`,
        modulo: "prestacao",
        href: "/prestacao-contas",
        titulo: tituloLanc(registro.l, convenio),
        subtitulo: rotuloParcela(registro.l, convenio),
        motivo:
          dias < 0
            ? `${-dias}d de atraso na Entrega da Prestação de Contas`
            : dias === 0
              ? "Vence hoje a Entrega da Prestação de Contas"
              : `Vence em ${dias}d a Entrega da Prestação de Contas`,
        dias,
        severidade,
      });
    });

    pisoReconferir.forEach((competencia) => {
      const etapa = etapaAtualPiso(competencia.etapas_concluidas);
      itens.push({
        id: `piso-${competencia.id}`,
        modulo: "piso",
        href: "/piso/$id",
        hrefParams: { id: competencia.id },
        titulo: `Piso da Enfermagem · ${competencia.competencia}`,
        subtitulo: `Etapa ${etapa} · ${PISO_ETAPAS[etapa - 1].titulo}`,
        motivo: "Competência possui etapa(s) marcada(s) para reconferência",
        dias: idadeComoAtraso(competencia.updated_at ?? competencia.created_at),
        severidade: "alerta",
      });
    });

    pisoPrazosEtapa1.forEach((pendencia) => {
      itens.push({
        id: pendencia.id,
        modulo: "piso",
        href: "/piso/$id",
        hrefParams: { id: pendencia.competenciaId },
        titulo: `Piso da Enfermagem · ${pendencia.competencia}`,
        subtitulo:
          pendencia.tipo === "envio_instituicao"
            ? `Etapa 1A · envio${pendencia.prestadorNome ? ` · ${pendencia.prestadorNome}` : ""}`
            : pendencia.tipo === "retorno_instituicao"
              ? `Etapa 1A · retorno${pendencia.prestadorNome ? ` · ${pendencia.prestadorNome}` : ""}`
              : "Etapa 1B · envio ao InvestSUS",
        motivo: pendencia.motivo,
        dias: pendencia.dias,
        prazoLabel:
          pendencia.dias < 0
            ? `${Math.abs(pendencia.dias)}d atraso`
            : pendencia.dias === 0
              ? "vence hoje"
              : `${pendencia.dias}d`,
        severidade: pendencia.severidade,
      });
    });

    pisoFiltrado
      .filter((competencia) => {
        const concluidas = competencia.etapas_concluidas ?? {};
        return (
          competencia.status !== "encerrada" &&
          concluidas["7"] === true &&
          concluidas["8"] !== true
        );
      })
      .forEach((competencia) => {
        itens.push({
          id: `piso-email-${competencia.id}`,
          modulo: "piso",
          href: "/piso/$id",
          hrefParams: { id: competencia.id },
          titulo: `Piso da Enfermagem · ${competencia.competencia}`,
          subtitulo: "Etapa 8 · Notificação por e-mail",
          motivo: "Pagamento concluído; comunicação às instituições ainda pendente",
          dias: idadeComoAtraso(competencia.updated_at ?? competencia.created_at),
          severidade: "alerta",
        });
      });

    caconComCritica.forEach((competencia) => {
      const etapa = etapaAtualCacon(competencia);
      itens.push({
        id: `cacon-${competencia.id}`,
        modulo: "cacon",
        href: "/cacon/$id",
        hrefParams: { id: competencia.id },
        titulo: `Dieta CACON · ${competencia.competencia}`,
        subtitulo: `Etapa ${etapa} · ${CACON_ETAPAS[etapa - 1].titulo}`,
        motivo: `${Number(competencia.auditoria?.criticas ?? 0)} crítica(s) de auditoria pendente(s)`,
        dias: idadeComoAtraso(
          competencia.processado_em ?? competencia.updated_at ?? competencia.created_at,
        ),
        severidade: "critico",
      });
    });

    caconPendenciasMensais.forEach((pendencia) => {
      itens.push({
        id: pendencia.id,
        modulo: "cacon",
        href: "/cacon",
        titulo: `Dieta CACON · ${pendencia.prestadorNome}`,
        subtitulo: `Competência ${pendencia.competencia}`,
        motivo: pendencia.motivo,
        dias: pendencia.dias,
        prazoLabel:
          pendencia.severidade === "critico"
            ? `${Math.abs(pendencia.dias)}d atraso`
            : pendencia.dias === 0
              ? "vence hoje"
              : `${pendencia.dias}d para abrir`,
        severidade: pendencia.severidade,
      });
    });

    pvh.pendencias.forEach((pendencia) => {
      itens.push({
        id: pendencia.id,
        modulo: "pvh",
        href: pendencia.competenciaId ? "/pvh/$id" : "/pvh",
        hrefParams: pendencia.competenciaId
          ? { id: pendencia.competenciaId }
          : undefined,
        titulo: `PVH · ${pendencia.competencia}`,
        subtitulo:
          pendencia.tipo === "abertura"
            ? "Abertura da competência"
            : pendencia.tipo === "repasse_5_dias"
              ? "Prazo de 5 dias úteis após crédito no FMS"
              : "Limite de pagamento da competência",
        motivo: pendencia.motivo,
        dias: pendencia.dias,
        prazoLabel: pendencia.prazoLabel,
        severidade: pendencia.severidade,
      });
    });

    return itens;
  }, [
    aberturasPendentes,
    fSemPais,
    convById,
    prestsFiltradas,
    pisoReconferir,
    pisoPrazosEtapa1,
    pisoFiltrado,
    caconComCritica,
    caconPendenciasMensais,
    pvh.pendencias,
  ]);

  const urgenciasPrazoProximas = agingItens.filter(
    (item) =>
      item.modulo === "convenios" &&
      (item.severidade === "alerta" || item.severidade === "preventivo"),
  ).length;

  const barraItens = useMemo(
    () =>
      gerarAcoesNecessarias({
        lancamentos: fSemPais as any[],
        lancamentosTodos: f as any[],
        convenios: conveniosAlertas,
        convById,
        termos: termos as any[],
        prestacoes: prestacoes as any[],
        pisoCompetencias: pisoFiltrado,
        pisoPrazosEtapa1,
        caconCompetencias: caconFiltrado,
        pvhCompetencias: pvh.filtrado,
        pvhPendencias: pvh.pendencias,
        aberturasPendentes,
        caconPendenciasMensais,
        urgenciasPrazoProximas,
      }),
    [
      fSemPais,
      f,
      conveniosAlertas,
      convById,
      termos,
      prestacoes,
      pisoFiltrado,
      pisoPrazosEtapa1,
      caconFiltrado,
      pvh.filtrado,
      pvh.pendencias,
      aberturasPendentes,
      caconPendenciasMensais,
      urgenciasPrazoProximas,
    ],
  );


  const evolucao = useMemo(
    () =>
      montarEvolucaoExecucao({
        lancamentosRaiz: fSemFilhos as any[],
        lancamentosTodos: lancs as any[],
        piso: pisoFiltrado,
        cacon: caconFiltrado,
        pvh: pvh.filtrado,
      }),
    [fSemFilhos, lancs, pisoFiltrado, caconFiltrado, pvh.filtrado],
  );

  return (
    <div className="space-y-4">
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

      {barraItens.length === 0 ? (
        <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          Nenhuma ação necessária para os filtros aplicados.
        </div>
      ) : (
        <BarraAtencao itens={barraItens} />
      )}

      <FluxoExecucaoCard
        empenhado={totalEmp}
        atestado={totalAtest}
        glosa={totalAnul}
        complementar={totalComp}
        qtd={fSemFilhos.length}
        modulos={[
          {
            id: "convenios",
            nome: "Convênios",
            href: "/lancamentos",
            descricao: `${fSemFilhos.length} lançamento(s) no recorte`,
            valorReferencia: totalEmp,
            rotuloReferencia: "Empenhado",
            metricas: [
              { rotulo: "Empenhado", valor: totalEmp, destaque: true },
              { rotulo: "Atestado", valor: totalAtest },
            ],
          },
          {
            id: "piso",
            nome: "Piso da Enfermagem",
            href: "/piso",
            descricao: `${pisoFiltrado.length} competência(s) no recorte`,
            valorReferencia: totalPisoHomologado,
            rotuloReferencia: "Homologado",
            metricas: [
              { rotulo: "Homologado", valor: totalPisoHomologado },
              { rotulo: "Transferido", valor: totalPisoTransferido, destaque: true },
            ],
          },
          {
            id: "cacon",
            nome: "Dieta CACON",
            href: "/cacon",
            descricao: `${resumoCacon.competenciasAuditadas} auditada(s) de ${caconFiltrado.length} competência(s)`,
            valorReferencia: totalCaconProduzido,
            rotuloReferencia: "Produção auditada",
            metricas: [
              { rotulo: "Produção auditada", valor: totalCaconProduzido, destaque: true },
              {
                rotulo: "Média / competência auditada",
                valor: resumoCacon.mediaPorCompetenciaAuditada,
              },
            ],
          },
          {
            id: "pvh",
            nome: "PVH",
            href: "/pvh",
            descricao: `${pvh.filtrado.length} competência(s) no recorte`,
            valorReferencia: pvh.totalPublicado,
            rotuloReferencia: "Publicado pelo Estado",
            metricas: [
              { rotulo: "Publicado pelo Estado", valor: pvh.totalPublicado },
              { rotulo: "Pago", valor: pvh.totalPago, destaque: true },
            ],
          },
        ]}
      />

      <div className="space-y-2">
        <EsteiraProcesso
          titulo="Convênios / lançamentos"
          descricao="7 etapas do fluxo regular"
          colunas={colunasLancamentos}
        />
        <EsteiraProcesso
          titulo="Piso da Enfermagem"
          descricao="9 etapas da competência mensal + concluídos"
          colunas={colunasPiso}
        />
        <EsteiraProcesso
          titulo="Dieta CACON"
          descricao="3 etapas do fluxo de produção e auditoria + concluídos"
          colunas={colunasCacon}
        />
        <EsteiraProcesso
          titulo="Programa de Valorização dos Hospitais"
          descricao="7 etapas da execução mensal + concluídos"
          colunas={colunasPvh}
        />
      </div>

      <SlaScorecards
        leadTime={leadTimeFinal}
        modulos={slaModulos}
        slaSignatarios={slaSignatarios}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DistribuicaoSetorChart data={distribuicaoSetor} />
        <AtividadeUsuarioChart data={atividadeUsuario} />
      </div>

      <div className="w-full">
        <EvolucaoExecucaoChart data={evolucao} />
      </div>

      {exibirBlocoPc && (
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
              <FileText className="h-3.5 w-3.5" />
              Indicadores de Prestação de Contas · Convênios + PVH
              <HelpTip text="Visão consolidada das prestações de contas dos convênios e do universo PVH cuja configuração institucional exige prestação de contas." />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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

              <div className="bg-muted/30 p-3 rounded-lg border border-border/20">
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide font-semibold">
                  PVH · com obrigação
                </span>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-bold tabular-nums text-primary">
                    {pvh.totalPrestacaoObrigatoria}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    instituição(ões)
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div id="urgencias-aging" className="w-full scroll-mt-20">
        <AgingList itens={agingItens} />
      </div>

      {convSelecionado && completude && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide">Acompanhamento do contrato</h2>
            <span className="text-xs text-muted-foreground">· {convSelecionado.objeto ?? "Convênio selecionado"}</span>
          </div>
          <Card>
            <CardContent className="pt-4 space-y-4">
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
