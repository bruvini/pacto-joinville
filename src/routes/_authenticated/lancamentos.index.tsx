import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { Plus, Download, Filter, Pencil, Trash2, ChevronDown, ChevronUp, ChevronsUpDown, Lock, ClipboardCheck, CheckCircle2, ArrowUpRight } from "lucide-react";
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
  "Análise de Orçamento",
  "Solicitação",
  "Revisão",
  "Liberação de Orçamento",
  "Liberação de Recurso",
  "Anulação",
  "Concluídos",
] as const;

const isUrl = (u: any) => !!u && (String(u).startsWith("http://") || String(u).startsWith("https://"));

/** Nome completo da etapa (1–7) para o Digest e rótulos. */
const ETAPA_NOME: Record<number, string> = {
  1: "Análise de Orçamento",
  2: "Solicitação de Empenho",
  3: "Revisão da Coordenação da UFI",
  4: "Assinaturas e Envio (Solicitação)",
  5: "Liberação de Orçamento",
  6: "Liberação de Recurso",
  7: "Anulação de Empenho",
};

/** Reescreve a pendência "Falta/Pendente…" como AÇÃO imperativa para o Digest. */
function paraAcao(texto: string): string {
  const t = texto.replace(/\s*\(Etapa \d+\)\s*$/, "").replace(/\s+na Etapa \d+\b/, "").trim();
  if (/^Falta preencher Número e Link SEI da Nota de Empenho/i.test(t)) return "Registrar Número e Link SEI da Nota de Empenho.";
  if (/^Falta assinatura d/i.test(t)) return t.replace(/^Falta assinatura d/i, "Colher assinatura d") + ".";
  if (/^Falta colher assinatura/i.test(t)) return t.replace(/^Falta colher/i, "Colher") + ".";
  if (/^Falta Link SEI/i.test(t)) return t.replace(/^Falta Link SEI/i, "Anexar o Link SEI") + ".";
  if (/^Falta preencher/i.test(t)) return t.replace(/^Falta preencher\s+(o |a )?/i, "Preencher ") + ".";
  if (/^Falta Justificativa/i.test(t)) return "Preencher a " + t.replace(/^Falta\s+/i, "") + ".";
  if (/^Falta\s+/i.test(t)) return t.replace(/^Falta\s+/i, "Concluir: ") + ".";
  if (/^Pendente registro de data de envio à SEFAZ/i.test(t)) return "Registrar a data de envio à SEFAZ.";
  if (/^Pendente envio para bloco de revisão/i.test(t)) return "Enviar a solicitação para o bloco de revisão.";
  if (/^Pendente\s+/i.test(t)) return t.replace(/^Pendente\s+/i, "Concluir: ") + ".";
  return t.endsWith(".") ? t : t + ".";
}

/** Cabeçalho de coluna clicável para ordenar (asc → desc → sem ordenação). */
function ThSort({ col, sort, onSort, className, align = "left", children }: { col: string; sort: { col: string; dir: "asc" | "desc" } | null; onSort: (c: string) => void; className?: string; align?: "left" | "center" | "right"; children: React.ReactNode }) {
  const active = sort?.col === col;
  const alignTh = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const alignBtn = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={`${className ?? ""} ${alignTh}`}>
      <button type="button" onClick={() => onSort(col)} className={`inline-flex items-center gap-1 w-full hover:text-primary transition-colors ${alignBtn}`}>
        <span>{children}</span>
        {active
          ? (sort!.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function getEtapaAgrupamento(l: any): typeof ETAPAS_AGRUPAMENTO[number] {
  if (l.concluido) return "Concluídos";
  const solic = Number(l.valor_solicitado ?? 0);
  const atest = Number(l.valor_atestado ?? 0);

  const temAnulacao = atest > 0 && (solic > atest) && (
    l.sefaz_etapa5_em || l.link_solicitacao_anulacao || l.link_anulacao_sei || Number(l.valor_anulado ?? 0) > 0
  );
  if (temAnulacao) return "Anulação";

  // Etapa REAL pelo último dado preenchido (retro-safe), da mais avançada p/ a inicial.
  // Etapa 6 — Liberação de Recurso (Fluxo 1) / Liquidação de Despesa (Fluxo 2)
  if (atest > 0 || l.sefaz_etapa4_em || l.data_pagamento
    || isUrl(l.link_relatorio_tecnico_sei) || isUrl(l.link_relatorio_analise_sei) || isUrl(l.link_certidoes_sei)
    || isUrl(l.link_solicitacao_liberacao_sei) || isUrl(l.link_subempenho_sei)
    || isUrl(l.link_programacao_pagamento_sei) || isUrl(l.link_comprovante_pagamento_sei)
    || isUrl(l.link_minuta_sei) || isUrl(l.link_memorando_sei) || isUrl(l.link_portaria_sei)
    || isUrl(l.link_solicitacao_liquidacao_sei) || Number(l.valor_liquidado ?? 0) > 0 || isUrl(l.link_aviso_liquidacao_sei)) return "Liberação de Recurso";
  // Etapa 5 — Liberação de Orçamento (empenho gerado)
  if (l.numero_empenho || isUrl(l.link_empenho_sei)) return "Liberação de Orçamento";
  // Etapa 4 — Assinaturas e Envio da Solicitação: NÃO tem grupo próprio; as
  // assinaturas pertencem à Etapa Mãe (Solicitação), então retorna à Solicitação.
  if (l.revisao_status === "aprovado" || l.sefaz_etapa1_em) return "Solicitação";
  // Etapa 3 — Revisão da Coordenação da UFI (em bloco de revisão / negada)
  if (l.em_bloco_revisao || l.revisao_status === "negado") return "Revisão";
  // Etapa 2 — Solicitação de Empenho
  if (solic > 0 || isUrl(l.link_solicitacao_sei)) return "Solicitação";
  // Etapa 1 — Análise de Orçamento (ou processo recém-criado, ainda na 1ª etapa)
  return "Análise de Orçamento";
}

function getPendenciasLancamento(l: any, assinaturas: any[], teto: number, convenio: any): { texto: string; critical: boolean; etapa: number }[] {
  const pends: { texto: string; critical: boolean; etapa: number }[] = [];
  const fluxo2 = (convenio?.modelo_fluxo ?? l.convenios?.modelo_fluxo) === "fluxo_2";
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
  // Fluxo 2 — Etapa 4 exige exclusivamente Coord. Orçamentos, Fiscal, Membro da Comissão e Financeira/Saúde.
  const slotsAss4 = fluxo2 ? [
    { key: "coord_orc", label: "Coordenador de Orçamentos" },
    { key: "fiscal", label: "Fiscal" },
    { key: "comissao", label: "Membro da Comissão de Gestão e Controle de Despesa" },
    { key: "financeira", label: "Diretoria Financeira ou Secretária de Saúde" },
  ] : slotsE1;
  const faltamAss1: string[] = [];
  slotsAss4.forEach((s) => {
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

  // Etapa 6 — Fluxo 2: Liquidação de Despesa (8 subpassos). Sem Etapa 7 (anulação).
  if (fluxo2) {
    const isEtapaAtual = s1 && s2 && s3 && s4 && s5;
    const assF = (b: string) => assinaturas.filter((a) => a.bloco === b);
    const temMinutaAss = assF("f2_minuta").some((a) => a.slot === "gerente") && assF("f2_minuta").some((a) => a.slot === "diretor");
    const temMemoAss = assF("f2_memorando").some((a) => a.slot === "fiscal") && assF("f2_memorando").some((a) => a.slot === "gerente");
    const temLiqAss = assF("f2_liquidacao").some((a) => a.slot === "fiscal") && assF("f2_liquidacao").some((a) => a.slot === "comissao");
    const temAvisoAss = assF("f2_aviso").some((a) => a.slot === "fiscal") && assF("f2_aviso").some((a) => a.slot === "comissao");
    if (!linkValido(l.link_minuta_sei)) pends.push({ texto: "Falta Link SEI da Minuta na Etapa 6 (Liquidação de Despesa)", critical: isEtapaAtual, etapa: 6 });
    if (!temMinutaAss) pends.push({ texto: "Falta assinatura conjunta (Gerente ACP + Diretor de Serviços Complementares) na Minuta (Etapa 6)", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_memorando_sei)) pends.push({ texto: "Falta Link SEI do Memorando na Etapa 6 (Liquidação de Despesa)", critical: isEtapaAtual, etapa: 6 });
    if (!temMemoAss) pends.push({ texto: "Falta assinatura (Fiscal + Gerente/Coordenador ACP) no Memorando (Etapa 6)", critical: isEtapaAtual, etapa: 6 });
    if (!l.minuta_enc_ses) pends.push({ texto: "Pendente confirmar Minuta encaminhada para SES.UPA e SES.UPA.APA (Etapa 6)", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_portaria_sei)) pends.push({ texto: "Falta Link SEI da Portaria de Divulgação de Recursos na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_solicitacao_liquidacao_sei)) pends.push({ texto: "Falta Link SEI da Solicitação de Subempenho/Liquidação na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!(Number(l.valor_liquidado ?? 0) > 0)) pends.push({ texto: "Falta preencher o Valor Liquidado na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temLiqAss) pends.push({ texto: "Falta assinatura (Fiscal + Membro da Comissão) na Solicitação de Liquidação (Etapa 6)", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_aviso_liquidacao_sei)) pends.push({ texto: "Falta Link SEI do Aviso de Movimento (Empenho em Liquidação) na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!temAvisoAss) pends.push({ texto: "Falta assinatura (Fiscal + Membro da Comissão) no Aviso de Movimento (Etapa 6)", critical: isEtapaAtual, etapa: 6 });
    if (!l.aviso_enc_sefaz) pends.push({ texto: "Pendente confirmar Aviso enviado para SEFAZ.UAF.ADE (Etapa 6)", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_subempenho_sei)) pends.push({ texto: "Falta Link SEI do Aviso de Movimento · Subempenho na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_programacao_pagamento_sei)) pends.push({ texto: "Falta Link SEI da Programação de Pagamento na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!linkValido(l.link_comprovante_pagamento_sei)) pends.push({ texto: "Falta Link SEI do Comprovante de Pagamento na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    if (!l.data_pagamento) pends.push({ texto: "Falta preencher a Data de Pagamento na Etapa 6", critical: isEtapaAtual, etapa: 6 });
    return pends;
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
  const navigate = useNavigate();
  const { roles } = useAuth();
  const canCriar = hasRole(roles, "acp"); // ACP ou admin
  const isAdmin = roles.includes("admin");
  const search = Route.useSearch();
  const [filtros, setFiltros] = useState({ prestador: "", competencia: "", status: search.status || "all" });

  useEffect(() => {
    if (search.status) {
      setFiltros((prev) => ({ ...prev, status: search.status ?? "all" }));
    }
  }, [search.status]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Ordenação por clique no cabeçalho (dentro de cada agrupamento).
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const toggleSort = (col: string) =>
    setSort((s) => (s?.col === col ? (s.dir === "asc" ? { col, dir: "desc" } : null) : { col, dir: "asc" }));
  // "Processos Concluídos" recolhido por padrão (os demais grupos são fixos).
  const [concluidosOpen, setConcluidosOpen] = useState(false);
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
      .select("*, prestadores(nome_instituicao), convenios(numero_processo_sei_mae, modelo_fluxo)")
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

  // Em atraso com HERANÇA pai→filho: o pai herda o atraso de qualquer filho em atraso.
  // (definido antes de `filtered` porque o filtro ?status=atrasados o utiliza)
  const emAtrasoHeranca = (l: any) =>
    emAtraso(l, convById[l.convenio_id]) ||
    (lancs as any[]).some((c: any) => c.parent_id === l.id && emAtraso(c, convById[c.convenio_id]));

  const filtered = useMemo(() => lancs.filter((l: any) => {
    if (l.parent_id) return false;
    if (filtros.prestador && l.prestador_id !== filtros.prestador) return false;
    if (filtros.competencia && !(l.competencia ?? "").includes(filtros.competencia)) return false;
    if (filtros.status !== "all") {
      if (filtros.status === "atrasados") {
        // Correção do filtro por URL: inclui o PAI se ele ou qualquer filho estiver em atraso.
        if (!emAtrasoHeranca(l)) return false;
      } else {
        if (etapaCorrenteLabel(l) !== filtros.status) return false;
      }
    }
    return true;
    // emAtrasoHeranca fecha sobre lancs/convById (já nas deps) — recomputo correto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lancs, filtros, convById]);

  // Total absoluto de processos lançados (processos-pai/avulsos; filhos são parcelas internas).
  const nProcessos = useMemo(() => (lancs as any[]).filter((l: any) => !l.parent_id).length, [lancs]);

  // Pais DUPLICADOS contextualmente: têm filhos espalhados por >1 grupo de etapa.
  const paisDuplicados = useMemo(() => {
    const gruposPorPai = new Map<string, Set<string>>();
    for (const c of lancs as any[]) {
      if (!c.parent_id) continue;
      if (!gruposPorPai.has(c.parent_id)) gruposPorPai.set(c.parent_id, new Set());
      gruposPorPai.get(c.parent_id)!.add(getEtapaAgrupamento(c));
    }
    const s = new Set<string>();
    gruposPorPai.forEach((grupos, pid) => { if (grupos.size > 1) s.add(pid); });
    return s;
  }, [lancs]);

  // Uma "entrada" da tabela: um processo-pai contextualizado a um grupo de etapa
  // (kids = os filhos DAQUELE grupo) ou um processo avulso (kids = null).
  type Entrada = { l: any; kids: any[] | null };
  // Soma um campo considerando os filhos contextuais (ou o próprio, se avulso).
  const somaEntry = (e: Entrada, campo: string) => (e.kids ?? [e.l]).reduce((s: number, x: any) => s + Number(x[campo] ?? 0), 0);

  // Ordena as entradas de um agrupamento conforme a coluna/direção selecionada.
  const ordenarEntries = (arr: Entrada[]) => {
    if (!sort) return arr;
    const val = (e: Entrada) => {
      switch (sort.col) {
        case "prestador": return (e.l.prestadores?.nome_instituicao ?? "").toLowerCase();
        case "descricao": return (e.l.descricao ?? "").toLowerCase();
        case "competencia": return e.l.competencia ?? "";
        case "solicitado": return somaEntry(e, "valor_solicitado");
        case "atestado": return somaEntry(e, "valor_atestado");
        case "anulado": { const at = somaEntry(e, "valor_atestado"); return at > 0 ? somaEntry(e, "valor_anulado") : 0; }
        default: return "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...arr].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "pt-BR") * dir;
    });
  };

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
      const compsForm = form.competencia.split(",").map((s) => s.trim()).filter(Boolean);
      // Competência já lançada para o convênio não pode ser duplicada (mesmo já concluída).
      if (form.convenio_id && compsForm.length > 0) {
        const idsComFilhos = new Set((lancs as any[]).filter((l: any) => l.parent_id).map((l: any) => l.parent_id));
        const existentes = new Set<string>();
        for (const l of lancs as any[]) {
          if (l.convenio_id !== form.convenio_id) continue;
          if (editId && (l.id === editId || l.parent_id === editId)) continue; // ignora a própria família ao editar
          if (idsComFilhos.has(l.id)) continue; // pai é representado pelos filhos
          for (const c of (l.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean)) existentes.add(c);
        }
        const dup = compsForm.find((c) => existentes.has(c));
        if (dup) throw new Error(`Já existe um lançamento para a competência ${dup} neste convênio. Cada competência só pode ser lançada uma vez.`);
      }
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
          <p className="text-sm text-muted-foreground">{nProcessos} processos</p>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 items-end">
            <div>
              <Label className="text-xs flex items-center gap-1 h-4"><Filter className="h-3 w-3" />Prestador</Label>
              <Select value={filtros.prestador || "all"} onValueChange={(v) => setFiltros({ ...filtros, prestador: v === "all" ? "" : v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {prestadores.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome_instituicao}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1 h-4">Competência</Label>
              <Input className="h-9" placeholder="06/2026" value={filtros.competencia} onChange={(e) => setFiltros({ ...filtros, competencia: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1 h-4">Etapa</Label>
              <Select value={filtros.status} onValueChange={(v) => setFiltros({ ...filtros, status: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {ETAPA_LABELS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  <SelectItem value="atrasados">Apenas em Atraso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed min-w-[960px]">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b bg-muted/20">
                <tr>
                  <ThSort col="prestador" sort={sort} onSort={toggleSort} className="py-3 px-3 w-[28%]" align="left">Prestador</ThSort>
                  <ThSort col="descricao" sort={sort} onSort={toggleSort} className="py-3 px-2 w-[24%]" align="left">Descrição</ThSort>
                  <ThSort col="competencia" sort={sort} onSort={toggleSort} className="py-3 px-2 w-[80px]" align="center">Comp.</ThSort>
                  <ThSort col="solicitado" sort={sort} onSort={toggleSort} className="py-3 px-2 w-[120px]" align="right">Solicitado</ThSort>
                  <ThSort col="atestado" sort={sort} onSort={toggleSort} className="py-3 px-2 w-[120px]" align="right">Atestado</ThSort>
                  <ThSort col="anulado" sort={sort} onSort={toggleSort} className="py-3 px-2 w-[120px]" align="right">Anulado</ThSort>
                  <th className="py-3 pr-4 w-[80px] text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {ETAPAS_AGRUPAMENTO.map((etapa) => {
                  // Entradas do grupo:
                  //  - processo avulso (sem filhos): entra pelo seu PRÓPRIO grupo de etapa.
                  //  - processo-pai (com filhos): aparece em CADA grupo onde tenha ≥1 filho,
                  //    contextualizado somente aos filhos daquele grupo (item 3).
                  const entriesRaw: Entrada[] = [];
                  for (const l of filtered as any[]) {
                    const kids = (lancs as any[]).filter((c: any) => c.parent_id === l.id);
                    if (kids.length > 0) {
                      const kidsHere = kids
                        .filter((c: any) => getEtapaAgrupamento(c) === etapa)
                        .sort((a: any, b: any) => (a.competencia || "").localeCompare(b.competencia || ""));
                      if (kidsHere.length > 0) entriesRaw.push({ l, kids: kidsHere });
                    } else if (getEtapaAgrupamento(l) === etapa) {
                      entriesRaw.push({ l, kids: null });
                    }
                  }
                  const entries = ordenarEntries(entriesRaw);
                  const isConcluidos = etapa === "Concluídos";
                  const colapsado = isConcluidos && !concluidosOpen;

                  // Com 8 grupos, oculta qualquer grupo vazio para manter o grid enxuto.
                  if (entries.length === 0) return null;

                  return (
                    <Fragment key={etapa}>
                      {/* Subcabeçalho da Etapa — só "Concluídos" é recolhível. */}
                      <tr className={`border-y ${isConcluidos ? "bg-green-100/40 dark:bg-green-900/20 cursor-pointer select-none" : "bg-muted/40"}`}
                          onClick={isConcluidos ? () => setConcluidosOpen((v) => !v) : undefined}>
                        <td colSpan={7} className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            {isConcluidos && <ChevronDown className={`h-4 w-4 text-green-700 dark:text-green-400 transition-transform ${concluidosOpen ? "" : "-rotate-90"}`} />}
                            <span className={`font-semibold text-xs uppercase tracking-wider ${isConcluidos ? "text-green-700 dark:text-green-400" : "text-primary"}`}>{isConcluidos ? "✓ Processos Concluídos" : etapa}</span>
                            <Badge variant="secondary" className="text-[10px] font-medium py-0 px-1.5 h-4">
                              {entries.length} {entries.length === 1 ? "processo" : "processos"}
                            </Badge>
                            {isConcluidos && <span className="text-[10px] text-muted-foreground normal-case">{concluidosOpen ? "(clique para recolher)" : "(clique para expandir)"}</span>}
                          </div>
                        </td>
                      </tr>
                      {!colapsado && entries.map(({ l, kids }) => {
                        const contextual = kids !== null; // pai com filhos DESTE grupo
                        const comps = (l.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
                        const expKey = `${l.id}:${etapa}`;
                        const isExp = !!expanded[expKey];

                        const totalSolic = contextual ? kids!.reduce((s: number, c: any) => s + Number(c.valor_solicitado ?? 0), 0) : Number(l.valor_solicitado ?? 0);
                        const totalAtestado = contextual ? kids!.reduce((s: number, c: any) => s + Number(c.valor_atestado ?? 0), 0) : Number(l.valor_atestado ?? 0);
                        const totalAnulado = contextual ? kids!.reduce((s: number, c: any) => s + Number(c.valor_anulado ?? 0), 0) : Number(l.valor_anulado ?? 0);

                        // Herança de atraso (item 2): avulso usa herança do próprio; pai contextual
                        // acende se qualquer filho DESTE grupo estiver em atraso.
                        const rowAtraso = contextual
                          ? kids!.some((c: any) => emAtraso(c, convById[c.convenio_id]))
                          : emAtrasoHeranca(l);

                        return (
                          <Fragment key={expKey}>
                            <tr className={`border-b h-12 ${rowAtraso ? "bg-destructive/10 hover:bg-destructive/15" : "hover:bg-muted/50"}`}>
                              <td className="py-3 px-3 w-[28%] text-left">
                                <div className="flex items-center gap-2 max-w-full">
                                  {contextual && kids!.length > 0 && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 p-0 shrink-0"
                                      onClick={() => setExpanded(prev => ({ ...prev, [expKey]: !prev[expKey] }))}
                                    >
                                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExp ? "" : "-rotate-90"}`} />
                                    </Button>
                                  )}
                                  <Link
                                    to="/lancamentos/$id"
                                    params={{ id: l.id }}
                                    className="hover:underline font-medium text-primary truncate max-w-full block whitespace-nowrap text-sm"
                                    title={l.prestadores?.nome_instituicao ?? ""}
                                  >
                                    {l.prestadores?.nome_instituicao ?? "—"}
                                  </Link>
                                  {contextual && paisDuplicados.has(l.id) && (
                                    <Badge variant="outline" className="text-[9px] shrink-0 py-0 px-1.5 border-primary/40 text-primary/80 font-normal whitespace-nowrap">Pai · parcelas nesta etapa</Badge>
                                  )}
                                  {rowAtraso && <Badge variant="destructive" className="text-[10px] shrink-0 py-0 px-1.5">Em atraso</Badge>}
                                </div>
                              </td>
                              <td className="px-2 w-[24%] text-left">
                                <div
                                  className="truncate max-w-full whitespace-nowrap text-muted-foreground text-sm"
                                  title={l.descricao ?? ""}
                                >
                                  {l.descricao ?? "—"}
                                </div>
                              </td>
                              <td className="px-2 w-[80px] text-center whitespace-nowrap">
                                {contextual
                                  ? <Badge variant="secondary" className="text-[10px] py-0 px-1.5" title={kids!.map((c: any) => c.competencia).join(", ")}>{kids!.length} comp.</Badge>
                                  : comps.length > 1
                                    ? <Badge variant="secondary" className="text-[10px] py-0 px-1.5" title={l.competencia ?? ""}>{comps.length} comp.</Badge>
                                    : (l.competencia ?? "—")}
                              </td>
                              <td className="px-2 w-[120px] text-right tabular-nums whitespace-nowrap">{brl(Number(totalSolic))}</td>
                              <td className="px-2 w-[120px] text-right tabular-nums whitespace-nowrap">{brl(Number(totalAtestado))}</td>
                              <td className="px-2 w-[120px] text-right tabular-nums whitespace-nowrap">{brl(Number(totalAtestado) > 0 ? Number(totalAnulado) : 0)}</td>
                              <td className="pr-4 w-[80px] text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1">
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
                                </div>
                              </td>
                            </tr>
                            {contextual && isExp && kids!.map((c: any) => {
                              const childAtestado = Number(c.valor_atestado ?? 0);
                              const childAnulado = Number(c.valor_anulado ?? 0);
                              const childClickable = retro || (!!l.numero_empenho && !!l.link_empenho_sei);
                              const childAtraso = emAtraso(c, convById[c.convenio_id]);
                              return (
                                <tr key={c.id} className={`border-b h-10 ${childAtraso ? "bg-destructive/10 hover:bg-destructive/15" : "bg-muted/10 hover:bg-muted/50"}`}>
                                  <td className="py-2.5 px-3 pl-8 w-[28%] text-left">
                                    <div className="flex items-center gap-1.5 max-w-full">
                                      <span className="text-muted-foreground/60 text-xs font-mono shrink-0">├─</span>
                                      {childClickable ? (
                                        <Link 
                                          to="/lancamentos/$id" 
                                          params={{ id: c.id }} 
                                          className="hover:underline text-xs font-medium text-primary/80 truncate block whitespace-nowrap"
                                          title={`Competência ${c.competencia}`}
                                        >
                                          Competência {c.competencia}
                                        </Link>
                                      ) : (
                                        <span 
                                          className="text-muted-foreground/60 text-xs font-medium flex items-center gap-1 cursor-not-allowed truncate whitespace-nowrap" 
                                          title="Aguardando liberação de empenho no pai"
                                        >
                                          Competência {c.competencia} <Lock className="h-3.5 w-3.5 shrink-0" />
                                        </span>
                                      )}
                                      {childAtraso && <Badge variant="destructive" className="text-[10px] py-0 px-1 shrink-0">Em atraso</Badge>}
                                    </div>
                                  </td>
                                  <td className="px-2 w-[24%] text-left">
                                    <div 
                                      className="truncate max-w-full whitespace-nowrap text-muted-foreground text-xs" 
                                      title={c.descricao ?? ""}
                                    >
                                      {c.descricao ?? "—"}
                                    </div>
                                  </td>
                                  <td className="px-2 w-[80px] text-center whitespace-nowrap text-xs text-muted-foreground">{c.competencia ?? "—"}</td>
                                  <td className="px-2 w-[120px] text-right tabular-nums whitespace-nowrap text-xs text-muted-foreground">{brl(Number(c.valor_solicitado))}</td>
                                  <td className="px-2 w-[120px] text-right tabular-nums whitespace-nowrap text-xs text-muted-foreground">{brl(childAtestado)}</td>
                                  <td className="px-2 w-[120px] text-right tabular-nums whitespace-nowrap text-xs text-muted-foreground">{brl(childAtestado > 0 ? childAnulado : 0)}</td>
                                  <td className="pr-4 w-[80px] text-right whitespace-nowrap"></td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</td></tr>
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
                const convenio: any = convenios.find((c: any) => c.id === l.convenio_id);
                const aditivo: any = termos.find((t: any) => t.id === l.termo_aditivo_id);
                const teto = Number(aditivo?.valor_total ?? convenio?.teto_mensal ?? 0);
                const lancAssinaturas = assPorLanc[l.id] ?? [];
                
                const todasPendencias = getPendenciasLancamento(l, lancAssinaturas, teto, convenio);
                // Divulgação progressiva (fim do dump): considera apenas as pendências
                // BLOQUEANTES da ETAPA ATUAL REAL (a menor etapa com bloqueio). Nada de
                // subpassos/assinaturas de etapas futuras.
                const criticas = todasPendencias.filter(p => p.critical && (p.texto.startsWith("Falta") || p.texto.startsWith("Pendente") || p.texto.startsWith("Aguardando") || p.texto.startsWith("Revisão negada")));
                const etapaAtual = criticas.length ? Math.min(...criticas.map(p => p.etapa)) : null;
                const acoesAtuais = etapaAtual ? criticas.filter(p => p.etapa === etapaAtual) : [];
                
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/5"
                          title="Abrir o processo já na etapa retida"
                          onClick={() => {
                            setDigestOpen(false); // fecha o Digest
                            navigate({ to: "/lancamentos/$id", params: { id: l.id }, search: { foco: etapaAtual ?? undefined } });
                          }}
                        >
                          Abrir processo <ArrowUpRight className="h-3.5 w-3.5" />
                        </Button>
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
                      {acoesAtuais.length === 0 || etapaAtual === null ? (
                        <p className="text-xs text-success flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" /> Tudo pronto para esta competência (aguardando conclusão formal).
                        </p>
                      ) : (
                        <>
                          <div className="text-xs">
                            <span className="font-semibold text-muted-foreground uppercase tracking-wider">Status atual: </span>
                            <span className="font-semibold text-destructive">Retido na Etapa {etapaAtual} — {ETAPA_NOME[etapaAtual]}</span>
                          </div>
                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-1.5">Ação imediata necessária:</div>
                          <ul className="mt-0.5 space-y-0.5 list-disc pl-5">
                            {acoesAtuais.map((p, idx) => (
                              <li key={idx} className="text-xs text-foreground">{paraAcao(p.texto)}</li>
                            ))}
                          </ul>
                        </>
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
