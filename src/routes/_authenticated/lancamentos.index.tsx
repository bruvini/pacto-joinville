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
import { LimparFiltrosButton } from "@/components/LimparFiltrosButton";
import { RegistrarDotacaoFonteDialog } from "@/components/lancamentos/RegistrarDotacaoFonteDialog";
import { registrarAcesso } from "@/lib/acesso";
import { brl } from "@/lib/format";
import { ETAPA_NOME, paraAcao, getPendenciasLancamento } from "@/lib/lancamentos/digest";
import { lancamentoAcimaTeto } from "@/lib/lancamentos/limites";
import { etapaCorrenteLabel, emAtraso, vencendoEmBreve, statusConvenioEfetivo, ETAPAS_AGRUPAMENTO, getEtapaAgrupamento, gruposEtapaProcesso } from "@/lib/etapa";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { HelpTip } from "@/components/HelpTip";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { CompetenciaField } from "@/components/inputs/CompetenciaField";
import { HELP } from "@/lib/field-help";
import { toast } from "sonner";
import * as XLSX from "xlsx";

/** Nome completo da etapa (1–7) para o Digest e rótulos. */
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


export const Route = createFileRoute("/_authenticated/lancamentos/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { status?: string; ids?: string } => ({
    status: search.status as string | undefined,
    ids: search.ids as string | undefined,
  }),
  head: () => ({ meta: [{ title: "Lançamentos — Convênios SMS Joinville" }] }),
  component: LancamentosList,
});

function LancamentosList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const canCriar = hasRole(roles, "acp"); // ACP ou admin
  const canRegistrarDotacao = hasRole(roles, "aco"); // UFI ou admin
  const isAdmin = roles.includes("admin");
  const search = Route.useSearch();
  const [filtros, setFiltros] = useState({
    prestador: "",
    competencia: "",
    status: search.status || "all",
  });
  const [idsFiltro, setIdsFiltro] = useState<string[]>(
    () => String(search.ids ?? "").split(",").filter(Boolean),
  );

  useEffect(() => {
    if (search.status) {
      setFiltros((prev) => ({ ...prev, status: search.status ?? "all" }));
    }
    setIdsFiltro(String(search.ids ?? "").split(",").filter(Boolean));
  }, [search.status, search.ids]);

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
    queryFn: async () => {
      const primeira = await supabase
        .from("convenios")
        .select("id, prestador_id, objeto, teto_mensal, dia_inicio_execucao, dia_fim_execucao, data_inicio_vigencia, total_parcelas, status_convenio, exige_relatorio_analise, pagamento_pontual, prazo_atesto_meses, modelo_fluxo")
        .order("created_at", { ascending: false });
      if (!primeira.error) return primeira.data ?? [];

      const fallback = await supabase
        .from("convenios")
        .select("id, prestador_id, objeto, teto_mensal, dia_inicio_execucao, dia_fim_execucao, data_inicio_vigencia, total_parcelas, status_convenio, exige_relatorio_analise, pagamento_pontual, modelo_fluxo")
        .order("created_at", { ascending: false });
      if (fallback.error) throw fallback.error;
      return (fallback.data ?? []).map((convenio: any) => ({
        ...convenio,
        prazo_atesto_meses: 1,
      }));
    },
  });
  const convById = Object.fromEntries((convenios as any[]).map((c) => [c.id, c]));
  const { data: termos = [] } = useQuery({
    queryKey: ["termos_aditivos"],
    queryFn: async () => (await supabase.from("termos_aditivos").select("id, convenio_id, identificador, valor_total").order("data_assinatura", { ascending: false, nullsFirst: false })).data ?? [],
  });
  const termosPorId = useMemo(
    () => new Map((termos as any[]).map((termo) => [termo.id, termo])),
    [termos],
  );
  const conveniosDoPrestador = (convenios as any[]).filter((c) => c.prestador_id === form.prestador_id && statusConvenioEfetivo(c) === "ativo");
  const tasDoConvenio = (termos as any[]).filter((t) => t.convenio_id === form.convenio_id);

  const { data: lancs = [] } = useQuery({
    queryKey: ["lancs"],
    // FALLBACK ABSOLUTO: a listagem nunca pode sumir por causa de uma coluna/tabela
    // recém-criada e ainda não migrada no banco. Tentamos o embed rico (com
    // modelo_fluxo do convênio, para o agrupamento do Fluxo 2); se ele falhar,
    // retrocedemos para um select mínimo e seguro que sempre retorna os processos.
    queryFn: async () => {
      const rica = await supabase.from("lancamentos_pagamento")
        .select("*, prestadores(nome_instituicao), convenios(numero_processo_sei_mae, modelo_fluxo)")
        .order("created_at", { ascending: false });
      if (!rica.error && rica.data) return rica.data;
      const base = await supabase.from("lancamentos_pagamento")
        .select("*, prestadores(nome_instituicao), convenios(numero_processo_sei_mae)")
        .order("created_at", { ascending: false });
      return base.data ?? [];
    },
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

  const vencendoHeranca = (l: any) =>
    vencendoEmBreve(l, convById[l.convenio_id]) ||
    (lancs as any[]).some(
      (filho: any) =>
        filho.parent_id === l.id &&
        vencendoEmBreve(filho, convById[filho.convenio_id]),
    );

  const acimaTetoHeranca = (l: any) =>
    lancamentoAcimaTeto(l, convById[l.convenio_id], termosPorId) ||
    (lancs as any[]).some(
      (filho: any) =>
        filho.parent_id === l.id &&
        lancamentoAcimaTeto(
          filho,
          convById[filho.convenio_id],
          termosPorId,
        ),
    );

  const filtered = useMemo(() => lancs.filter((l: any) => {
    if (l.parent_id) return false;
    if (idsFiltro.length > 0 && !idsFiltro.includes(l.id)) return false;
    if (filtros.prestador && l.prestador_id !== filtros.prestador) return false;
    if (filtros.competencia && !(l.competencia ?? "").includes(filtros.competencia)) return false;
    if (filtros.status !== "all") {
      if (filtros.status === "atrasados") {
        if (!emAtrasoHeranca(l)) return false;
      } else if (filtros.status === "vencendo") {
        if (!vencendoHeranca(l)) return false;
      } else if (filtros.status === "acima-teto") {
        if (!acimaTetoHeranca(l)) return false;
      } else {
        // Filtro por GRUPO de etapa (mesma classificação da tabela e da esteira):
        // o pai entra se qualquer competência filha estiver no grupo selecionado.
        if (!gruposEtapaProcesso(l, lancs as any[]).includes(filtros.status as any)) return false;
      }
    }
    return true;
    // emAtrasoHeranca fecha sobre lancs/convById (já nas deps) — recomputo correto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lancs, filtros, convById, termosPorId, idsFiltro]);

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
        case "convenio": return (convById[e.l.convenio_id]?.objeto ?? e.l.descricao ?? "").toLowerCase();
        case "parcela": return e.l.parcela ?? "";
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
      void registrarAcesso(editId ? "lancamento_editado" : "lancamento_criado", { detalhe: form.descricao || undefined });
      setOpen(false);
      toast.success(editId ? "Lançamento atualizado" : "Lançamento criado");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const excluir = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("lancamentos_pagamento").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lancs"] }); toast.success("Lançamento excluído"); void registrarAcesso("lancamento_excluido"); },
    onError: (e: any) => toast.error(e.message),
  });

  const exportar = () => {
    const fmtDate = (d: any) => (d ? new Date(String(d).length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR") : "");
    const fmtDT = (d: any) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
    const rows = filtered.map((l: any) => {
      const fluxo2 = l.convenios?.modelo_fluxo === "fluxo_2";
      const solic = Number(l.valor_solicitado ?? 0);
      const atest = Number(l.valor_atestado ?? 0);
      const anulado = Number(l.valor_anulado ?? 0) || (atest > 0 ? Math.max(0, solic - atest) : 0);
      const comps = (l.competencia ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
      const isParent = !l.parent_id && comps.length > 1;
      // Status das pendências ativas de cada competência filha (processo pai).
      const filhosDoL = isParent ? (lancs as any[]).filter((c: any) => c.parent_id === l.id) : [];
      const statusFilhos = filhosDoL.length
        ? filhosDoL.map((c: any) => `${c.competencia}: ${c.concluido ? "Concluído" : etapaCorrenteLabel(c)}`).join(" | ")
        : "";
      return {
        "Prestador": l.prestadores?.nome_instituicao ?? "",
        "Processo SEI Mãe": l.convenios?.numero_processo_sei_mae ?? "",
        "Modelo de Fluxo": fluxo2 ? "Fluxo 2 (Liquidação Direta)" : "Fluxo 1 (Padrão Hospitalar)",
        "Convênio": convById[l.convenio_id]?.objeto ?? l.descricao ?? "",
        "Parcela": l.parcela ?? "",
        "Competência": l.competencia ?? "",
        "Mês Pgto Previsto": l.mes_pagamento_previsto ?? "",
        "Etapa Atual": etapaCorrenteLabel(l),
        "Concluído": l.concluido ? "Sim" : "Não",
        "Valor Solicitado": solic,
        "Valor Atestado": atest,
        "Valor Liquidado": fluxo2 ? Number(l.valor_liquidado ?? 0) : "",
        "Valor Efetivamente Anulado": anulado,
        // Datas de passagem por etapa (marcos temporais do processo).
        "Criado em": fmtDT(l.created_at),
        "Envio SEFAZ · Solicitação (Et. 4)": fmtDT(l.sefaz_etapa1_em),
        "Envio SEFAZ · Liberação/Liquidação (Et. 6)": fmtDT(l.sefaz_etapa4_em),
        "Envio SEFAZ · Anulação (Et. 7)": fmtDT(l.sefaz_etapa5_em),
        "Data do Pagamento": fmtDate(l.data_pagamento),
        "Status Competências (Filhos)": statusFilhos,
        "Link Solicitação SEI": l.link_solicitacao_sei ?? "",
        "Nº Empenho": l.numero_empenho ?? "",
        "Link Empenho SEI": l.link_empenho_sei ?? "",
        "Link Solic. Anulação": l.link_solicitacao_anulacao ?? "",
        "Link Anulação SEI": l.link_anulacao_sei ?? "",
        "Dotação Orçamentária": l.dotacao_orcamentaria ?? "",
        "Fonte Pagamento": l.fonte_pagamento ?? "",
        "Status Orçamento (UFI)": l.status_aco ?? "",
      };
    });
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
        <div className="flex flex-wrap gap-2">
          {canRegistrarDotacao && (
            <RegistrarDotacaoFonteDialog
              lancamentos={lancs as any[]}
              convenios={convenios as any[]}
              podeEditar={canRegistrarDotacao}
              onChanged={() => {
                qc.invalidateQueries({ queryKey: ["lancs"] });
              }}
            />
          )}
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 items-end">
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
              <Select
                value={filtros.status}
                onValueChange={(v) => {
                  setIdsFiltro([]);
                  setFiltros({ ...filtros, status: v });
                }}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {ETAPAS_AGRUPAMENTO.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  <SelectItem value="atrasados">Apenas em Atraso</SelectItem>
                  <SelectItem value="vencendo">Próximos do Prazo</SelectItem>
                  <SelectItem value="acima-teto">Acima do Teto Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <LimparFiltrosButton
                ativo={!!filtros.prestador || !!filtros.competencia || filtros.status !== "all"}
                onClear={() => {
                  setIdsFiltro([]);
                  setFiltros({ prestador: "", competencia: "", status: "all" });
                }}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed min-w-[1080px]">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b bg-muted/20">
                <tr>
                  <ThSort col="prestador" sort={sort} onSort={toggleSort} className="py-3 px-3 w-[24%]" align="left">Prestador</ThSort>
                  <ThSort col="convenio" sort={sort} onSort={toggleSort} className="py-3 px-2 w-[22%]" align="left">Convênio</ThSort>
                  <ThSort col="parcela" sort={sort} onSort={toggleSort} className="py-3 px-2 w-[78px]" align="center">Parcela</ThSort>
                  <ThSort col="competencia" sort={sort} onSort={toggleSort} className="py-3 px-2 w-[88px]" align="center">Comp.</ThSort>
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
                        <td colSpan={8} className="py-2 px-3">
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
                        const parcelasContexto = contextual
                          ? [...new Set(kids!.map((c: any) => String(c.parcela ?? "").trim()).filter(Boolean))]
                          : [];
                        const parcelaExibida = parcelasContexto.length
                          ? parcelasContexto.join(", ")
                          : String(l.parcela ?? "").trim();

                        // Herança de atraso (item 2): avulso usa herança do próprio; pai contextual
                        // acende se qualquer filho DESTE grupo estiver em atraso.
                        const rowAtraso = contextual
                          ? kids!.some((c: any) => emAtraso(c, convById[c.convenio_id]))
                          : emAtrasoHeranca(l);

                        return (
                          <Fragment key={expKey}>
                            <tr className={`border-b h-12 ${rowAtraso ? "bg-destructive/10 hover:bg-destructive/15" : "hover:bg-muted/50"}`}>
                              <td className="py-3 px-3 w-[24%] text-left">
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
                              <td className="px-2 w-[22%] text-left">
                                <div
                                  className="truncate max-w-full whitespace-nowrap text-muted-foreground text-sm"
                                  title={convById[l.convenio_id]?.objeto ?? l.descricao ?? ""}
                                >
                                  {convById[l.convenio_id]?.objeto ?? l.descricao ?? "—"}
                                </div>
                              </td>
                              <td
                                className="px-2 w-[78px] text-center whitespace-nowrap text-xs"
                                title={parcelaExibida || "Parcela ainda não informada"}
                              >
                                {parcelaExibida || "—"}
                              </td>
                              <td className="px-2 w-[88px] text-center whitespace-nowrap">
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
                                  <td className="py-2.5 px-3 pl-8 w-[24%] text-left">
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
                                  <td className="px-2 w-[22%] text-left">
                                    <div 
                                      className="truncate max-w-full whitespace-nowrap text-muted-foreground text-xs" 
                                      title={convById[c.convenio_id]?.objeto ?? c.descricao ?? ""}
                                    >
                                      {convById[c.convenio_id]?.objeto ?? c.descricao ?? "—"}
                                    </div>
                                  </td>
                                  <td className="px-2 w-[78px] text-center whitespace-nowrap text-xs text-muted-foreground">{c.parcela ?? "—"}</td>
                                  <td className="px-2 w-[88px] text-center whitespace-nowrap text-xs text-muted-foreground">{c.competencia ?? "—"}</td>
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
                  <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</td></tr>
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

                // Etapa 3 é ato do Pai: para um filho, usa o status de revisão do pai.
                const paiDoL = l.parent_id ? (lancs as any[]).find((p: any) => p.id === l.parent_id) : null;
                const revisaoEfetiva = paiDoL ? (paiDoL.revisao_status ?? l.revisao_status) : l.revisao_status;
                // Blindagem: um lançamento com campos nulos do fluxo antigo (ou de
                // um Fluxo 2 sem os marcos) nunca deve travar o loop de renderização.
                let todasPendencias: { texto: string; critical: boolean; etapa: number }[] = [];
                try {
                  todasPendencias = getPendenciasLancamento(l, lancAssinaturas, teto, convenio, revisaoEfetiva);
                } catch {
                  todasPendencias = [];
                }
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
                          {l.responsavel_atual === "aco" ? "UFI" : l.responsavel_atual?.toUpperCase()}
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
