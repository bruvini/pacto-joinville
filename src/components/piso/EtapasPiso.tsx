import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CampoBlur, Pendencias } from "@/components/piso/campos";
import { DocumentoCard } from "@/components/piso/DocumentoCard";
import { ArquivosEvidencia, enviarArquivo } from "@/components/piso/ArquivosEvidencia";
import { auditarPlanilha, totalCriticas } from "@/lib/piso/planilha";
import { elegiveis, iguaisCentavo, pendenciasEtapa, soma, type CtxPiso } from "@/lib/piso/regras";
import { brl } from "@/lib/format";

interface Props {
  n: number;
  ctx: CtxPiso;
  arquivos: any[];
  pool: any[];
  canEdit: boolean;
  onChange: () => void;
}

const nomeInst = (p: any) => p?.prestadores?.nome_instituicao ?? "Instituição";

export function EtapaPiso({ n, ctx, arquivos, pool, canEdit, onChange }: Props) {
  const c = ctx.comp;
  const cid = c.id as string;
  const err = (e: any) => toast.error(e.message ?? String(e));
  const saveComp = async (campo: string, v: any) => {
    const { error } = await supabase.from("piso_competencias").update({ [campo]: v } as any).eq("id", cid);
    error ? err(error) : onChange();
  };
  const savePart = async (pid: string, campo: string, v: any) => {
    const { error } = await supabase.from("piso_participantes").update({ [campo]: v } as any).eq("id", pid);
    error ? err(error) : onChange();
  };
  const saveObrig = async (oid: string, campo: string, v: any) => {
    const { error } = await supabase.from("piso_obrigacoes").update({ [campo]: v } as any).eq("id", oid);
    error ? err(error) : onChange();
  };
  const doc = (tipo: string, extra: { participanteId?: string; obrigacaoId?: string; encaminhavel?: boolean } = {}) => (
    <DocumentoCard key={tipo + (extra.obrigacaoId ?? "")} ctx={ctx} competenciaId={cid} tipo={tipo} participanteId={extra.participanteId ?? null}
      obrigacaoId={extra.obrigacaoId ?? null} pool={pool} canEdit={canEdit} encaminhavel={extra.encaminhavel} onChange={onChange} />
  );
  const eleg = elegiveis(ctx.parts);
  const pend = pendenciasEtapa(n, ctx);
  const dis = !canEdit;

  const porObrig = (tipos: string[], encaminhavel?: string) =>
    ctx.obrigs.length === 0 ? <p className="text-sm text-muted-foreground">Cadastre as obrigações na Etapa 5.</p> :
      ctx.obrigs.map((o) => (
        <div key={o.id} className="space-y-2 rounded-md bg-muted/30 p-3">
          <p className="text-sm font-semibold">{nomeInst(ctx.parts.find((p) => p.id === o.participante_id))} · {o.origem_recurso === "saldo_afc" ? "Saldo AFC" : "Recurso atual"} · {brl(o.valor_a_liquidar)}</p>
          <div className="grid gap-2 lg:grid-cols-2">{tipos.map((t) => doc(t, { obrigacaoId: o.id, encaminhavel: t === encaminhavel }))}</div>
          {n === 7 && (
            <div className="grid gap-2 sm:grid-cols-2">
              <CampoBlur label="Data de pagamento" type="date" value={o.data_pagamento} disabled={dis} onSave={(v) => saveObrig(o.id, "data_pagamento", v)} />
              <CampoBlur label="Valor pago" type="moeda" value={o.valor_pago} disabled={dis} invalid={o.valor_pago != null && !iguaisCentavo(o.valor_pago, o.valor_a_liquidar)} onSave={(v) => saveObrig(o.id, "valor_pago", v)} />
            </div>
          )}
        </div>
      ));

  const importarPlanilha = async (p: any, file: File) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      const resumo = auditarPlanilha(rows);
      await enviarArquivo(file, cid, "planilha_carga", p.id);
      await savePart(p.id, "auditoria_resumo", resumo);
      toast.success(`Planilha auditada: ${resumo.linhas} linhas, ${totalCriticas(resumo)} críticas.`);
    } catch (e) { err(e); }
  };

  const addObrig = async (pid: string) => {
    const { error } = await supabase.from("piso_obrigacoes").insert({ participante_id: pid, origem_recurso: "recurso_atual" } as any);
    error ? err(error) : onChange();
  };
  const delObrig = async (oid: string) => {
    if (!confirm("Remover obrigação?")) return;
    const { error } = await supabase.from("piso_obrigacoes").delete().eq("id", oid);
    error ? err(error) : onChange();
  };

  let corpo: React.ReactNode = null;
  switch (n) {
    case 1:
      corpo = (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <CampoBlur label="Processo SEI da competência" value={c.processo_sei} disabled={dis} onSave={(v) => saveComp("processo_sei", v)} />
            <CampoBlur label="Link do processo SEI" value={c.link_processo_sei} disabled={dis} onSave={(v) => saveComp("link_processo_sei", v)} />
          </div>
          {ctx.parts.map((p) => {
            const r = p.auditoria_resumo;
            return (
              <div key={p.id} className="rounded-md border p-3 space-y-2">
                <p className="text-sm font-semibold">{nomeInst(p)}</p>
                {canEdit && (
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer text-primary">
                    <FileSpreadsheet className="h-4 w-4" />Enviar Planilha de Carga (.xlsx/.csv)
                    <input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importarPlanilha(p, f); }} />
                  </label>
                )}
                {r && (
                  <p className="text-xs text-muted-foreground">
                    {r.linhas} linhas · CPF inválido {r.cpfs_invalidos} · duplicado {r.cpfs_duplicados} · sem CNES {r.sem_cnes} · sem CBO {r.sem_cbo} · jornada {r.jornada_invalida} · salário {r.salario_invalido}
                    {r.colunas_ausentes?.length ? ` · colunas ausentes: ${r.colunas_ausentes.join(", ")}` : ""}
                  </p>
                )}
                <ArquivosEvidencia arquivos={arquivos} competenciaId={cid} categoria="planilha_carga" participanteId={p.id} canEdit={false} onChange={onChange} />
              </div>
            );
          })}
        </div>
      );
      break;
    case 2: {
      const div = c.valor_homologado != null && c.valor_apurado_investsus != null && !iguaisCentavo(c.valor_homologado, c.valor_apurado_investsus);
      corpo = (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <CampoBlur label="Carga no InvestSUS" type="date" value={c.investsus_carga_em} disabled={dis} onSave={(v) => saveComp("investsus_carga_em", v)} />
            <CampoBlur label="Confirmação InvestSUS" type="date" value={c.investsus_confirmacao_em} disabled={dis} onSave={(v) => saveComp("investsus_confirmacao_em", v)} />
            <CampoBlur label="Valor apurado (InvestSUS)" type="moeda" value={c.valor_apurado_investsus} disabled={dis} onSave={(v) => saveComp("valor_apurado_investsus", v)} />
            <CampoBlur label="Nº Portaria GM/MS" value={c.portaria_gm_numero} disabled={dis} onSave={(v) => saveComp("portaria_gm_numero", v)} />
            <CampoBlur label="Data do ato" type="date" value={c.portaria_gm_data_ato} disabled={dis} onSave={(v) => saveComp("portaria_gm_data_ato", v)} />
            <CampoBlur label="Data de publicação" type="date" value={c.portaria_gm_data_publicacao} disabled={dis} onSave={(v) => saveComp("portaria_gm_data_publicacao", v)} />
            <CampoBlur label="Edição do DOU" value={c.portaria_gm_edicao} disabled={dis} onSave={(v) => saveComp("portaria_gm_edicao", v)} />
            <CampoBlur className="sm:col-span-2" label="URL do DOU" value={c.portaria_gm_url_dou} disabled={dis} hint="https://www.in.gov.br/web/dou/..." onSave={(v) => saveComp("portaria_gm_url_dou", v)} />
            <CampoBlur label="Valor homologado" type="moeda" value={c.valor_homologado} disabled={dis} invalid={div} onSave={(v) => saveComp("valor_homologado", v)} />
            <CampoBlur label="Desconto de saldo" type="moeda" value={c.desconto_saldo} disabled={dis} onSave={(v) => saveComp("desconto_saldo", v)} />
            <CampoBlur label="Acerto de contas" type="moeda" value={c.acerto_contas} disabled={dis} onSave={(v) => saveComp("acerto_contas", v)} />
          </div>
          {div && <CampoBlur multiline label="Justificativa da divergência (obrigatória)" value={c.justificativa_conciliacao} disabled={dis} onSave={(v) => saveComp("justificativa_conciliacao", v)} />}
          <ArquivosEvidencia arquivos={arquivos} competenciaId={cid} categoria="investsus" canEdit={canEdit} onChange={onChange} label="Anexar saída do InvestSUS" />
        </div>
      );
      break;
    }
    case 3:
      corpo = (
        <div className="space-y-3">
          <div className="grid gap-2 lg:grid-cols-3">{["minuta", "memorando", "portaria_municipal"].map((t) => doc(t))}</div>
          <CampoBlur className="max-w-xs" label="Total publicado na portaria municipal" type="moeda" value={c.total_publicado_municipal} disabled={dis}
            invalid={c.total_publicado_municipal != null && !iguaisCentavo(c.total_publicado_municipal, c.valor_homologado)}
            hint={`Homologado: ${brl(c.valor_homologado)}`} onSave={(v) => saveComp("total_publicado_municipal", v)} />
        </div>
      );
      break;
    case 4:
      corpo = (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <CampoBlur label="Data do crédito no FMS" type="date" value={c.credito_fms_data} disabled={dis} onSave={(v) => saveComp("credito_fms_data", v)} />
            <CampoBlur label="Valor creditado" type="moeda" value={c.credito_fms_valor} disabled={dis} onSave={(v) => saveComp("credito_fms_valor", v)} />
            <CampoBlur label="Link do extrato/crédito" value={c.credito_fms_link} disabled={dis} onSave={(v) => saveComp("credito_fms_link", v)} />
            <CampoBlur label="Saldo AFC anterior" type="moeda" value={c.saldo_afc_anterior} disabled={dis} onSave={(v) => saveComp("saldo_afc_anterior", v)} />
            <CampoBlur label="Fonte recurso atual" value={c.fonte_recurso_atual} disabled={dis} onSave={(v) => saveComp("fonte_recurso_atual", v)} />
            <CampoBlur label="Fonte saldo AFC" value={c.fonte_saldo_afc} disabled={dis} onSave={(v) => saveComp("fonte_saldo_afc", v)} />
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b"><tr><th className="py-2">Instituição</th><th>Valor devido</th><th>Recurso atual</th><th>Saldo AFC</th></tr></thead>
            <tbody>
              {eleg.map((p) => (
                <tr key={p.id} className="border-b align-top">
                  <td className="py-2 font-medium">{nomeInst(p)}</td>
                  <td><CampoBlur label="" type="moeda" value={p.valor_devido} disabled={dis} onSave={(v) => savePart(p.id, "valor_devido", v)} /></td>
                  <td><CampoBlur label="" type="moeda" value={p.valor_recurso_atual} disabled={dis} onSave={(v) => savePart(p.id, "valor_recurso_atual", v)} /></td>
                  <td><CampoBlur label="" type="moeda" value={p.valor_saldo_afc} disabled={dis} onSave={(v) => savePart(p.id, "valor_saldo_afc", v)} /></td>
                </tr>
              ))}
              <tr className="font-semibold"><td className="py-2">Total</td><td>{brl(soma(eleg.map((p) => p.valor_devido)))}</td><td>{brl(soma(eleg.map((p) => p.valor_recurso_atual)))}</td><td>{brl(soma(eleg.map((p) => p.valor_saldo_afc)))}</td></tr>
            </tbody>
          </table>
        </div>
      );
      break;
    case 5:
      corpo = (
        <div className="space-y-4">
          {eleg.map((p) => (
            <div key={p.id} className="rounded-md border p-3 space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold mr-auto">{nomeInst(p)} · devido {brl(p.valor_devido)}</p>
                {canEdit && <Button size="sm" variant="outline" onClick={() => addObrig(p.id)}><Plus className="h-4 w-4 mr-1" />Obrigação</Button>}
              </div>
              {ctx.obrigs.filter((o) => o.participante_id === p.id).map((o) => (
                <div key={o.id} className="space-y-2 rounded-md bg-muted/30 p-3">
                  <div className="grid gap-2 sm:grid-cols-5 items-end">
                    <div className="space-y-1">
                      <label className="text-xs">Origem</label>
                      <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={dis} value={o.origem_recurso}
                        onChange={(e) => saveObrig(o.id, "origem_recurso", e.target.value)}>
                        <option value="recurso_atual">Recurso atual</option><option value="saldo_afc">Saldo AFC</option>
                      </select>
                    </div>
                    <CampoBlur label="Fonte" value={o.fonte} disabled={dis} onSave={(v) => saveObrig(o.id, "fonte", v)} />
                    <CampoBlur label="Saldo disponível" type="moeda" value={o.saldo_disponivel} disabled={dis} onSave={(v) => saveObrig(o.id, "saldo_disponivel", v)} />
                    <CampoBlur label="Valor a liquidar" type="moeda" value={o.valor_a_liquidar} disabled={dis} onSave={(v) => saveObrig(o.id, "valor_a_liquidar", v)} />
                    {canEdit && <Button size="icon" variant="ghost" onClick={() => delObrig(o.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                  <div className="grid gap-2 lg:grid-cols-2">{["solicitacao_ne", "nota_empenho"].map((t) => doc(t, { obrigacaoId: o.id }))}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
      break;
    case 6:
      corpo = <div className="space-y-3">{porObrig(["solicitacao_liquidacao", "aviso_liquidacao"], "aviso_liquidacao")}</div>;
      break;
    case 7:
      corpo = <div className="space-y-3">{porObrig(["aviso_subempenho", "programacao_pagamento", "comprovante_pagamento"])}</div>;
      break;
    case 8:
      corpo = (
        <div className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ["Homologado", c.valor_homologado], ["Publicado", c.total_publicado_municipal],
              ["Total devido", soma(eleg.map((p) => p.valor_devido))], ["Total pago", soma(ctx.obrigs.map((o) => o.valor_pago))],
            ].map(([l, v]) => (
              <div key={l as string} className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="font-semibold">{brl(v as number)}</p></div>
            ))}
          </div>
          <CampoBlur multiline label="Observação de encerramento" value={c.observacao} disabled={dis} onSave={(v) => saveComp("observacao", v)} />
        </div>
      );
      break;
  }

  return (
    <div className="space-y-4">
      {corpo}
      <div className="rounded-md border border-dashed p-3">
        <p className="text-xs font-semibold mb-1">Pendências da etapa {n}</p>
        <Pendencias itens={pend} />
      </div>
    </div>
  );
}
