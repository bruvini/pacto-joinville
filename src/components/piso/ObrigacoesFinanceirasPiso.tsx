import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { modoSubempenhoExplicito, valorLiquidadoNe, totalSubempenhado, obrigacaoRequerPagamento, bloqueioAlteracaoSubempenho, type SubempenhoAloc } from "@/lib/piso/alocacao";
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
  const [novaInstituicao, setNovaInstituicao] = useState<string | null>(null);
  const [novaNe, setNovaNe] = useState("");
  const salvarSub = async (id: string, valor: number | null) => {
    const { error } = await supabase.from("piso_subempenhos").update({ valor }).eq("id", id);
    if (error) { toast.error(error.message); return false; }
    onChange(); return true;
  };
  const cadastrar = async (o: any, cadeias: SubempenhoAloc[]) => {
    if (!canEdit || busy || !docCompleto(ctx, acharDoc(ctx.docs, "nota_empenho", {obrigacao_id:o.id}))) return;
    const anterior = cadeias.find(s => s.valor == null);
    if (anterior) { setNovaInstituicao(null); setNovaNe(""); setAberto(anterior.id); toast.error("Informe o valor das solicitações existentes antes de adicionar outra."); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.from("piso_subempenhos").insert({
        competencia_id: ctx.comp.id, participante_id: o.participante_id, obrigacao_id: o.id,
        sequencia: Math.max(0, ...cadeias.map(s => s.sequencia ?? 0)) + 1,
      }).select("id").single();
      if (error) throw error;
      setNovaInstituicao(null); setNovaNe(""); setAberto(data.id); onChange();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const impedimentoAlteracao = (o: any) => bloqueioAlteracaoSubempenho(o, ctx.docs);
  const trocarNe = async (s: SubempenhoAloc, destino: any, origem: any) => {
    if (!canEdit || busy || destino.id===origem.id || impedimentoAlteracao(origem) || impedimentoAlteracao(destino)) return;
    const numero=acharDoc(ctx.docs,"nota_empenho",{obrigacao_id:destino.id})?.numero;
    if (!confirm(`Vincular esta solicitação à NE ${numero}? Confira se a NE consta nos documentos SEI. Os documentos, assinaturas e encaminhamentos existentes serão preservados no PACTO.`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("piso_subempenhos").update({ obrigacao_id: destino.id }).eq("id",s.id).select("id").single();
      if (error || !data) throw error ?? new Error("O vínculo não foi confirmado.");
      toast.success("Nota de empenho vinculada atualizada."); onChange();
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const remover = async (id: string) => {
    if (!canEdit || busy || !confirm("Excluir esta solicitação do PACTO? Seus documentos, assinaturas e encaminhamentos locais serão removidos; uma cópia ficará no histórico de auditoria. Nenhum documento será excluído no SEI ou no e-Pública.")) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("piso_excluir_subempenho", {p_subempenho_id:id});
      if (error) throw error;
      toast.success("Solicitação excluída do PACTO."); setAberto(null); onChange();
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return ctx.obrigs.length === 0 ? (
      <p className="text-sm text-muted-foreground">Cadastre as obrigações na etapa de Empenho / liquidação.</p>
    ) : (
      ctx.parts.filter(p=>ctx.obrigs.some(o=>o.participante_id===p.id)).map(part => {
        const notas = ctx.obrigs.filter(o=>o.participante_id===part.id);
        const registradas = notas.filter(o=>Number(o.valor_empenhado ?? 0)>0 && docCompleto(ctx,acharDoc(ctx.docs,"nota_empenho",{obrigacao_id:o.id})));
        const selecionada = registradas.find(o=>o.id===novaNe);
        const total = notas.reduce((s,o)=>s+Math.round(totalSubempenhado(o.id,ctx.subempenhos ?? [])*100),0)/100;
        return <section key={part.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h3 className="font-semibold">{nomeInst(part)}</h3>
              {etapa === 6 && <p className="text-xs text-muted-foreground">Devido: {part.valor_devido == null ? "A apurar" : brl(part.valor_devido)} · Total das solicitações: {brl(total)}</p>}
            </div>
            {etapa===6 && canEdit && <Button size="sm" variant="outline" disabled={busy || !registradas.length} onClick={()=>{setNovaNe(registradas.length===1?registradas[0].id:"");setNovaInstituicao(part.id);}}><Plus className="mr-1 h-4 w-4"/>Cadastrar solicitação de subempenho</Button>}
          </div>
          {etapa===6 && <p className="text-xs text-muted-foreground">Uma NE pode ter nenhuma, uma ou várias solicitações; selecione a nota dentro da solicitação.</p>}
          {etapa===6 && <Dialog open={novaInstituicao===part.id} onOpenChange={open=>{if(!open && !busy){setNovaInstituicao(null);setNovaNe("");}}}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Nova solicitação de subempenho · {nomeInst(part)}</DialogTitle><DialogDescription>Selecione a nota de empenho que será utilizada nesta solicitação.</DialogDescription></DialogHeader>
              <label className="grid gap-2 text-sm font-medium">Nota de empenho
                <select className="h-10 rounded-md border bg-background px-3 text-sm" value={novaNe} onChange={e=>setNovaNe(e.target.value)} disabled={busy}>
                  <option value="">Selecione a NE</option>
                  {registradas.map(o=><option key={o.id} value={o.id}>NE {acharDoc(ctx.docs,"nota_empenho",{obrigacao_id:o.id})?.numero} · {o.ne_saldo_disponivel != null ? `Saldo global ${brl(Number(o.ne_saldo_disponivel))}` : brl(o.valor_empenhado)}</option>)}
                </select>
              </label>
              <Button disabled={busy || !selecionada} onClick={()=>selecionada && cadastrar(selecionada,(ctx.subempenhos ?? []).filter(s=>s.obrigacao_id===selecionada.id))}>Continuar</Button>
            </DialogContent>
          </Dialog>}
          {notas.map(o=>{
        const nota = acharDoc(ctx.docs, "nota_empenho", { obrigacao_id: o.id });
        const cadeias = (ctx.subempenhos ?? []).filter(s => s.obrigacao_id === o.id);
        const valorReferencia = valorLiquidadoNe(o, ctx.obrigs, ctx.subempenhos) ?? (!modoSubempenhoExplicito(o.participante_id, ctx.obrigs, ctx.subempenhos) ? part.valor_devido : null);
        const usaPagamento = obrigacaoRequerPagamento(o, ctx.obrigs, ctx.subempenhos);
        return (
          <div key={o.id} className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-semibold">NE {nota?.numero ?? "a registrar"} · {etapa===6 ? `Empenhado: ${o.valor_empenhado == null ? "A informar" : brl(o.valor_empenhado)}` : `A pagar: ${valorReferencia == null ? "A informar" : brl(valorReferencia)}`}</p>

            {etapa === 6 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="mr-auto text-sm text-muted-foreground">Valor das solicitações: {brl(totalSubempenhado(o.id, cadeias))} · Subempenhado (documentado): {brl(totalSubempenhado(o.id, cadeias.filter(s => docCompleto(ctx, acharDoc(ctx.docs, "aviso_subempenho", { obrigacao_id: o.id, subempenho_id: s.legado ? null : s.id })))))} </p>
                </div>
                {cadeias.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma solicitação cadastrada para esta NE — utilização facultativa.</p>}
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
                    <label className="grid gap-2 text-sm font-medium rounded-md border p-3">Nota de empenho vinculada
                      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={o.id} disabled={dis || busy || impedimentoAlteracao(o)} onChange={e=>{const destino=registradas.find(n=>n.id===e.target.value);if(destino) void trocarNe(s,destino,o);}}>
                        {!registradas.some(n=>n.id===o.id) && <option value={o.id}>NE {nota?.numero ?? "a registrar"}</option>}
                        {registradas.map(n=><option key={n.id} value={n.id} disabled={n.id!==o.id && !!impedimentoAlteracao(n)}>NE {acharDoc(ctx.docs,"nota_empenho",{obrigacao_id:n.id})?.numero} · {n.ne_saldo_disponivel != null ? `Saldo global ${brl(Number(n.ne_saldo_disponivel))}` : brl(n.valor_empenhado)}</option>)}
                      </select>
                      <span className="text-xs font-normal text-muted-foreground">{impedimentoAlteracao(o) ? "Vínculo protegido: existe pagamento ou anulação nesta NE." : "A alteração preserva os documentos e assinaturas da solicitação."}</span>
                    </label>
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
                    {canEdit && <Button size="sm" variant="ghost" className="text-destructive" disabled={busy || !!impedimentoAlteracao(o)} onClick={()=>remover(s.id)}><Trash2 className="mr-1 h-4 w-4"/>Excluir solicitação</Button>}
                    </DialogContent></Dialog>
                  </div>;
                })}
              </div>
            ) : !usaPagamento ? (
              <p className="text-xs text-muted-foreground">NE não utilizada. Não exige documentos de pagamento.</p>
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
      })}
      </section>;
      })
    );
}
