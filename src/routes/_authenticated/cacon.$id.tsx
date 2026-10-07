import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  FileDown,
  FileText,
  History,
  Send,
  ShieldCheck,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SeiButton, SeiLink } from "@/components/inputs/SeiLink";
import { brl, dateTime } from "@/lib/format";
import { linkValido } from "@/lib/sei";
import { registrarAcesso } from "@/lib/acesso";
import {
  CACON_ETAPAS,
  CACON_STATUS,
  etapa1Completa,
  etapa2Completa,
  etapaAtualCacon,
} from "@/lib/cacon/etapas";
import { gerarHtmlMemorandoCacon, gerarTextoMemorandoCacon } from "@/lib/cacon/memorando";
import { gerarRelatorioExecutivoCacon } from "@/lib/cacon/relatorio";
import { extrairTextoPdfCacon } from "@/lib/cacon/pdf";
import { processarRelatorioCacon } from "@/lib/cacon/processar";
import { auditarDadosCacon, type DadosCaconEditaveis } from "@/lib/cacon/dados";
import { EtapaAuditoriaCacon } from "@/components/cacon/EtapaAuditoriaCacon";

export const Route = createFileRoute("/_authenticated/cacon/$id")({
  head: () => ({ meta: [{ title: "Dieta CACON — Competência" }] }),
  component: CaconDetalhe,
});

const hojeLocal = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

async function sha256Hex(file: File) {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const nomeSeguro = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);

const objetoJson = (valor: unknown): Record<string, any> =>
  valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, any>)
    : {};

function CaconDetalhe() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { user, profile, roles } = useAuth();
  const podeEditar = hasRole(roles, "acp");
  const [etapaAberta, setEtapaAberta] = useState<number | null>(null);
  const etapaInicialRef = useRef<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [linhaDoTempoAberta, setLinhaDoTempoAberta] = useState(false);

  const comp = useQuery({
    queryKey: ["cacon-competencia", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cacon_competencias")
        .select("*, prestadores(id,nome_instituicao,cnpj)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const arquivos = useQuery({
    queryKey: ["cacon-arquivos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cacon_arquivos")
        .select("*")
        .eq("competencia_id", id)
        .order("enviado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const assinaturas = useQuery({
    queryKey: ["cacon-assinaturas", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cacon_assinaturas")
        .select("*")
        .eq("competencia_id", id)
        .order("assinado_em");
      if (error) throw error;
      return data ?? [];
    },
  });

  const logs = useQuery({
    queryKey: ["cacon-logs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cacon_logs")
        .select("*")
        .eq("competencia_id", id)
        .order("ocorrido_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const fiscais = useQuery({
    queryKey: ["cacon-fiscais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assinaturas_config")
        .select("id,nome_servidor,cargo,ativo")
        .eq("cargo", "Fiscal")
        .eq("ativo", true)
        .order("nome_servidor");
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["cacon-competencia", id] });
    qc.invalidateQueries({ queryKey: ["cacon-arquivos", id] });
    qc.invalidateQueries({ queryKey: ["cacon-assinaturas", id] });
    qc.invalidateQueries({ queryKey: ["cacon-logs", id] });
    qc.invalidateQueries({ queryKey: ["cacon-competencias"] });
  };

  const registrarLog = async (acao: string, detalhes: Record<string, unknown> = {}) => {
    if (!user?.id) return;
    const { error } = await supabase.from("cacon_logs").insert({
      competencia_id: id,
      acao,
      detalhes,
      usuario_id: user.id,
      usuario_nome: profile?.nome ?? user.email ?? "Usuário",
    });
    if (!error) qc.invalidateQueries({ queryKey: ["cacon-logs", id] });
  };

  const campoLabel: Record<string, string> = {
    data_recebimento: "Data de recebimento",
    hmsj_memorando_numero: "Nº SEI do Memorando HMSJ",
    hmsj_memorando_link: "Link do Memorando HMSJ",
    hmsj_anexo_numero: "Nº SEI do Anexo CACON",
    hmsj_anexo_link: "Link do Anexo CACON",
    portaria_referencia: "Base normativa",
    portaria_sei_numero: "Nº SEI da Portaria",
    portaria_sei_link: "Link da Portaria",
    sms_memorando_numero: "Nº SEI do Memorando SMS",
    sms_memorando_link: "Link do Memorando SMS",
    sms_memorando_data: "Data do Memorando SMS",
  };

  const salvarCampo = async (campo: string, valor: any) => {
    if (!podeEditar) return false;
    const { error } = await supabase
      .from("cacon_competencias")
      .update({ [campo]: valor || null, updated_by: user?.id ?? null })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    qc.setQueryData(["cacon-competencia", id], (antigo: any) =>
      antigo ? { ...antigo, [campo]: valor || null, updated_at: new Date().toISOString() } : antigo,
    );
    qc.invalidateQueries({ queryKey: ["cacon-competencias"] });

    const label = campoLabel[campo] ?? campo;
    const descricao = campo.endsWith("_link")
      ? `${label} atualizado.`
      : `${label}: ${valor || "removido"}.`;
    await registrarLog("Dados da competência atualizados", {
      campo,
      descricao,
    });
    return true;
  };

  useEffect(() => {
    const atual = comp.data;
    if (
      !podeEditar ||
      !atual ||
      atual.sms_memorando_data ||
      !etapa2Completa(atual)
    )
      return;

    const data = hojeLocal();
    void supabase
      .from("cacon_competencias")
      .update({ sms_memorando_data: data, updated_by: user?.id ?? null })
      .eq("id", id)
      .then(({ error }) => {
        if (error) return;
        qc.setQueryData(["cacon-competencia", id], (antigo: any) =>
          antigo ? { ...antigo, sms_memorando_data: data } : antigo,
        );
      });
  }, [
    podeEditar,
    comp.data?.id,
    comp.data?.processado_em,
    comp.data?.sms_memorando_data,
    id,
    qc,
    user?.id,
  ]);

  const assinar = useMutation({
    mutationFn: async (nome: string) => {
      if (!user?.id) throw new Error("Sessão não identificada.");
      const { error } = await supabase.from("cacon_assinaturas").insert({
        competencia_id: id,
        slot: "fiscal",
        servidor_nome: nome,
        cargo: "Fiscal",
        assinado_por: user.id,
      });
      if (error) throw error;
      await registrarLog("Assinatura fiscal registrada", { servidor_nome: nome });
      await registrarAcesso("assinatura_registrada", {
        detalhe: `${nome} · Fiscal (Dieta CACON ${comp.data?.competencia ?? ""})`,
        rota: `/cacon/${id}`,
      });
    },
    onSuccess: () => {
      toast.success("Assinatura fiscal registrada");
      refresh();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removerAssinatura = useMutation({
    mutationFn: async (assinatura: any) => {
      const { error } = await supabase
        .from("cacon_assinaturas")
        .delete()
        .eq("id", assinatura.id);
      if (error) throw error;
      await registrarLog("Assinatura fiscal removida", {
        servidor_nome: assinatura.servidor_nome,
      });
    },
    onSuccess: () => refresh(),
    onError: (e: any) => toast.error(e.message),
  });

  if (comp.isLoading)
    return <p className="text-sm text-muted-foreground">Carregando competência CACON…</p>;
  if (comp.isError || !comp.data)
    return (
      <Card role="alert">
        <CardContent className="pt-6">
          Não foi possível carregar a competência. {(comp.error as Error)?.message}
        </CardContent>
      </Card>
    );

  const c = comp.data;
  const etapaAtual = etapaAtualCacon(c);
  if (etapaInicialRef.current == null) etapaInicialRef.current = etapaAtual;
  const etapaSelecionada = etapaAberta ?? etapaInicialRef.current ?? etapaAtual;
  const etapa1Ok = etapa1Completa(c);
  const etapa2Ok = etapa2Completa(c);
  const assinaturaFiscalOk = (assinaturas.data ?? []).some((a: any) => a.slot === "fiscal");
  const memoOk = Boolean(
    c.sms_memorando_numero?.trim?.() &&
      linkValido(c.sms_memorando_link ?? "") &&
      c.sms_memorando_data &&
      c.portaria_referencia?.trim?.() &&
      c.portaria_sei_numero?.trim?.(),
  );
  const prontoEncaminhar = etapa2Ok && assinaturaFiscalOk && memoOk;
  const concluida = c.status === "concluida" && Boolean(c.encaminhado_ses_ufi_em);
  const arquivoAtual = (arquivos.data ?? [])[0];
  const eventosTimeline = [...(logs.data ?? [])];
  if (
    c.created_at &&
    !eventosTimeline.some((evento: any) => evento.acao === "Competência CACON criada")
  ) {
    eventosTimeline.push({
      id: "registro-criado",
      acao: "Competência CACON criada",
      ocorrido_em: c.created_at,
      usuario_nome: "Sistema",
      detalhes: {
        descricao: `Registro ${c.competencia} · ${c.prestadores?.nome_instituicao ?? "prestador"} criado no módulo.`,
      },
    });
  }
  eventosTimeline.sort(
    (a: any, b: any) =>
      new Date(b.ocorrido_em).getTime() - new Date(a.ocorrido_em).getTime(),
  );

  const processarArquivo = async (arquivoId: string, pdf: Blob, hash: string) => {
    const extraido = await extrairTextoPdfCacon(pdf);
    if (!extraido.texto)
      throw new Error("O PDF não possui texto extraível. Confirme se o arquivo não é apenas uma imagem digitalizada.");

    return processarRelatorioCacon({
      data: {
        competenciaId: id,
        arquivoId,
        sha256: hash,
        textoPdf: extraido.texto,
        paginas: extraido.paginas,
      },
    });
  };

  const registrarFalhaExtracao = async (
    arquivoId: string,
    hash: string,
    mensagem: string,
  ) => {
    const agora = new Date().toISOString();
    const { error } = await supabase
      .from("cacon_competencias")
      .update({
        total_unidades: null,
        valor_medio_unitario: null,
        valor_medio_dia: null,
        valor_fornecido: null,
        pacientes_oral: null,
        dias_oral: null,
        pacientes_enteral: null,
        dias_enteral: null,
        processado_em: null,
        auditoria: {},
        extracao: {
          versao: 3,
          origem: "pdf_original",
          modo: "falha_extracao",
          status: "requer_preenchimento_manual",
          arquivo_id: arquivoId,
          sha256: hash,
          erro: mensagem,
          tentativa_em: agora,
          confirmada_em: null,
          confirmada_por: null,
          confirmada_por_nome: null,
        },
        updated_by: user?.id ?? null,
      })
      .eq("id", id);
    if (error) throw error;

    await registrarLog("Extração automática CACON não concluída", {
      descricao: `A leitura automática do PDF não fechou os indicadores. Preenchimento manual liberado: ${mensagem}`,
      arquivo_id: arquivoId,
      sha256: hash,
    });
  };

  const confirmarExtracao = async () => {
    if (!podeEditar || !user?.id) return;
    const atual = comp.data;
    if (!atual?.processado_em) {
      toast.error("Não há extração processada para confirmar.");
      return;
    }
    if (Number(atual.auditoria?.criticas ?? 0) > 0) {
      toast.error("Resolva as críticas bloqueantes antes de confirmar a extração.");
      return;
    }

    setBusy("confirmar");
    try {
      const agora = new Date().toISOString();
      const extracao = {
        ...objetoJson(atual.extracao),
        versao: 3,
        status: "confirmada",
        confirmada_em: agora,
        confirmada_por: user.id,
        confirmada_por_nome: profile?.nome ?? user.email ?? "Usuário",
      };
      const { error } = await supabase
        .from("cacon_competencias")
        .update({ extracao, updated_by: user.id })
        .eq("id", id);
      if (error) throw error;

      await registrarLog("Extração CACON conferida e confirmada", {
        descricao: "Usuário conferiu os indicadores extraídos do PDF e confirmou os dados para continuidade do fluxo.",
        modo_extracao: extracao.modo,
      });
      toast.success("Dados extraídos confirmados. Etapa 2 concluída.");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const salvarDadosManuais = async (dados: DadosCaconEditaveis) => {
    if (!podeEditar || !user?.id) return;
    const auditoria = auditarDadosCacon(dados);
    if (auditoria.criticas > 0) {
      toast.error("Os dados manuais possuem campos obrigatórios inválidos.");
      return;
    }

    setBusy("manual");
    try {
      const agora = new Date().toISOString();
      const extracao = {
        ...objetoJson(comp.data?.extracao),
        versao: 3,
        origem: "preenchimento_manual",
        modo: comp.data?.processado_em ? "manual_apos_extracao" : "manual_fallback",
        status: "confirmada",
        preenchido_em: agora,
        confirmada_em: agora,
        confirmada_por: user.id,
        confirmada_por_nome: profile?.nome ?? user.email ?? "Usuário",
      };
      const { error } = await supabase
        .from("cacon_competencias")
        .update({
          ...dados,
          auditoria,
          extracao,
          processado_em: agora,
          updated_by: user.id,
        })
        .eq("id", id);
      if (error) throw error;

      await registrarLog("Dados CACON preenchidos e confirmados manualmente", {
        descricao: `Indicadores conferidos manualmente no PDF; ${auditoria.alertas} alerta(s) de consistência.`,
        origem: extracao.modo,
        valor_fornecido: dados.valor_fornecido,
        total_unidades: dados.total_unidades,
      });
      toast.success("Dados manuais salvos e confirmados.");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const importarPdf = async (file: File) => {
    if (!podeEditar) return;
    let arquivoId: string | null = null;
    let arquivoHash = "";
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
      return toast.error("Envie o relatório CACON em PDF.");
    setBusy("upload");
    try {
      const hash = await sha256Hex(file);
      arquivoHash = hash;
      const path = `${id}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("cacon-arquivos")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;

      const { data: arq, error: metaError } = await supabase
        .from("cacon_arquivos")
        .insert({
          competencia_id: id,
          categoria: "relatorio_cacon",
          nome_original: file.name,
          storage_path: path,
          mime_type: file.type || "application/pdf",
          tamanho: file.size,
          sha256: hash,
          enviado_por: user?.id,
          enviado_por_nome: profile?.nome ?? user?.email,
        })
        .select("*")
        .single();
      if (metaError) {
        await supabase.storage.from("cacon-arquivos").remove([path]);
        throw metaError;
      }
      arquivoId = arq.id;

      await registrarLog("PDF do relatório CACON anexado", {
        descricao: `${file.name} anexado para auditoria · SHA-256 ${hash.slice(0, 12)}…`,
        arquivo_id: arq.id,
      });

      const resultado = await processarArquivo(arq.id, file, hash);
      await registrarAcesso("cacon_relatorio_processado", {
        detalhe: `Dieta CACON ${c.competencia} · ${c.prestadores?.nome_instituicao ?? ""} · ${brl(resultado.resumo?.valor_fornecido ?? 0)}`,
        rota: `/cacon/${id}`,
      });
      toast.success(
        `Relatório processado: ${resultado.auditoria?.criticas ?? 0} crítica(s) e ${resultado.auditoria?.alertas ?? 0} alerta(s). Confira os dados extraídos para concluir a etapa.`,
      );
      refresh();
    } catch (e: any) {
      if (arquivoId && arquivoHash) {
        try {
          await registrarFalhaExtracao(arquivoId, arquivoHash, e.message);
          toast.warning("A extração automática falhou. O preenchimento manual foi liberado.");
          refresh();
        } catch (falha: any) {
          toast.error(falha.message);
        }
      } else {
        toast.error(e.message);
      }
    } finally {
      setBusy(null);
    }
  };

  const reprocessar = async () => {
    if (!arquivoAtual) return toast.error("Nenhum PDF anexado.");
    setBusy("reprocessar");
    try {
      const { data: pdf, error } = await supabase.storage
        .from("cacon-arquivos")
        .download(arquivoAtual.storage_path);
      if (error || !pdf) throw error ?? new Error("Não foi possível baixar o PDF para reprocessamento.");

      const resultado = await processarArquivo(
        arquivoAtual.id,
        pdf,
        String(arquivoAtual.sha256),
      );
      toast.success(
        `Auditoria recalculada: ${resultado.auditoria?.criticas ?? 0} crítica(s), ${resultado.auditoria?.alertas ?? 0} alerta(s).`,
      );
      refresh();
    } catch (e: any) {
      try {
        await registrarFalhaExtracao(
          arquivoAtual.id,
          String(arquivoAtual.sha256),
          e.message,
        );
        toast.warning("A extração automática falhou. O preenchimento manual foi liberado.");
        refresh();
      } catch (falha: any) {
        toast.error(falha.message);
      }
    } finally {
      setBusy(null);
    }
  };

  const encaminhar = async () => {
    if (!prontoEncaminhar)
      return toast.error("Complete o Memorando SMS e registre ao menos uma assinatura fiscal.");
    if (!confirm("Confirmar o encaminhamento do Memorando para SES.UFI e concluir a competência?"))
      return;
    const agora = new Date().toISOString();
    const { error } = await supabase
      .from("cacon_competencias")
      .update({
        status: "concluida",
        encaminhado_ses_ufi_em: agora,
        encaminhado_por: user?.id ?? null,
        encaminhado_por_nome: profile?.nome ?? user?.email,
        updated_by: user?.id ?? null,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);

    await registrarLog("Memorando encaminhado para SES.UFI", {
      descricao: "Competência concluída após encaminhamento do Memorando da SMS.",
      sms_memorando_numero: c.sms_memorando_numero,
    });
    await registrarAcesso("cacon_encaminhado", {
      detalhe: `Dieta CACON ${c.competencia} encaminhada para SES.UFI`,
      rota: `/cacon/${id}`,
    });
    toast.success("Encaminhamento registrado. Competência concluída.");
    refresh();
  };

  const reabrir = async () => {
    if (!podeEditar || !confirm("Reabrir esta competência CACON?")) return;
    const { error } = await supabase
      .from("cacon_competencias")
      .update({
        status: "aberta",
        encaminhado_ses_ufi_em: null,
        encaminhado_por: null,
        encaminhado_por_nome: null,
        updated_by: user?.id ?? null,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    await registrarLog("Competência reaberta");
    toast.success("Competência reaberta");
    refresh();
  };

  const dadosMemorando = {
    ...c,
    sms_memorando_data: c.sms_memorando_data || hojeLocal(),
  };
  const textoMemorando = gerarTextoMemorandoCacon(dadosMemorando);
  const htmlMemorando = gerarHtmlMemorandoCacon(dadosMemorando);

  const gerarRelatorio = async () => {
    const ok = gerarRelatorioExecutivoCacon(
      c,
      arquivos.data ?? [],
      assinaturas.data ?? [],
      logs.data ?? [],
      profile?.nome,
    );
    if (!ok) {
      toast.error("O navegador bloqueou a abertura do relatório. Libere pop-ups para este site e tente novamente.");
      return;
    }

    await supabase
      .from("cacon_competencias")
      .update({ relatorio_gerado_em: new Date().toISOString(), updated_by: user?.id ?? null })
      .eq("id", id);
    await registrarLog("Relatório executivo gerado", {
      descricao: "Relatório executivo da competência aberto para impressão/PDF.",
    });
  };

  const acessivel = (n: number) =>
    n === 1 || (n === 2 && etapa1Ok) || (n === 3 && etapa1Ok && etapa2Ok) || c.status === "concluida";

  return (
    <div className="space-y-4">
      <Link
        to="/cacon"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Dieta CACON
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold text-primary">
            Dieta CACON · {c.competencia}
          </h1>
          <p className="text-sm text-muted-foreground">
            {c.prestadores?.nome_instituicao ?? "Prestador"}
          </p>
        </div>
        <Badge variant={concluida ? "secondary" : "outline"}>
          {CACON_STATUS[c.status] ?? c.status}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLinhaDoTempoAberta(true)}
        >
          <History className="mr-2 h-4 w-4" />
          Linha do tempo
          {eventosTimeline.length > 0 && (
            <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px]">
              {eventosTimeline.length}
            </Badge>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={gerarRelatorio}>
          <FileDown className="mr-2 h-4 w-4" />
          Relatório executivo
        </Button>
        {concluida && podeEditar && (
          <Button variant="outline" size="sm" onClick={reabrir}>
            Reabrir
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Esteira da competência</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          <ol className="flex items-start px-2">
            {CACON_ETAPAS.map((e, index) => {
              const feito =
                e.n === 1
                  ? etapa1Ok
                  : e.n === 2
                    ? etapa2Ok
                    : concluida;
              const corrente = !feito && e.n === etapaAtual;
              const podeAbrir = acessivel(e.n);
              return (
                <li key={e.n} className="relative flex flex-1 flex-col items-center text-center">
                  {index < CACON_ETAPAS.length - 1 && (
                    <span
                      className={`absolute left-1/2 top-4 h-1 w-full ${
                        feito ? "bg-success" : "bg-muted"
                      }`}
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    disabled={!podeAbrir}
                    onClick={() => setEtapaAberta(e.n)}
                    title={podeAbrir ? e.desc : "Conclua a etapa anterior para liberar esta etapa."}
                    className={`relative z-10 grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-bold transition-all ${
                      podeAbrir
                        ? "cursor-pointer hover:-translate-y-0.5 hover:scale-110 hover:shadow-md hover:ring-4 hover:ring-primary/10"
                        : "cursor-not-allowed border-muted bg-muted text-muted-foreground"
                    } ${
                      feito
                        ? "border-success bg-success text-success-foreground"
                        : corrente
                          ? "border-primary bg-primary text-primary-foreground"
                          : podeAbrir
                            ? "border-primary/40 bg-background text-primary"
                            : ""
                    } ${etapaSelecionada === e.n && podeAbrir ? "ring-4 ring-primary/15" : ""}`}
                  >
                    {feito ? <Check className="h-4 w-4" /> : e.n}
                  </button>
                  <span className="mt-2 max-w-[180px] text-xs font-medium">{e.titulo}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Verde = concluída · azul = etapa atual · cinza = ainda não liberada.
          </p>
        </CardContent>
      </Card>

      <Card id="cacon-etapa">
        <CardHeader>
          <CardTitle className="text-base">
            Etapa {etapaSelecionada} — {CACON_ETAPAS[etapaSelecionada - 1].titulo}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {etapaSelecionada === 1 && (
            <EtapaRecebimento
              c={c}
              canEdit={podeEditar && !concluida}
              salvar={salvarCampo}
            />
          )}

          {etapaSelecionada === 2 && (
            <EtapaAuditoriaCacon
              c={c}
              arquivo={arquivoAtual}
              canEdit={podeEditar && !concluida}
              busy={busy}
              importarPdf={importarPdf}
              reprocessar={reprocessar}
              confirmarExtracao={confirmarExtracao}
              salvarManual={salvarDadosManuais}
            />
          )}

          {etapaSelecionada === 3 && (
            <EtapaMemorando
              c={c}
              canEdit={podeEditar && !concluida}
              salvar={salvarCampo}
              texto={textoMemorando}
              html={htmlMemorando}
              fiscais={fiscais.data ?? []}
              assinaturas={assinaturas.data ?? []}
              assinar={(nome) => assinar.mutate(nome)}
              remover={(a) => removerAssinatura.mutate(a)}
              pronto={prontoEncaminhar}
              concluida={concluida}
              encaminhar={encaminhar}
            />
          )}

          <div className="flex items-center justify-between border-t pt-4">
            <Button
              variant="outline"
              disabled={etapaSelecionada <= 1}
              onClick={() => setEtapaAberta(Math.max(1, etapaSelecionada - 1))}
            >
              ← Etapa anterior
            </Button>
            {etapaSelecionada < 3 && (
              <Button
                disabled={
                  (etapaSelecionada === 1 && !etapa1Ok) ||
                  (etapaSelecionada === 2 && !etapa2Ok)
                }
                onClick={() => setEtapaAberta(etapaSelecionada + 1)}
              >
                Próxima etapa →
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={linhaDoTempoAberta} onOpenChange={setLinhaDoTempoAberta}>
        <DialogContent className="max-h-[82vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Linha do tempo · Dieta CACON · {c.competencia}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Trilha auditável das alterações, anexos, análises, assinaturas e encaminhamentos desta competência.
          </p>
          {logs.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando histórico…</p>
          ) : eventosTimeline.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sem eventos registrados ainda.
            </p>
          ) : (
            <ol className="mt-3 space-y-4 border-l-2 border-primary/15 pl-5">
              {eventosTimeline.map((l: any) => (
                <li key={l.id} className="relative text-sm">
                  <span className="absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                  <p className="font-medium">{l.acao}</p>
                  <p className="text-xs text-muted-foreground">
                    {dateTime(l.ocorrido_em)} · {l.usuario_nome ?? "Sistema"}
                  </p>
                  {l.detalhes?.descricao && (
                    <p className="mt-1 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
                      {l.detalhes.descricao}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({
  label,
  value,
  canEdit,
  onSave,
  type = "text",
  placeholder,
}: {
  label: string;
  value?: string | null;
  canEdit: boolean;
  onSave: (v: string) => void | Promise<void>;
  type?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={draft}
        disabled={!canEdit}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== (value ?? "") && onSave(draft)}
      />
    </div>
  );
}

function CampoSei({
  label,
  value,
  canEdit,
  onSave,
}: {
  label: string;
  value?: string | null;
  canEdit: boolean;
  onSave: (v: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div onBlur={() => draft !== (value ?? "") && onSave(draft)}>
        <SeiLink value={draft} editable={canEdit} onChange={setDraft} />
      </div>
    </div>
  );
}

function EtapaRecebimento({
  c,
  canEdit,
  salvar,
}: {
  c: any;
  canEdit: boolean;
  salvar: (campo: string, valor: any) => Promise<boolean>;
}) {
  const ok = etapa1Completa(c);
  return (
    <>
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="mb-1 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Documentos recebidos do HMSJ</h3>
          <Badge className={ok ? "bg-success text-success-foreground" : ""} variant={ok ? "default" : "outline"}>
            {ok ? "Completo" : "Pendente"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Registre a data de recebimento e os documentos SEI que comprovam o envio da produção
          CACON pelo HMSJ.
        </p>
      </div>

      <div className="space-y-4">
        <div className="max-w-[190px]">
          <Campo
            label="Data do recebimento"
            type="date"
            value={c.data_recebimento}
            canEdit={canEdit}
            onSave={(v) => salvar("data_recebimento", v)}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-[190px_minmax(0,1fr)] md:items-end">
          <Campo
            label="Nº SEI do Memorando HMSJ"
            value={c.hmsj_memorando_numero}
            canEdit={canEdit}
            placeholder="30788020"
            onSave={(v) => salvar("hmsj_memorando_numero", v)}
          />
          <CampoSei
            label="Link do Memorando HMSJ no SEI"
            value={c.hmsj_memorando_link}
            canEdit={canEdit}
            onSave={(v) => salvar("hmsj_memorando_link", v)}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-[190px_minmax(0,1fr)] md:items-end">
          <Campo
            label="Nº SEI do Anexo CACON"
            value={c.hmsj_anexo_numero}
            canEdit={canEdit}
            placeholder="30788041"
            onSave={(v) => salvar("hmsj_anexo_numero", v)}
          />
          <CampoSei
            label="Link do Anexo CACON no SEI"
            value={c.hmsj_anexo_link}
            canEdit={canEdit}
            onSave={(v) => salvar("hmsj_anexo_link", v)}
          />
        </div>
      </div>

      {!ok && (
        <p className="text-sm text-amber-700">
          Preencha a data de recebimento, os números SEI e os dois links para liberar a auditoria.
        </p>
      )}
    </>
  );
}

function EtapaMemorando({
  c,
  canEdit,
  salvar,
  texto,
  html,
  fiscais,
  assinaturas,
  assinar,
  remover,
  pronto,
  concluida,
  encaminhar,
}: {
  c: any;
  canEdit: boolean;
  salvar: (campo: string, valor: any) => Promise<boolean>;
  texto: string;
  html: string;
  fiscais: any[];
  assinaturas: any[];
  assinar: (nome: string) => void;
  remover: (assinatura: any) => void;
  pronto: boolean;
  concluida: boolean;
  encaminhar: () => void;
}) {
  const assinados = new Set(assinaturas.map((a) => a.servidor_nome));
  const disponiveis = fiscais.filter((f) => !assinados.has(f.nome_servidor));
  const dataMemo = c.sms_memorando_data || hojeLocal();

  return (
    <>
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="mb-1 flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Memorando da SMS para SES.UFI</h3>
          <Badge className={concluida ? "bg-success text-success-foreground" : ""} variant={concluida ? "default" : "outline"}>
            {concluida ? "Encaminhado" : pronto ? "Pronto para encaminhar" : "Pendente"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Confira a base normativa e os documentos recebidos. O texto é montado automaticamente
          com a produção extraída do PDF e pode ser copiado para o SEI.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border p-4">
          <h4 className="font-semibold">Base normativa</h4>
          <Campo
            label="Norma / referência"
            value={c.portaria_referencia}
            canEdit={canEdit}
            onSave={(v) => salvar("portaria_referencia", v)}
          />
          <Campo
            label="Nº SEI da Portaria vigente"
            value={c.portaria_sei_numero}
            canEdit={canEdit}
            placeholder="Ex.: 0016111061"
            onSave={(v) => salvar("portaria_sei_numero", v)}
          />
          <CampoSei
            label="Link da Portaria no SEI (opcional)"
            value={c.portaria_sei_link}
            canEdit={canEdit}
            onSave={(v) => salvar("portaria_sei_link", v)}
          />
        </div>

        <div className="space-y-4 rounded-xl border p-4">
          <h4 className="font-semibold">Memorando SMS</h4>
          <Campo
            label="Nº SEI do Memorando"
            value={c.sms_memorando_numero}
            canEdit={canEdit}
            placeholder="Ex.: 31029969"
            onSave={(v) => salvar("sms_memorando_numero", v)}
          />
          <CampoSei
            label="Link do Memorando no SEI"
            value={c.sms_memorando_link}
            canEdit={canEdit}
            onSave={(v) => salvar("sms_memorando_link", v)}
          />
          <Campo
            label="Data do Memorando"
            type="date"
            value={dataMemo}
            canEdit={canEdit}
            onSave={(v) => salvar("sms_memorando_data", v)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-3">
          <div className="mr-auto">
            <h4 className="font-semibold">Modelo do Memorando para o SEI</h4>
            <p className="text-xs text-muted-foreground">
              A prévia reproduz a estrutura do documento institucional, inclusive a tabela. Ao copiar,
              o sistema tenta preservar a formatação rica para colagem direta no editor do SEI.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                if ("ClipboardItem" in window && navigator.clipboard?.write) {
                  const item = new ClipboardItem({
                    "text/html": new Blob([html], { type: "text/html" }),
                    "text/plain": new Blob([texto], { type: "text/plain" }),
                  });
                  await navigator.clipboard.write([item]);
                } else {
                  await navigator.clipboard.writeText(texto);
                }
                toast.success("Memorando copiado para colar no SEI");
              } catch {
                await navigator.clipboard.writeText(texto);
                toast.success("Texto do Memorando copiado");
              }
            }}
          >
            <Copy className="mr-1.5 h-4 w-4" />
            Copiar para o SEI
          </Button>
        </div>
        <div className="max-h-[620px] overflow-auto bg-white p-5">
          <div
            className="mx-auto max-w-[900px] text-[14px] leading-relaxed text-slate-950"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      <div className={`rounded-xl border p-4 ${assinaturas.length ? "border-success/40 bg-success/5" : "bg-muted/20"}`}>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h4 className="font-semibold">Assinatura fiscal</h4>
          <Badge variant={assinaturas.length ? "secondary" : "outline"}>
            {assinaturas.length ? `${assinaturas.length} registrada(s)` : "Ao menos 1 obrigatória"}
          </Badge>
        </div>

        <div className="space-y-2">
          {assinaturas.map((a: any) => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
              <Check className="h-4 w-4 text-success" />
              <span className="flex-1">
                <b>{a.servidor_nome}</b>
                <span className="text-muted-foreground"> · {a.cargo}</span>
              </span>
              <span className="text-xs text-muted-foreground">{dateTime(a.assinado_em)}</span>
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  title="Remover assinatura"
                  onClick={() => remover(a)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          {canEdit && disponiveis.length > 0 && (
            <Select value="" onValueChange={assinar}>
              <SelectTrigger className="max-w-lg">
                <SelectValue placeholder="Selecionar Fiscal para registrar assinatura" />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((f: any) => (
                  <SelectItem key={f.id} value={f.nome_servidor}>
                    {f.nome_servidor} · Fiscal
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {canEdit && fiscais.length === 0 && (
            <p className="text-sm text-amber-700">
              Nenhum Fiscal ativo está cadastrado em Configurações → Matriz de Assinaturas SEI.
            </p>
          )}
        </div>
      </div>

      <div className={`rounded-xl border p-4 ${concluida ? "border-success/40 bg-success/5" : ""}`}>
        {concluida ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-success text-success-foreground">
              <Check className="mr-1 h-3.5 w-3.5" />
              Competência concluída
            </Badge>
            <span className="text-sm">
              Encaminhada à <b>SES.UFI</b> em {dateTime(c.encaminhado_ses_ufi_em)} por{" "}
              {c.encaminhado_por_nome ?? "usuário"}.
            </span>
            {linkValido(c.sms_memorando_link ?? "") && (
              <SeiButton href={c.sms_memorando_link} label="Abrir Memorando no SEI" />
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h4 className="font-semibold">Encaminhamento final</h4>
              <p className="text-sm text-muted-foreground">
                Depois do Memorando estar completo e com ao menos uma assinatura fiscal,
                registre o encaminhamento para SES.UFI. Esta ação conclui nossa parte do fluxo.
              </p>
            </div>
            <Button disabled={!canEdit || !pronto} onClick={encaminhar}>
              <Send className="mr-2 h-4 w-4" />
              Encaminhar para SES.UFI
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
