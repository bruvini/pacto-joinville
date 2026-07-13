import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { brl, dateTime } from "@/lib/format";
import { statusAcoEfetivo, etapaCorrenteLabel, statusConvenioEfetivo } from "@/lib/etapa";
import { agruparLogs, mudancasVisiveis, rotuloCampo, formatarValor } from "@/lib/audit";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { HelpTip } from "@/components/HelpTip";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { CompetenciaInput } from "@/components/inputs/CompetenciaInput";
import { SeiLink } from "@/components/inputs/SeiLink";
import { SaldoBar } from "@/components/SaldoBar";
import { BlocoAssinaturas, SLOTS_PADRAO, SLOTS_ETAPA1, SLOTS_LIBERA_ORC, SLOTS_ETAPA4_F2, SLOTS_F2_MINUTA, SLOTS_F2_MEMORANDO, SLOTS_F2_LIQUIDACAO, SLOTS_F2_AVISO, blocoCompleto, type Slot } from "@/components/BlocoAssinaturas";
import { situacaoPrestacao, STATUS_PRESTACAO_LABEL } from "@/lib/prestacao";
import { ClipboardCheck, ArrowRight } from "lucide-react";
import { HELP } from "@/lib/field-help";
import { linkValido as isSafeUrl } from "@/lib/sei";
import { gerarPdfLancamento } from "@/lib/pdf-lancamento";
import { registrarAcesso } from "@/lib/acesso";
import logoAsset from "@/assets/joinville-logo.png.asset.json";
import { ArrowLeft, Check, X, Lock, Send, CheckCircle2, Circle, FileDown, LockOpen, ThumbsUp, ThumbsDown, Undo2, MinusCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_authenticated/lancamentos/$id")({
  head: () => ({ meta: [{ title: "Processo de Empenho" }] }),
  // `foco` = etapa (1–7) a destacar/expandir ao abrir (deep-linking do Digest).
  validateSearch: (search: Record<string, unknown>) => ({
    foco: search.foco != null && !Number.isNaN(Number(search.foco)) ? Number(search.foco) : undefined,
  }),
  component: LancamentoDetalhe,
});

function getProximoMes(m: string): string {
  const match = m.trim().match(/^(\d{2})\/(\d{4})$/);
  if (!match) return "";
  let month = parseInt(match[1], 10);
  let year = parseInt(match[2], 10);
  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${String(month).padStart(2, "0")}/${year}`;
}

const REL_TEC: Slot[] = [
  { key: "fiscal", label: "Fiscais", cargos: ["Fiscal"], min: 2 },
  { key: "extra", label: "Terceira assinatura (opcional)", cargos: ["Fiscal", "Gerente", "Coordenador ACP"], opcional: true, min: 1 },
];
const REL_ANA: Slot[] = [{ key: "fiscal", label: "Fiscal", cargos: ["Fiscal"], min: 1 }];
const ETAPAS_NOMES = ["Análise Orç.", "Solicitação", "Revisão", "Assinaturas", "Liberação Orç.", "Liberação Rec.", "Anulação"];

// Completude da Etapa 6 no Fluxo 2 (Liquidação de Despesa) — 8 subpassos sequenciais.
function etapa6F2Completa(l: any, ass: any[]): boolean {
  return (
    isSafeUrl(l.link_minuta_sei) && blocoCompleto(ass, "f2_minuta", SLOTS_F2_MINUTA) &&
    isSafeUrl(l.link_memorando_sei) && blocoCompleto(ass, "f2_memorando", SLOTS_F2_MEMORANDO) && !!l.minuta_enc_ses &&
    isSafeUrl(l.link_portaria_sei) &&
    isSafeUrl(l.link_solicitacao_liquidacao_sei) && Number(l.valor_liquidado ?? 0) > 0 && blocoCompleto(ass, "f2_liquidacao", SLOTS_F2_LIQUIDACAO) &&
    isSafeUrl(l.link_aviso_liquidacao_sei) && blocoCompleto(ass, "f2_aviso", SLOTS_F2_AVISO) && !!l.aviso_enc_sefaz &&
    isSafeUrl(l.link_subempenho_sei) && isSafeUrl(l.link_programacao_pagamento_sei) &&
    isSafeUrl(l.link_comprovante_pagamento_sei) && !!l.data_pagamento
  );
}

function progresso(l: any, ass: any[], teto = 0, filhos: any[] = [], fluxo2 = false): any {
  const solic = Number(l.valor_solicitado ?? 0);
  const atest = Number(l.valor_atestado ?? 0);
  const anular = atest > 0 ? Math.max(0, solic - atest) : 0;
  const st = statusAcoEfetivo(l);

  const comps = (l.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const isMulti = !l.parent_id && comps.length > 1;

  let excedeTeto = false;
  let justificativasCompletas = true;

  if (isMulti) {
    const pcArr = Array.isArray(l.parcelas_competencia) ? l.parcelas_competencia : [];
    const parcelasExcedentes = teto > 0 ? pcArr.filter((p: any) => Number(p.valor ?? 0) > teto) : [];
    excedeTeto = parcelasExcedentes.length > 0;
    justificativasCompletas = parcelasExcedentes.every((p: any) => !!(p.justificativa_teto && String(p.justificativa_teto).trim()));
  } else {
    excedeTeto = teto > 0 && solic > teto;
    justificativasCompletas = !excedeTeto || !!(l.justificativa_teto && String(l.justificativa_teto).trim());
  }

  const s1 = (st === "orcamento_disponivel" || st === "empenhado") && !!l.dotacao_orcamentaria && !!l.fonte_pagamento;
  const s2 = solic > 0 && isSafeUrl(l.link_solicitacao_sei) && !!l.em_bloco_revisao && justificativasCompletas;
  const s3 = l.revisao_status === "aprovado";
  const s4 = blocoCompleto(ass, "etapa1", fluxo2 ? SLOTS_ETAPA4_F2 : SLOTS_ETAPA1) && !!l.sefaz_etapa1_em;
  const s5 = !!l.numero_empenho && isSafeUrl(l.link_empenho_sei) && blocoCompleto(ass, "libera_orc", SLOTS_LIBERA_ORC);

  let s6 = false;
  let relOk = false;
  let precisaAnular = false;
  let anularVal = 0;
  let s7 = null as boolean | null;

  if (isMulti && filhos.length > 0) {
    const progsFilhos: any[] = filhos.map(f => progresso(f, ass, teto, [], fluxo2));
    s6 = progsFilhos.every((p: any) => p.s6);
    relOk = progsFilhos.every((p: any) => p.relOk);
    // Anulação é do EMPENHO PAI (não por competência): o atestado do pai é a soma
    // do atestado dos filhos e a Etapa 7 só abre quando TODAS as competências
    // estiverem concluídas. Se a soma superar o solicitado, vira "a complementar".
    const atestPai = filhos.reduce((acc: number, f: any) => acc + Number(f.valor_atestado ?? 0), 0);
    const solicPai = Number(l.valor_solicitado ?? 0) || filhos.reduce((acc: number, f: any) => acc + Number(f.valor_solicitado ?? 0), 0);
    const todosConcluidos = filhos.every((f: any) => f.concluido);
    anularVal = todosConcluidos ? Math.max(0, solicPai - atestPai) : 0;
    precisaAnular = anularVal > 0;
    s7 = precisaAnular
      ? (isSafeUrl(l.link_solicitacao_anulacao) && isSafeUrl(l.link_anulacao_sei) && blocoCompleto(ass, "etapa5", SLOTS_PADRAO) && !!l.sefaz_etapa5_em)
      : null;
  } else if (fluxo2) {
    // Fluxo 2 — Liquidação de Despesa (8 subpassos), sem etapa de anulação.
    relOk = true;
    s6 = etapa6F2Completa(l, ass);
    precisaAnular = false;
    anularVal = 0;
    s7 = null;
  } else {
    const exigeRelAna = l.convenios?.exige_relatorio_analise !== false;
    const relAnaOk = !exigeRelAna || (blocoCompleto(ass, "rel_analise", REL_ANA) && isSafeUrl(l.link_relatorio_analise_sei));
    relOk = blocoCompleto(ass, "rel_tecnico", REL_TEC) && relAnaOk
      && isSafeUrl(l.link_relatorio_tecnico_sei) && isSafeUrl(l.link_certidoes_sei);
    s6 = relOk && atest > 0 && isSafeUrl(l.link_solicitacao_liberacao_sei) && blocoCompleto(ass, "etapa4", SLOTS_PADRAO) && !!l.sefaz_etapa4_em
      && isSafeUrl(l.link_subempenho_sei) && isSafeUrl(l.link_programacao_pagamento_sei) && isSafeUrl(l.link_comprovante_pagamento_sei) && !!l.data_pagamento;
    // Uma competência filha NÃO anula individualmente — a anulação é do empenho pai.
    const ehFilho = !!l.parent_id;
    precisaAnular = !ehFilho && s6 && anular > 0;
    anularVal = ehFilho ? 0 : anular;
    s7 = precisaAnular
      ? (isSafeUrl(l.link_solicitacao_anulacao) && isSafeUrl(l.link_anulacao_sei) && blocoCompleto(ass, "etapa5", SLOTS_PADRAO) && !!l.sefaz_etapa5_em)
      : null;
  }

  const flags = [s1, s2, s3, s4, s5, s6, ...(precisaAnular ? [s7] : [])];
  const done = flags.filter(Boolean).length;
  const total = flags.length;
  return { s1, s2, s3, s4, s5, s6, s7, relOk, precisaAnular, anular: anularVal, done, total, pct: Math.round((done / total) * 100), completo: done === total };
}

function responsavelDe(p: ReturnType<typeof progresso>): "acp" | "aco" {
  if (!p.s1) return "aco";
  if (!p.s4) return "acp";
  if (!p.s5) return "aco";
  return "acp";
}

function LancamentoDetalhe() {
  const { id } = Route.useParams();
  const { foco } = Route.useSearch(); // etapa a destacar (deep-link do Digest)
  const qc = useQueryClient();
  const { roles, profile } = useAuth();
  const canAcp = hasRole(roles, "acp");
  const canAco = hasRole(roles, "aco");
  const isAdmin = roles.includes("admin");

  const { data: lanc, isLoading } = useQuery({
    queryKey: ["lanc", id],
    queryFn: async () => (await supabase.from("lancamentos_pagamento").select("*, prestadores(*), convenios(*)").eq("id", id).single()).data as any,
  });
  const { data: logs = [] } = useQuery({ queryKey: ["logs", id], queryFn: async () => (await supabase.from("historico_logs").select("*").eq("lancamento_id", id).order("data_hora", { ascending: false })).data ?? [] });
  const { data: notas = [] } = useQuery({ queryKey: ["notas", id], queryFn: async () => (await supabase.from("notas_comentarios").select("*").eq("lancamento_id", id).order("data_hora", { ascending: false })).data ?? [] });
  const { data: convenios = [] } = useQuery({ queryKey: ["convenios"], queryFn: async () => (await supabase.from("convenios").select("*, prestadores(nome_instituicao)").order("created_at", { ascending: false })).data ?? [] });
  const { data: termos = [] } = useQuery({ queryKey: ["termos_aditivos"], queryFn: async () => (await supabase.from("termos_aditivos").select("*").order("data_assinatura", { ascending: false, nullsFirst: false })).data ?? [] });
  const { data: pool = [] } = useQuery({ queryKey: ["assinaturas_config"], queryFn: async () => (await supabase.from("assinaturas_config").select("*")).data ?? [] });
  // Modo retroativo (Configurações → Avançado): libera preencher etapas sem as travas de sequência.
  const { data: cfgRetro } = useQuery({
    queryKey: ["cfg-retroativo"],
    queryFn: async () => (await supabase.from("sistema_config").select("valor").eq("chave", "modo_retroativo").maybeSingle()).data,
  });
  const retro = cfgRetro?.valor === "1";
  const { data: ass = [] } = useQuery({
    queryKey: ["assinaturas_etapa", id, lanc?.parent_id],
    queryFn: async () => {
      const ids = [id];
      if (lanc?.parent_id) ids.push(lanc.parent_id);
      return (await supabase.from("assinaturas_etapa").select("*").in("lancamento_id", ids)).data ?? [];
    }
  });
  // Lançamentos do mesmo convênio: mostra o status de cada parcela no seletor da Etapa 2.
  const { data: lancsConv = [] } = useQuery({
    queryKey: ["lancs-convenio", lanc?.convenio_id],
    enabled: !!lanc?.convenio_id,
    queryFn: async () => (await supabase.from("lancamentos_pagamento").select("id, parcela, concluido, sefaz_etapa5_em").eq("convenio_id", lanc.convenio_id)).data ?? [],
  });
  const { data: revisoes = [] } = useQuery({ queryKey: ["revisoes", id], queryFn: async () => (await supabase.from("revisoes_empenho").select("*").eq("lancamento_id", id).order("created_at", { ascending: false })).data ?? [] });
  // Query para buscar sublançamentos/filhos
  const { data: filhos = [] } = useQuery({
    queryKey: ["filhos", id],
    enabled: !!lanc && !lanc.parent_id && (lanc.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean).length > 1,
    queryFn: async () => (await supabase.from("lancamentos_pagamento").select("*, prestadores(*)").eq("parent_id", id).order("competencia")).data ?? [],
  });
  // Query para buscar o lançamento pai se for sublançamento
  const { data: parentLanc } = useQuery({
    queryKey: ["lanc", lanc?.parent_id],
    enabled: !!lanc && !!lanc.parent_id,
    queryFn: async () => (await supabase.from("lancamentos_pagamento").select("*, prestadores(*), convenios(*)").eq("id", lanc.parent_id).single()).data as any,
  });

  const [f, setF] = useState<any>({});
  const fRef = useRef<any>({});
  const loadedId = useRef<string | null>(null);
  const saveTimer = useRef<any>(null);
  const [nova, setNova] = useState("");
  const [revJust, setRevJust] = useState("");
  useEffect(() => {
    if (lanc && loadedId.current !== lanc.id) {
      loadedId.current = lanc.id;
      const comps = (lanc.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
      const isMultiComp = comps.length > 1;
      const next = { ...lanc };
      if (!isMultiComp && !next.mes_pagamento_previsto && next.competencia) {
        next.mes_pagamento_previsto = getProximoMes(next.competencia);
      }
      fRef.current = next;
      setF({ ...next });
    }
  }, [lanc]);

  const invalidarAss = () => { qc.invalidateQueries({ queryKey: ["assinaturas_etapa"] }); };

  // Mutação para criar os filhos automaticamente ao concluir a Etapa 5
  const criarFilhos = useMutation({
    mutationFn: async () => {
      if (!lanc || lanc.parent_id || filhos.length > 0) return;
      const comps = (lanc.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
      if (comps.length <= 1) return;

      // 1. Verificação de segurança no banco de dados para evitar duplicidade
      const { data: existing } = await supabase
        .from("lancamentos_pagamento")
        .select("id")
        .eq("parent_id", lanc.id);
      
      if (existing && existing.length > 0) {
        return;
      }

      const pcArr = Array.isArray(lanc.parcelas_competencia) ? lanc.parcelas_competencia : [];
      if (pcArr.length !== comps.length) {
        throw new Error("As parcelas por competência não estão configuradas corretamente.");
      }

      const payload = pcArr.map((p: any) => ({
        parent_id: lanc.id,
        convenio_id: lanc.convenio_id,
        termo_aditivo_id: lanc.termo_aditivo_id,
        prestador_id: lanc.prestador_id,
        descricao: lanc.descricao,
        numero_empenho: lanc.numero_empenho,
        link_empenho_sei: lanc.link_empenho_sei,
        dotacao_orcamentaria: lanc.dotacao_orcamentaria,
        fonte_pagamento: lanc.fonte_pagamento,
        status_aco: "empenhado",
        link_solicitacao_sei: lanc.link_solicitacao_sei,
        em_bloco_revisao: true,
        // Herda a aprovação da Etapa 3 (Revisão da UFI) do processo pai.
        revisao_status: lanc.revisao_status ?? "pendente",
        sefaz_etapa1_em: lanc.sefaz_etapa1_em,
        responsavel_atual: "acp",
        competencia: p.competencia,
        parcela: String(p.parcela),
        mes_pagamento_previsto: p.mes_pagamento,
        valor_solicitado: Number(p.valor) || 0,
        justificativa_teto: p.justificativa_teto || null,
        concluido: false,
        reaberto: false,
      }));

      const { error } = await supabase.from("lancamentos_pagamento").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["filhos", id] });
      qc.invalidateQueries({ queryKey: ["lanc", id] });
      toast.success("Sublançamentos por competência gerados com sucesso!");
    },
    onError: (e: any) => toast.error("Erro ao gerar sublançamentos: " + e.message),
  });

  // useEffect para verificar e disparar a criação dos filhos
  useEffect(() => {
    if (!lanc || lanc.parent_id || filhos.length > 0 || criarFilhos.isPending) return;
    const comps = (lanc.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
    if (comps.length <= 1) return;

    const status = statusAcoEfetivo(lanc);
    const taX = (termos as any[]).find((t) => t.id === lanc.termo_aditivo_id);
    const cvX = (convenios as any[]).find((c) => c.id === lanc.convenio_id);
    const tetoX = Number(taX?.valor_total ?? cvX?.teto_mensal ?? 0);
    const progPai = progresso(lanc, ass, tetoX, [], cvX?.modelo_fluxo === "fluxo_2");

    if (progPai.s5 || (retro && lanc.numero_empenho && isSafeUrl(lanc.link_empenho_sei))) {
      criarFilhos.mutate();
    }
  }, [lanc, ass, termos, convenios, filhos, criarFilhos, retro]);

  const salvar = useMutation({
    mutationFn: async () => {
      const merged = { ...lanc, ...fRef.current };
      const status = statusAcoEfetivo(merged);
      const taX = (termos as any[]).find((t) => t.id === merged.termo_aditivo_id);
      const cvX = (convenios as any[]).find((c) => c.id === merged.convenio_id);
      const tetoX = Number(taX?.valor_total ?? cvX?.teto_mensal ?? 0);
      const prog = progresso({ ...merged, status_aco: status, revisao_status: lanc.revisao_status }, ass as any[], tetoX, filhos, cvX?.modelo_fluxo === "fluxo_2");
      // Recalcular valor_solicitado a partir das parcelas por competência, se houver.
      const pc = merged.parcelas_competencia;
      const comps = (merged.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
      const isMultiComp = comps.length > 1;
      let valorSolic = Number(merged.valor_solicitado) || 0;
      let parcelaStr = merged.parcela || null;
      let mesPgtoStr = merged.mes_pagamento_previsto || null;
      if (isMultiComp && Array.isArray(pc) && pc.length > 0) {
        valorSolic = pc.reduce((s: number, p: any) => s + (Number(p.valor) || 0), 0);
        parcelaStr = pc.map((p: any) => p.parcela || "").join(", ") || null;
        mesPgtoStr = pc.map((p: any) => p.mes_pagamento || "").join(", ") || null;
      }
      const payload: any = {
        parcela: parcelaStr,
        mes_pagamento_previsto: mesPgtoStr,
        valor_solicitado: valorSolic,
        parcelas_competencia: isMultiComp && Array.isArray(pc) ? pc : null,
        justificativa_teto: merged.justificativa_teto || null,
        link_solicitacao_sei: merged.link_solicitacao_sei || null,
        em_bloco_revisao: !!merged.em_bloco_revisao,
        sefaz_etapa1_em: merged.sefaz_etapa1_em || null,
        dotacao_orcamentaria: merged.dotacao_orcamentaria || null,
        fonte_pagamento: merged.fonte_pagamento || null,
        status_aco: status,
        numero_empenho: merged.numero_empenho || null,
        link_empenho_sei: merged.link_empenho_sei || null,
        valor_atestado: merged.valor_atestado ? Number(merged.valor_atestado) : null,
        link_relatorio_tecnico_sei: merged.link_relatorio_tecnico_sei || null,
        link_relatorio_analise_sei: merged.link_relatorio_analise_sei || null,
        link_certidoes_sei: merged.link_certidoes_sei || null,
        link_solicitacao_liberacao_sei: merged.link_solicitacao_liberacao_sei || null,
        link_subempenho_sei: merged.link_subempenho_sei || null,
        link_programacao_pagamento_sei: merged.link_programacao_pagamento_sei || null,
        link_comprovante_pagamento_sei: merged.link_comprovante_pagamento_sei || null,
        data_pagamento: merged.data_pagamento || null,
        sefaz_etapa4_em: merged.sefaz_etapa4_em || null,
        link_solicitacao_anulacao: merged.link_solicitacao_anulacao || null,
        link_anulacao_sei: merged.link_anulacao_sei || null,
        sefaz_etapa5_em: merged.sefaz_etapa5_em || null,
        // Fluxo 2 — Liquidação de Despesa
        link_minuta_sei: merged.link_minuta_sei || null,
        link_memorando_sei: merged.link_memorando_sei || null,
        minuta_enc_ses: !!merged.minuta_enc_ses,
        link_portaria_sei: merged.link_portaria_sei || null,
        link_solicitacao_liquidacao_sei: merged.link_solicitacao_liquidacao_sei || null,
        valor_liquidado: merged.valor_liquidado ? Number(merged.valor_liquidado) : null,
        link_aviso_liquidacao_sei: merged.link_aviso_liquidacao_sei || null,
        aviso_enc_sefaz: !!merged.aviso_enc_sefaz,
        responsavel_atual: responsavelDe(prog),
      };
      const { error } = await supabase.from("lancamentos_pagamento").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lanc", id] }); qc.invalidateQueries({ queryKey: ["logs", id] }); void registrarAcesso("lancamento_editado", { rota: `/lancamentos/${id}` }); },
    onError: (e: any) => toast.error(String(e.message).replace(/\d+\.\d{2}/g, (m) => brl(Number(m)))),
  });
  const agendarSave = () => { clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => salvar.mutate(), 800); };

  const addNota = useMutation({
    mutationFn: async () => {
      if (!nova.trim()) return;
      const { data: u } = await supabase.auth.getUser();
      const { data: p } = await supabase.from("profiles").select("nome").eq("id", u.user!.id).maybeSingle();
      await supabase.from("notas_comentarios").insert({ lancamento_id: id, usuario_id: u.user?.id, usuario_nome: p?.nome ?? u.user?.email, mensagem: nova });
    },
    onSuccess: () => { setNova(""); qc.invalidateQueries({ queryKey: ["notas", id] }); },
  });
  const reabrir = useMutation({
    mutationFn: async (reaberto: boolean) => {
      const { error } = await supabase.from("lancamentos_pagamento").update({ reaberto, concluido: !reaberto } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, reaberto) => { qc.invalidateQueries({ queryKey: ["lanc", id] }); qc.invalidateQueries({ queryKey: ["logs", id] }); void registrarAcesso(reaberto ? "processo_reaberto" : "processo_concluido", { rota: `/lancamentos/${id}` }); },
    onError: (e: any) => toast.error(e.message),
  });
  const reverter = useMutation({
    mutationFn: async (firstInc: number) => {
      const blocosMap: Record<number, string[]> = { 4: ["etapa1"], 5: ["libera_orc"], 6: ["rel_tecnico", "rel_analise", "etapa4", "f2_minuta", "f2_memorando", "f2_liquidacao", "f2_aviso"], 7: ["etapa5"] };
      const camposMap: Record<number, any> = {
        4: { sefaz_etapa1_em: null },
        5: { numero_empenho: null, link_empenho_sei: null },
        6: { link_relatorio_tecnico_sei: null, link_relatorio_analise_sei: null, link_certidoes_sei: null, valor_atestado: null, link_solicitacao_liberacao_sei: null, sefaz_etapa4_em: null, link_subempenho_sei: null, link_programacao_pagamento_sei: null, link_comprovante_pagamento_sei: null, data_pagamento: null, link_minuta_sei: null, link_memorando_sei: null, minuta_enc_ses: false, link_portaria_sei: null, link_solicitacao_liquidacao_sei: null, valor_liquidado: null, link_aviso_liquidacao_sei: null, aviso_enc_sefaz: false },
        7: { link_solicitacao_anulacao: null, link_anulacao_sei: null, sefaz_etapa5_em: null },
      };
      const blocos: string[] = [];
      let campos: any = { concluido: false, reaberto: false };
      if (firstInc < 3) campos.revisao_status = "pendente";
      for (let s = firstInc; s <= 7; s++) { if (camposMap[s]) campos = { ...campos, ...camposMap[s] }; }
      for (let s = firstInc + 1; s <= 7; s++) { if (blocosMap[s]) blocos.push(...blocosMap[s]); }
      if (blocos.length) await supabase.from("assinaturas_etapa").delete().eq("lancamento_id", id).in("bloco", blocos);
      const { error } = await supabase.from("lancamentos_pagamento").update(campos).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lanc", id] }); qc.invalidateQueries({ queryKey: ["assinaturas_etapa", id] }); qc.invalidateQueries({ queryKey: ["logs", id] }); toast.success("Etapas seguintes revertidas"); void registrarAcesso("etapas_revertidas", { rota: `/lancamentos/${id}` }); },
    onError: (e: any) => toast.error(e.message),
  });
  const concluir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lancamentos_pagamento").update({ concluido: true, reaberto: false } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lanc", id] }); qc.invalidateQueries({ queryKey: ["logs", id] }); toast.success("Processo concluído"); void registrarAcesso("processo_concluido", { rota: `/lancamentos/${id}` }); },
    onError: (e: any) => toast.error(e.message),
  });
  const revisar = useMutation({
    mutationFn: async (decisao: "aprovado" | "negado") => {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("revisoes_empenho").insert({ lancamento_id: id, decisao, justificativa: revJust || null, autor_id: u.user?.id, autor_nome: profile?.nome ?? u.user?.email });
      // Regra de estado: ao negar, força o "em bloco para revisão" a voltar a false,
      // obrigando a ACP a reativá-lo manualmente depois de corrigir os dados.
      const patch: any = { revisao_status: decisao };
      if (decisao === "negado") patch.em_bloco_revisao = false;
      await supabase.from("lancamentos_pagamento").update(patch).eq("id", id);
      if (decisao === "negado") {
        // Reflete no formulário local para não reaparecer marcado até o próximo fetch.
        fRef.current = { ...fRef.current, em_bloco_revisao: false };
        setF({ ...fRef.current });
      }
    },
    onSuccess: (_d, decisao) => { setRevJust(""); qc.invalidateQueries({ queryKey: ["revisoes", id] }); qc.invalidateQueries({ queryKey: ["lanc", id] }); qc.invalidateQueries({ queryKey: ["logs", id] }); toast.success("Revisão registrada"); void registrarAcesso("revisao_registrada", { detalhe: decisao, rota: `/lancamentos/${id}` }); },
    onError: (e: any) => toast.error(e.message),
  });
  // Reverte uma revisão já aprovada, reabrindo a Etapa 3 para nova decisão (com auditoria).
  const reverterRevisao = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("lancamentos_pagamento").update({ revisao_status: "pendente" } as any).eq("id", id);
      if (error) throw error;
      await supabase.from("historico_logs").insert({
        lancamento_id: id,
        usuario_id: u.user?.id,
        usuario_nome: profile?.nome ?? u.user?.email,
        acao: "Revisão da UFI revertida (aprovação cancelada, etapa reaberta)",
      } as any);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["revisoes", id] }); qc.invalidateQueries({ queryKey: ["lanc", id] }); qc.invalidateQueries({ queryKey: ["logs", id] }); toast.success("Aprovação revertida — Etapa 3 reaberta"); void registrarAcesso("revisao_revertida", { rota: `/lancamentos/${id}` }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !lanc) return <div className="text-muted-foreground">Carregando…</div>;

  const isChild = !!lanc.parent_id;
  const comps = (lanc.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const isParent = !lanc.parent_id && comps.length > 1;

  const statusEfetivo = statusAcoEfetivo({ ...lanc, ...f });
  const _ta = (termos as any[]).find((t) => t.id === f.termo_aditivo_id);
  const _cv = (convenios as any[]).find((c) => c.id === f.convenio_id);
  const _teto = Number(_ta?.valor_total ?? _cv?.teto_mensal ?? 0);
  // Etapa 3 (Revisão da UFI) é um ato único no Empenho Pai. Filhos herdam o status.
  const revisaoStatusEfetivo = isChild ? (parentLanc?.revisao_status ?? lanc.revisao_status) : lanc.revisao_status;
  // Motor de fluxo do convênio (herdado pelo filho a partir do pai/convênio).
  const fluxo2 = (_cv?.modelo_fluxo ?? parentLanc?.convenios?.modelo_fluxo) === "fluxo_2";
  const prog = progresso({ ...lanc, ...f, status_aco: statusEfetivo, revisao_status: revisaoStatusEfetivo }, ass as any[], _teto, filhos, fluxo2);
  const finalizado = !!lanc.concluido;

  const vigenciaExpiradaComTolerancia = (() => {
    if (_cv?.pagamento_pontual) return false;
    if (!_cv?.data_inicio_vigencia || !_cv?.total_parcelas) return false;
    const fim = new Date(_cv.data_inicio_vigencia + "T12:00:00");
    fim.setMonth(fim.getMonth() + Number(_cv.total_parcelas) + 2); // Fim + 2 meses tolerância
    return new Date() > fim;
  })();

  const convenioEncerradoManualmente = _cv?.status_convenio === "encerrado";
  const convenioSuspenso = _cv?.status_convenio === "suspenso";

  const editavel = !finalizado && !vigenciaExpiradaComTolerancia && !convenioEncerradoManualmente && !convenioSuspenso;
  const editAcp = canAcp && editavel;
  const editAco = canAco && editavel;
  
  // Para sublançamentos/filhos, as etapas 1-5 são compartilhadas e somente-leitura.
  const editSolic = editAcp && !isChild;
  const editAcoEtapa1to5 = editAco && !isChild;

  const revisaoStatus = lanc.revisao_status ?? "pendente";
  
  const compValida = (v: string) => {
    const cv = (convenios as any[]).find((c) => c.id === f.convenio_id);
    if (!cv?.data_inicio_vigencia) return true;
    const m = v.match(/^(\d{2})\/(\d{4})$/);
    if (!m) return true;
    const vig = new Date(cv.data_inicio_vigencia);
    const cy = Number(m[2]), cm = Number(m[1]);
    return cy > vig.getFullYear() || (cy === vig.getFullYear() && cm >= vig.getMonth() + 1);
  };
  // Mês de pagamento: no máximo 6 meses após a competência.
  // Convênios de Pagamentos Complementares permitem o pagamento no MESMO mês da
  // competência (delta >= 0); os demais exigem de 1 a 6 meses após (delta >= 1).
  const mesPagamentoValido = (v: string) => {
    const m = v.match(/^(\d{2})\/(\d{4})$/);
    const c = (f.competencia ?? "").split(",")[0].trim().match(/^(\d{2})\/(\d{4})$/);
    if (!m || !c) return true;
    const pg = Number(m[2]) * 12 + Number(m[1]);
    const cp = Number(c[2]) * 12 + Number(c[1]);
    const minDelta = _cv?.pagamento_pontual ? 0 : 1;
    return pg - cp >= minDelta && pg - cp <= 6;
  };
  const set = (patch: any) => { if (!editavel) return; const next = { ...fRef.current, ...patch }; fRef.current = next; setF(next); agendarSave(); };
  // Modo retroativo: nenhuma etapa fica bloqueada e os passos internos aparecem todos.
  const trava = (bloqueada: boolean) => (retro ? false : bloqueada);
  const gate = (cond: boolean) => retro || cond;

  const convSel = (convenios as any[]).find((c) => c.id === f.convenio_id);
  const taSel = (termos as any[]).find((t) => t.id === f.termo_aditivo_id);
  const totalParcelas = Number(convSel?.total_parcelas ?? 0);
  // Status de cada parcela do convênio (para o seletor da Etapa 2).
  const statusParcela = (num: string): { label: string; ocupada: boolean } => {
    const outros = (lancsConv as any[]).filter((l) => String(l.parcela) === num && l.id !== id);
    if (outros.length === 0) return { label: "Livre", ocupada: false };
    if (outros.some((l) => l.concluido)) return { label: "Concluída", ocupada: true };
    if (outros.some((l) => l.sefaz_etapa5_em)) return { label: "Aguardando conclusão", ocupada: true };
    return { label: "Em andamento", ocupada: true };
  };
  const tetoMensal = Number(taSel?.valor_total ?? convSel?.teto_mensal ?? 0);
  const vSolic = isParent
    ? (filhos.length > 0 ? filhos.reduce((s, c) => s + Number(c.valor_solicitado ?? 0), 0) : Number(f.valor_solicitado ?? 0))
    : Number(f.valor_solicitado ?? 0);
  const vAtest = isParent
    ? filhos.reduce((s, c) => s + Number(c.valor_atestado ?? 0), 0)
    : Number(f.valor_atestado ?? 0);
  const ajusteLabel = vAtest > 0 && vAtest > vSolic ? "A complementar" : "A anular";
  const ajusteValor = vAtest > 0 ? Math.abs(vAtest - vSolic) : 0;
  const pcArr = Array.isArray(f.parcelas_competencia) ? f.parcelas_competencia : [];
  const excedeTeto = isParent
    ? (tetoMensal > 0 && pcArr.some((pc: any) => Number(pc.valor) > tetoMensal))
    : (tetoMensal > 0 && vSolic > tetoMensal);

  // Reversão em cascata: detecta etapa anterior incompleta com etapa posterior preenchida.
  const sigs = (b: string) => (ass as any[]).some((a) => a.bloco === b);
  const flagsArr = [prog.s1, prog.s2, prog.s3, prog.s4, prog.s5, prog.s6, prog.anular > 0 ? prog.s7 : true];
  let firstInc = 0;
  for (let i = 0; i < flagsArr.length; i++) { if (!flagsArr[i]) { firstInc = i + 1; break; } }
  const artefDepois: Record<number, boolean> = {
    3: lanc.revisao_status === "aprovado",
    4: !!f.sefaz_etapa1_em || sigs("etapa1"),
    5: !!f.numero_empenho || isSafeUrl(f.link_empenho_sei) || sigs("libera_orc"),
    6: !!f.sefaz_etapa4_em || isSafeUrl(f.link_solicitacao_liberacao_sei) || Number(f.valor_atestado) > 0 || isSafeUrl(f.link_certidoes_sei) || isSafeUrl(f.link_relatorio_tecnico_sei) || isSafeUrl(f.link_relatorio_analise_sei) || !!f.data_pagamento || sigs("rel_tecnico") || sigs("rel_analise") || sigs("etapa4"),
    7: isSafeUrl(f.link_solicitacao_anulacao) || isSafeUrl(f.link_anulacao_sei) || !!f.sefaz_etapa5_em || sigs("etapa5"),
  };
  const inconsistente = !finalizado && firstInc > 0 && Object.entries(artefDepois).some(([k, v]) => Number(k) > firstInc && v);

  const todosFilhosConcluidos = isParent ? (filhos.length > 0 && filhos.every((child: any) => child.concluido)) : true;

  const respBadge = lanc.concluido
    ? <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" />CONCLUÍDO</Badge>
    : lanc.responsavel_atual === "aco"
      ? <Badge className="bg-aco text-aco-foreground gap-1"><Circle className="h-2.5 w-2.5 fill-current" />AÇÃO DA UFI</Badge>
      : <Badge className="bg-acp text-acp-foreground gap-1"><Circle className="h-2.5 w-2.5 fill-current" />AÇÃO DA ACP</Badge>;

  const blocoProps = (bloco: string) => ({ lancamentoId: id, bloco, pool: pool as any[], assinaturas: ass as any[], onChange: invalidarAss });

  // ===== Subpassos por etapa (para tooltips do "Progresso do processo") =====
  const exigeRelAna = convSel?.exige_relatorio_analise !== false;
  const _url = (u: any) => isSafeUrl(u);
  const merged = { ...lanc, ...f };
  // Fluxo 2 — completude de cada subpasso da Etapa 6 (Liquidação de Despesa).
  const f2step = {
    s1: _url(merged.link_minuta_sei) && blocoCompleto(ass as any[], "f2_minuta", SLOTS_F2_MINUTA),
    s2: _url(merged.link_memorando_sei) && blocoCompleto(ass as any[], "f2_memorando", SLOTS_F2_MEMORANDO) && !!merged.minuta_enc_ses,
    s3: _url(merged.link_portaria_sei),
    s4: _url(merged.link_solicitacao_liquidacao_sei) && Number(merged.valor_liquidado ?? 0) > 0 && blocoCompleto(ass as any[], "f2_liquidacao", SLOTS_F2_LIQUIDACAO),
    s5: _url(merged.link_aviso_liquidacao_sei) && blocoCompleto(ass as any[], "f2_aviso", SLOTS_F2_AVISO) && !!merged.aviso_enc_sefaz,
    s6: _url(merged.link_subempenho_sei) && _url(merged.link_programacao_pagamento_sei) && _url(merged.link_comprovante_pagamento_sei) && !!merged.data_pagamento,
  };
  const subpassos: Record<number, { label: string; ok: boolean; naoExigido?: boolean }[]> = fluxo2 ? {
    1: [
      { label: "Dotação orçamentária", ok: !!merged.dotacao_orcamentaria },
      { label: "Fonte de pagamento", ok: !!merged.fonte_pagamento },
    ],
    2: [
      { label: "Valor solicitado", ok: Number(merged.valor_solicitado ?? 0) > 0 },
      { label: "Link Solicitação SEI", ok: _url(merged.link_solicitacao_sei) },
      { label: "Solicitação em bloco para revisão", ok: !!merged.em_bloco_revisao },
    ],
    3: [
      { label: "Parecer da coordenação (aprovado)", ok: revisaoStatusEfetivo === "aprovado" },
    ],
    4: [
      { label: "Assinaturas (Coord. Orçamentos, Fiscal, Comissão, Financeira/Saúde)", ok: blocoCompleto(ass as any[], "etapa1", SLOTS_ETAPA4_F2) },
      { label: "Envio à SEFAZ.UCG.AEO", ok: !!merged.sefaz_etapa1_em },
    ],
    5: [
      { label: "Nº da Nota de Empenho", ok: !!merged.numero_empenho },
      { label: "Link Nota de Empenho SEI", ok: _url(merged.link_empenho_sei) },
      { label: "Assinaturas da liberação de orçamento", ok: blocoCompleto(ass as any[], "libera_orc", SLOTS_LIBERA_ORC) },
    ],
    6: [
      { label: "1. Minuta no SEI · assinaturas", ok: f2step.s1 },
      { label: "2. Memorando no SEI · assinaturas + envio SES.UPA", ok: f2step.s2 },
      { label: "3. Portaria de Divulgação de Recursos", ok: f2step.s3 },
      { label: "4. Solicitação de Liquidação · valor + assinaturas", ok: f2step.s4 },
      { label: "5. Aviso de Movimento (Empenho em Liquidação) · assinaturas + envio SEFAZ", ok: f2step.s5 },
      { label: "6/7/8. Subempenho, Programação, Comprovante e Data", ok: f2step.s6 },
    ],
  } : {
    1: [
      { label: "Dotação orçamentária", ok: !!merged.dotacao_orcamentaria },
      { label: "Fonte de pagamento", ok: !!merged.fonte_pagamento },
    ],
    2: [
      { label: "Valor solicitado", ok: Number(merged.valor_solicitado ?? 0) > 0 },
      { label: "Link Solicitação SEI", ok: _url(merged.link_solicitacao_sei) },
      { label: "Solicitação em bloco para revisão", ok: !!merged.em_bloco_revisao },
    ],
    3: [
      { label: "Parecer da coordenação (aprovado)", ok: revisaoStatusEfetivo === "aprovado" },
    ],
    4: [
      { label: "Assinaturas da solicitação", ok: blocoCompleto(ass as any[], "etapa1", SLOTS_ETAPA1) },
      { label: "Envio à SEFAZ.UCG.AEO", ok: !!merged.sefaz_etapa1_em },
    ],
    5: [
      { label: "Nº da Nota de Empenho", ok: !!merged.numero_empenho },
      { label: "Link Nota de Empenho SEI", ok: _url(merged.link_empenho_sei) },
      { label: "Assinaturas da liberação de orçamento", ok: blocoCompleto(ass as any[], "libera_orc", SLOTS_LIBERA_ORC) },
    ],
    6: [
      { label: "1. Relatório Técnico de Monitoramento", ok: blocoCompleto(ass as any[], "rel_tecnico", REL_TEC) && _url(merged.link_relatorio_tecnico_sei) },
      { label: "2. Relatório de Análise", ok: !exigeRelAna || (blocoCompleto(ass as any[], "rel_analise", REL_ANA) && _url(merged.link_relatorio_analise_sei)), naoExigido: !exigeRelAna },
      { label: "3. Certidões Negativas", ok: _url(merged.link_certidoes_sei) },
      { label: "4. Valor Atestado", ok: Number(merged.valor_atestado ?? 0) > 0 },
      { label: "5. Solicitação de Liberação · Assinaturas", ok: _url(merged.link_solicitacao_liberacao_sei) && blocoCompleto(ass as any[], "etapa4", SLOTS_PADRAO) },
      { label: "6. Envio à SEFAZ.UAF.ADE", ok: !!merged.sefaz_etapa4_em },
      { label: "7. Acompanhamento (subempenho, pgto, comprovante, data)", ok: _url(merged.link_subempenho_sei) && _url(merged.link_programacao_pagamento_sei) && _url(merged.link_comprovante_pagamento_sei) && !!merged.data_pagamento },
    ],
    7: [
      { label: "1. Link Solicitação de Anulação", ok: _url(merged.link_solicitacao_anulacao) },
      { label: "2. Assinaturas", ok: blocoCompleto(ass as any[], "etapa5", SLOTS_PADRAO) },
      { label: "3. Envio à SEFAZ.UCG.AEO", ok: !!merged.sefaz_etapa5_em },
      { label: "4. Aviso de Movimento (Anulação SEI)", ok: _url(merged.link_anulacao_sei) },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {isChild ? (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/lancamentos/$id" params={{ id: lanc.parent_id ?? "" }}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar ao Empenho Pai
            </Link>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/lancamentos">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Link>
          </Button>
        )}
        <div className="flex items-center gap-2">
          {!finalizado && <span className="text-xs text-muted-foreground">{salvar.isPending ? "Salvando…" : "Tudo salvo automaticamente"}</span>}
          <Button variant="outline" size="sm" onClick={() => { if (!gerarPdfLancamento({ lanc: { ...lanc, ...f, valor_solicitado: vSolic, valor_atestado: vAtest }, ass: ass as any[], logs: logs as any[], convenio: convSel, termo: taSel, logoUrl: logoAsset.url, emissor: profile?.nome })) toast.error("Habilite pop-ups para gerar o PDF."); }}><FileDown className="h-4 w-4 mr-1.5" />Exportar PDF</Button>
          {finalizado && isAdmin && <Button variant="outline" size="sm" onClick={() => reabrir.mutate(true)}><LockOpen className="h-4 w-4 mr-1.5" />Reabrir</Button>}
        </div>
      </div>

      {finalizado && (
        <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 flex items-center gap-3">
          <Lock className="h-5 w-5 text-success shrink-0" />
          <div className="text-sm"><b className="text-success">Processo finalizado.</b> Somente leitura.{isAdmin ? " Um administrador pode reabrir para editar." : ""}</div>
        </div>
      )}
      {convenioEncerradoManualmente && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 flex items-center gap-3">
          <Lock className="h-5 w-5 text-destructive shrink-0" />
          <div className="text-sm"><b className="text-destructive">Convênio encerrado manualmente.</b> Este lançamento está somente leitura.</div>
        </div>
      )}
      {convenioSuspenso && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 flex items-center gap-3">
          <Lock className="h-5 w-5 text-warning-foreground shrink-0" />
          <div className="text-sm"><b className="text-warning-foreground">Convênio suspenso.</b> Este lançamento está somente leitura.</div>
        </div>
      )}
      {!finalizado && vigenciaExpiradaComTolerancia && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 flex items-center gap-3">
          <Lock className="h-5 w-5 text-destructive shrink-0" />
          <div className="text-sm"><b className="text-destructive">Vigência expirada (fora do prazo de tolerância de 2 meses).</b> Este lançamento está somente leitura.</div>
        </div>
      )}
      {!finalizado && !vigenciaExpiradaComTolerancia && !convenioEncerradoManualmente && !convenioSuspenso && lanc.reaberto && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm flex items-center gap-3"><LockOpen className="h-5 w-5 text-warning-foreground shrink-0" />Reaberto para edição. Conclua novamente quando terminar.</div>
      )}
      {!finalizado && !vigenciaExpiradaComTolerancia && !convenioEncerradoManualmente && !convenioSuspenso && retro && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm flex items-center gap-3">
          <LockOpen className="h-5 w-5 text-warning-foreground shrink-0" />
          <span><b>Modo retroativo ativo</b> (Configurações → Avançado): todas as etapas estão liberadas, sem travas de sequência — para registro de processos históricos. Desative ao terminar a migração.</span>
        </div>
      )}

      <Card className={`border-l-4 ${lanc.responsavel_atual === "aco" ? "border-l-aco" : "border-l-acp"}`}>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl text-primary">{lanc.prestadores?.nome_instituicao ?? "Sem prestador"}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{f.descricao || "—"} · Competência {f.competencia || "—"}</p>
          </div>
          {respBadge}
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Kpi label="Solicitado" value={brl(vSolic)} />
          <Kpi label="Atestado" value={brl(vAtest)} />
          <Kpi label={ajusteLabel} value={brl(ajusteValor)} />
          <Kpi label="Parcela" value={f.parcela ? `${f.parcela}${totalParcelas ? ` / ${totalParcelas}` : ""}` : "—"} />
        </CardContent>
        <CardContent className="pt-0"><ProgressoEtapas prog={prog} subpassos={subpassos} isParent={isParent} isChild={isChild} fluxo2={fluxo2} /></CardContent>
      </Card>

      <Tabs defaultValue="processo">
        <TabsList>
          <TabsTrigger value="processo">Processo de Empenho</TabsTrigger>
          <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
          <TabsTrigger value="notas">Notas & Comentários</TabsTrigger>
        </TabsList>

        <TabsContent value="processo" className="space-y-4">
          {inconsistente && !retro && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-destructive flex items-center gap-2"><Lock className="h-4 w-4 shrink-0" />Uma etapa anterior ficou incompleta, mas há etapas seguintes já preenchidas. É preciso reverter as etapas seguintes para manter a consistência.</div>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button size="sm" variant="destructive">Reverter etapas seguintes</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reverter etapas seguintes?</AlertDialogTitle>
                    <AlertDialogDescription>Tudo que foi preenchido nas etapas após a etapa incompleta (assinaturas, envios à SEFAZ, nota de empenho, atestado, links, etc.) será <b>anulado</b> e precisará ser refeito. Esta ação não pode ser desfeita.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => reverter.mutate(firstInc)}>Reverter</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* ETAPA 1 — Análise de Orçamento (coordenação da UFI) */}
          <Etapa n={1} titulo="Análise de Orçamento" done={prog.s1} ativa colapsada={isChild} destaque={foco === 1} badge={isChild ? <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15">Compartilhada (Pai)</Badge> : undefined}>
            {!canAco && <Aviso>Somente a UFI edita esta etapa.</Aviso>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Dotação Orçamentária" help={HELP.dotacao_orcamentaria}><Input inputMode="numeric" value={f.dotacao_orcamentaria ?? ""} disabled={!editAcoEtapa1to5} onChange={(e) => set({ dotacao_orcamentaria: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="Fonte de Pagamento" help={HELP.fonte_pagamento}><Input inputMode="numeric" value={f.fonte_pagamento ?? ""} disabled={!editAcoEtapa1to5} onChange={(e) => set({ fonte_pagamento: e.target.value.replace(/\D/g, "") })} /></Field>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Ao preencher dotação e fonte, o status muda para <b>Orçamento Disponível</b> e libera a próxima etapa.</p>
          </Etapa>

          {/* ETAPA 2 — Solicitação de Empenho (ACP) */}
          <Etapa n={2} titulo="Solicitação de Empenho" done={prog.s2} ativa={prog.s1} bloqueada={trava(!prog.s1)} colapsada={isChild} destaque={foco === 2} badge={isChild ? <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15">Compartilhada (Pai)</Badge> : undefined}>
            {!canAcp && <Aviso>Somente a ACP edita esta etapa.</Aviso>}
            {revisaoStatus === "negado" && <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">Revisão negada — ajuste os dados e recoloque em bloco para nova revisão.</div>}
            <div className="text-xs text-muted-foreground mb-1">{f.descricao || "—"}{convSel ? ` · ${convSel.prestadores?.nome_instituicao ?? ""}` : ""}{taSel ? ` · ${taSel.identificador}` : ""}</div>
            {(() => {
              const compsEtapa2 = (f.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
              const isMulti = compsEtapa2.length > 1;
              // Inicializar parcelas_competencia se necessário.
              const pcArr: { competencia: string; parcela: string; mes_pagamento: string; valor: number }[] =
                Array.isArray(f.parcelas_competencia) && f.parcelas_competencia.length === compsEtapa2.length
                  ? f.parcelas_competencia
                  : compsEtapa2.map((c: string) => ({ competencia: c, parcela: "", mes_pagamento: getProximoMes(c), valor: 0 }));
              const setPc = (idx: number, patch: any) => {
                if (!editSolic) return;
                const next = pcArr.map((p, i) => (i === idx ? { ...p, ...patch } : p));
                const soma = next.reduce((s, p) => s + (Number(p.valor) || 0), 0);
                set({ parcelas_competencia: next, valor_solicitado: soma });
              };
              // Inicializa parcelas_competencia na state se ainda não bate.
              if (isMulti && (!Array.isArray(f.parcelas_competencia) || f.parcelas_competencia.length !== compsEtapa2.length)) {
                // Agenda um set sem salvar imediatamente (evita loop).
                setTimeout(() => {
                  const merged = { ...fRef.current };
                  if (!Array.isArray(merged.parcelas_competencia) || merged.parcelas_competencia.length !== compsEtapa2.length) {
                    const init = compsEtapa2.map((c: string) => ({ competencia: c, parcela: "", mes_pagamento: getProximoMes(c), valor: 0 }));
                    fRef.current = { ...merged, parcelas_competencia: init };
                    setF({ ...fRef.current });
                  }
                }, 0);
              }
              const totalMulti = isMulti ? pcArr.reduce((s, p) => s + (Number(p.valor) || 0), 0) : 0;
              return isMulti ? (
                <>
                  <div className="rounded-lg border bg-muted/10 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Parcelas por competência</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                          <tr>
                            <th className="py-1.5 pr-2">Competência</th>
                            <th className="py-1.5 pr-2">Parcela</th>
                            <th className="py-1.5 pr-2">Mês de Pagamento</th>
                            <th className="py-1.5">Valor Mensal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pcArr.map((pc, idx) => (
                            <tr key={idx} className="border-b last:border-0">
                              <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{pc.competencia}</td>
                              <td className="py-1.5 pr-2">
                                {totalParcelas > 0 ? (
                                  <Select value={pc.parcela || ""} onValueChange={(v) => setPc(idx, { parcela: v })}>
                                    <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Parcela" /></SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: totalParcelas }, (_, i) => String(i + 1)).map((p) => {
                                        const st = statusParcela(p);
                                        const usadaNaGrid = pcArr.some((x, xi) => xi !== idx && x.parcela === p);
                                        return (
                                          <SelectItem key={p} value={p} disabled={(st.ocupada && p !== pc.parcela) || usadaNaGrid}>
                                            <span className="flex items-center gap-2">
                                              {p}/{totalParcelas}
                                              <span className={`text-xs ${st.label === "Livre" ? "text-success" : st.label === "Concluída" ? "text-muted-foreground" : "text-warning-foreground"}`}>· {usadaNaGrid ? "Já selecionada" : st.label}</span>
                                            </span>
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                ) : <Input className="h-8 text-xs w-[80px]" inputMode="numeric" value={pc.parcela} onChange={(e) => setPc(idx, { parcela: e.target.value.replace(/\D/g, "") })} />}
                              </td>
                              <td className="py-1.5 pr-2">
                                <CompetenciaInput className="h-8 text-xs w-[120px]" value={pc.mes_pagamento} onChange={(v) => { if (!editSolic) return; if (!compValida(v)) return toast.error("Mês anterior ao início da vigência."); setPc(idx, { mes_pagamento: v }); }} />
                              </td>
                              <td className="py-1.5">
                                <CurrencyInput value={Number(pc.valor) || 0} onChange={(n) => setPc(idx, { valor: n })} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Valor Total Solicitado:</span>
                      <span className="text-base font-bold tabular-nums text-primary">{brl(totalMulti)}</span>
                    </div>
                    {/* Justificativas para cada competência excedente */}
                    {tetoMensal > 0 && pcArr.some((pc: any) => Number(pc.valor) > tetoMensal) && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        <Label className="text-xs font-semibold text-warning-foreground">Justificativas para parcelas acima do teto</Label>
                        {pcArr.map((pc: any, idx: number) => {
                          const excedeu = Number(pc.valor) > tetoMensal;
                          if (!excedeu) return null;
                          return (
                            <div key={idx} className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 space-y-1">
                              <span className="text-xs font-medium text-warning-foreground">Competência {pc.competencia} (Valor: {brl(Number(pc.valor))} · Teto: {brl(tetoMensal)})</span>
                              <Textarea
                                className="mt-1 h-16 text-xs bg-background"
                                placeholder={`Explique por que o valor de ${pc.competencia} está acima do teto...`}
                                value={pc.justificativa_teto ?? ""}
                                disabled={!editSolic}
                                onChange={(e) => setPc(idx, { justificativa_teto: e.target.value })}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <Field label="Link Solicitação SEI" help={HELP.link_solicitacao_sei}><SeiLink value={f.link_solicitacao_sei ?? ""} onChange={(v) => editSolic && set({ link_solicitacao_sei: v })} /></Field>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Parcela" help={convSel?.pagamento_pontual ? "Para convênios com pagamentos pontuais/demanda, a parcela é gerada automaticamente de forma sequencial." : HELP.parcela}>
                      {convSel?.pagamento_pontual ? (
                        <Input disabled value={f.parcela ? `Parcela ${f.parcela} (Gerada Automaticamente)` : "Será gerada ao salvar"} />
                      ) : totalParcelas > 0 ? (
                        <Select value={f.parcela || ""} onValueChange={(v) => editSolic && set({ parcela: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione a parcela" /></SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: totalParcelas }, (_, i) => String(i + 1)).map((p) => {
                              const st = statusParcela(p);
                              return (
                                <SelectItem key={p} value={p} disabled={st.ocupada && p !== String(f.parcela ?? "")}>
                                  <span className="flex items-center gap-2">
                                    Parcela {p} de {totalParcelas}
                                    <span className={`text-xs ${st.label === "Livre" ? "text-success" : st.label === "Concluída" ? "text-muted-foreground" : "text-warning-foreground"}`}>· {st.label}</span>
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input inputMode="numeric" value={f.parcela ?? ""} onChange={(e) => editSolic && set({ parcela: e.target.value.replace(/\D/g, "") })} />
                      )}
                    </Field>
                    <Field label="Mês de Pagamento (MM/AAAA)" help={_cv?.pagamento_pontual ? "Convênio de pagamentos complementares: pode ser no mesmo mês da competência ou em até 6 meses após." : "Deve ser depois da competência e no máximo 6 meses após ela."}><CompetenciaInput value={f.mes_pagamento_previsto ?? ""} onChange={(v) => { if (!editSolic) return; if (!compValida(v)) return toast.error("Mês anterior ao início da vigência do convênio."); if (!mesPagamentoValido(v)) return toast.error(_cv?.pagamento_pontual ? "O mês de pagamento deve ser igual ou até 6 meses após a competência." : "O mês de pagamento deve ser de 1 a 6 meses após a competência."); set({ mes_pagamento_previsto: v }); }} /></Field>
                    <Field label="Link Solicitação SEI" help={HELP.link_solicitacao_sei}><SeiLink value={f.link_solicitacao_sei ?? ""} onChange={(v) => editSolic && set({ link_solicitacao_sei: v })} /></Field>
                    <Field label="Valor Solicitado" help={HELP.valor_solicitado}><CurrencyInput value={vSolic} onChange={(n) => editSolic && set({ valor_solicitado: n })} /></Field>
                  </div>
                </>
              );
            })()}
            {tetoMensal > 0 && (
              <div className="mt-1">
                <SaldoBar usado={isParent && comps.length > 0 ? vSolic / comps.length : vSolic} teto={tetoMensal} />
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isParent ? "Consumo médio mensal comparado ao teto." : "Teto mensal do convênio/aditivo."}
                </p>
              </div>
            )}
            {!isParent && excedeTeto && (
              <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
                <Label className="text-xs font-semibold text-warning-foreground flex items-center gap-1">Justificativa do valor acima do teto <HelpTip text="O valor solicitado excede o teto mensal. Justifique (fica registrado no processo)." /></Label>
                <Textarea className="mt-1" placeholder="Explique por que o valor está acima do teto mensal…" value={f.justificativa_teto ?? ""} onChange={(e) => editSolic && set({ justificativa_teto: e.target.value })} />
              </div>
            )}
            <div className="rounded-lg border bg-muted/10 p-3 mt-3">
              <CheckLinha checked={!!f.em_bloco_revisao} disabled={!editSolic} onChange={(v) => set({ em_bloco_revisao: v })} label="Solicitação colocada em bloco para revisão da coordenação da UFI" />
            </div>
          </Etapa>

          {/* ETAPA 3 — Revisão da Coordenação da UFI (a mesma coordenação que fez a análise de orçamento) */}
          <Etapa n={3} titulo="Revisão da Coordenação da UFI" done={prog.s3} ativa={prog.s2} bloqueada={trava(!prog.s2)} colapsada={isChild} destaque={foco === 3} badge={isChild ? <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15">Compartilhada (Pai)</Badge> : undefined}>
            {!canAco && <Aviso>Somente a UFI (coordenação) decide esta etapa.</Aviso>}
            <div className="flex items-center gap-2 mb-2">
              {revisaoStatus === "aprovado" ? <Badge className="bg-success text-success-foreground">Aprovada</Badge>
                : revisaoStatus === "negado" ? <Badge variant="destructive">Negada — aguardando ajuste</Badge>
                : <Badge variant="outline">Aguardando decisão</Badge>}
            </div>
            {revisaoStatus !== "aprovado" && editAco && (
              <div className="rounded-lg border bg-muted/10 p-3 space-y-2">
                <Label className="text-xs">Justificativa / parecer <HelpTip text="Obrigatória ao negar; opcional ao aprovar." /></Label>
                <Textarea placeholder="Parecer da coordenação da UFI…" value={revJust} onChange={(e) => setRevJust(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="text-destructive" disabled={!revJust.trim() || revisar.isPending} onClick={() => revisar.mutate("negado")}><ThumbsDown className="h-4 w-4 mr-1.5" />Negar</Button>
                  <Button size="sm" disabled={revisar.isPending} onClick={() => revisar.mutate("aprovado")}><ThumbsUp className="h-4 w-4 mr-1.5" />Aprovar</Button>
                </div>
              </div>
            )}
            {revisaoStatus === "aprovado" && editAco && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Revisão aprovada. Se precisar reabrir para nova análise, reverta a aprovação — a ação fica registrada na auditoria.</span>
                <Button size="sm" variant="outline" className="text-destructive shrink-0" disabled={reverterRevisao.isPending} onClick={() => reverterRevisao.mutate()}><Undo2 className="h-4 w-4 mr-1.5" />Reverter Aprovação / Cancelar Revisão</Button>
              </div>
            )}
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Histórico de revisões</div>
              {(revisoes as any[]).length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma revisão registrada.</p> : (
                <ul className="space-y-1.5">
                  {(revisoes as any[]).map((r: any) => (
                    <li key={r.id} className="text-sm border rounded p-2">
                      <div className="flex items-center gap-2">
                        {r.decisao === "aprovado" ? <Badge className="bg-success text-success-foreground">Aprovado</Badge> : <Badge variant="destructive">Negado</Badge>}
                        <span className="text-xs text-muted-foreground">{dateTime(r.created_at)} · {r.autor_nome ?? "—"}</span>
                      </div>
                      {r.justificativa && <p className="text-xs mt-1 whitespace-pre-wrap">{r.justificativa}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Etapa>

          {/* ETAPA 4 — Solicitação: Assinaturas + SEFAZ.UCG.AEO (ACP) */}
          <Etapa n={4} titulo="Assinaturas e Envio (Solicitação)" done={prog.s4} ativa={prog.s3} bloqueada={trava(!prog.s3)} colapsada={isChild} destaque={foco === 4} badge={isChild ? <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15">Compartilhada (Pai)</Badge> : undefined}>
            {!canAcp && <Aviso>Somente a ACP edita esta etapa.</Aviso>}
            <Passo titulo="Assinaturas"><BlocoAssinaturas {...blocoProps("etapa1")} slots={fluxo2 ? SLOTS_ETAPA4_F2 : SLOTS_ETAPA1} canEdit={editAcp} /></Passo>
            {gate(blocoCompleto(ass as any[], "etapa1", fluxo2 ? SLOTS_ETAPA4_F2 : SLOTS_ETAPA1)) && (
              <Passo titulo="Envio à SEFAZ.UCG.AEO"><SefazConfirm em={f.sefaz_etapa1_em} disabled={!editAcp} onToggle={(v) => set({ sefaz_etapa1_em: v })} /></Passo>
            )}
          </Etapa>

          {/* ETAPA 5 — Liberação de Orçamento (UFI) */}
          <Etapa n={5} titulo="Liberação de Orçamento" done={prog.s5} ativa={prog.s4} bloqueada={trava(!prog.s4)} colapsada={isChild} destaque={foco === 5} badge={isChild ? <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15">Compartilhada (Pai)</Badge> : undefined}>
            {!canAco && <Aviso>Somente a UFI edita esta etapa.</Aviso>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nº da Nota de Empenho" help={HELP.numero_empenho}><Input value={f.numero_empenho ?? ""} onChange={(e) => set({ numero_empenho: e.target.value })} /></Field>
              <Field label="Link Nota de Empenho SEI" help={HELP.link_empenho_sei}><SeiLink value={f.link_empenho_sei ?? ""} onChange={(v) => set({ link_empenho_sei: v })} /></Field>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Com o nº e o link da nota de empenho, o status vai para <b>Empenhado</b>.</p>
            {gate(!!f.numero_empenho && isSafeUrl(f.link_empenho_sei)) && (
              <div className="mt-3"><BlocoAssinaturas {...blocoProps("libera_orc")} slots={SLOTS_LIBERA_ORC} canEdit={editAco} /></div>
            )}
          </Etapa>

          {isParent && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" />
                  Competências e Sublançamentos
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  As etapas compartilhadas (1 a 5) foram concluídas no processo pai. {fluxo2 ? "A liquidação de despesa (Etapa 6)" : "A liberação de recurso (Etapa 6)"} e a prestação de contas ocorrem individualmente por competência.
                  {!fluxo2 && " A anulação do empenho (Etapa 7) é feita uma única vez no processo pai, ao final, sobre o valor total."}
                </p>
              </CardHeader>
              <CardContent>
                {filhos.length === 0 ? (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-center space-y-3">
                    <div>
                      <p className="text-sm text-warning-foreground font-semibold">Sublançamentos pendentes de criação.</p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">Conclua a Etapa 5 (preenchendo Nota de Empenho, Link SEI e coletando assinaturas) para gerá-los automaticamente.</p>
                    </div>
                    {retro && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-warning/50 text-warning-foreground hover:bg-warning/10"
                        disabled={criarFilhos.isPending}
                        onClick={() => criarFilhos.mutate()}
                      >
                        Gerar Sublançamentos (Modo Retroativo)
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                        <tr>
                          <th className="py-2 pr-2">Competência</th>
                          <th className="py-2 pr-2">Parcela</th>
                          <th className="py-2 pr-2">Mês Pagamento</th>
                          <th className="py-2 pr-2">Valor Solicitado</th>
                          <th className="py-2 pr-2">Valor Atestado</th>
                          <th className="py-2 pr-2">Status</th>
                          <th className="py-2 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filhos.map((child: any) => (
                          <tr key={child.id} className="border-b last:border-0 hover:bg-muted/40">
                            <td className="py-2 pr-2 font-medium">{child.competencia}</td>
                            <td className="py-2 pr-2">{child.parcela}</td>
                            <td className="py-2 pr-2">{child.mes_pagamento_previsto || "—"}</td>
                            <td className="py-2 pr-2 tabular-nums">{brl(Number(child.valor_solicitado))}</td>
                            <td className="py-2 pr-2 tabular-nums">{brl(Number(child.valor_atestado))}</td>
                            <td className="py-2 pr-2">
                              <Badge variant={child.concluido ? "secondary" : "outline"} className="text-xs font-normal">
                                {etapaCorrenteLabel(child)}
                              </Badge>
                            </td>
                            <td className="py-2 text-right">
                              {retro || prog.s5 ? (
                                <Button variant="outline" size="sm" asChild>
                                  <Link to="/lancamentos/$id" params={{ id: child.id }}>
                                    Gerenciar <ArrowRight className="h-3.5 w-3.5 ml-1" />
                                  </Link>
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" disabled>
                                  Bloqueado <Lock className="h-3.5 w-3.5 ml-1" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ETAPA 7 (PROCESSO PAI) — Anulação do empenho sobre o valor TOTAL, ao final.
              Só aparece quando todas as competências filhas estiverem concluídas. */}
          {isParent && !fluxo2 && filhos.length > 0 && (
            todosFilhosConcluidos ? (
              prog.anular > 0 ? (
                <Etapa n={7} titulo="Anulação de Empenho (Processo Pai)" done={!!prog.s7} ativa bloqueada={false} destaque={foco === 7}>
                  {!canAcp && <Aviso>Somente a ACP edita esta etapa.</Aviso>}
                  <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm mb-3">
                    Todas as competências foram concluídas. Há <b>{brl(prog.anular)}</b> a anular no empenho pai — total Solicitado <b>{brl(vSolic)}</b> − total Atestado das competências <b>{brl(vAtest)}</b>.
                  </div>
                  <Passo titulo="1. Link Solicitação de Anulação">
                    <Field label="Link Solicitação de Anulação" help={HELP.link_solicitacao_anulacao}><SeiLink value={f.link_solicitacao_anulacao ?? ""} onChange={(v) => set({ link_solicitacao_anulacao: v })} /></Field>
                  </Passo>
                  {gate(isSafeUrl(f.link_solicitacao_anulacao)) && (
                    <Passo titulo="2. Assinaturas"><BlocoAssinaturas {...blocoProps("etapa5")} slots={SLOTS_PADRAO} canEdit={editAcp} /></Passo>
                  )}
                  {gate(isSafeUrl(f.link_solicitacao_anulacao) && blocoCompleto(ass as any[], "etapa5", SLOTS_PADRAO)) && (
                    <Passo titulo="3. Envio à SEFAZ.UCG.AEO"><SefazConfirm em={f.sefaz_etapa5_em} disabled={!editAcp} onToggle={(v) => set({ sefaz_etapa5_em: v })} /></Passo>
                  )}
                  {gate(!!f.sefaz_etapa5_em) && (
                    <Passo titulo="4. Link Anulação SEI (Aviso de Movimento)">
                      <Field label="Link Anulação SEI (Aviso de Movimento)" help={HELP.link_anulacao_sei}><SeiLink value={f.link_anulacao_sei ?? ""} onChange={(v) => set({ link_anulacao_sei: v })} /></Field>
                    </Passo>
                  )}
                </Etapa>
              ) : (
                <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <span>Todas as competências concluídas. {vAtest > vSolic ? `Houve valor a complementar (${brl(vAtest - vSolic)}) — não há empenho a anular.` : "Não há saldo a anular no empenho pai (Atestado = Solicitado)."}</span>
                </div>
              )
            ) : (
              <div className="rounded-lg border bg-muted/10 px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                A <b className="text-foreground">Etapa 7 — Anulação do Empenho Pai</b> será liberada quando todas as competências acima estiverem concluídas. A anulação considera o total (Solicitado − soma do Atestado das competências).
              </div>
            )
          )}

          {!isParent && (
            <>
              {/* ETAPA 6 — Liberação de Recurso (Fluxo 1) · Liquidação de Despesa (Fluxo 2) */}
              <Etapa n={6} titulo={fluxo2 ? "Liquidação de Despesa" : "Liberação de Recurso"} done={prog.s6} ativa={prog.s5} bloqueada={trava(!prog.s5)} destaque={foco === 6}>
                {!canAcp && <Aviso>Somente a ACP edita esta etapa.</Aviso>}
                {fluxo2 ? (
                  <>
                    <Passo titulo="1. Minuta (Gerente ACP + Diretor de Serviços Complementares)">
                      <Field label="Link da Minuta no SEI" help="Exige a assinatura conjunta do Gerente ACP e do Diretor de Serviços Complementares."><SeiLink value={f.link_minuta_sei ?? ""} onChange={(v) => set({ link_minuta_sei: v })} /></Field>
                      {gate(isSafeUrl(f.link_minuta_sei)) && <div className="mt-2"><BlocoAssinaturas {...blocoProps("f2_minuta")} slots={SLOTS_F2_MINUTA} canEdit={editAcp} /></div>}
                    </Passo>
                    {gate(f2step.s1) && (
                      <Passo titulo="2. Memorando (Fiscal + Gerente/Coordenador ACP)">
                        <Field label="Link do Memorando no SEI" help="Exige 1 Fiscal + 1 assinatura conjunta condicional (Gerente E/OU Coordenador ACP)."><SeiLink value={f.link_memorando_sei ?? ""} onChange={(v) => set({ link_memorando_sei: v })} /></Field>
                        {gate(isSafeUrl(f.link_memorando_sei)) && <div className="mt-2"><BlocoAssinaturas {...blocoProps("f2_memorando")} slots={SLOTS_F2_MEMORANDO} canEdit={editAcp} /></div>}
                        <div className="rounded-lg border bg-muted/10 p-3 mt-2"><CheckLinha checked={!!f.minuta_enc_ses} disabled={!editAcp} onChange={(v) => set({ minuta_enc_ses: v })} label="Minuta encaminhada para SES.UPA e SES.UPA.APA" /></div>
                      </Passo>
                    )}
                    {gate(f2step.s2) && (
                      <Passo titulo="3. Portaria de Divulgação de Recursos">
                        <Field label="Link da Portaria de Divulgação de Recursos no SEI" help="Link da Portaria de Divulgação de Recursos no SEI."><SeiLink value={f.link_portaria_sei ?? ""} onChange={(v) => set({ link_portaria_sei: v })} /></Field>
                      </Passo>
                    )}
                    {gate(f2step.s3) && (
                      <Passo titulo="4. Solicitação de Subempenho/Liquidação (Fiscal + Membro da Comissão)">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Field label="Link da Solicitação de Subempenho/Liquidação (SEI)" help="Link do documento de Solicitação de Subempenho/Liquidação no SEI."><SeiLink value={f.link_solicitacao_liquidacao_sei ?? ""} onChange={(v) => set({ link_solicitacao_liquidacao_sei: v })} /></Field>
                          <Field label="Valor Liquidado" help="Valor efetivamente liquidado da despesa."><CurrencyInput value={Number(f.valor_liquidado ?? 0)} onChange={(n) => set({ valor_liquidado: n })} /></Field>
                        </div>
                        {gate(isSafeUrl(f.link_solicitacao_liquidacao_sei)) && <div className="mt-2"><BlocoAssinaturas {...blocoProps("f2_liquidacao")} slots={SLOTS_F2_LIQUIDACAO} canEdit={editAcp} /></div>}
                      </Passo>
                    )}
                    {gate(f2step.s4) && (
                      <Passo titulo="5. Aviso de Movimento — Empenho em Liquidação (Fiscal + Membro da Comissão)">
                        <Field label="Link do Aviso de Movimento - Empenho em Liquidação (SEI)" help="Link do Aviso de Movimento de Empenho em Liquidação no SEI."><SeiLink value={f.link_aviso_liquidacao_sei ?? ""} onChange={(v) => set({ link_aviso_liquidacao_sei: v })} /></Field>
                        {gate(isSafeUrl(f.link_aviso_liquidacao_sei)) && <div className="mt-2"><BlocoAssinaturas {...blocoProps("f2_aviso")} slots={SLOTS_F2_AVISO} canEdit={editAcp} /></div>}
                        <div className="rounded-lg border bg-muted/10 p-3 mt-2"><CheckLinha checked={!!f.aviso_enc_sefaz} disabled={!editAcp} onChange={(v) => set({ aviso_enc_sefaz: v })} label="Aviso enviado para SEFAZ.UAF.ADE" /></div>
                      </Passo>
                    )}
                    {gate(f2step.s5) && (
                      <Passo titulo="6, 7 e 8. Movimentação e Pagamento (links SEI) — obrigatório para concluir">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Field label="Aviso de Movimento · Subempenho" help="Link do Aviso de Movimento de Subempenho no SEI."><SeiLink value={f.link_subempenho_sei ?? ""} onChange={(v) => set({ link_subempenho_sei: v })} /></Field>
                          <Field label="Programação de Pagamento" help="Link da Programação de Pagamento no SEI."><SeiLink value={f.link_programacao_pagamento_sei ?? ""} onChange={(v) => set({ link_programacao_pagamento_sei: v })} /></Field>
                          <Field label="Comprovante de Pagamento" help="Link do Comprovante de Pagamento no SEI."><SeiLink value={f.link_comprovante_pagamento_sei ?? ""} onChange={(v) => set({ link_comprovante_pagamento_sei: v })} /></Field>
                          <Field label="Data do Pagamento" help="Data em que o pagamento foi efetivado. O prazo de prestação de contas começa a contar a partir desta data."><Input type="date" value={f.data_pagamento ?? ""} onChange={(e) => editAcp && set({ data_pagamento: e.target.value || null })} /></Field>
                        </div>
                      </Passo>
                    )}
                  </>
                ) : (<>
                <Passo titulo="1. Relatório Técnico de Monitoramento (2 fiscais + 1 opcional)">
                  <Field label="Link SEI do Relatório Técnico" help="Link do Relatório Técnico de Monitoramento no SEI. Exige 2 fiscais; uma terceira assinatura (Fiscal, Gerente ou Coordenador ACP) é opcional."><SeiLink value={f.link_relatorio_tecnico_sei ?? ""} onChange={(v) => set({ link_relatorio_tecnico_sei: v })} /></Field>
                  <div className="mt-2"><BlocoAssinaturas {...blocoProps("rel_tecnico")} slots={REL_TEC} canEdit={editAcp} /></div>
                </Passo>
                {convSel?.exige_relatorio_analise !== false ? (
                  <Passo titulo="2. Relatório de Análise (mín. 1 fiscal)">
                    <Field label="Link SEI do Relatório de Análise" help="Link do Relatório de Análise no SEI. Exige ao menos 1 fiscal."><SeiLink value={f.link_relatorio_analise_sei ?? ""} onChange={(v) => set({ link_relatorio_analise_sei: v })} /></Field>
                    <div className="mt-2"><BlocoAssinaturas {...blocoProps("rel_analise")} slots={REL_ANA} canEdit={editAcp} /></div>
                  </Passo>
                ) : (
                  <div className="rounded-lg border bg-muted/5 p-3 text-xs text-muted-foreground italic">
                    O Relatório de Análise não é exigido para este convênio ou está incluso no Relatório Técnico de Monitoramento e Avaliação (RTMA).
                  </div>
                )}
                <Passo titulo="3. Certidões Negativas">
                  <Field label="Link SEI das Certidões" help="Link das certidões negativas no SEI."><SeiLink value={f.link_certidoes_sei ?? ""} onChange={(v) => set({ link_certidoes_sei: v })} /></Field>
                </Passo>
                <Passo titulo="4. Valor Atestado">
                  <Field label="Valor Atestado" help={HELP.valor_atestado}><CurrencyInput value={vAtest} onChange={(n) => set({ valor_atestado: n })} /></Field>
                </Passo>
                {gate(prog.relOk && vAtest > 0) ? (
                  <>
                    <Passo titulo="5. Solicitação de Liberação de Recurso · Assinaturas">
                      <Field label="Link Solicitação de Liberação (SEI)" help="Link do documento de Solicitação de Liberação de Recurso no SEI."><SeiLink value={f.link_solicitacao_liberacao_sei ?? ""} onChange={(v) => set({ link_solicitacao_liberacao_sei: v })} /></Field>
                      {gate(isSafeUrl(f.link_solicitacao_liberacao_sei)) && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Assinaturas da Solicitação de Liberação</div>
                          <BlocoAssinaturas {...blocoProps("etapa4")} slots={SLOTS_PADRAO} canEdit={editAcp} />
                        </div>
                      )}
                    </Passo>
                    {gate(blocoCompleto(ass as any[], "etapa4", SLOTS_PADRAO) && isSafeUrl(f.link_solicitacao_liberacao_sei)) && (
                      <Passo titulo="6. Envio à SEFAZ.UAF.ADE"><SefazConfirm em={f.sefaz_etapa4_em} disabled={!editAcp} onToggle={(v) => set({ sefaz_etapa4_em: v })} /></Passo>
                    )}
                    {gate(!!f.sefaz_etapa4_em) && (
                      <Passo titulo="7. Acompanhamento (links SEI) — obrigatório para concluir">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Field label="Aviso de Movimento · Subempenho" help="Link do Aviso de Movimento de Subempenho no SEI."><SeiLink value={f.link_subempenho_sei ?? ""} onChange={(v) => set({ link_subempenho_sei: v })} /></Field>
                          <Field label="Programação de Pagamento" help="Link da Programação de Pagamento no SEI."><SeiLink value={f.link_programacao_pagamento_sei ?? ""} onChange={(v) => set({ link_programacao_pagamento_sei: v })} /></Field>
                          <Field label="Comprovante de Pagamento" help="Link do Comprovante de Pagamento no SEI."><SeiLink value={f.link_comprovante_pagamento_sei ?? ""} onChange={(v) => set({ link_comprovante_pagamento_sei: v })} /></Field>
                          <Field label="Data do Pagamento" help="Data em que o pagamento foi efetivado. O prazo de prestação de contas do prestador começa a contar a partir desta data."><Input type="date" value={f.data_pagamento ?? ""} onChange={(e) => editAcp && set({ data_pagamento: e.target.value || null })} /></Field>
                        </div>
                      </Passo>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Para liberar a solicitação de recurso, complete: relatórios (links + assinaturas), certidões (link) e o valor atestado.</p>
                )}
                </>)}
              </Etapa>

              {/* ETAPA 7 — Anulação (Fluxo 1; extinta no Fluxo 2; nunca por competência filha;
                  oculta se não houver saldo a anular). No multi-competência a anulação é do Pai. */}
              {!fluxo2 && !isChild && prog.anular > 0 ? (
                <Etapa n={7} titulo="Anulação de Empenho" done={!!prog.s7} ativa bloqueada={false} destaque={foco === 7}>
                  {!canAcp && <Aviso>Somente a ACP edita esta etapa.</Aviso>}
                  <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm mb-3">Há <b>{brl(prog.anular)}</b> a anular (Solicitado − Atestado).</div>
                  <Passo titulo="1. Link Solicitação de Anulação">
                    <Field label="Link Solicitação de Anulação" help={HELP.link_solicitacao_anulacao}><SeiLink value={f.link_solicitacao_anulacao ?? ""} onChange={(v) => set({ link_solicitacao_anulacao: v })} /></Field>
                  </Passo>
                  {gate(isSafeUrl(f.link_solicitacao_anulacao)) && (
                    <Passo titulo="2. Assinaturas"><BlocoAssinaturas {...blocoProps("etapa5")} slots={SLOTS_PADRAO} canEdit={editAcp} /></Passo>
                  )}
                  {gate(isSafeUrl(f.link_solicitacao_anulacao) && blocoCompleto(ass as any[], "etapa5", SLOTS_PADRAO)) && (
                    <Passo titulo="3. Envio à SEFAZ.UCG.AEO"><SefazConfirm em={f.sefaz_etapa5_em} disabled={!editAcp} onToggle={(v) => set({ sefaz_etapa5_em: v })} /></Passo>
                  )}
                  {gate(!!f.sefaz_etapa5_em) && (
                    <Passo titulo="4. Link Anulação SEI (Aviso de Movimento)">
                      <Field label="Link Anulação SEI (Aviso de Movimento)" help={HELP.link_anulacao_sei}><SeiLink value={f.link_anulacao_sei ?? ""} onChange={(v) => set({ link_anulacao_sei: v })} /></Field>
                    </Passo>
                  )}
                </Etapa>
              ) : null}

              {/* PRESTAÇÃO DE CONTAS — resumo com link (a gestão fica na página própria) */}
              {(prog.s6 || finalizado) && convSel?.exige_prestacao_contas !== false && <PrestacaoResumo lanc={{ ...lanc, ...f }} convenio={convSel} />}
            </>
          )}
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle className="text-base">Linha do Tempo (Audit Trail)</CardTitle></CardHeader>
            <CardContent>
              {(logs as any[]).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p> : (
                <ol className="border-l-2 border-primary/30 ml-3 space-y-4">
                  {agruparLogs(logs as any[]).map((l: any) => {
                    const mudancas = l.acao === "Campos atualizados" ? mudancasVisiveis(l.detalhes) : [];
                    return (
                      <li key={l.id} className="ml-4 relative">
                        <span className="absolute -left-[1.4rem] top-1 w-3 h-3 rounded-full bg-primary" />
                        <div className="text-xs text-muted-foreground">{dateTime(l.data_hora)} · {l.usuario_nome ?? "Sistema"}</div>
                        <div className="text-sm font-medium">{l.acao === "Campos atualizados" && mudancas.length ? "Atualização" : l.acao}</div>
                        {mudancas.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            {mudancas.map(([campo, val]: any) => (
                              <li key={campo}><span className="font-medium text-foreground">{rotuloCampo(campo)}:</span> {formatarValor(campo, val?.de)} <span>→</span> {formatarValor(campo, val?.para)}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notas">
          <Card>
            <CardHeader><CardTitle className="text-base">Notas & Comentários (ACP ↔ UFI)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Textarea placeholder="Escreva um comentário…" value={nova} onChange={(e) => setNova(e.target.value)} />
                <Button onClick={() => addNota.mutate()} disabled={!nova.trim()}>Enviar</Button>
              </div>
              <ul className="space-y-2">
                {(notas as any[]).map((n: any) => (
                  <li key={n.id} className="border rounded p-3 bg-muted/30">
                    <div className="text-xs text-muted-foreground">{n.usuario_nome ?? "—"} · {dateTime(n.data_hora)}</div>
                    <div className="text-sm whitespace-pre-wrap mt-1">{n.mensagem}</div>
                  </li>
                ))}
                {(notas as any[]).length === 0 && <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!finalizado && (
        <div className="flex justify-end pt-4 border-t mt-6">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                size="lg" 
                className="bg-success hover:bg-success/90 text-success-foreground shadow-sm"
                disabled={!retro && !(prog.completo && todosFilhosConcluidos)}
              >
                <Check className="h-5 w-5 mr-2" />
                Concluir processo
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Concluir este processo?</AlertDialogTitle>
                <AlertDialogDescription>
                  {isParent ? (
                    <>O processo pai de múltiplas competências será concluído. Todos os sublançamentos individuais das parcelas já estão concluídos. O processo pai ficará <b>somente leitura</b>.</>
                  ) : prog.completo ? (
                    <>Todas as etapas estão preenchidas. Ao concluir, o processo fica <b>somente leitura</b> (um administrador pode reabrir depois). Confira tudo antes de confirmar.</>
                  ) : (
                    <><b>Modo retroativo ativo:</b> o processo será concluído mesmo com etapas incompletas ({prog.done} de {prog.total} preenchidas). Use apenas para registrar processos históricos. Ao concluir, fica <b>somente leitura</b>.</>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction className="bg-success text-success-foreground hover:bg-success/90" onClick={() => concluir.mutate()}>Concluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

type SubpassoItem = { label: string; ok: boolean; naoExigido?: boolean };

/**
 * Progresso do processo — trilha das 7 etapas com Tooltip por bolinha
 * revelando a árvore de subpassos daquela etapa (ícones minimalistas).
 *
 * Granularidade:
 *  - Empenho pai (múltiplas competências): mostra 1..4 apenas.
 *  - Empenho filho (parcela): 1..4 herdadas como concluídas; 5..7 reais.
 *  - Empenho simples: 1..7 (a 7 aparece só se houver saldo a anular).
 */
function ProgressoEtapas({
  prog,
  subpassos,
  isParent,
  isChild,
  fluxo2 = false,
}: {
  prog: ReturnType<typeof progresso>;
  subpassos: Record<number, SubpassoItem[]>;
  isParent: boolean;
  isChild: boolean;
  fluxo2?: boolean;
}) {
  // No Fluxo 2 a Etapa 6 é "Liquidação" e não existe Etapa 7 (anulação).
  const nomes = fluxo2 ? ["Análise Orç.", "Solicitação", "Revisão", "Assinaturas", "Liberação Orç.", "Liquidação"] : ETAPAS_NOMES;
  const flagsBase = [prog.s1, prog.s2, prog.s3, prog.s4, prog.s5, prog.s6, prog.anular > 0 ? prog.s7 : true];

  // Filhos herdam as etapas 1..4 do pai como concluídas.
  const flags = flagsBase.map((v, i) => (isChild && i < 4 ? true : v));

  // Empenho pai (multi): esconde 5..7 (feitos por parcela). Simples/filho: mostra até 7
  // (com a 7 só se anular>0; no Fluxo 2 nunca há Etapa 7).
  const total = isParent ? 4 : !fluxo2 && prog.anular > 0 ? 7 : 6;
  const visiveis = flags.slice(0, total);

  const pctDone = visiveis.filter(Boolean).length;
  const pct = Math.round((pctDone / visiveis.length) * 100);

  return (
    <TooltipProvider delayDuration={80}>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Progresso do processo</span>
          <span className="text-xs font-semibold text-primary">{prog.pct}% <span className="text-muted-foreground font-normal">· {pct}% desta visão</span></span>
        </div>
        <div className="flex items-center">
          {visiveis.map((done, i) => {
            const etapaNum = i + 1;
            const atual = !done && visiveis.slice(0, i).every(Boolean);
            const passos = subpassos[etapaNum] ?? [];
            const herdada = isChild && etapaNum <= 4;
            return (
              <div key={etapaNum} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors cursor-help ${done ? "bg-success text-success-foreground" : atual ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground"}`}
                        aria-label={`Etapa ${etapaNum}`}
                      >
                        {done ? <Check className="h-4 w-4" /> : etapaNum}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[280px] p-3 bg-popover text-popover-foreground border border-border shadow-md">
                      <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 text-primary">
                        Etapa {etapaNum} — {nomes[i]}
                      </div>
                      {herdada && (
                        <div className="text-[10px] text-muted-foreground mb-1.5 italic">Compartilhada com o Empenho Pai · herdada como concluída</div>
                      )}
                      {passos.length === 0 ? (
                        <div className="text-[11px] text-muted-foreground">Sem subpassos detalhados.</div>
                      ) : (
                        <ul className="space-y-1">
                          {passos.map((p, k) => (
                            <li key={k} className="flex items-start gap-1.5 text-[11px]">
                              {p.naoExigido ? (
                                <MinusCircle className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-[1px]" />
                              ) : (herdada || p.ok) ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-[1px]" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-[1px]" />
                              )}
                              <span className={p.naoExigido ? "text-muted-foreground/70" : (herdada || p.ok) ? "text-foreground" : "text-muted-foreground"}>
                                {p.label}{p.naoExigido ? " — não exigido" : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TooltipContent>
                  </Tooltip>
                  <span className={`mt-1 text-[10px] leading-tight text-center max-w-[80px] ${atual ? "font-semibold text-primary" : "text-muted-foreground"}`}>{nomes[i]}</span>
                </div>
                {i < visiveis.length - 1 && <div className={`h-0.5 flex-1 mx-1 -mt-4 rounded ${done ? "bg-success" : "bg-muted"}`} />}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}


function Etapa({
  n,
  titulo,
  done,
  ativa,
  bloqueada,
  colapsada,
  badge,
  destaque,
  children
}: {
  n: number;
  titulo: string;
  done: boolean;
  ativa?: boolean;
  bloqueada?: boolean;
  colapsada?: boolean;
  badge?: React.ReactNode;
  destaque?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Foco dinâmico (deep-link do Digest): rola até a etapa destacada ao abrir.
  useEffect(() => {
    if (destaque && ref.current) {
      const t = setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
      return () => clearTimeout(t);
    }
  }, [destaque]);

  const badgeElement = badge ? badge : (
    done ? <Badge className="bg-success text-success-foreground">Concluída</Badge>
    : bloqueada ? <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />Aguardando etapa anterior</Badge>
    : <Badge variant="outline">Em andamento</Badge>
  );

  // `destaque` força a exibição do conteúdo mesmo quando colapsada (filho) e realça a etapa.
  const oculto = (bloqueada || colapsada) && !destaque;

  return (
    <Card ref={ref} id={`etapa-${n}`} className={`border-l-4 scroll-mt-24 ${done ? "border-l-success" : ativa ? "border-l-primary" : "border-l-muted"} ${oculto ? "opacity-75" : ""} ${destaque ? "ring-2 ring-primary ring-offset-2" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-success text-success-foreground" : "bg-primary/10 text-primary"}`}>{done ? <Check className="h-3.5 w-3.5" /> : n}</span>
          Etapa {n} — {titulo}
          {destaque && <Badge className="bg-primary text-primary-foreground text-[10px] py-0 px-1.5 h-4">foco</Badge>}
        </CardTitle>
        {badgeElement}
      </CardHeader>
      {!oculto && <CardContent className="space-y-3">{children}</CardContent>}
    </Card>
  );
}

function Passo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/10 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{titulo}</div>
      {children}
    </div>
  );
}

function CheckLinha({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)} className={`flex items-start gap-2 text-left text-sm ${disabled ? "opacity-60" : ""}`}>
      {checked ? <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" /> : <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
      <span>{label}</span>
    </button>
  );
}

function SefazConfirm({ em, onToggle, disabled }: { em: string | null; onToggle: (v: string | null) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" disabled={disabled} onClick={() => onToggle(em ? null : new Date().toISOString())} className={disabled ? "opacity-60" : ""}>
        {em ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
      </button>
      <div className="text-sm">
        {em ? <span className="text-success font-medium flex items-center gap-1"><Send className="h-3.5 w-3.5" />Enviado em {dateTime(em)}</span> : <span className="text-muted-foreground">Confirmar envio do processo à SEFAZ</span>}
      </div>
    </div>
  );
}

/** Resumo da prestação de contas do lançamento pago, com link para a página de gestão. */
function PrestacaoResumo({ lanc, convenio }: { lanc: any; convenio: any }) {
  const { data: pc } = useQuery({
    queryKey: ["prestacao", lanc.id],
    queryFn: async () => (await supabase.from("prestacoes_contas").select("*").eq("lancamento_id", lanc.id).maybeSingle()).data as any,
  });
  const sit = situacaoPrestacao(lanc, convenio, pc);
  const status = pc?.status ?? "aguardando";
  const tone = sit.nivel === "ok" ? "border-success/40 bg-success/10" : sit.nivel === "grave" ? "border-destructive/40 bg-destructive/10" : sit.nivel === "alerta" ? "border-warning/40 bg-warning/10" : "border-acp/40 bg-acp/10";
  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${tone}`}>
      <div className="flex items-center gap-3 min-w-0">
        <ClipboardCheck className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="text-sm font-semibold">Prestação de contas · {STATUS_PRESTACAO_LABEL[status]}</div>
          <div className="text-xs text-muted-foreground">
            {sit.label}{sit.prazo ? ` · prazo ${sit.prazo.toLocaleDateString("pt-BR")}` : " · cadastre o prazo no convênio"}
            {!lanc.data_pagamento ? " · informe a Data do Pagamento na Etapa 6 para a contagem correta" : ""}
          </div>
        </div>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link to="/prestacao-contas">Gerenciar na página de Prestação de Contas<ArrowRight className="h-4 w-4 ml-1.5" /></Link>
      </Button>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />{children}</div>;
}
function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return <div><Label className="text-xs flex items-center gap-1">{label}{help && <HelpTip text={help} />}</Label>{children}</div>;
}
function Kpi({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="text-lg font-bold tabular-nums">{value}</div></div>;
}
