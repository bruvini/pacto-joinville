import type { ReactNode } from "react";
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
  encaminhavel?: boolean;
  canEditOverride?: boolean;
  destinoEncaminhamento?: string;
};

type Props = {
  tipos: string[];
  etapa: 6 | 7;
  ctx: CtxPiso;
  canEdit: boolean;
  dis: boolean;
  renderDocumento: (tipo: string, extra?: DocumentoExtra) => ReactNode;
  salvarObrigacao: (id: string, campo: string, valor: any) => Promise<boolean>;
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
}: Props) {
  const doc = renderDocumento;
  const saveObrig = salvarObrigacao;
  return =>
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
}
