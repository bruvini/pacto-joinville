import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SeiButton } from "@/components/inputs/SeiLink";
import { linkValido } from "@/lib/sei";
import { CampoBlur } from "@/components/piso/campos";
import { DocumentoCard } from "@/components/piso/DocumentoCard";
import {
  ArquivosEvidencia,
  enviarArquivo,
  rollbackArquivoProcessavel,
} from "@/components/piso/ArquivosEvidencia";
import {
  auditarPlanilhaCarga,
  lerPlanilhaComCabecalho,
} from "@/lib/piso/planilha";
import {
  auditarInvestsus,
  INVESTSUS_AUDIT_RULES_VERSION,
} from "@/lib/piso/investsus";
import { statusParticipantePiso } from "@/lib/piso/status";
import { atraso, formatarDataIso, prazosEtapa1Piso } from "@/lib/piso/prazos";
import { periodoAfcDocumentoPiso } from "@/lib/piso/parcelas";
import {
  acharDoc,
  docCompleto,
  dentroTolerancia,
  elegiveis,
  encaminhado,
  soma,
  transferenciaFederalEsperada,
  urlDouValida,
  type CtxPiso,
} from "@/lib/piso/regras";
import { brl } from "@/lib/format";
import {
  competenciaExtenso,
  dataExtensoMunicipal,
  gerarMemorandoMunicipal,
  gerarMinutaMunicipal,
  notaFederalMunicipal,
  numeroSeiComAno,
  rotuloPortariaFederal,
  type DadosModeloMunicipal,
  type LinhaAnexoMunicipal,
} from "@/lib/piso/municipal";
import { EtapaNotificacaoEmail } from "@/components/piso/EtapaNotificacaoEmail";
import { processarEvidenciaPiso } from "@/lib/piso/processamento";

interface Props {
  n: number;
  ctx: CtxPiso;
  arquivos: any[];
  pool: any[];
  cnes: any[];
  feriados: any[];
  ocorrencias: any[];
  canEdit: boolean;
  usuarioNome?: string | null;
  onChange: () => void;
}

const nomeInst = (p: any) => p?.prestadores?.nome_instituicao ?? "Instituição";
const ultimoArquivo = (arquivos: any[], categoria: string, participanteId?: string) =>
  arquivos
    .filter(
      (a) =>
        a.categoria === categoria &&
        (participanteId === undefined || a.participante_id === participanteId),
    )
    .sort((a, b) => b.enviado_em.localeCompare(a.enviado_em))[0];

export function EtapaPiso({
  n,
  ctx,
  arquivos,
  pool,
  cnes,
  ocorrencias,
  canEdit,
  usuarioNome,
  onChange,
}: Props) {
  const c = ctx.comp,
    cid = c.id as string,
    dis = !canEdit;
  const [busy, setBusy] = useState<string | null>(null);
  const [municipalDraft, setMunicipalDraft] = useState<Record<string, any>>(
    c.municipal_config ?? {},
  );
  const municipalDraftRef = useRef<Record<string, any>>(c.municipal_config ?? {});
  useEffect(() => {
    const atual = c.municipal_config ?? {};
    municipalDraftRef.current = atual;
    setMunicipalDraft(atual);
  }, [c.municipal_config]);
  const err = (e: any) => toast.error(e.message ?? String(e));
  const saveComp = async (campo: string, valor: any) => {
    const { error } = await (supabase as any).from("piso_competencias").update({ [campo]: valor }).eq("id", cid);
    if (error) { err(error); return false; }
    onChange();
    return true;
  };
  const savePart = async (pid: string, campo: string, valor: any) => {
    const { data, error } = await (supabase as any)
      .from("piso_participantes")
      .update({ [campo]: valor })
      .eq("id", pid)
      .eq("competencia_id", cid)
      .select("id")
      .single();
    if (error) { err(error); return false; }
    if (data?.id !== pid) {
      err(new Error("O sistema não confirmou o participante atualizado. Recarregue a competência e tente novamente."));
      return false;
    }
    onChange();
    return true;
  };
  const saveObrig = async (oid: string, campo: string, valor: any) => {
    const { error } = await (supabase as any).from("piso_obrigacoes").update({ [campo]: valor }).eq("id", oid);
    if (error) { err(error); return false; }
    onChange();
    return true;
  };
  const doc = (
    tipo: string,
    extra: {
      participanteId?: string;
      obrigacaoId?: string;
      encaminhavel?: boolean;
      canEditOverride?: boolean;
      destinoEncaminhamento?: string;
    } = {},
  ) => (
    <DocumentoCard
      key={tipo + (extra.obrigacaoId ?? "")}
      ctx={ctx}
      competenciaId={cid}
      tipo={tipo}
      participanteId={extra.participanteId ?? null}
      obrigacaoId={extra.obrigacaoId ?? null}
      pool={pool}
      canEdit={extra.canEditOverride ?? canEdit}
      encaminhavel={extra.encaminhavel}
      destinoEncaminhamento={extra.destinoEncaminhamento}
      onChange={onChange}
    />
  );
  const eleg = elegiveis(ctx.parts);
  const observacao13 = c.tipo_parcela === "decimo_terceiro" ? (
    <p role="note" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
      13ª parcela da AFC · exercício {c.exercicio_referencia}. Valores, memória de cálculo,
      portaria e pagamento são próprios desta parcela. Não utilize a soma ou a média
      das competências mensais como valor automático. Confirme as regras vigentes do Ministério
      da Saúde para o exercício, inclusive proporcionalidade e tempo efetivamente trabalhado.
    </p>
  ) : null;
  const prazosEtapa1 = c.tipo_parcela === "decimo_terceiro"
    ? { envioInstituicoes: null, retornoInstituicoes: null, envioInvestsus: null }
    : prazosEtapa1Piso(c.competencia);
  const prazoEnvio = prazosEtapa1.envioInstituicoes;
  const prazoRetorno = prazosEtapa1.retornoInstituicoes;
  const prazoInvestsus = prazosEtapa1.envioInvestsus;

  const importarCarga = async (p: any, file: File) => {
    if (!p.data_retorno)
      return toast.error("Informe a data do retorno antes de anexar a Planilha de Carga.");
    const cnesPermitidos = cnes
      .filter((x) => x.prestador_id === p.prestador_id)
      .map((x) => x.cnes)
      .filter(Boolean);
    if (!cnesPermitidos.length)
      return toast.error("Cadastre ao menos um CNES no prestador antes de auditar a Planilha de Carga.");

    setBusy(`carga-${p.id}`);
    let arq: any = null;
    try {
      const rows = await lerPlanilhaComCabecalho(await file.arrayBuffer());
      auditarPlanilhaCarga(rows, cnesPermitidos);

      arq = await enviarArquivo(file, cid, "planilha_carga", p.id, true);
      const resultado = await processarEvidenciaPiso(cid, arq.id, "planilha_carga");
      toast.success(
        `Planilha original preservada e auditada no servidor: ${resultado.audit?.linhas ?? 0} registros, ${resultado.audit?.erros ?? 0} erro(s) e ${resultado.audit?.alertas ?? 0} alerta(s).`,
      );
      onChange();
    } catch (e) {
      if (arq && !arq.reutilizado) await rollbackArquivoProcessavel(arq);
      onChange();
      err(e);
    } finally {
      setBusy(null);
    }
  };

  const reprocessarCarga = async (p: any, arq: any) => {
    setBusy(`carga-reprocess-${p.id}`);
    try {
      const resultado = await processarEvidenciaPiso(cid, arq.id, "planilha_carga");
      toast.success(
        `Planilha auditada no servidor: ${resultado.audit?.linhas ?? 0} registros, ${resultado.audit?.erros ?? 0} erro(s) e ${resultado.audit?.alertas ?? 0} alerta(s).`,
      );
      onChange();
    } finally {
      setBusy(null);
    }
  };

  const importarInvestsus = async (file: File) => {
    setBusy("investsus");
    try {
      // Pré-validação local apenas para feedback imediato. Os valores oficiais
      // são recalculados no servidor a partir do arquivo preservado no Storage.
      const categoria = c.tipo_parcela === "decimo_terceiro" ? "afc13_cnes" : "investsus";
      if (categoria === "investsus") {
        const rows = await lerPlanilhaComCabecalho(await file.arrayBuffer(), "investsus");
        auditarInvestsus(rows);
      }
      const arq = await enviarArquivo(file, cid, categoria);
      const resultado = await processarEvidenciaPiso(cid, arq.id);
      toast.success(c.tipo_parcela === "decimo_terceiro"
        ? `Memória da 13ª conciliada no servidor: ${resultado.audit?.linhas ?? 0} CNES.`
        : `InvestSUS processado no servidor: ${resultado.audit?.linhas ?? 0} registros, ${resultado.conciliacao?.criticas ?? 0} crítica(s) e ${resultado.conciliacao?.alertas ?? 0} alerta(s).`);
      onChange();
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  };

  const reprocessarInvestsus = async () => {
    const arq = ultimoArquivo(arquivos,
      c.tipo_parcela === "decimo_terceiro" ? "afc13_cnes" : "investsus");
    if (!arq) return toast.error("Nenhuma memória do InvestSUS/AFC foi anexada.");
    setBusy("investsus-reprocess");
    try {
      const resultado = await processarEvidenciaPiso(cid, arq.id);
      toast.success(
        `Auditoria recalculada no servidor: ${resultado.audit?.linhas ?? 0} registros, ${resultado.conciliacao?.criticas ?? 0} crítica(s) e ${resultado.conciliacao?.alertas ?? 0} alerta(s).`,
      );
      onChange();
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  };

  const importarPortaria = async (file: File) => {
    setBusy("portaria");
    try {
      const arq = await enviarArquivo(file, cid, "portaria_gm");
      const resultado = await processarEvidenciaPiso(cid, arq.id);
      const dados = resultado.dados ?? {};
      dados.campos_nao_extraidos?.length
        ? toast.warning(
            `PDF processado no servidor. Confira manualmente: ${dados.campos_nao_extraidos.join(", ")}.`,
          )
        : toast.success("Portaria GM/MS processada no servidor e vinculada à competência.");
      onChange();
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  };

  const reprocessarPortaria = async () => {
    const arq = ultimoArquivo(arquivos, "portaria_gm");
    if (!arq) return toast.error("Nenhum PDF da Portaria GM/MS foi anexado.");
    setBusy("portaria-reprocess");
    try {
      const resultado = await processarEvidenciaPiso(cid, arq.id);
      const dados = resultado.dados ?? {};
      dados.campos_nao_extraidos?.length
        ? toast.warning(
            `PDF reprocessado no servidor. Confira manualmente: ${dados.campos_nao_extraidos.join(", ")}.`,
          )
        : toast.success("Portaria GM/MS reprocessada no servidor.");
      onChange();
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  };

  const addObrig = async (pid: string) => {
    const { error } = await (supabase as any)
      .from("piso_obrigacoes")
      .insert({
        participante_id: pid,
        origem_recurso: "atual",
      });
    error ? err(error) : onChange();
  };
  const delObrig = async (oid: string) => {
    if (!confirm("Remover obrigação?")) return;
    const { error } = await supabase.from("piso_obrigacoes").delete().eq("id", oid);
    error ? err(error) : onChange();
  };
  const marcarExcecao = async (marcada: boolean) => {
    const { data: u } = await supabase.auth.getUser();
    await (supabase as any)
      .from("piso_competencias")
      .update({
        conciliacao_excecao_por: marcada ? u.user?.id : null,
        conciliacao_excecao_em: marcada ? new Date().toISOString() : null,
      })
      .eq("id", cid);
    onChange();
  };

  const Ocorrencias = ({ lista }: { lista: any[] }) =>
    lista.length ? (
      <div className="space-y-1">
        {lista.slice(0, 50).map((o) => (
          <div
            key={o.id ?? `${o.regra}-${o.linha}`}
            className={`rounded border p-2 text-xs ${o.severidade === "erro" ? "border-destructive/40 bg-destructive/5 text-destructive" : o.severidade === "alerta" ? "border-amber-400/50 bg-amber-50 text-amber-900" : "bg-muted"}`}
          >
            <b>{o.regra?.replaceAll("_", " ")}</b>
            {o.cpf_mascarado ? ` · ${o.cpf_mascarado}` : ""}
            {o.cnes ? ` · CNES ${o.cnes}` : ""}
            <span className="block">{o.descricao}</span>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-xs text-muted-foreground">Nenhuma ocorrência registrada.</p>
    );

  const porObrig = (tipos: string[], etapa: 6 | 7) =>
    ctx.obrigs.length === 0 ? (
      <p className="text-sm text-muted-foreground">Cadastre as obrigações na Etapa 5.</p>
    ) : (
      ctx.obrigs.map((o) => {
        const part = ctx.parts.find((p) => p.id === o.participante_id);
        const valorReferencia = Number(part?.valor_devido ?? o.valor_a_liquidar ?? 0);
        const solicitacao =
          etapa === 6
            ? acharDoc(ctx.docs, "solicitacao_liquidacao", { obrigacao_id: o.id })
            : undefined;
        const solicitacaoCompleta =
          etapa !== 6 || docCompleto(ctx, solicitacao);
        const aviso =
          etapa === 6
            ? acharDoc(ctx.docs, "aviso_liquidacao", { obrigacao_id: o.id })
            : undefined;
        const avisoCompleto =
          etapa !== 6 || docCompleto(ctx, aviso);
        const avisoEncaminhado =
          etapa === 6 &&
          solicitacaoCompleta &&
          avisoCompleto &&
          encaminhado(ctx.encaminhamentos, aviso?.id);

        return (
          <div key={o.id} className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-semibold">
              {nomeInst(part)} · {brl(valorReferencia)}
            </p>

            {etapa === 6 ? (
              <div className="space-y-3">
                {doc("solicitacao_liquidacao", { obrigacaoId: o.id })}

                {solicitacaoCompleta ? (
                  doc("aviso_liquidacao", {
                    obrigacaoId: o.id,
                    encaminhavel: true,
                    canEditOverride: canEdit,
                    destinoEncaminhamento: "SEFAZ.UAF.ADE",
                  })
                ) : (
                  <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                    <b className="block text-foreground">
                      Aviso de Movimento - Empenho em Liquidação
                    </b>
                    Complete a Solicitação de Subempenho / Liquidação para liberar este bloco.
                  </div>
                )}

                {avisoEncaminhado ? (
                  <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <div>
                      <p className="font-semibold">Aviso de Movimento - Subempenho</p>
                      <p className="text-xs text-muted-foreground">
                        Após o Aviso de Movimento - Empenho em Liquidação estar completo e encaminhado
                        à SEFAZ.UAF.ADE, registre o Nº SEI, o link SEI e a data do Aviso de Movimento - Subempenho.
                      </p>
                    </div>
                    {doc("aviso_subempenho", { obrigacaoId: o.id })}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                    <b className="block text-foreground">Aviso de Movimento - Subempenho</b>
                    Este bloco será liberado depois que o Aviso de Movimento - Empenho em Liquidação
                    estiver completo e encaminhado para SEFAZ.UAF.ADE.
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid gap-2 lg:grid-cols-2">
                  {tipos.map((t) => doc(t, { obrigacaoId: o.id }))}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <CampoBlur
                    label="Data da programação"
                    type="date"
                    value={o.data_programacao}
                    disabled={dis}
                    onSave={(v) => saveObrig(o.id, "data_programacao", v)}
                  />
                  <CampoBlur
                    label="Data do pagamento/crédito"
                    type="date"
                    value={o.data_pagamento}
                    disabled={dis}
                    onSave={(v) => saveObrig(o.id, "data_pagamento", v)}
                  />
                  <CampoBlur
                    label="Valor pago"
                    type="moeda"
                    value={o.valor_pago}
                    disabled={dis}
                    invalid={
                      o.valor_pago != null && !dentroTolerancia(o.valor_pago, valorReferencia)
                    }
                    onSave={(v) => saveObrig(o.id, "valor_pago", v)}
                  />
                  <CampoBlur
                    className="sm:col-span-3"
                    multiline
                    label="Observação (devolução, parcial ou reprogramação)"
                    value={o.observacao}
                    disabled={dis}
                    onSave={(v) => saveObrig(o.id, "observacao", v)}
                  />
                </div>
              </>
            )}
          </div>
        );
      })
    );

  let corpo: React.ReactNode;
  if (n === 1)
    corpo = (
      <div className="space-y-5">
        {observacao13}
        <div>
          <h3 className="font-semibold">1A. Coleta e auditoria das Planilhas de Carga</h3>
          <p className="text-sm text-muted-foreground">
            {c.tipo_parcela === "decimo_terceiro"
              ? "13ª parcela: registre as datas efetivas de solicitação e retorno. O calendário mensal de dias 5/10/15 não é presumido; confira o ato e a memória oficial deste exercício."
              : `Enviar às instituições até ${formatarDataIso(prazoEnvio)} (dia 5) · receber até ${formatarDataIso(prazoRetorno)} (dia 10). Prazos de calendário mensais; atrasos geram alerta, mas não bloqueiam.`}
          </p>
        </div>
        {ctx.parts.map((p) => {
          const arq = ultimoArquivo(arquivos, "planilha_carga", p.id),
            ocorr = ocorrencias.filter(
              (o) => o.participante_id === p.id && (!arq || o.arquivo_id === arq.id),
            );
          const status = statusParticipantePiso(p, Boolean(arq), ocorr.length),
            cnesPart = cnes.filter((x) => x.prestador_id === p.prestador_id);
          return (
            <div key={p.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="mr-auto font-semibold">{nomeInst(p)}</h4>
                <Badge
                  variant={
                    status.tom === "erro"
                      ? "destructive"
                      : status.tom === "sucesso"
                        ? "default"
                        : "outline"
                  }
                >
                  {status.rotulo}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                CNES: {cnesPart.map((x) => x.cnes).join(", ") || "Não cadastrado"}
              </p>
              {cnesPart.length === 0 && (
                <div className="flex flex-wrap items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">CNES não cadastrado para esta instituição.</p>
                    <p>Cadastre pelo menos um CNES no prestador antes de auditar a Planilha de Carga.</p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/prestadores">Cadastrar CNES</Link>
                  </Button>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <CampoBlur
                  identity={`${p.id}:data_envio`}
                  label="Data do envio"
                  type="date"
                  value={p.data_envio}
                  disabled={dis}
                  invalid={atraso(p.data_envio, prazoEnvio)}
                  hint={
                    atraso(p.data_envio, prazoEnvio)
                      ? p.data_envio
                        ? `Registrado fora do prazo de ${formatarDataIso(prazoEnvio)} (alerta)`
                        : `Prazo ${formatarDataIso(prazoEnvio)} vencido — registro pendente`
                      : `Prazo: ${formatarDataIso(prazoEnvio)}`
                  }
                  onSave={(v) => savePart(p.id, "data_envio", v)}
                />
                <CampoBlur
                  identity={`${p.id}:data_retorno`}
                  label="Data do retorno"
                  type="date"
                  value={p.data_retorno}
                  disabled={dis}
                  invalid={Boolean(p.data_envio && p.data_retorno && p.data_retorno < p.data_envio)}
                  hint={
                    atraso(p.data_retorno, prazoRetorno)
                      ? p.data_retorno
                        ? `Registrado fora do prazo de ${formatarDataIso(prazoRetorno)} (alerta)`
                        : `Prazo ${formatarDataIso(prazoRetorno)} vencido — registro pendente`
                      : `Prazo: ${formatarDataIso(prazoRetorno)}`
                  }
                  onSave={(v) => savePart(p.id, "data_retorno", v)}
                />
                <CampoBlur
                  identity={`${p.id}:observacao`}
                  className="sm:col-span-2"
                  multiline
                  label="Observações"
                  value={p.observacao}
                  disabled={dis}
                  onSave={(v) => savePart(p.id, "observacao", v)}
                />
              </div>
              {p.data_retorno && !arq && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={p.sem_elegiveis}
                    disabled={dis}
                    onChange={(e) => savePart(p.id, "sem_elegiveis", e.target.checked)}
                  />
                  <span>
                    A instituição informou que não há profissionais elegíveis nesta competência.
                  </span>
                </label>
              )}
              {!p.sem_elegiveis && canEdit && (
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary">
                  <FileSpreadsheet className="h-4 w-4" />
                  {busy === `carga-${p.id}`
                    ? "Auditando…"
                    : "Enviar Planilha de Carga original (.xlsx/.csv)"}
                  {!p.data_retorno ? (
                    <span className="text-xs text-muted-foreground">(informe o retorno para habilitar)</span>
                  ) : cnesPart.length === 0 ? (
                    <span className="text-xs text-muted-foreground">(cadastre CNES para habilitar)</span>
                  ) : null}
                  <input
                    type="file"
                    hidden
                    accept=".xlsx,.csv"
                    disabled={Boolean(busy) || !p.data_retorno || cnesPart.length === 0}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) importarCarga(p, f);
                    }}
                  />
                </label>
              )}
              <ArquivosEvidencia
                arquivos={arquivos}
                competenciaId={cid}
                categoria="planilha_carga"
                participanteId={p.id}
                canEdit={false}
                onChange={onChange}
                canRemove={(arquivo) => {
                  if (!canEdit) return false;
                  const atual = p.auditoria_resumo?.arquivo_id;
                  if (arquivo.id === atual) return false;
                  const iguais = arquivos.filter(
                    (item: any) =>
                      item.categoria === "planilha_carga" &&
                      item.participante_id === p.id &&
                      item.sha256 &&
                      item.sha256 === arquivo.sha256,
                  ).length;
                  return !atual || iguais > 1;
                }}
                onRetry={(arquivo) => reprocessarCarga(p, arquivo)}
              />
              {p.auditoria_resumo && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-muted p-2">
                    <b>{p.auditoria_resumo.linhas}</b>
                    <span className="block">registros</span>
                  </div>
                  <div className="rounded bg-muted p-2">
                    <b>{p.auditoria_resumo.erros}</b>
                    <span className="block">erros de origem</span>
                  </div>
                  <div className="rounded bg-muted p-2">
                    <b>{p.auditoria_resumo.alertas}</b>
                    <span className="block">alertas</span>
                  </div>
                </div>
              )}
              {ocorr.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-destructive">
                    Ver {ocorr.length} ocorrência(s) da planilha original
                  </summary>
                  <div className="mt-2">
                    <Ocorrencias lista={ocorr} />
                  </div>
                </details>
              )}
            </div>
          );
        })}
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div>
            <h3 className="font-semibold">1B. Envio das Planilhas de Carga ao InvestSUS</h3>
            <p className="text-sm text-muted-foreground">
              Registre apenas a data em que as Planilhas de Carga das instituições foram enviadas
              ao InvestSUS. Prazo: {formatarDataIso(prazoInvestsus)} (dia 15, data-calendário fixa).
            </p>
          </div>
          <div className="max-w-sm">
            <CampoBlur
              label="Data do envio ao InvestSUS"
              type="date"
              value={c.investsus_carga_em}
              disabled={dis}
              invalid={atraso(c.investsus_carga_em, prazoInvestsus)}
              hint={`Prazo: ${formatarDataIso(prazoInvestsus)}`}
              onSave={(v) => saveComp("investsus_carga_em", v)}
            />
          </div>
        </div>
      </div>
    );
  else if (n === 2) {
    const resumo = c.investsus_resumo ?? {},
      cruz = c.investsus_auditoria?.conciliacao ?? {},
      interna = c.investsus_auditoria?.interna ?? {},
      arquivoInvestAtual = ultimoArquivo(arquivos, "investsus"),
      auditoriaAtual =
        Number(c.investsus_auditoria?.versao_regras ?? 0) === INVESTSUS_AUDIT_RULES_VERSION,
      ocorrArquivoAtual = ocorrencias.filter(
        (o) => !arquivoInvestAtual || o.arquivo_id === arquivoInvestAtual.id,
      ),
      ocorrInterna = ocorrArquivoAtual.filter((o) => o.categoria === "investsus"),
      ocorrConciliacao = ocorrArquivoAtual.filter((o) => o.categoria === "conciliacao"),
      totalInterna =
        Number(interna.erros ?? ocorrInterna.filter((o) => o.severidade === "erro").length) +
        Number(interna.alertas ?? ocorrInterna.filter((o) => o.severidade === "alerta").length),
      gruposOcorrencias = [
        {
          titulo: "Críticas que exigem ação",
          subtitulo: "Divergências da conciliação Carga × InvestSUS com potencial de impacto financeiro ou de elegibilidade.",
          filtro: (o: any) => o.severidade === "erro",
        },
        {
          titulo: "Alertas para conferência",
          subtitulo: "Diferenças cadastrais ou múltiplos vínculos que merecem revisão, sem crítica financeira automática.",
          filtro: (o: any) => o.severidade === "alerta",
        },
        {
          titulo: "Ausências sem complemento esperado",
          subtitulo: "Profissionais válidos na carga cuja ausência no InvestSUS é compatível com complemento de R$ 0,00.",
          filtro: (o: any) => o.regra === "ausencia_sem_complemento",
        },
        {
          titulo: "Registros fora da conciliação por erro de origem",
          subtitulo: "Linhas preservadas como evidência, mas excluídas da exigência de correspondência por erro já identificado na carga.",
          filtro: (o: any) => o.regra === "fora_conciliacao_origem",
        },
      ];
    const criticasInternas =
        Number(interna.erros ?? ocorrInterna.filter((o) => o.severidade === "erro").length),
      criticasCruzadas = Number(cruz.criticas ?? 0);
    corpo = (
      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className="font-semibold">1. Evidências da saída do Ministério</h3>
          <div className="grid gap-3">
            <div className="rounded-lg border p-3">
              <b className="text-sm">{c.tipo_parcela === "decimo_terceiro"
                ? "Memória homologada da 13ª por CNES" : "Planilha exportada do InvestSUS"}</b>
              <p className="mb-3 text-xs text-muted-foreground">
                {c.tipo_parcela === "decimo_terceiro"
                  ? "Use planilha com CNES e VALOR AFC 13ª (ou VALOR HOMOLOGADO DA 13ª). Os valores por instituição serão derivados e conferidos no servidor. Mantenha o arquivo original do FNS como evidência."
                  : "O original privado é auditado e conciliado com as cargas por CPF + CNES."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary">
                    <FileSpreadsheet className="h-4 w-4" />
                    {busy === "investsus" ? "Processando…" : "Importar XLSX/CSV"}
                    <input
                      hidden
                      type="file"
                      accept=".xlsx,.csv"
                      disabled={Boolean(busy)}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) importarInvestsus(f);
                      }}
                    />
                  </label>
                )}
                {canEdit && arquivoInvestAtual && (
                  <Button
                    size="sm"
                    variant="outline"
                    className={
                      auditoriaAtual
                        ? "h-8 rounded-full border-primary/20 bg-primary/5 px-3 text-primary shadow-none hover:bg-primary/10"
                        : "h-8 rounded-full border-primary bg-primary px-3 text-primary-foreground shadow-sm hover:bg-primary/90"
                    }
                    disabled={Boolean(busy)}
                    onClick={reprocessarInvestsus}
                    title="Recalcular a auditoria usando a versão mais recente das regras"
                  >
                    <RefreshCw
                      className={`mr-1.5 h-3.5 w-3.5 ${
                        busy === "investsus-reprocess" ? "animate-spin" : ""
                      }`}
                    />
                    {busy === "investsus-reprocess" ? "Reprocessando…" : "Reprocessar auditoria"}
                  </Button>
                )}
              </div>
              <ArquivosEvidencia
                arquivos={arquivos}
                competenciaId={cid}
                categoria={c.tipo_parcela === "decimo_terceiro" ? "afc13_cnes" : "investsus"}
                canEdit={false}
                onChange={onChange}
              />
            </div>
            <div className="rounded-lg border p-3">
              <b className="text-sm">Portaria GM/MS da competência</b>
              <p className="mb-3 text-xs text-muted-foreground">
                O PDF é lido para extrair ato, publicação e valores de Joinville; o link oficial do DOU é registrado abaixo.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary">
                    <FileSpreadsheet className="h-4 w-4" />
                    {busy === "portaria" ? "Extraindo…" : "Importar PDF oficial"}
                    <input
                      hidden
                      type="file"
                      accept=".pdf"
                      disabled={Boolean(busy)}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) importarPortaria(f);
                      }}
                    />
                  </label>
                )}
                {canEdit && ultimoArquivo(arquivos, "portaria_gm") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full border-primary/20 bg-primary/5 px-3 text-primary shadow-none hover:bg-primary/10"
                    disabled={Boolean(busy)}
                    onClick={reprocessarPortaria}
                    title="Executar novamente a extração automática do PDF"
                  >
                    <RefreshCw
                      className={`mr-1.5 h-3.5 w-3.5 ${
                        busy === "portaria-reprocess" ? "animate-spin" : ""
                      }`}
                    />
                    {busy === "portaria-reprocess" ? "Reprocessando…" : "Reprocessar extração"}
                  </Button>
                )}
              </div>
              <ArquivosEvidencia
                arquivos={arquivos}
                competenciaId={cid}
                categoria="portaria_gm"
                canEdit={false}
                onChange={onChange}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">2. Auditoria cruzada: Planilhas de Carga × InvestSUS</h3>
          <p className="text-sm text-muted-foreground">
            A conciliação identifica o profissional por CPF + CNES. CBO numérico e descrição profissional são comparados semanticamente; linhas com erro de origem não geram uma segunda crítica de ausência.
          </p>
          {arquivoInvestAtual && !auditoriaAtual && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Esta competência ainda guarda uma auditoria calculada por regras anteriores. Reprocesse a planilha do InvestSUS para substituir as contagens antigas antes de tomar decisão.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {[
              ["Cargas", auditoriaAtual ? cruz.registros_carga : "—"],
              ["InvestSUS", auditoriaAtual ? cruz.registros_investsus : "—"],
              ["Localizados", auditoriaAtual ? cruz.localizados : "—"],
              ["Críticas", auditoriaAtual ? cruz.criticas : "—"],
              ["Alertas", auditoriaAtual ? cruz.alertas : "—"],
              ["Sem complemento", auditoriaAtual ? cruz.sem_complemento : "—"],
              ["Fora da conciliação", auditoriaAtual ? cruz.fora_conciliacao : "—"],
            ].map(([l, v]) => (
              <div key={String(l)} className="rounded border p-2">
                <b>{v ?? 0}</b>
                <span className="block text-[11px] text-muted-foreground">{l}</span>
              </div>
            ))}
          </div>

          {auditoriaAtual && totalInterna > 0 && (
            <details
              className={`rounded border p-3 ${criticasInternas ? "border-destructive/40 bg-destructive/5" : "border-sky-200 bg-sky-50/50"}`}
              open={criticasInternas > 0}
            >
              <summary className="cursor-pointer text-sm font-medium">
                Auditoria interna da planilha do InvestSUS ({totalInterna})
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Valida a própria estrutura da saída ministerial (CPF, CNPJ, CNES, categoria e coerência financeira). Fica separada da conciliação Carga × InvestSUS.
              </p>
              {criticasInternas > 0 && (
                <p className="mt-2 text-xs font-medium text-destructive">
                  Erros internos da própria saída do InvestSUS precisam ser corrigidos ou conferidos na origem; a continuidade excepcional é reservada às críticas da conciliação.
                </p>
              )}
              <div className="mt-2">
                <Ocorrencias lista={ocorrInterna} />
              </div>
            </details>
          )}

          {auditoriaAtual && gruposOcorrencias.map((grupo) => {
            const lista = ocorrConciliacao.filter(grupo.filtro);
            return (
              <details
                key={grupo.titulo}
                className="rounded border p-3"
                open={grupo.titulo === "Críticas que exigem ação" && lista.length > 0}
              >
                <summary className="cursor-pointer text-sm font-medium">
                  {grupo.titulo} ({lista.length})
                </summary>
                <p className="mt-1 text-xs text-muted-foreground">{grupo.subtitulo}</p>
                <div className="mt-2">
                  <Ocorrencias lista={lista} />
                </div>
              </details>
            );
          })}

          {auditoriaAtual && criticasCruzadas > 0 && criticasInternas === 0 && (
            <div className="rounded border border-amber-400 bg-amber-50 p-3">
              <CampoBlur
                multiline
                label="Justificativa formal para continuidade excepcional"
                value={c.justificativa_conciliacao}
                disabled={dis}
                onSave={(v) => saveComp("justificativa_conciliacao", v)}
              />
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(c.conciliacao_excecao_por)}
                  disabled={dis || !c.justificativa_conciliacao?.trim()}
                  onChange={(e) => marcarExcecao(e.target.checked)}
                />
                Confirmo que as críticas foram analisadas e que a continuidade está formalmente justificada.
              </label>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">3. Portaria GM/MS e Diário Oficial</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <CampoBlur label="Número da Portaria" value={c.portaria_gm_numero} disabled={dis} onSave={(v) => saveComp("portaria_gm_numero", v)} />
            <CampoBlur label="Data do ato" type="date" value={c.portaria_gm_data_ato} disabled={dis} onSave={(v) => saveComp("portaria_gm_data_ato", v)} />
            <CampoBlur label="Data da publicação" type="date" value={c.portaria_gm_data_publicacao} disabled={dis} onSave={(v) => saveComp("portaria_gm_data_publicacao", v)} />
            <CampoBlur label="Edição" value={c.portaria_gm_edicao} disabled={dis} onSave={(v) => saveComp("portaria_gm_edicao", v)} />
            <CampoBlur label="Seção" value={c.portaria_gm_secao} disabled={dis} onSave={(v) => saveComp("portaria_gm_secao", v)} />
            <CampoBlur label="Página" value={c.portaria_gm_pagina} disabled={dis} onSave={(v) => saveComp("portaria_gm_pagina", v)} />
            <CampoBlur
              className="sm:col-span-3"
              label="Link oficial no DOU"
              value={c.portaria_gm_url_dou}
              disabled={dis}
              invalid={Boolean(c.portaria_gm_url_dou && !urlDouValida(c.portaria_gm_url_dou))}
              hint={
                urlDouValida(c.portaria_gm_url_dou)
                  ? "Origem do endereço validada: publicação oficial no domínio in.gov.br"
                  : "Obrigatório: https://www.in.gov.br/web/dou/..."
              }
              onSave={(v) => saveComp("portaria_gm_url_dou", v)}
            />
          </div>
          {urlDouValida(c.portaria_gm_url_dou) && (
            <a className="text-sm text-primary underline" href={c.portaria_gm_url_dou} target="_blank" rel="noreferrer">
              Abrir publicação
            </a>
          )}
          <div className="grid gap-2 sm:grid-cols-4">
            <CampoBlur
              label="Valor homologado"
              type="moeda"
              value={c.valor_homologado}
              disabled
              onSave={() => {}}
            />
            <CampoBlur label="Desconto de saldo" type="moeda" value={c.desconto_saldo} disabled onSave={() => {}} />
            <CampoBlur label="Acerto de contas" type="moeda" value={c.acerto_contas} disabled onSave={() => {}} />
            <CampoBlur
              label="Valor transferido"
              type="moeda"
              value={c.valor_transferido}
              disabled
              onSave={() => {}}
            />
          </div>
          {Math.abs(Number(c.desconto_saldo ?? 0)) > 0.005 && (
            <CampoBlur multiline label="Identificação do saldo descontado" value={c.desconto_identificacao} disabled={dis} onSave={(v) => saveComp("desconto_identificacao", v)} />
          )}
          {Math.abs(Number(c.acerto_contas ?? 0)) > 0.005 && (
            <CampoBlur multiline label="Identificação do acerto de contas" value={c.acerto_identificacao} disabled={dis} onSave={(v) => saveComp("acerto_identificacao", v)} />
          )}
          <div className="rounded bg-muted p-3 text-sm">
            Total InvestSUS: <b>{brl(resumo.total_complemento)}</b> · Homologado: <b>{brl(c.valor_homologado)}</b> · Transferido calculado:{" "}
            <b>{brl(transferenciaFederalEsperada(c.valor_homologado, c.desconto_saldo, c.acerto_contas))}</b>
          </div>
        </section>
      </div>
    );
  } else if (n === 3) {
    const cfg = municipalDraft,
      salvarCfg = async (campo: string, valor: unknown) => {
        const anterior = municipalDraftRef.current;
        const proximo = { ...anterior, [campo]: valor };
        municipalDraftRef.current = proximo;
        setMunicipalDraft(proximo);
        const { error } = await (supabase as any)
          .from("piso_competencias")
          .update({ municipal_config: proximo })
          .eq("id", cid);
        if (error) {
          municipalDraftRef.current = anterior;
          setMunicipalDraft(anterior);
          err(error);
          return false;
        }
        onChange();
        return true;
      },
      destinatariosCfg = Array.isArray(cfg.destinatarios) ? cfg.destinatarios : [],
      destinatariosExibidos =
        destinatariosCfg.length > 0
          ? destinatariosCfg
          : [{ unidade: "", nome: "", cargo: "" }],
      salvarDestinatario = (indice: number, campo: "unidade" | "nome" | "cargo", valor: unknown) => {
        const base =
          destinatariosCfg.length > 0
            ? destinatariosCfg
            : [{ unidade: "", nome: "", cargo: "" }];
        return salvarCfg(
          "destinatarios",
          base.map((item: any, i: number) =>
            i === indice ? { ...item, [campo]: valor } : item,
          ),
        );
      };
    const docMinuta = ctx.docs.find((d) => d.tipo === "minuta"),
      docMemo = ctx.docs.find((d) => d.tipo === "memorando"),
      linhasAnexo: LinhaAnexoMunicipal[] = Object.entries(c.investsus_resumo?.por_cnes ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([codigo, valor]) => {
          const mestre = cnes.find((x) => String(x.cnes) === String(codigo));
          const participante = ctx.parts.find((p) => p.prestador_id === mestre?.prestador_id);
          return {
            cnes: codigo,
            nome:
              mestre?.nome_estabelecimento ||
              participante?.prestadores?.nome_instituicao ||
              "Estabelecimento",
            total: Number(valor),
          };
        }),
      dadosModelo: DadosModeloMunicipal = {
        competencia: c.competencia,
        tipo_parcela: c.tipo_parcela,
        exercicio_referencia: c.exercicio_referencia,
        minutaSei: docMinuta?.numero_sei,
        minutaData: docMinuta?.data_documento,
        memorandoSei: docMemo?.numero_sei,
        memorandoData: docMemo?.data_documento,
        autoridade: cfg.autoridade,
        cargo: cfg.cargo,
        portariaFederal: c.portaria_gm_numero,
        portariaFederalData: c.portaria_gm_data_ato,
        consultaInvestsus: cfg.consulta_investsus,
        valorHomologado: c.valor_homologado,
        valorTransferido: c.valor_transferido,
        descontoSaldo: c.desconto_saldo,
        descontoIdentificacao: c.desconto_identificacao,
        acertoContas: c.acerto_contas,
        acertoIdentificacao: c.acerto_identificacao,
        totalPublicado: c.valor_apurado_investsus,
        linhas: linhasAnexo,
        destinatarios: destinatariosCfg,
      },
      minuta = gerarMinutaMunicipal(dadosModelo),
      memo = gerarMemorandoMunicipal(dadosModelo),
      notaFederal = notaFederalMunicipal(dadosModelo),
      competenciaTexto = c.tipo_parcela === "decimo_terceiro"
        ? periodoAfcDocumentoPiso(c)
        : competenciaExtenso(c.competencia),
      federal = rotuloPortariaFederal(c.portaria_gm_numero),
      federalData = dataExtensoMunicipal(c.portaria_gm_data_ato) || "[DATA DA PORTARIA GM/MS]",
      minutaSei = numeroSeiComAno(docMinuta?.numero_sei, c.competencia),
      memoSei = numeroSeiComAno(docMemo?.numero_sei, c.competencia);

    corpo = (
      <div className="space-y-6">
        <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <div>
            <h3 className="font-semibold">Dados gerais dos atos municipais</h3>
            <p className="text-xs text-muted-foreground">
              Informações comuns à Minuta, ao Memorando e à Portaria municipal.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr_.8fr]">
            <CampoBlur
              label="Processo SEI das Portarias"
              value={cfg.processo}
              disabled={dis}
              onSave={(v) => salvarCfg("processo", v)}
            />
            <CampoBlur
              label="Data da consulta ao InvestSUS"
              type="date"
              value={cfg.consulta_investsus}
              disabled={dis}
              onSave={(v) => salvarCfg("consulta_investsus", v)}
            />
            <div className="rounded-lg border bg-background p-3 text-sm">
              <span className="text-xs text-muted-foreground">Total publicado</span>
              <b className="block text-lg">{brl(c.valor_apurado_investsus)}</b>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Parte 1 de 3</p>
            <h3 className="text-lg font-semibold">Construção da Minuta</h3>
            <p className="text-sm text-muted-foreground">
              Configure a autoridade e confira o documento que será levado ao processo SEI.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <CampoBlur label="Nome da autoridade" value={cfg.autoridade} disabled={dis} onSave={(v) => salvarCfg("autoridade", v)} />
            <CampoBlur label="Cargo da autoridade" value={cfg.cargo} disabled={dis} onSave={(v) => salvarCfg("cargo", v)} />
          </div>

          {doc("minuta")}

          <div className="space-y-2">
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(minuta)}>
              Copiar texto da Minuta
            </Button>
            <div className="max-h-[680px] overflow-auto rounded-lg border bg-white p-6 font-serif text-[13px] leading-6 text-slate-900 shadow-inner">
              <p className="text-center font-bold">MINUTA SEI Nº {minutaSei} - SES.UCP.ACP</p>
              <p className="mt-5 text-right">
                Joinville, {dataExtensoMunicipal(docMinuta?.data_documento) || "[DATA DA MINUTA]"}.
              </p>
              <p className="mt-5 font-bold">
                Dispõe sobre a relação de estabelecimentos elegíveis para o recebimento da assistência financeira complementar destinada ao cumprimento do piso salarial nacional de enfermeiros, técnicos e auxiliares de enfermagem e parteiras, e os respectivos valores destinados a cada um, conforme relatório e cálculo do Ministério da Saúde, referente a {competenciaTexto}.
              </p>
              <p className="mt-4">
                A {cfg.cargo || "Secretária da Saúde"}, {cfg.autoridade || "[AUTORIDADE]"}, em conformidade com a Lei Municipal nº 9.868 de 15 de julho de 2025, e tendo em vista o Título IX-A da Portaria de Consolidação GM/MS nº 6/2017, a {federal}, de {federalData} e a Portaria nº 307/2023/SES,
              </p>
              <p className="my-5 text-center font-bold">RESOLVE:</p>
              <p><b>Art. 1º</b> Divulgar a relação de estabelecimentos elegíveis para o recebimento da assistência financeira complementar destinada ao cumprimento do piso salarial nacional de enfermeiros, técnicos e auxiliares de enfermagem e parteiras, e os respectivos valores destinados a cada um, conforme relatório e cálculo extraído do portal do Ministério da Saúde.</p>
              <p className="mt-3">§1º Para os fins desta Portaria, consideram-se estabelecimentos elegíveis aqueles que atendem os requisitos estabelecidos no Título IX-A da Portaria de Consolidação GM/MS nº 6/2017 e na Portaria nº 307/2023/SES.</p>
              <p className="mt-3">§2º A relação dos estabelecimentos considerados elegíveis consta no Anexo I desta Portaria.</p>
              <p className="mt-3"><b>Art. 2º</b> A assistência financeira de que trata esta Portaria refere-se {c.tipo_parcela === "decimo_terceiro" ? "à" : "à parcela de"} {competenciaTexto}, conforme {federal}, de {federalData}.</p>
              <p className="mt-3"><b>Art. 3º</b> Esta Portaria entra em vigor na data de sua publicação.</p>
              <p className="my-6 text-center font-bold">{cfg.autoridade || "[AUTORIDADE]"}<br />{cfg.cargo || "Secretária da Saúde"}</p>
              <p className="mb-3 text-center font-bold">ANEXO I</p>
              <table className="w-full border-collapse text-xs">
                <thead><tr><th className="border p-2 text-left">CNES</th><th className="border p-2 text-left">NOME</th><th className="border p-2 text-right">{competenciaTexto.toUpperCase()}</th></tr></thead>
                <tbody>
                  {linhasAnexo.map((linha) => (
                    <tr key={linha.cnes}><td className="border p-2">{linha.cnes}</td><td className="border p-2">{linha.nome}</td><td className="border p-2 text-right">{brl(linha.total)}</td></tr>
                  ))}
                  <tr><td className="border p-2 text-right font-bold" colSpan={2}>TOTAL</td><td className="border p-2 text-right font-bold">{brl(c.valor_apurado_investsus)}</td></tr>
                </tbody>
              </table>
              <div className="mt-4 space-y-3 text-[11px] leading-4">
                {notaFederal.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Parte 2 de 3</p>
            <h3 className="text-lg font-semibold">Memorando para publicação</h3>
            <p className="text-sm text-muted-foreground">
              O assunto é gerado automaticamente a partir da Minuta, sem campo complementar.
            </p>
          </div>
          {doc("memorando")}
          <div className="space-y-2">
            <div className="flex flex-wrap items-start gap-2">
              <div className="mr-auto">
                <p className="text-xs font-medium">Destinatários do Memorando</p>
                <p className="text-[11px] text-muted-foreground">
                  Informe pelo menos um destinatário com Setor/Unidade SEI, Nome e Cargo.
                </p>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    salvarCfg("destinatarios", [
                      ...(destinatariosCfg.length
                        ? destinatariosCfg
                        : [{ unidade: "", nome: "", cargo: "" }]),
                      { unidade: "", nome: "", cargo: "" },
                    ])
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />Adicionar outro destinatário
                </Button>
              )}
            </div>
            {destinatariosExibidos.map((dest: any, i: number) => (
              <div
                key={i}
                className="grid gap-2 rounded border p-2 sm:grid-cols-[1fr_1.2fr_1fr_auto]"
              >
                <CampoBlur
                  label="Setor / Unidade SEI"
                  value={dest.unidade}
                  disabled={dis}
                  onSave={(v) => salvarDestinatario(i, "unidade", v)}
                />
                <CampoBlur
                  label="Nome"
                  value={dest.nome}
                  disabled={dis}
                  onSave={(v) => salvarDestinatario(i, "nome", v)}
                />
                <CampoBlur
                  label="Cargo"
                  value={dest.cargo}
                  disabled={dis}
                  onSave={(v) => salvarDestinatario(i, "cargo", v)}
                />
                {canEdit && destinatariosCfg.length > 0 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="self-end"
                    onClick={() =>
                      salvarCfg(
                        "destinatarios",
                        destinatariosCfg.filter((_: any, j: number) => j !== i),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(memo)}>
              Copiar texto do Memorando
            </Button>
            <div className="max-h-[520px] overflow-auto rounded-lg border bg-white p-6 font-serif text-[13px] leading-6 text-slate-900 shadow-inner">
              <p className="text-center font-bold">MEMORANDO SEI Nº {memoSei} - SES.UCP.ACP</p>
              <p className="mt-5 text-right">Joinville, {dataExtensoMunicipal(docMemo?.data_documento) || "[DATA DO MEMORANDO]"}.</p>
              <div className="mt-5 space-y-4">
                {destinatariosCfg.length ? destinatariosCfg.map((d: any, i: number) => (
                  <div key={i}><b>{i === 0 ? "À" : "e"} {d.unidade || "[UNIDADE SEI]"}</b><br />{d.nome || "[DESTINATÁRIO]"}<br />{d.cargo || "[CARGO]"}</div>
                )) : <p>[DESTINATÁRIOS]</p>}
              </div>
              <p className="mt-5"><b>Assunto:</b> Publicação de Portaria - Minuta SEI Nº {minutaSei} - SES.UCP.ACP.</p>
              <p className="mt-5">Prezadas(os),</p>
              <p className="mt-4">Conforme estabelecido na Portaria Nº 307/2023/SES, solicita-se a elaboração e publicação de portaria conforme minuta em epígrafe.</p>
              <p className="mt-4">Atenciosamente,</p>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Parte 3 de 3</p>
            <h3 className="text-lg font-semibold">Portaria municipal publicada</h3>
            <p className="text-sm text-muted-foreground">
              Registre o número oficial da Portaria e, no cartão do documento, o número SEI, link e data da publicação.
            </p>
          </div>
          <CampoBlur
            label="Número da Portaria municipal"
            value={cfg.portaria_numero}
            disabled={dis}
            onSave={(v) => salvarCfg("portaria_numero", v)}
          />
          {doc("portaria_municipal")}
        </section>
      </div>
    );
  } else if (n === 4)
    corpo = (
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <CampoBlur
            label="Data do crédito no FMS"
            type="date"
            value={c.credito_fms_data}
            disabled={dis}
            onSave={(v) => saveComp("credito_fms_data", v)}
          />
          <CampoBlur
            label="Valor creditado no FMS"
            type="moeda"
            value={c.credito_fms_valor}
            disabled={dis}
            invalid={
              c.credito_fms_valor != null &&
              !dentroTolerancia(c.credito_fms_valor, c.valor_transferido)
            }
            hint={`Transferido: ${brl(c.valor_transferido)}`}
            onSave={(v) => saveComp("credito_fms_valor", v)}
          />
        </div>
        <div className="grid items-end gap-2 sm:grid-cols-[1.2fr_1.5fr_auto]">
          <CampoBlur
            label="Informação SEI"
            value={c.credito_fms_referencia}
            disabled={dis}
            hint="Ex.: Informação SEI Nº 31158661/2026 - SES.UFI.AFI"
            onSave={(v) => saveComp("credito_fms_referencia", v)}
          />
          <CampoBlur
            label="Link da Informação no SEI"
            value={c.credito_fms_link}
            disabled={dis}
            invalid={Boolean(c.credito_fms_link && !linkValido(c.credito_fms_link))}
            hint="Cole o link direto da Informação no SEI."
            onSave={(v) => saveComp("credito_fms_link", v)}
          />
          {linkValido(c.credito_fms_link) && (
            <div className="self-end pb-[18px]">
              <SeiButton href={c.credito_fms_link} label="Abrir no SEI" />
            </div>
          )}
        </div>
        {c.credito_fms_valor != null &&
          !dentroTolerancia(c.credito_fms_valor, c.valor_transferido) && (
            <CampoBlur
              multiline
              label="Justificativa documental da diferença"
              value={c.justificativa_credito}
              disabled={dis}
              onSave={(v) => saveComp("justificativa_credito", v)}
            />
          )}
      </div>
    );
  else if (n === 5)
    corpo = (
      <div className="space-y-4">
        {eleg.map((p) => {
          const obrigacoes = ctx.obrigs.filter((o) => o.participante_id === p.id);
          return (
            <div key={p.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="mr-auto">
                  <p className="font-semibold">{nomeInst(p)}</p>
                  <p className="text-xs text-muted-foreground">
                    CNPJ {p.prestadores?.cnpj ?? "—"} · CNES{" "}
                    {cnes
                      .filter((x) => x.prestador_id === p.prestador_id)
                      .map((x) => x.cnes)
                      .join(", ") || "—"}{" "}
                    · valor a empenhar <b>{brl(p.valor_devido)}</b>
                  </p>
                </div>
                {canEdit && obrigacoes.length === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addObrig(p.id)}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Iniciar empenho
                  </Button>
                )}
              </div>

              {obrigacoes.map((o) => {
                const solicitacao = acharDoc(ctx.docs, "solicitacao_ne", { obrigacao_id: o.id });
                const solicitacaoCompleta = docCompleto(ctx, solicitacao);
                const solicitacaoEncaminhada =
                  solicitacaoCompleta && encaminhado(ctx.encaminhamentos, solicitacao?.id);
                return (
                  <div key={o.id} className="space-y-4 rounded bg-muted/30 p-3">
                    <div className="space-y-2 rounded-md border bg-background p-3">
                      <p className="text-xs font-semibold">Processo anual de empenho / liquidação no SEI</p>
                      <div className="grid items-end gap-2 sm:grid-cols-[.8fr_1.4fr_auto]">
                        <CampoBlur
                          label="Número do processo"
                          value={o.processo_sei}
                          disabled={dis}
                          onSave={(v) => saveObrig(o.id, "processo_sei", v)}
                        />
                        <CampoBlur
                          label="Link do processo"
                          value={o.link_processo_sei}
                          disabled={dis}
                          invalid={Boolean(o.link_processo_sei && !linkValido(o.link_processo_sei))}
                          onSave={(v) => saveObrig(o.id, "link_processo_sei", v)}
                        />
                        {linkValido(o.link_processo_sei) && (
                          <SeiButton href={o.link_processo_sei} label="Abrir no SEI" />
                        )}
                      </div>
                    </div>

                    <div className="grid items-end gap-2 sm:grid-cols-3">
                      <CampoBlur
                        label="Fonte"
                        value={o.fonte}
                        disabled={dis}
                        onSave={(v) => saveObrig(o.id, "fonte", v)}
                      />
                      <CampoBlur
                        label="CR/dotação"
                        value={o.cr_dotacao}
                        disabled={dis}
                        onSave={(v) => saveObrig(o.id, "cr_dotacao", v)}
                      />
                      <div className="rounded-md border bg-background p-3">
                        <span className="text-xs text-muted-foreground">Valor a empenhar</span>
                        <b className="block text-base">{brl(p.valor_devido)}</b>
                        <span className="text-[10px] text-muted-foreground">
                          Preenchido pelo valor devido apurado nas etapas anteriores.
                        </span>
                      </div>
                    </div>

                    <CampoBlur
                      multiline
                      label="Observação"
                      value={o.observacao}
                      disabled={dis}
                      onSave={(v) => saveObrig(o.id, "observacao", v)}
                    />

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        1. Solicitação de Nota de Empenho
                      </p>
                      {doc("solicitacao_ne", {
                        obrigacaoId: o.id,
                        encaminhavel: true,
                        destinoEncaminhamento: "SEFAZ.UCG.AEO",
                      })}
                      {solicitacaoCompleta && !solicitacaoEncaminhada && (
                        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                          As assinaturas estão completas. Registre o encaminhamento da Solicitação de
                          Nota de Empenho para <b>SEFAZ.UCG.AEO</b> para liberar a Nota de Empenho.
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        2. Nota de Empenho
                      </p>
                      {solicitacaoEncaminhada ? (
                        doc("nota_empenho", { obrigacaoId: o.id })
                      ) : (
                        <div className="rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
                          {!solicitacaoCompleta
                            ? "Complete a Solicitação de Nota de Empenho, inclusive as assinaturas obrigatórias, para continuar."
                            : "Registre o encaminhamento da Solicitação de Nota de Empenho para SEFAZ.UCG.AEO para liberar a Nota de Empenho."}
                        </div>
                      )}
                    </div>

                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => delObrig(o.id)}>
                        <Trash2 className="mr-1 h-4 w-4" />
                        Remover obrigação
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  else if (n === 6)
    corpo = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-3">
          <div className="mr-auto">
            <p className="text-sm font-semibold">Emissão do Aviso de Movimento no e-Pública</p>
            <p className="text-xs text-muted-foreground">
              O fluxo é sequencial: Solicitação de Subempenho / Liquidação → Aviso de Movimento - Empenho em Liquidação → encaminhamento à SEFAZ → Aviso de Movimento - Subempenho.
            </p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <CircleHelp className="mr-2 h-4 w-4" />
                Ver passo a passo do e-Pública
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Como emitir o Aviso de Movimento no e-Pública</DialogTitle>
              </DialogHeader>
              <ol className="space-y-3 text-sm">
                {[
                  "Selecionar “Empenho em Liquidação” na página inicial do e-Pública.",
                  "Clicar no sinal de “+” à direita.",
                  "Inserir a data, o valor e o número do empenho. Dar seguimento clicando em “Próximo”.",
                  "Na etapa “Relacionar”, pressionar Enter para carregar os documentos. Em “Documentos fiscais”, selecionar “Novo” e, em seguida, “Diversos”. Confirmar.",
                  "Adicionar o nº SEI da solicitação de subempenho, a data do dia do aviso e a emissão. Confirmar.",
                  "Conferir se o registro está selecionado, atentando para número, emissão, emitente e valor. Confirmar.",
                  "Clicar em “Gerar”.",
                  "Clicar em “Dados complementares”.",
                  "Clicar em “Aviso de movimento”.",
                  "Clicar em “Transmitir” e, no subitem, selecionar “SEI”.",
                  "Preencher a unidade SES.UCP.ACP, o número SEI do processo e o tipo de documento “Aviso de Movimento - Empenho em Liquidação”.",
                  "Após a assinatura obrigatória no Aviso de Movimento - Empenho em Liquidação, encaminhar o documento para SEFAZ.UAF.ADE. Com o encaminhamento registrado, o sistema libera o Aviso de Movimento - Subempenho para registrar Nº SEI, link SEI e data.",
                ].map((passo, i) => (
                  <li key={passo} className="grid grid-cols-[2rem_1fr] gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <p className="pt-1">{passo}</p>
                  </li>
                ))}
              </ol>
            </DialogContent>
          </Dialog>
        </div>
        {porObrig(["solicitacao_liquidacao", "aviso_liquidacao"], 6)}
      </div>
    );
  else if (n === 7)
    corpo = (
      <div className="space-y-3">
        {porObrig(["programacao_pagamento", "comprovante_pagamento"], 7)}
        <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
          A data de pagamento de cada instituição será o marco da futura Prestação de Contas (+30
          dias), em processo separado desta esteira.
        </p>
      </div>
    );
  else if (n === 8)
    corpo = (
      <EtapaNotificacaoEmail
        ctx={ctx}
        competenciaId={cid}
        canEdit={canEdit}
        usuarioNome={usuarioNome}
        onChange={onChange}
      />
    );
  else
    corpo = (
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-4">
          {[
            ["Apurado InvestSUS", c.valor_apurado_investsus],
            ["Homologado", c.valor_homologado],
            ["Transferido", c.valor_transferido],
            ["Crédito FMS", c.credito_fms_valor],
            ["Total devido", soma(eleg.map((p) => p.valor_devido))],
            ["Total pago", soma(ctx.obrigs.map((o) => o.valor_pago))],
          ].map(([l, v]) => (
            <div key={String(l)} className="rounded border p-3">
              <span className="text-xs text-muted-foreground">{l}</span>
              <b className="block">{brl(v as number)}</b>
            </div>
          ))}
        </div>
        <CampoBlur
          multiline
          label="Conclusão / ocorrência relevante"
          value={c.conclusao_ocorrencia}
          disabled={dis}
          onSave={(v) => saveComp("conclusao_ocorrencia", v)}
        />
        {c.relatorio_gerado_em ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            Relatório Executivo gerado nesta revisão.
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            Gere o Relatório Executivo antes do encerramento.
          </p>
        )}
      </div>
    );

  return <div className="space-y-4">{corpo}</div>;
}
