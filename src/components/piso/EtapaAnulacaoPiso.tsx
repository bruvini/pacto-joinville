import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CampoBlur } from "@/components/piso/campos";
import { DocumentoCard } from "@/components/piso/DocumentoCard";
import { SolicitacaoAnulacaoPiso } from "@/components/piso/SolicitacaoAnulacaoPiso";
import { envioAnulacaoConfirmado } from "@/lib/piso/anulacao-envio";
import { brl } from "@/lib/format";
import { acharDoc, docCompleto, type CtxPiso } from "@/lib/piso/regras";
import { programacaoPagamentoProntaPiso, saldosAnulacaoPiso } from "@/lib/piso/anulacao";

export function EtapaAnulacaoPiso({
  ctx, pool, canEdit, onChange,
}: {
  ctx: CtxPiso; pool: any[]; canEdit: boolean; onChange: () => void;
}) {
  const saldos = saldosAnulacaoPiso(ctx.obrigs);
  const nome = (participanteId: string) =>
    ctx.parts.find(p => p.id === participanteId)?.prestadores?.nome_instituicao
      ?? "Instituição não identificada";
  const salvar = async (obrigacaoId: string, valor: number | null) => {
    const { error } = await supabase.from("piso_obrigacoes")
      .update({ valor_anulado: valor }).eq("id", obrigacaoId);
    if (error) { toast.error(error.message); return false; }
    onChange(); return true;
  };
  return <div className="space-y-4">
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
      Etapa condicional: a Nota de Empenho antecipada superou o valor necessário
      após a conciliação do InvestSUS. Preencha número, link e data SEI da
      Solicitação de Anulação, registre as quatro assinaturas e confirme seu envio
      à SEFAZ.UCG.AEO. Após o retorno, registre o número, link e data SEI do
      Aviso de Movimento de Anulação e seu valor efetivo. Nenhum valor é
      considerado anulado apenas pelo cálculo do saldo.
    </div>
    {saldos.map(saldo => {
      const programada = programacaoPagamentoProntaPiso(ctx.docs, ctx.obrigs);
      const solicitacao = acharDoc(ctx.docs,"solicitacao_anulacao",{obrigacao_id:saldo.obrigacaoId});
      const apta = docCompleto(ctx,solicitacao);
      const enviada = apta && envioAnulacaoConfirmado(ctx,solicitacao?.id);
      const aviso = acharDoc(ctx.docs,"aviso_anulacao",{obrigacao_id:saldo.obrigacaoId});
      const avisoCompleto = docCompleto(ctx,aviso);
      return <section key={saldo.obrigacaoId} className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">{nome(saldo.participanteId)} · NE {acharDoc(ctx.docs,"nota_empenho",{obrigacao_id:saldo.obrigacaoId})?.numero ?? "a informar"}</h3>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            ["NE originalmente empenhada",saldo.empenhado],
            ["Necessário após conciliação",saldo.necessario],
            ["Saldo previsto a anular",saldo.previsto],
            ["Efetivamente anulado",saldo.anulado],
          ].map(([label,valor])=><div key={String(label)} className="rounded border p-2">
            <span className="block text-xs text-muted-foreground">{label}</span>
            <strong>{valor == null ? "Pendente" : brl(Number(valor))}</strong>
          </div>)}
        </div>
        {!programada ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
            Aguardando uma Programação de pagamento completa na competência.
            Preencha número, link e data SEI em qualquer NE utilizada para liberar a solicitação de anulação.
          </div>
        ) : <>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">1. Solicitação de Anulação — SEFAZ</h4>
          <SolicitacaoAnulacaoPiso ctx={ctx} obrigacaoId={saldo.obrigacaoId}
            pool={pool} canEdit={canEdit} onChange={onChange} />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">2. Aviso de Movimento de Anulação</h4>
          {!enviada ? <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            Preencha os dados SEI da Solicitação de Anulação, registre as quatro
            assinaturas e confirme o encaminhamento à SEFAZ.UCG.AEO para liberar
            o cadastro do Aviso de Movimento de Anulação.
          </p> : <>
            <DocumentoCard ctx={ctx} competenciaId={ctx.comp.id}
              tipo="aviso_anulacao" obrigacaoId={saldo.obrigacaoId}
              pool={pool} canEdit={canEdit} onChange={onChange} />
            <CampoBlur identity={saldo.obrigacaoId+":valor_anulado"}
              label="Valor efetivamente anulado conforme Aviso da SEFAZ"
              type="moeda" value={saldo.anulado} disabled={!canEdit || !avisoCompleto}
              invalid={saldo.anulado != null && Math.abs(saldo.anulado-saldo.previsto)>0.01}
              hint="Não é preenchido automaticamente. Confira o valor publicado no documento SEI."
              onSave={v=>salvar(saldo.obrigacaoId,v)} />
          </>}
        </div>
        </>}
      </section>;
    })}
  </div>;
}
