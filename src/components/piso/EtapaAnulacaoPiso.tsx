import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CampoBlur } from "@/components/piso/campos";
import { DocumentoCard } from "@/components/piso/DocumentoCard";
import { brl } from "@/lib/format";
import { acharDoc, docCompleto, encaminhado, type CtxPiso } from "@/lib/piso/regras";
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
      após a conciliação do InvestSUS. Cada obrigação exige solicitação com número
      e link SEI, matriz de assinaturas e envio à SEFAZ. Após o retorno, registre
      o Aviso de Movimento de Anulação e seu valor efetivo. Nenhum valor é
      considerado anulado apenas pelo cálculo do saldo.
    </div>
    {saldos.map(saldo => {
      const programada = programacaoPagamentoProntaPiso(ctx.docs,saldo.obrigacaoId);
      const solicitacao = acharDoc(ctx.docs,"solicitacao_anulacao",{obrigacao_id:saldo.obrigacaoId});
      const apta = docCompleto(ctx,solicitacao);
      const enviada = apta && encaminhado(ctx.encaminhamentos,solicitacao?.id);
      const aviso = acharDoc(ctx.docs,"aviso_anulacao",{obrigacao_id:saldo.obrigacaoId});
      const avisoCompleto = docCompleto(ctx,aviso);
      return <section key={saldo.obrigacaoId} className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">{nome(saldo.participanteId)}</h3>
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
            Aguardando a Programação de Pagamento desta instituição na Etapa 7.
            Preencha número SEI, link e data no bloco correspondente para liberar os documentos.
            As demais instituições podem avançar de forma independente.
          </div>
        ) : <>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">1. Solicitação de Anulação — SEFAZ</h4>
          <DocumentoCard ctx={ctx} competenciaId={ctx.comp.id}
            tipo="solicitacao_anulacao" obrigacaoId={saldo.obrigacaoId}
            pool={pool} canEdit={canEdit} onChange={onChange}
            encaminhavel destinoEncaminhamento="SEFAZ.UCG.AEO" />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">2. Aviso de Movimento de Anulação</h4>
          {!enviada ? <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            Complete a matriz de assinaturas e registre o encaminhamento à SEFAZ
            para liberar o cadastro do Aviso de Movimento de Anulação.
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
