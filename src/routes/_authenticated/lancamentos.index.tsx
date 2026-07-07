import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useState, useMemo, Fragment, useEffect } from "react";
import { Plus, Download, Filter, Pencil, Trash2, ChevronDown, Lock, ClipboardCheck } from "lucide-react";
import { brl } from "@/lib/format";
import { etapaCorrenteLabel, emAtraso, ETAPA_LABELS, statusConvenioEfetivo } from "@/lib/etapa";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { HelpTip } from "@/components/HelpTip";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { CompetenciaField } from "@/components/inputs/CompetenciaField";
import { HELP } from "@/lib/field-help";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const ETAPAS_AGRUPAMENTO = [
  "Solicitação",
  "Análise de Orçamento",
  "Liberação de Orçamento",
  "Liberação de Recurso",
  "Anulação"
] as const;

function getEtapaAgrupamento(l: any): typeof ETAPAS_AGRUPAMENTO[number] {
  const solic = Number(l.valor_solicitado ?? 0);
  const atest = Number(l.valor_atestado ?? 0);
  
  const temAnulacao = atest > 0 && (solic > atest) && (
    l.sefaz_etapa5_em || l.link_solicitacao_anulacao || l.link_anulacao_sei || Number(l.valor_anulado ?? 0) > 0
  );
  
  if (temAnulacao) {
    return "Anulação";
  }

  const label = etapaCorrenteLabel(l);
  if (label === "Solicitação de Empenho") return "Solicitação";
  if (label === "Análise de Orçamento") return "Análise de Orçamento";
  if (label === "Liberação de Orçamento") return "Liberação de Orçamento";
  if (label === "Liberação de Recurso") return "Liberação de Recurso";
  if (label === "Aguardando conclusão" || label === "Concluído") {
    if (atest > 0 && solic > atest) {
      return "Anulação";
    }
    return "Liberação de Recurso";
  }
  return "Solicitação";
}

function getPendenciasLancamento(l: any, assinaturas: any[], teto: number, convenio: any): { texto: string; critical: boolean; etapa: number }[] {
  const pends: { texto: string; critical: boolean; etapa: number }[] = [];
  const solic = Number(l.valor_solicitado ?? 0);
  const atest = Number(l.valor_atestado ?? 0);
  const anular = atest > 0 ? Math.max(0, solic - atest) : 0;
  
  const linkValido = (url: string | null) => !!url && (url.startsWith("http://") || url.startsWith("https://"));
  
  // Etapa 1: Análise Orçamentária
  const s1 = !!l.dotacao_orcamentaria && !!l.fonte_pagamento;
  if (!s1) {
    pends.push({ texto: "Pendente indicação de Dotação Orçamentária e Fonte de Pagamento", critical: true, etapa: 1 });
  }

  // Etapa 2: Solicitação
  const comps = (l.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const isMulti = !l.parent_id && comps.length > 1;
  let justificativasCompletas = true;
  if (isMulti) {
    const pcArr = Array.isArray(l.parcelas_competencia) ? l.parcelas_competencia : [];
    const parcelasExcedentes = teto > 0 ? pcArr.filter((p: any) => Number(p.valor ?? 0) > teto) : [];
    justificativasCompletas = parcelasExcedentes.every((p: any) => !!(p.justificativa_teto && String(p.justificativa_teto).trim()));
  } else {
    const excede = teto > 0 && solic > teto;
    justificativasCompletas = !excede || !!(l.justificativa_teto && String(l.justificativa_teto).trim());
  }

  const temSolic = solic > 0;
  const temSei = linkValido(l.link_solicitacao_sei);
  const temRevisao = !!l.em_bloco_revisao;

  const s2 = temSolic && temSei && temRevisao && justificativasCompletas;
  if (!s2) {
    const isEtapaAtual = s1;
    if (!temSolic) pends.push({ texto: "Falta preencher o Valor Solicitado", critical: isEtapaAtual, etapa: 2 });
    if (!temSei) pends.push({ texto: "Falta Link SEI da Solicitação de Empenho", critical: isEtapaAtual, etapa: 2 });
    if (!temRevisao) pends.push({ texto: "Pendente envio para bloco de revisão", critical: isEtapaAtual, etapa: 2 });
    if (!justificativasCompletas) pends.push({ texto: "Falta Justificativa do Teto Excedente", critical: isEtapaAtual, etapa: 2 });
  }

  // Etapa 3: Revisão
  const s3 = l.revisao_status === "aprovado";
  if (!s3) {
    const isEtapaAtual = s1 && s2;
    pends.push({ 
      texto: l.revisao_status === "negado" 
        ? "Revisão negada pelo Coordenador (ajuste a Solicitação)" 
        : "Aguardando aprovação da revisão pelo Coordenador de Orçamentos", 
      critical: isEtapaAtual, 
      etapa: 3 
    });
  }

  // Etapa 4: Assinaturas da Solicitação (bloco etapa1)
  const ass1 = assinaturas.filter((a) => a.bloco === "etapa1");
  const slotsE1 = [
    { key: "coord_orc", label: "Coordenador de Orçamentos" },
    { key: "fiscal", label: "Fiscal" },
    { key: "gerente", label: "Gerente ou Coordenador ACP" },
    { key: "diretor", label: "Diretor de Serviços Complementares" },
    { key: "financeira", label: "Diretoria Financeira ou Secretária de Saúde" },
  ];
  const faltamAss1: string[] = [];
  slotsE1.forEach((s) => {
    const ok = ass1.some((a) => a.slot === s.key);
    if (!ok) faltamAss1.push(s.label);
  });
  const temSefaz1 = !!l.sefaz_etapa1_em;
  const s4 = faltamAss1.length === 0 && temSefaz1;
  if (!s4) {
    const isEtapaAtual = s1 && s2 && s3;
    faltamAss1.forEach((label) => {
      pends.push({ texto: `Falta assinatura do ${label} na Etapa 4`, critical: isEtapaAtual, etapa: 4 });
    });
    if (!temSefaz1) {
      pends.push({ texto: "Pendente registro de data de envio à SEFAZ na Etapa 4", critical: isEtapaAtual, etapa: 4 });
    }
  }

  // Etapa 5: Liberação de Orçamento
  const temEmp = !!l.numero_empenho;
  const temEmpSei = linkValido(l.link_empenho_sei);
  const ass2 = assinaturas.filter((a) => a.bloco === "libera_orc");
  const slotsE2 = [
    { key: "sefaz", label: "Membro da SEFAZ" },
    { key: "financeira", label: "Diretoria Financeira ou Secretária de Saúde" }
  ];
  const faltamAss2: string[] = [];
  slotsE2.forEach((s) => {
    const ok = ass2.some((a) => a.slot === s.key);
    if (!ok) faltamAss2.push(s.label);
  });
  const s5 = temEmp && temEmpSei && faltamAss2.length === 0;
  if (!s5) {
    const isEtapaAtual = s1 && s2 && s3 && s4;
    if (!temEmp || !temEmpSei) {
      pends.push({ texto: "Falta preencher Número e Link SEI da Nota de Empenho (Etapa 5)", critical: isEtapaAtual, etapa: 5 });
    }
    faltamAss2.forEach((label) => {
      pends.push({ texto: `Falta assinatura do ${label} na Etapa 5`, critical: isEtapaAtual, etapa: 5 });
    });
  }

  // Etapa 6: Liberação de Recurso
  const exigeRelAna = convenio?.exige_relatorio_analise !== false;
  const temRelTec = linkValido(l.link_relatorio_tecnico_sei);
  const temRelAna = !exigeRelAna || linkValido(l.link_relatorio_analise_sei);
  const temCert = linkValido(l.link_certidoes_sei);
  const assRelTec = assinaturas.filter((a) => a.bloco === "rel_tecnico");
  const assRelAna = assinaturas.filter((a) => a.bloco === "rel_analise");
  const assEtapa4 = assinaturas.filter((a) => a.bloco === "etapa4");

  const faltamRelTecAss = assRelTec.length < 3;
  const faltamRelAnaAss = exigeRelAna && assRelAna.length < 1;
  const slotsE4 = [
    { key: "fiscal", label: "Fiscal" },
    { key: "gerente", label: "Gerente ou Coordenador ACP" },
    { key: "diretor", label: "Diretor de Serviços Complementares" },
    { key: "financeira", label: "Diretoria Financeira ou Secretária de Saúde" }
  ];
  const faltamAss4: string[] = [];
  slotsE4.forEach((s) => {
    const ok = assEtapa4.some((a) => a.slot === s.key);
    if (!ok) faltamAss4.push(s.label);
  });

  const temAtest = atest > 0;
  const temSolLib = linkValido(l.link_solicitacao_liberacao_sei);
  const temSefaz4 = !!l.sefaz_etapa4_em;
  const temSub = linkValido(l.link_subempenho_sei);
  const temProg = linkValido(l.link_programacao_pagamento_sei);
  const temCompr = linkValido(l.link_comprovante_pagamento_sei);
  const temDtPag = !!l.data_pagamento;

  const s6 = temRelTec && temRelAna && temCert && !faltamRelTecAss && !faltamRelAnaAss
    && temAtest && temSolLib && faltamAss4.length === 0 && temSefaz4 
    && temSub && temProg && temCompr && temDtPag;
    
  if (!s6) {
    const isEtapaAtual = s1 && s2 && s3 && s4 && s5;
    if (!temRelTec) pends.push({ texto: "Pendente Link SEI do Relatório Técnico na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (exigeRelAna && !linkValido(l.link_relatorio_analise_sei)) pends.push({ texto: "Pendente Link SEI do Relatório de Análise na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temCert) pends.push({ texto: "Pendente Link SEI de Certidões na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (faltamRelTecAss) pends.push({ texto: `Falta colher assinaturas dos Fiscais no Relatório Técnico na Etapa 6 (obtido ${assRelTec.length}/3)`, critical: isEtapaAtual, etapa: 6 });
    if (exigeRelAna && faltamRelAnaAss) pends.push({ texto: "Falta colher assinatura do Fiscal no Relatório de Análise na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temAtest) pends.push({ texto: "Falta preencher o Valor Atestado na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temSolLib) pends.push({ texto: "Falta Link SEI da Solicitação de Liberação na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    faltamAss4.forEach((label) => {
      pends.push({ texto: `Falta assinatura do ${label} na Etapa 6`, critical: isEtapaAtual, etapa: 6 });
    });
    if (!temSefaz4) pends.push({ texto: "Pendente registro de data de envio à SEFAZ na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temSub) pends.push({ texto: "Falta Link SEI do Subempenho na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temProg) pends.push({ texto: "Falta Link SEI da Programação de Pagamento na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temCompr) pends.push({ texto: "Falta Link SEI do Comprovante de Pagamento na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temDtPag) pends.push({ texto: "Falta preencher a Data de Pagamento na Etapa 6", critical: isEtapaAtual, etapa: 6 });
  }

  // Etapa 7: Anulação (opcional)
  const precisaAnular = s6 && anular > 0;
  if (precisaAnular) {
    const temSolAnul = linkValido(l.link_solicitacao_anulacao);
    const temAnulSei = linkValido(l.link_anulacao_sei);
    const assEtapa5 = assinaturas.filter((a) => a.bloco === "etapa5");
    const faltamAss5: string[] = [];
    slotsE1.forEach((s) => {
      const ok = assEtapa5.some((a) => a.slot === s.key);
      if (!ok) faltamAss5.push(s.label);
    });
    const temSefaz5 = !!l.sefaz_etapa5_em;

    const s7 = temSolAnul && temAnulSei && faltamAss5.length === 0 && temSefaz5;
    if (!s7) {
      const isEtapaAtual = s1 && s2 && s3 && s4 && s5 && s6;
      if (!temSolAnul) pends.push({ texto: "Falta Link SEI da Solicitação de Anulação na Etapa 7", critical: isEtapaAtual, etapa: 7 });
      if (!temAnulSei) pends.push({ texto: "Falta Link SEI da Nota de Anulação (Aviso de Movimento) na Etapa 7", critical: isEtapaAtual, etapa: 7 });
      faltamAss5.forEach((label) => {
        pends.push({ texto: `Falta assinatura do ${label} na Etapa 7`, critical: isEtapaAtual, etapa: 7 });
      });
      if (!temSefaz5) pends.push({ texto: "Pendente registro de data de envio à SEFAZ da Anulação na Etapa 7", critical: isEtapaAtual, etapa: 7 });
    }
  }

  return pends;
}

export const Route = createFileRoute("/_authenticated/lancamentos/")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      status: search.status as string | undefined,
    };
  },
  head: () => ({ meta: [{ title: "Lançamentos — Convênios SMS Joinville" }] }),
  component: LancamentosList,
});

function LancamentosList() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canCriar = hasRole(roles, "acp"); // ACP ou admin
  const isAdmin = roles.includes("admin");
  const search = Route.useSearch();
  const [filtros, setFiltros] = useState({ prestador: "", competencia: "", status: search.status || "all", sei: "" });
  
  useEffect(() => {
    if (search.status) {
      setFiltros((prev) => ({ ...prev, status: search.status }));
    }
  }, [search.status]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [digestOpen, setDigestOpen] = useState(false);
  const [form, setForm] = useState({ prestador_id: "", convenio_id: "", termo_aditivo_id: "", descricao: "", competencia: "" });
  const abrirNovo = () => { setEditId(null); setForm({ prestador_id: "", convenio_id: "", termo_aditivo_id: "", descricao: "", competencia: "" }); setOpen(true); };
  const abrirEdicao = (l: any) => { setEditId(l.id); setForm({ prestador_id: l.prestador_id ?? "", convenio_id: l.convenio_id ?? "", termo_aditivo_id: l.termo_aditivo_id ?? "", descricao: l.descricao ?? "", competencia: l.competencia ?? "" }); setOpen(true); };

  const { data: cfgRetro } = useQuery({
    queryKey: ["cfg-retroativo"],
    queryFn: async () => (await supabase.from("sistema_config").select("valor").eq("chave", "modo_retroativo").maybeSingle()).data,
  });
  const retro = cfgRetro?.valor === "1";

  const { data: prestadores = [] } = useQuery({
    queryKey: ["prestadores"],
    queryFn: async () => (await supabase.from("prestadores").select("*").order("nome_instituicao")).data ?? [],
  });
  const { data: convenios = [] } = useQuery({
    queryKey: ["convenios"],
    queryFn: async () => (await supabase.from("convenios").select("id, prestador_id, objeto, dia_inicio_execucao, dia_fim_execucao, data_inicio_vigencia, total_parcelas, status_convenio, exige_relatorio_analise").order("created_at", { ascending: false })).data ?? [],
  });
  const convById = Object.fromEntries((convenios as any[]).map((c) => [c.id, c]));
  const { data: termos = [] } = useQuery({
    queryKey: ["termos_aditivos"],
    queryFn: async () => (await supabase.from("termos_aditivos").select("id, convenio_id, identificador").order("data_assinatura", { ascending: false, nullsFirst: false })).data ?? [],
  });
  const conveniosDoPrestador = (convenios as any[]).filter((c) => c.prestador_id === form.prestador_id && statusConvenioEfetivo(c) === "ativo");
  const tasDoConvenio = (termos as any[]).filter((t) => t.convenio_id === form.convenio_id);

  const { data: lancs = [] } = useQuery({
    queryKey: ["lancs"],
    queryFn: async () => (await supabase.from("lancamentos_pagamento")
      .select("*, prestadores(nome_instituicao), convenios(numero_processo_sei_mae)")
      .order("created_at", { ascending: false })).data ?? [],
  });

  const { data: allAssinaturas = [] } = useQuery({
    queryKey: ["all-assinaturas"],
    queryFn: async () => (await supabase.from("assinaturas_etapa").select("*")).data ?? [],
  });

  const assPorLanc = useMemo(() => {
    const map: Record<string, any[]> = {};
    allAssinaturas.forEach((a: any) => {
      if (!map[a.lancamento_id]) map[a.lancamento_id] = [];
      map[a.lancamento_id].push(a);
    });
    return map;
  }, [allAssinaturas]);

  const filtered = useMemo(() => lancs.filter((l: any) => {
    if (l.parent_id) return false;
    if (filtros.prestador && l.prestador_id !== filtros.prestador) return false;
    if (filtros.competencia && !(l.competencia ?? "").includes(filtros.competencia)) return false;
    if (filtros.status !== "all") {
      if (filtros.status === "atrasados") {
        if (!emAtraso(l, convById[l.convenio_id])) return false;
      } else {
        if (etapaCorrenteLabel(l) !== filtros.status) return false;
      }
    }
    if (filtros.sei && !`${l.link_solicitacao_sei ?? ""} ${l.link_empenho_sei ?? ""} ${l.numero_empenho ?? ""}`.toLowerCase().includes(filtros.sei.toLowerCase())) return false;
    return true;
  }), [lancs, filtros, convById]);

  const isFiltering = filtros.prestador !== "" || filtros.competencia !== "" || filtros.status !== "all" || filtros.sei !== "";

  const activeLancs = useMemo(() => {
    const parentIdsWithChildren = new Set(
      lancs.filter((l: any) => l.parent_id).map((l: any) => l.parent_id)
    );
    return lancs.filter((l: any) => {
      if (l.concluido) return false;
      if (!l.parent_id && parentIdsWithChildren.has(l.id)) {
        const hasChildren = lancs.some((c: any) => c.parent_id === l.id);
        if (hasChildren) return false;
      }
      return true;
    });
  }, [lancs]);

  const novo = useMutation({
    mutationFn: async () => {
      // Competência não pode ser anterior ao início da vigência do convênio.
      const conv = (convenios as any[]).find((c) => c.id === form.convenio_id);
      if (conv?.data_inicio_vigencia && form.competencia) {
        const vig = new Date(conv.data_inicio_vigencia);
        const vy = vig.getFullYear(), vm = vig.getMonth() + 1;
        for (const cstr of form.competencia.split(",").map((s) => s.trim()).filter(Boolean)) {
          const m = cstr.match(/(\d{2})\/(\d{4})/);
          if (m) { const cy = Number(m[2]), cm = Number(m[1]); if (cy < vy || (cy === vy && cm < vm)) throw new Error(`Competência ${cstr} é anterior ao início da vigência do convênio (${String(vm).padStart(2, "0")}/${vy}).`); }
        }
      }
      const dados = {
        prestador_id: form.prestador_id || null,
        convenio_id: form.convenio_id || null,
        termo_aditivo_id: form.termo_aditivo_id || null,
        descricao: form.descricao,
        competencia: form.competencia,
      };
      if (editId) {
        const { error } = await supabase.from("lancamentos_pagamento").update(dados as any).eq("id", editId);
        if (error) throw error;
        return;
      }
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("lancamentos_pagamento").insert({ ...dados, created_by: user.user?.id } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lancs"] });
      setOpen(false);
      toast.success(editId ? "Lançamento atualizado" : "Lançamento criado");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const excluir = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("lancamentos_pagamento").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lancs"] }); toast.success("Lançamento excluído"); },
    onError: (e: any) => toast.error(e.message),
  });

  const exportar = () => {
    const rows = filtered.map((l: any) => ({
      "Prestador": l.prestadores?.nome_instituicao ?? "",
      "Processo SEI Mãe": l.convenios?.numero_processo_sei_mae ?? "",
      "Descrição": l.descricao ?? "",
      "Termo Aditivo": l.termo_aditivo ?? "",
      "Parcela": l.parcela ?? "",
      "Competência": l.competencia ?? "",
      "Mês Pgto Previsto": l.mes_pagamento_previsto ?? "",
      "Valor Solicitado": Number(l.valor_solicitado ?? 0),
      "Link Solicitação SEI": l.link_solicitacao_sei ?? "",
      "Nº Empenho": l.numero_empenho ?? "",
      "Link Empenho SEI": l.link_empenho_sei ?? "",
      "Valor Atestado": Number(l.valor_atestado ?? 0),
      "Valor Anulado": Number(l.valor_anulado ?? 0),
      "Link Solic. Anulação": l.link_solicitacao_anulacao ?? "",
      "Link Anulação SEI": l.link_anulacao_sei ?? "",
      "Dotação Orçamentária": l.dotacao_orcamentaria ?? "",
      "Fonte Pagamento": l.fonte_pagamento ?? "",
      "Status Orçamento (UFI)": l.status_aco ?? "",
      "Etapa Atual": etapaCorrenteLabel(l),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
    XLSX.writeFile(wb, `lancamentos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">Lançamentos de Pagamento</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} de {lancs.length} processos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDigestOpen(true)} className="border-primary/45 text-primary hover:bg-primary/5">
            <ClipboardCheck className="h-4 w-4 mr-2" />Resumo dos Lançamentos (Digest)
          </Button>
          <Button variant="outline" onClick={exportar}><Download className="h-4 w-4 mr-2" />Exportar XLSX</Button>
          {canCriar && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-2" />Novo lançamento</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editId ? "Editar lançamento" : "Novo lançamento de pagamento"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Registre a intenção de iniciar um processo de empenho. Os valores são preenchidos depois, nas etapas.</p>
                <div>
                  <Label>Prestador</Label>
                  <Select value={form.prestador_id} onValueChange={(v) => setForm({ ...form, prestador_id: v, convenio_id: "", descricao: "" })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {prestadores.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="flex items-center gap-1">Convênio / Objeto <HelpTip text="Escolha o convênio do prestador. A descrição vem do objeto cadastrado." /></Label>
                  <Select value={form.convenio_id} onValueChange={(v) => { const c = (convenios as any[]).find((x) => x.id === v); setForm({ ...form, convenio_id: v, termo_aditivo_id: "", descricao: c?.objeto ?? "" }); }} disabled={!form.prestador_id}>
                    <SelectTrigger><SelectValue placeholder={form.prestador_id ? "Selecione o convênio" : "Escolha o prestador primeiro"} /></SelectTrigger>
                    <SelectContent>
                      {conveniosDoPrestador.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum convênio para este prestador.</div>}
                      {conveniosDoPrestador.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.objeto ?? "(sem objeto)"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="flex items-center gap-1">Termo Aditivo (se houver) <HelpTip text="Opcional. Vincule a um termo aditivo do convênio, se aplicável." /></Label>
                  <Select value={form.termo_aditivo_id || "none"} onValueChange={(v) => setForm({ ...form, termo_aditivo_id: v === "none" ? "" : v })} disabled={!form.convenio_id}>
                    <SelectTrigger><SelectValue placeholder="Sem aditivo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem aditivo</SelectItem>
                      {tasDoConvenio.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.identificador}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="flex items-center gap-1">Competência(s) MM/AAAA <HelpTip text={HELP.competencia} /></Label><CompetenciaField value={form.competencia} onChange={(v) => setForm({ ...form, competencia: v })} /></div>
              </div>
              <DialogFooter><Button onClick={() => novo.mutate()} disabled={novo.isPending || !form.prestador_id || !form.competencia}>{editId ? "Salvar" : "Criar"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div>
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />Prestador</Label>
              <Select value={filtros.prestador || "all"} onValueChange={(v) => setFiltros({ ...filtros, prestador: v === "all" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {prestadores.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Competência</Label><Input placeholder="06/2026" value={filtros.competencia} onChange={(e) => setFiltros({ ...filtros, competencia: e.target.value })} /></div>
            <div>
              <Label className="text-xs">Etapa</Label>
              <Select value={filtros.status} onValueChange={(v) => setFiltros({ ...filtros, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {ETAPA_LABELS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  <SelectItem value="atrasados">Apenas em Atraso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Nº SEI / Empenho</Label><Input value={filtros.sei} onChange={(e) => setFiltros({ ...filtros, sei: e.target.value })} /></div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b bg-muted/20">
                <tr>
                  <th className="py-3 px-3">Prestador</th>
                  <th className="py-3 px-2">Descrição</th>
                  <th className="py-3 px-2">Comp.</th>
                  <th className="py-3 px-2 text-right">Solicitado</th>
                  <th className="py-3 px-2 text-right">Atestado</th>
                  <th className="py-3 px-2 text-right">Anulado</th>
                  <th className="py-3 px-2">Etapa</th>
                  <th className="py-3 px-2">Responsável</th>
                  <th className="py-3 pr-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {ETAPAS_AGRUPAMENTO.map((etapa) => {
                  const items = filtered.filter((l: any) => getEtapaAgrupamento(l) === etapa);
                  
                  // Se for Anulação e não houver itens, oculta.
                  // Se estiver filtrando e não houver itens, oculta o grupo inteiro para economizar espaço.
                  if (items.length === 0 && (etapa === "Anulação" || isFiltering)) {
                    return null;
                  }

                  return (
                    <Fragment key={etapa}>
                      {/* Subcabeçalho da Etapa */}
                      <tr className="bg-muted/40 border-y">
                        <td colSpan={9} className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-primary text-xs uppercase tracking-wider">{etapa}</span>
                            <Badge variant="secondary" className="text-[10px] font-medium py-0 px-1.5 h-4">
                              {items.length} {items.length === 1 ? "processo" : "processos"}
                            </Badge>
                          </div>
                        </td>
                      </tr>
                      {items.map((l: any) => {
                        const comps = (l.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
                        const isMulti = comps.length > 1;
                        const isExp = !!expanded[l.id];
                        const children = lancs.filter((c: any) => c.parent_id === l.id).sort((a: any, b: any) => (a.competencia || "").localeCompare(b.competencia || ""));
                        
                        const totalAtestado = children.length > 0
                          ? children.reduce((s: number, c: any) => s + Number(c.valor_atestado ?? 0), 0)
                          : Number(l.valor_atestado ?? 0);
                        const totalAnulado = children.length > 0
                          ? children.reduce((s: number, c: any) => s + Number(c.valor_anulado ?? 0), 0)
                          : Number(l.valor_anulado ?? 0);

                        return (
                          <Fragment key={l.id}>
                            <tr className="border-b hover:bg-muted/40">
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  {isMulti && children.length > 0 && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 p-0 shrink-0"
                                      onClick={() => setExpanded(prev => ({ ...prev, [l.id]: !prev[l.id] }))}
                                    >
                                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExp ? "" : "-rotate-90"}`} />
                                    </Button>
                                  )}
                                  <Link to="/lancamentos/$id" params={{ id: l.id }} className="hover:underline font-medium text-primary">
                                    {l.prestadores?.nome_instituicao ?? "—"}
                                  </Link>
                                </div>
                              </td>
                              <td className="px-2 max-w-[200px] truncate">{l.descricao ?? "—"}</td>
                              <td className="px-2 whitespace-nowrap">{l.competencia ?? "—"}</td>
                              <td className="px-2 text-right tabular-nums">{brl(Number(l.valor_solicitado))}</td>
                              <td className="px-2 text-right tabular-nums">{brl(Number(totalAtestado))}</td>
                              <td className="px-2 text-right tabular-nums">{brl(Number(totalAtestado) > 0 ? Number(totalAnulado) : 0)}</td>
                              <td className="px-2 whitespace-nowrap">
                                <Badge variant="outline" className="text-xs">{etapaCorrenteLabel(l)}</Badge>
                                {emAtraso(l, convById[l.convenio_id]) && <Badge variant="destructive" className="text-xs ml-1">Em atraso</Badge>}
                              </td>
                              <td className="px-2">
                                <Badge className={l.responsavel_atual === "acp" ? "bg-acp text-acp-foreground" : "bg-aco text-aco-foreground"}>
                                  {l.responsavel_atual?.toUpperCase()}
                                </Badge>
                              </td>
                              <td className="pr-4 text-right whitespace-nowrap">
                                {canCriar && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEdicao(l)}><Pencil className="h-3.5 w-3.5" /></Button>}
                                {isAdmin && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Excluir este lançamento?</AlertDialogTitle>
                                        <AlertDialogDescription>Esta ação remove o lançamento e <b>todo o seu histórico, assinaturas e progresso</b>. Não pode ser desfeita.</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => excluir.mutate(l.id)}>Excluir</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </td>
                            </tr>
                            {isMulti && isExp && children.map((c: any) => {
                              const childAtestado = Number(c.valor_atestado ?? 0);
                              const childAnulado = Number(c.valor_anulado ?? 0);
                              const childClickable = retro || (!!l.numero_empenho && !!l.link_empenho_sei);
                              return (
                                <tr key={c.id} className="bg-muted/10 border-b hover:bg-muted/20">
                                  <td className="py-2.5 px-3 pl-8">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-muted-foreground/60 text-xs font-mono">├─</span>
                                      {childClickable ? (
                                        <Link to="/lancamentos/$id" params={{ id: c.id }} className="hover:underline text-xs font-medium text-primary/80">
                                          Competência {c.competencia}
                                        </Link>
                                      ) : (
                                        <span className="text-muted-foreground/60 text-xs font-medium flex items-center gap-1 cursor-not-allowed" title="Aguardando liberação de empenho no pai">
                                          Competência {c.competencia} <Lock className="h-3.5 w-3.5 shrink-0" />
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 max-w-[200px] truncate text-muted-foreground text-xs pl-4">{c.descricao ?? "—"}</td>
                                  <td className="px-2 text-xs text-muted-foreground whitespace-nowrap">{c.competencia ?? "—"}</td>
                                  <td className="px-2 text-right tabular-nums text-xs text-muted-foreground">{brl(Number(c.valor_solicitado))}</td>
                                  <td className="px-2 text-right tabular-nums text-xs text-muted-foreground">{brl(childAtestado)}</td>
                                  <td className="px-2 text-right tabular-nums text-xs text-muted-foreground">{brl(childAtestado > 0 ? childAnulado : 0)}</td>
                                  <td className="px-2 whitespace-nowrap">
                                    <Badge variant="outline" className="text-[11px] py-0">{etapaCorrenteLabel(c)}</Badge>
                                    {emAtraso(c, convById[c.convenio_id]) && <Badge variant="destructive" className="text-[11px] py-0 ml-1">Em atraso</Badge>}
                                  </td>
                                  <td className="px-2">
                                    <Badge className={`text-[10px] py-0 ${c.responsavel_atual === "acp" ? "bg-acp text-acp-foreground" : "bg-aco text-aco-foreground"}`}>
                                      {c.responsavel_atual?.toUpperCase()}
                                    </Badge>
                                  </td>
                                  <td className="pr-4"></td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-4 text-center text-muted-foreground text-xs italic bg-muted/5">
                            Nenhum lançamento nesta etapa.
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={digestOpen} onOpenChange={setDigestOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-primary flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Resumo dos Lançamentos (Digest para Gestores)
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Leitura rápida (1 minuto) focada nos gargalos e pendências ativas do fluxo de empenho.
            </p>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {activeLancs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum lançamento ativo (pendente de conclusão).</p>
            ) : (
              activeLancs.map((l: any) => {
                const convenio = convenios.find((c: any) => c.id === l.convenio_id);
                const aditivo = termos.find((t: any) => t.id === l.termo_aditivo_id);
                const teto = Number(aditivo?.valor_total ?? convenio?.teto_mensal ?? 0);
                const lancAssinaturas = assPorLanc[l.id] ?? [];
                
                const todasPendencias = getPendenciasLancamento(l, lancAssinaturas, teto, convenio);
                const pendenciasReais = todasPendencias.filter(p => p.texto.startsWith("Falta") || p.texto.startsWith("Pendente") || p.texto.startsWith("Aguardando") || p.texto.startsWith("Revisão negada"));
                
                const solic = Number(l.valor_solicitado ?? 0);
                const atest = Number(l.valor_atestado ?? 0);
                const anulado = atest > 0 ? Math.max(0, solic - atest) : 0;

                return (
                  <div key={l.id} className="border rounded-lg p-4 bg-card text-card-foreground shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                      <div>
                        <h3 className="font-semibold text-primary text-sm flex items-center gap-1.5">
                          {l.prestadores?.nome_instituicao ?? "—"}
                          {l.parent_id && <Badge variant="outline" className="text-[10px] py-0 px-1">Sublançamento</Badge>}
                        </h3>
                        <p className="text-xs text-muted-foreground">{l.descricao ?? "—"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Comp. {l.competencia ?? "—"}</Badge>
                        <Badge className="text-xs">{etapaCorrenteLabel(l)}</Badge>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground block">Solicitado</span>
                        <span className="font-semibold tabular-nums">{brl(solic)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Atestado</span>
                        <span className="font-semibold tabular-nums">{brl(atest)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Anulado</span>
                        <span className="font-semibold tabular-nums">{brl(anulado)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Responsável</span>
                        <Badge className={`text-[10px] h-5 ${l.responsavel_atual === "acp" ? "bg-acp text-acp-foreground" : "bg-aco text-aco-foreground"}`}>
                          {l.responsavel_atual?.toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">O que falta para concluir:</h4>
                      {pendenciasReais.length === 0 ? (
                        <p className="text-xs text-success flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" /> Tudo pronto para esta competência (aguardando conclusão formal).
                        </p>
                      ) : (
                        <ul className="space-y-1 mt-1">
                          {pendenciasReais.map((p, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-xs">
                              {p.critical ? (
                                <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 shrink-0 uppercase bg-destructive text-destructive-foreground">Bloqueante</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0 text-muted-foreground uppercase">Futuro</Badge>
                              )}
                              <span className={p.critical ? "font-medium text-foreground" : "text-muted-foreground"}>
                                {p.texto} <span className="text-[10px] text-muted-foreground/70">(Etapa {p.etapa})</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          <DialogFooter className="mt-4 border-t pt-3">
            <Button onClick={() => setDigestOpen(false)}>Fechar Resumo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
