import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CampoBlur, Pendencias } from "@/components/piso/campos";
import { DocumentoCard } from "@/components/piso/DocumentoCard";
import { ArquivosEvidencia, enviarArquivo } from "@/components/piso/ArquivosEvidencia";
import {
  auditarPlanilhaCarga,
  lerPlanilhaComCabecalho,
  type RegistroCarga,
} from "@/lib/piso/planilha";
import { auditarInvestsus, conciliarCargaInvestsus } from "@/lib/piso/investsus";
import { extrairDadosPortariaGm, extrairTextoPdf } from "@/lib/piso/portaria";
import { statusParticipantePiso } from "@/lib/piso/status";
import { atraso, enesimoDiaUtilCompetencia, formatarDataIso } from "@/lib/piso/prazos";
import {
  dentroTolerancia,
  elegiveis,
  pendenciasEtapa,
  soma,
  urlDouValida,
  type CtxPiso,
} from "@/lib/piso/regras";
import { brl } from "@/lib/format";

interface Props {
  n: number;
  ctx: CtxPiso;
  arquivos: any[];
  pool: any[];
  cnes: any[];
  feriados: any[];
  ocorrencias: any[];
  canEdit: boolean;
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
  feriados,
  ocorrencias,
  canEdit,
  onChange,
}: Props) {
  const c = ctx.comp,
    cid = c.id as string,
    dis = !canEdit;
  const [busy, setBusy] = useState<string | null>(null);
  const err = (e: any) => toast.error(e.message ?? String(e));
  const saveComp = async (campo: string, valor: any) => {
    const { error } = await (supabase as any)
      .from("piso_competencias")
      .update({ [campo]: valor })
      .eq("id", cid);
    error ? err(error) : onChange();
  };
  const savePart = async (pid: string, campo: string, valor: any) => {
    const { error } = await (supabase as any)
      .from("piso_participantes")
      .update({ [campo]: valor })
      .eq("id", pid);
    error ? err(error) : onChange();
  };
  const saveObrig = async (oid: string, campo: string, valor: any) => {
    const { error } = await (supabase as any)
      .from("piso_obrigacoes")
      .update({ [campo]: valor })
      .eq("id", oid);
    error ? err(error) : onChange();
  };
  const doc = (
    tipo: string,
    extra: { participanteId?: string; obrigacaoId?: string; encaminhavel?: boolean } = {},
  ) => (
    <DocumentoCard
      key={tipo + (extra.obrigacaoId ?? "")}
      ctx={ctx}
      competenciaId={cid}
      tipo={tipo}
      participanteId={extra.participanteId ?? null}
      obrigacaoId={extra.obrigacaoId ?? null}
      pool={pool}
      canEdit={canEdit}
      encaminhavel={extra.encaminhavel}
      onChange={onChange}
    />
  );
  const eleg = elegiveis(ctx.parts),
    pend = pendenciasEtapa(n, ctx);
  const feriadosIso = feriados.map((f) => f.data),
    prazoEnvio = enesimoDiaUtilCompetencia(c.competencia, 5, feriadosIso);
  const prazoRetorno = enesimoDiaUtilCompetencia(c.competencia, 10, feriadosIso),
    prazoInvestsus = enesimoDiaUtilCompetencia(c.competencia, 15, feriadosIso);

  const registrarOcorrencias = async (
    lista: any[],
    arquivoId: string,
    participanteId: string | null,
    instituicao: string,
    categoria: string,
  ) => {
    if (!lista.length) return;
    const { error } = await (supabase as any).from("piso_ocorrencias").insert(
      lista.map((o) => ({
        competencia_id: cid,
        participante_id: participanteId,
        arquivo_id: arquivoId,
        categoria,
        severidade: o.severidade,
        regra: o.regra,
        linha: o.linha || null,
        descricao: o.descricao,
        cpf_mascarado: o.cpf_mascarado || null,
        cnes: o.cnes || null,
        instituicao_nome: o.instituicao_nome || instituicao || null,
        dados: o.dados || {},
      })),
    );
    if (error) throw error;
  };

  const importarCarga = async (p: any, file: File) => {
    if (!p.data_retorno)
      return toast.error("Informe a data do retorno antes de anexar a Planilha de Carga.");
    setBusy(`carga-${p.id}`);
    try {
      const rows = await lerPlanilhaComCabecalho(await file.arrayBuffer());
      const cnesPermitidos = cnes
        .filter((x) => x.prestador_id === p.prestador_id)
        .map((x) => x.cnes);
      const audit = auditarPlanilhaCarga(rows, cnesPermitidos);
      const arq = await enviarArquivo(file, cid, "planilha_carga", p.id);
      await registrarOcorrencias(audit.ocorrencias, arq.id, p.id, nomeInst(p), "carga");
      const { error } = await (supabase as any)
        .from("piso_participantes")
        .update({ auditoria_resumo: audit.resumo, sem_elegiveis: false })
        .eq("id", p.id);
      if (error) throw error;
      toast.success(
        `Planilha original preservada e auditada: ${audit.resumo.linhas} registros, ${audit.resumo.ocorrencias} ocorrência(s).`,
      );
      onChange();
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  };

  const carregarRegistrosCarga = async () => {
    const registros: Array<RegistroCarga & { instituicao_nome?: string }> = [];
    for (const p of ctx.parts) {
      const arq = ultimoArquivo(arquivos, "planilha_carga", p.id);
      if (!arq) continue;
      const { data, error } = await supabase.storage
        .from("piso-arquivos")
        .download(arq.storage_path);
      if (error) throw error;
      const rows = await lerPlanilhaComCabecalho(await data.arrayBuffer());
      const permitidos = cnes.filter((x) => x.prestador_id === p.prestador_id).map((x) => x.cnes);
      registros.push(
        ...auditarPlanilhaCarga(rows, permitidos).registros.map((r) => ({
          ...r,
          instituicao_nome: nomeInst(p),
        })),
      );
    }
    return registros;
  };

  const importarInvestsus = async (file: File) => {
    setBusy("investsus");
    try {
      const rows = await lerPlanilhaComCabecalho(await file.arrayBuffer(), "investsus");
      const audit = auditarInvestsus(rows),
        cargas = await carregarRegistrosCarga(),
        cruzada = conciliarCargaInvestsus(cargas, audit.registros);
      const arq = await enviarArquivo(file, cid, "investsus");
      await registrarOcorrencias(audit.ocorrencias, arq.id, null, "", "investsus");
      await registrarOcorrencias(cruzada.ocorrencias, arq.id, null, "", "conciliacao");
      const resumoPersistido = {
        ...audit.resumo,
        processado_em: new Date().toISOString(),
        arquivo_id: arq.id,
      };
      const { error } = await (supabase as any)
        .from("piso_competencias")
        .update({
          investsus_resumo: resumoPersistido,
          investsus_auditoria: { conciliacao: cruzada.resumo },
          valor_apurado_investsus: audit.resumo.total_complemento,
          total_publicado_municipal: audit.resumo.total_complemento,
        })
        .eq("id", cid);
      if (error) throw error;
      for (const p of ctx.parts) {
        const cnesPart = new Set(
          cnes.filter((x) => x.prestador_id === p.prestador_id).map((x) => x.cnes),
        );
        const valor = Object.entries(audit.resumo.por_cnes)
          .filter(([codigo]) => cnesPart.has(codigo))
          .reduce((t, [, v]) => t + Number(v), 0);
        const { error: valorError } = await (supabase as any)
          .from("piso_participantes")
          .update({ valor_devido: Math.round(valor * 100) / 100 })
          .eq("id", p.id);
        if (valorError) throw valorError;
      }
      toast.success(
        `InvestSUS auditado: ${audit.resumo.linhas} registros e ${cruzada.resumo.criticas} crítica(s) cruzada(s).`,
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
      const dados = extrairDadosPortariaGm(await extrairTextoPdf(file));
      await enviarArquivo(file, cid, "portaria_gm");
      const extraidos = {
        portaria_gm_numero: dados.numero,
        portaria_gm_data_ato: dados.data_ato,
        portaria_gm_data_publicacao: dados.data_publicacao,
        portaria_gm_edicao: dados.edicao,
        portaria_gm_secao: dados.secao,
        portaria_gm_pagina: dados.pagina,
        valor_homologado: dados.valor_homologado,
        desconto_saldo: dados.desconto_saldo,
        acerto_contas: dados.acerto_contas,
        valor_transferido: dados.valor_transferido,
      };
      const patch = Object.fromEntries(
        Object.entries(extraidos).filter(([, valor]) => valor !== null && valor !== undefined),
      );
      const { error } = await (supabase as any)
        .from("piso_competencias")
        .update(patch)
        .eq("id", cid);
      if (error) throw error;
      dados.campos_nao_extraidos.length
        ? toast.warning(
            `PDF importado. Confira manualmente: ${dados.campos_nao_extraidos.join(", ")}.`,
          )
        : toast.success("Portaria GM/MS extraída e vinculada à competência.");
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
      .insert({ participante_id: pid, origem_recurso: "atual" });
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
        return (
          <div key={o.id} className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-semibold">
              {nomeInst(part)} · {brl(o.valor_a_liquidar)}
            </p>
            <div className="grid gap-2 lg:grid-cols-2">
              {tipos.map((t) =>
                doc(t, {
                  obrigacaoId: o.id,
                  encaminhavel: etapa === 6 && t === "aviso_liquidacao",
                }),
              )}
            </div>
            {etapa === 6 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <CampoBlur
                  label="Data da solicitação"
                  type="date"
                  value={o.data_solicitacao_liquidacao}
                  disabled={dis}
                  onSave={(v) => saveObrig(o.id, "data_solicitacao_liquidacao", v)}
                />
                <CampoBlur
                  label="Data do movimento"
                  type="date"
                  value={o.data_movimento_liquidacao}
                  disabled={dis}
                  invalid={
                    o.data_solicitacao_liquidacao &&
                    o.data_movimento_liquidacao < o.data_solicitacao_liquidacao
                  }
                  onSave={(v) => saveObrig(o.id, "data_movimento_liquidacao", v)}
                />
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={o.movimento_transmitido}
                    disabled={dis}
                    onChange={(e) => saveObrig(o.id, "movimento_transmitido", e.target.checked)}
                  />
                  Movimento transmitido ao SEI e encaminhado para SEFAZ.UAF.ADE
                </label>
              </div>
            ) : (
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
                    o.valor_pago != null && !dentroTolerancia(o.valor_pago, o.valor_a_liquidar)
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
            )}
          </div>
        );
      })
    );

  let corpo: React.ReactNode;
  if (n === 1)
    corpo = (
      <div className="space-y-5">
        <div>
          <h3 className="font-semibold">1A. Coleta e auditoria das Planilhas de Carga</h3>
          <p className="text-sm text-muted-foreground">
            Envio até {formatarDataIso(prazoEnvio)} (5º dia útil) · retorno até{" "}
            {formatarDataIso(prazoRetorno)} (10º dia útil). Atrasos geram alerta, mas não bloqueiam.
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
              <div className="grid gap-2 sm:grid-cols-2">
                <CampoBlur
                  label="Data do envio"
                  type="date"
                  value={p.data_envio}
                  disabled={dis}
                  invalid={atraso(p.data_envio, prazoEnvio)}
                  hint={
                    atraso(p.data_envio, prazoEnvio)
                      ? `Fora do prazo de ${formatarDataIso(prazoEnvio)} (alerta)`
                      : `Prazo: ${formatarDataIso(prazoEnvio)}`
                  }
                  onSave={(v) => savePart(p.id, "data_envio", v)}
                />
                <CampoBlur
                  label="Data do retorno"
                  type="date"
                  value={p.data_retorno}
                  disabled={dis}
                  invalid={Boolean(p.data_envio && p.data_retorno && p.data_retorno < p.data_envio)}
                  hint={
                    atraso(p.data_retorno, prazoRetorno)
                      ? `Fora do prazo de ${formatarDataIso(prazoRetorno)} (alerta)`
                      : `Prazo: ${formatarDataIso(prazoRetorno)}`
                  }
                  onSave={(v) => savePart(p.id, "data_retorno", v)}
                />
                <CampoBlur
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
              {p.data_retorno && !p.sem_elegiveis && canEdit && (
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary">
                  <FileSpreadsheet className="h-4 w-4" />
                  {busy === `carga-${p.id}`
                    ? "Auditando…"
                    : "Enviar Planilha de Carga original (.xlsx/.csv)"}
                  <input
                    type="file"
                    hidden
                    accept=".xlsx,.csv"
                    disabled={Boolean(busy)}
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
            <h3 className="font-semibold">1B. Atualização da competência no InvestSUS</h3>
            <p className="text-sm text-muted-foreground">
              Prazo até {formatarDataIso(prazoInvestsus)} (15º dia útil). A confirmação final
              encerra a preparação.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <CampoBlur
              label="Data da carga / atualização"
              type="date"
              value={c.investsus_carga_em}
              disabled={dis}
              invalid={atraso(c.investsus_carga_em, prazoInvestsus)}
              onSave={(v) => saveComp("investsus_carga_em", v)}
            />
            <CampoBlur
              label="Data da confirmação final"
              type="date"
              value={c.investsus_confirmacao_em}
              disabled={dis}
              invalid={c.investsus_carga_em && c.investsus_confirmacao_em < c.investsus_carga_em}
              onSave={(v) => saveComp("investsus_confirmacao_em", v)}
            />
            <CampoBlur
              className="sm:col-span-2"
              multiline
              label="Ocorrência do InvestSUS"
              value={c.investsus_ocorrencia}
              disabled={dis}
              onSave={(v) => saveComp("investsus_ocorrencia", v)}
            />
          </div>
        </div>
      </div>
    );
  else if (n === 2) {
    const resumo = c.investsus_resumo ?? {},
      cruz = c.investsus_auditoria?.conciliacao ?? {},
      ocorrInv = ocorrencias.filter((o) => ["investsus", "conciliacao"].includes(o.categoria)),
      gruposOcorrencias = [
        {
          titulo: "Críticas que exigem ação",
          filtro: (o: any) => o.severidade === "erro",
        },
        {
          titulo: "Alertas para conferência",
          filtro: (o: any) => o.severidade === "alerta",
        },
        {
          titulo: "Ausências sem complemento esperado",
          filtro: (o: any) => o.regra === "ausencia_sem_complemento",
        },
        {
          titulo: "Registros fora da conciliação por erro de origem",
          filtro: (o: any) => o.regra === "fora_conciliacao_origem",
        },
      ];
    corpo = (
      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className="font-semibold">1. Evidências da saída do Ministério</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border p-3">
              <b className="text-sm">Planilha exportada do InvestSUS</b>
              <p className="mb-3 text-xs text-muted-foreground">
                O original privado é auditado e conciliado com as cargas por CPF + CNES.
              </p>
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
              <ArquivosEvidencia
                arquivos={arquivos}
                competenciaId={cid}
                categoria="investsus"
                canEdit={false}
                onChange={onChange}
              />
            </div>
            <div className="rounded-lg border p-3">
              <b className="text-sm">Portaria GM/MS da competência</b>
              <p className="mb-3 text-xs text-muted-foreground">
                O PDF é lido para extrair ato, publicação e valores de Joinville.
              </p>
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
          <h3 className="font-semibold">2. Auditoria cruzada Cargas × InvestSUS</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {[
              ["Cargas", cruz.registros_carga],
              ["InvestSUS", cruz.registros_investsus],
              ["Localizados", cruz.localizados],
              ["Críticas", cruz.criticas],
              ["Alertas", cruz.alertas],
              ["Sem complemento", cruz.sem_complemento],
              ["Fora da conciliação", cruz.fora_conciliacao],
            ].map(([l, v]) => (
              <div key={String(l)} className="rounded border p-2">
                <b>{v ?? 0}</b>
                <span className="block text-[11px] text-muted-foreground">{l}</span>
              </div>
            ))}
          </div>
          {gruposOcorrencias.map((grupo) => {
            const lista = ocorrInv.filter(grupo.filtro);
            return (
              <details key={grupo.titulo} className="rounded border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {grupo.titulo} ({lista.length})
                </summary>
                <div className="mt-2">
                  <Ocorrencias lista={lista} />
                </div>
              </details>
            );
          })}
          {Number(cruz.criticas ?? 0) > 0 && (
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
                Confirmo a continuidade excepcional e a manutenção desta justificativa na auditoria.
              </label>
            </div>
          )}
        </section>
        <section className="space-y-3">
          <h3 className="font-semibold">3. Portaria GM/MS e Diário Oficial</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <CampoBlur
              label="Número da Portaria"
              value={c.portaria_gm_numero}
              disabled={dis}
              onSave={(v) => saveComp("portaria_gm_numero", v)}
            />
            <CampoBlur
              label="Data do ato"
              type="date"
              value={c.portaria_gm_data_ato}
              disabled={dis}
              onSave={(v) => saveComp("portaria_gm_data_ato", v)}
            />
            <CampoBlur
              label="Data da publicação"
              type="date"
              value={c.portaria_gm_data_publicacao}
              disabled={dis}
              onSave={(v) => saveComp("portaria_gm_data_publicacao", v)}
            />
            <CampoBlur
              label="Edição"
              value={c.portaria_gm_edicao}
              disabled={dis}
              onSave={(v) => saveComp("portaria_gm_edicao", v)}
            />
            <CampoBlur
              label="Seção"
              value={c.portaria_gm_secao}
              disabled={dis}
              onSave={(v) => saveComp("portaria_gm_secao", v)}
            />
            <CampoBlur
              label="Página"
              value={c.portaria_gm_pagina}
              disabled={dis}
              onSave={(v) => saveComp("portaria_gm_pagina", v)}
            />
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
            <a
              className="text-sm text-primary underline"
              href={c.portaria_gm_url_dou}
              target="_blank"
              rel="noreferrer"
            >
              Abrir publicação
            </a>
          )}
          <div className="grid gap-2 sm:grid-cols-4">
            <CampoBlur
              label="Valor homologado"
              type="moeda"
              value={c.valor_homologado}
              disabled={dis}
              onSave={(v) => saveComp("valor_homologado", v)}
            />
            <CampoBlur
              label="Desconto de saldo"
              type="moeda"
              value={c.desconto_saldo}
              disabled
              hint="Extraído da Portaria"
              onSave={() => {}}
            />
            <CampoBlur
              label="Acerto de contas"
              type="moeda"
              value={c.acerto_contas}
              disabled
              hint="Extraído da Portaria"
              onSave={() => {}}
            />
            <CampoBlur
              label="Valor transferido"
              type="moeda"
              value={c.valor_transferido}
              disabled={dis}
              onSave={(v) => saveComp("valor_transferido", v)}
            />
          </div>
          {Math.abs(Number(c.desconto_saldo ?? 0)) > 0.005 && (
            <CampoBlur
              multiline
              label="Identificação do saldo descontado"
              value={c.desconto_identificacao}
              disabled={dis}
              onSave={(v) => saveComp("desconto_identificacao", v)}
            />
          )}
          {Math.abs(Number(c.acerto_contas ?? 0)) > 0.005 && (
            <CampoBlur
              multiline
              label="Identificação do acerto de contas"
              value={c.acerto_identificacao}
              disabled={dis}
              onSave={(v) => saveComp("acerto_identificacao", v)}
            />
          )}
          <div className="rounded bg-muted p-3 text-sm">
            Total InvestSUS: <b>{brl(resumo.total_complemento)}</b> · Homologado:{" "}
            <b>{brl(c.valor_homologado)}</b> · Transferido calculado:{" "}
            <b>
              {brl(
                Number(c.valor_homologado ?? 0) -
                  Number(c.desconto_saldo ?? 0) +
                  Number(c.acerto_contas ?? 0),
              )}
            </b>
          </div>
        </section>
      </div>
    );
  } else if (n === 3) {
    const cfg = c.municipal_config ?? {},
      salvarCfg = (campo: string, valor: unknown) =>
        saveComp("municipal_config", { ...cfg, [campo]: valor });
    const docMinuta = ctx.docs.find((d) => d.tipo === "minuta"),
      anexoCnes = Object.entries(c.investsus_resumo?.por_cnes ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([codigo, valor]) => `CNES ${codigo}: ${brl(Number(valor))}`)
        .join("\n"),
      notasFederais = [
        c.desconto_identificacao ? `Saldo descontado: ${c.desconto_identificacao}` : "",
        c.acerto_identificacao ? `Acerto de contas: ${c.acerto_identificacao}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    const minuta = `PORTARIA MUNICIPAL\nProcesso SEI ${cfg.processo ?? "—"}\nA autoridade ${cfg.autoridade ?? "—"}, ${cfg.cargo ?? "—"}, resolve publicar o total de ${brl(c.valor_apurado_investsus)} para a competência ${c.competencia}.\n\nANEXO I — VALORES POR CNES\n${anexoCnes || "Sem valores consolidados."}${notasFederais ? `\n\nNOTAS\n${notasFederais}` : ""}`;
    const memo = `MEMORANDO\nEncaminha-se a Minuta SEI ${docMinuta?.numero_sei ?? "—"} para publicação.\nDestinatários: ${(cfg.destinatarios ?? []).map((d: any) => `${d.nome} - ${d.cargo} (${d.unidade})`).join("; ") || "—"}.`;
    corpo = (
      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className="font-semibold">1. Minuta</h3>
          <div className="grid gap-2 sm:grid-cols-3">
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
            <CampoBlur
              label="Nome da autoridade"
              value={cfg.autoridade}
              disabled={dis}
              onSave={(v) => salvarCfg("autoridade", v)}
            />
            <CampoBlur
              label="Cargo da autoridade"
              value={cfg.cargo}
              disabled={dis}
              onSave={(v) => salvarCfg("cargo", v)}
            />
            <div className="rounded border p-2 text-sm">
              <span className="text-xs text-muted-foreground">Total publicado</span>
              <b className="block">{brl(c.valor_apurado_investsus)}</b>
            </div>
          </div>
          {doc("minuta")}
          <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-xs">{minuta}</pre>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(minuta)}>
            Copiar texto da Minuta
          </Button>
        </section>
        <section className="space-y-3">
          <h3 className="font-semibold">2. Memorando</h3>
          {doc("memorando")}
          <div className="space-y-2">
            <p className="text-xs font-medium">Destinatários</p>
            {(cfg.destinatarios ?? []).map((dest: any, i: number) => (
              <div
                key={i}
                className="grid gap-2 rounded border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <CampoBlur
                  label="Nome"
                  value={dest.nome}
                  disabled={dis}
                  onSave={(v) =>
                    salvarCfg(
                      "destinatarios",
                      (cfg.destinatarios ?? []).map((x: any, j: number) =>
                        j === i ? { ...x, nome: v } : x,
                      ),
                    )
                  }
                />
                <CampoBlur
                  label="Cargo"
                  value={dest.cargo}
                  disabled={dis}
                  onSave={(v) =>
                    salvarCfg(
                      "destinatarios",
                      (cfg.destinatarios ?? []).map((x: any, j: number) =>
                        j === i ? { ...x, cargo: v } : x,
                      ),
                    )
                  }
                />
                <CampoBlur
                  label="Unidade SEI"
                  value={dest.unidade}
                  disabled={dis}
                  onSave={(v) =>
                    salvarCfg(
                      "destinatarios",
                      (cfg.destinatarios ?? []).map((x: any, j: number) =>
                        j === i ? { ...x, unidade: v } : x,
                      ),
                    )
                  }
                />
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      salvarCfg(
                        "destinatarios",
                        (cfg.destinatarios ?? []).filter((_: any, j: number) => j !== i),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  salvarCfg("destinatarios", [
                    ...(cfg.destinatarios ?? []),
                    { nome: "", cargo: "", unidade: "" },
                  ])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Adicionar destinatário
              </Button>
            )}
          </div>
          <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-xs">{memo}</pre>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(memo)}>
            Copiar texto do Memorando
          </Button>
        </section>
        <section className="space-y-3">
          <h3 className="font-semibold">3. Portaria publicada</h3>
          {doc("portaria_municipal")}
        </section>
      </div>
    );
  } else if (n === 4)
    corpo = (
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
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
          <CampoBlur
            label="Referência do crédito"
            value={c.credito_fms_referencia}
            disabled={dis}
            hint="SEI da informação financeira, extrato ou equivalente"
            onSave={(v) => saveComp("credito_fms_referencia", v)}
          />
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
        {eleg.map((p) => (
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
                  · devido {brl(p.valor_devido)}
                </p>
              </div>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => addObrig(p.id)}>
                  <Plus className="mr-1 h-4 w-4" />
                  Nova NE
                </Button>
              )}
            </div>
            {ctx.obrigs
              .filter((o) => o.participante_id === p.id)
              .map((o) => (
                <div key={o.id} className="space-y-3 rounded bg-muted/30 p-3">
                  <div className="grid items-end gap-2 sm:grid-cols-3">
                    <CampoBlur
                      label="Processo anual de empenho/liquidação"
                      value={o.processo_sei}
                      disabled={dis}
                      onSave={(v) => saveObrig(o.id, "processo_sei", v)}
                    />
                    <CampoBlur
                      label="Exercício"
                      type="number"
                      value={o.exercicio}
                      disabled={dis}
                      onSave={(v) => saveObrig(o.id, "exercicio", v)}
                    />
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
                    <CampoBlur
                      label="Saldo disponível da NE"
                      type="moeda"
                      value={o.saldo_disponivel}
                      disabled={dis}
                      onSave={(v) => saveObrig(o.id, "saldo_disponivel", v)}
                    />
                    <CampoBlur
                      label="Valor a liquidar"
                      type="moeda"
                      value={o.valor_a_liquidar}
                      disabled={dis}
                      invalid={Number(o.valor_a_liquidar ?? 0) > Number(o.saldo_disponivel ?? 0)}
                      onSave={(v) => saveObrig(o.id, "valor_a_liquidar", v)}
                    />
                  </div>
                  <CampoBlur
                    multiline
                    label="Observação"
                    value={o.observacao}
                    disabled={dis}
                    onSave={(v) => saveObrig(o.id, "observacao", v)}
                  />
                  <div className="grid gap-2 lg:grid-cols-2">
                    {doc("solicitacao_ne", { obrigacaoId: o.id })}
                    {doc("nota_empenho", { obrigacaoId: o.id })}
                  </div>
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => delObrig(o.id)}>
                      <Trash2 className="mr-1 h-4 w-4" />
                      Remover obrigação
                    </Button>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
    );
  else if (n === 6)
    corpo = (
      <div className="space-y-3">{porObrig(["solicitacao_liquidacao", "aviso_liquidacao"], 6)}</div>
    );
  else if (n === 7)
    corpo = (
      <div className="space-y-3">
        {porObrig(["aviso_subempenho", "programacao_pagamento", "comprovante_pagamento"], 7)}
        <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
          A data de pagamento de cada instituição será o marco da futura Prestação de Contas (+30
          dias), em processo separado desta esteira.
        </p>
      </div>
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

  return (
    <div className="space-y-4">
      {corpo}
      <div className="rounded-md border border-dashed p-3">
        <p className="mb-1 text-xs font-semibold">Pendências da etapa {n}</p>
        <Pendencias itens={pend} />
      </div>
    </div>
  );
}
