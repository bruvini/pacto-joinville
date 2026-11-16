import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { valorAplicadoNe, totalSubempenhado, type SubempenhoAloc } from "@/lib/piso/alocacao";
import { CampoBlur } from "@/components/piso/campos";
import { brl } from "@/lib/format";
import {
  acharDoc,
  docCompleto,
  dentroTolerancia,
  encaminhado,
  type CtxPiso,
} from "@/lib/piso/regras";

type DocumentoExtra = {
  participanteId?: string;
  obrigacaoId?: string;
  subempenhoId?: string | null;
  encaminhavel?: boolean;
  canEditOverride?: boolean;
  destinoEncaminhamento?: string;
  extraCampos?: ReactNode;
};

type Props = {
  tipos: string[];
  etapa: 6 | 7;
  ctx: CtxPiso;
  canEdit: boolean;
  dis: boolean;
  renderDocumento: (tipo: string, extra?: DocumentoExtra) => ReactNode;
  salvarObrigacao: (id: string, campo: string, valor: any) => Promise<boolean>;
  onChange: () => void;
};

const nomeInst = (p: any) => p?.prestadores?.nome_instituicao ?? "Instituição";

/**
 * Etapas financeiras 6 e 7. O status das assinaturas e encaminhamentos
 * continua vindo da competência; não altera as regras de aprovação.
 */
export function ObrigacoesFinanceirasPiso({
  tipos,
  etapa,
  ctx,
  canEdit,
  dis,
  renderDocumento,
  salvarObrigacao,
  onChange,
}: Props) {
  const doc = renderDocumento;
  const saveObrig = salvarObrigacao;
  const [aberto, setAberto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const salvarSub = async (id: string, valor: number | null) => {
    const { error } = await supabase.from("piso_subempenhos").update({ valor }).eq("id", id);
    if (error) { toast.error(error.message); return false; }
    onChange(); return true;
  };
  const cadastrar = async (o: any, cadeias: SubempenhoAloc[]) => {
    if (cadeias.some(s => s.valor == null)) { toast.error("Informe o valor das solicitações existentes antes de adicionar outra."); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.from("piso_subempenhos").insert({
        competencia_id: ctx.comp.id, participante_id: o.participante_id, obrigacao_id: o.id,
        sequencia: Math.max(0, ...cadeias.map(s => s.sequencia ?? 0)) + 1,
      }).select("id").single();
      if (error) throw error;
      setAberto(data.id); onChange();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const remover = async (id: string) => {
    if (!confirm("Remover esta solicitação sem documentos?")) return;
    const { error } = await supabase.from("piso_subempenhos").delete().eq("id", id);
    if (error) toast.error(error.message); else { setAberto(null); onChange(); }
  };
  return ctx.obrigs.length === 0 ? (
      <p className="text-sm text-muted-foreground">Cadastre as obrigações na Etapa 5.</p>
    ) : (
      ctx.obrigs.map((o) => {
        const part = ctx.parts.find((p) => p.id === o.participante_id);
        const valorReferencia = valorAplicadoNe(o, ctx.obrigs) ?? (!o.alocacao_manual ? part?.valor_devido : null);
        const nota = acharDoc(ctx.docs, "nota_empenho", { obrigacao_id: o.id });
        const cadeias = (ctx.subempenhos ?? []).filter(s => s.obrigacao_id === o.id);

        return (
          <div key={o.id} className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-semibold">
              {nomeInst(part)} · {nota?.numero ? `NE ${nota.numero} · ` : ""}{valorReferencia == null ? "Valor a informar" : brl(valorReferencia)}
            </p>

            {etapa === 6 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="mr-auto text-sm text-muted-foreground">Valor das solicitações: {brl(totalSubempenhado(o.id, cadeias))} · Subempenhado (documentado): {brl(totalSubempenhado(o.id, cadeias.filter(s => docCompleto(ctx, acharDoc(ctx.docs, "aviso_subempenho", { obrigacao_id: o.id, subempenho_id: s.legado ? null : s.id })))))} </p>
                  {canEdit && <Button size="sm" variant="outline" disabled={busy || !docCompleto(ctx, nota) || o.valor_empenhado == null || o.valor_a_liquidar == null || o.valor_a_liquidar <= 0} onClick={() => cadastrar(o, cadeias)}><Plus className="mr-1 h-4 w-4"/>Cadastrar solicitação de subempenho</Button>}
                </div>
                {cadeias.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma solicitação cadastrada para esta NE.</p>}
                {cadeias.map(s => {
                  const escopo = { obrigacao_id: o.id, subempenho_id: s.legado ? null : s.id };
                  const props = { obrigacaoId: o.id, subempenhoId: escopo.subempenho_id };
                  const solicitacao = acharDoc(ctx.docs, "solicitacao_liquidacao", escopo);
                  const aviso = acharDoc(ctx.docs, "aviso_liquidacao", escopo);
                  const sub = acharDoc(ctx.docs, "aviso_subempenho", escopo);
                  const solicitacaoCompleta = docCompleto(ctx, solicitacao);
                  const avisoEncaminhado = solicitacaoCompleta && docCompleto(ctx, aviso) && encaminhado(ctx.encaminhamentos, aviso?.id);
                  return <div key={s.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2"><div className="mr-auto"><p className="font-medium">Solicitação {s.sequencia}{s.legado ? " · registro anterior" : ""}</p><p className="text-xs text-muted-foreground">{s.valor == null ? "Valor a informar" : brl(s.valor)}</p></div><Badge variant="outline">{docCompleto(ctx, sub) && avisoEncaminhado ? "Subempenho registrado" : avisoEncaminhado ? "Aguardando subempenho" : solicitacaoCompleta ? "Em liquidação" : "Solicitação em andamento"}</Badge><Button size="sm" variant="outline" onClick={() => setAberto(s.id)}>Abrir solicitação</Button></div>
                    <Dialog open={aberto === s.id} onOpenChange={open => setAberto(open ? s.id : null)}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Solicitação de subempenho · {nomeInst(part)}</DialogTitle><DialogDescription>NE {nota?.numero ?? "a informar"} · {valorReferencia == null ? "Valor a informar" : brl(valorReferencia)}</DialogDescription></DialogHeader>
                    <CampoBlur label="Valor desta solicitação de subempenho" type="moeda" value={s.valor} disabled={dis} onSave={v => salvarSub(s.id, v)} />
                    {doc("solicitacao_liquidacao", props)}

                {solicitacaoCompleta ? (
                  doc("aviso_liquidacao", {
                    ...props,
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
                    {doc("aviso_subempenho", props)}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                    <b className="block text-foreground">Aviso de Movimento - Subempenho</b>
                    Este bloco será liberado depois que o Aviso de Movimento - Empenho em Liquidação
                    estiver completo e encaminhado para SEFAZ.UAF.ADE.
                  </div>
                )}
                    {canEdit && !s.legado && !ctx.docs.some(d => d.subempenho_id === s.id) && <Button size="sm" variant="ghost" onClick={()=>remover(s.id)}>Remover rascunho</Button>}
                    </DialogContent></Dialog>
                  </div>;
                })}
              </div>
            ) : (
              <>
                <div className="grid gap-2 lg:grid-cols-2">
                  {tipos.map((t) => doc(t, {
                    obrigacaoId: o.id,
                    extraCampos: t === "comprovante_pagamento" ? (
                      <div className="grid gap-2 sm:grid-cols-2">
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
                          invalid={o.valor_pago != null && !dentroTolerancia(o.valor_pago, valorReferencia)}
                          onSave={(v) => saveObrig(o.id, "valor_pago", v)}
                        />
                      </div>
                    ) : undefined,
                  }))}
                </div>
                <CampoBlur
                  multiline
                  label="Observação (devolução, parcial ou reprogramação)"
                  value={o.observacao}
                  disabled={dis}
                  onSave={(v) => saveObrig(o.id, "observacao", v)}
                />
              </>
            )}
          </div>
        );
      })
    );
}
