import { brl } from "@/lib/format";
import {
  descreverSituacaoFinanceiraEmenda,
  type ValoresResumoFinanceiro,
} from "@/lib/emendas/resumo-financeiro";

export function ResumoFinanceiroEmenda({ valores }: { valores: ValoresResumoFinanceiro }) {
  const situacao = descreverSituacaoFinanceiraEmenda(valores);
  const metricas = [
    {
      titulo: "Limite vigente",
      valor: valores.limiteVigente,
      descricao: "Valor original + rendimentos + ajustes formais.",
    },
    {
      titulo: "Reservado",
      valor: valores.reservado,
      descricao: "Solicitações de empenho aguardando emissão da NE.",
    },
    {
      titulo: "NE registradas",
      valor: valores.empenhado,
      descricao: "Empenhos emitidos, líquidos de anulações registradas.",
    },
    {
      titulo: "Disponível",
      valor: valores.disponivel,
      descricao: "Limite ainda não reservado nem comprometido em NE.",
    },
  ];

  return (
    <section aria-labelledby="emenda-situacao-financeira" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="space-y-1">
        <h2 id="emenda-situacao-financeira" className="text-sm font-semibold">
          Situação dos recursos da emenda
        </h2>
        <p className="text-xs text-muted-foreground">
          {situacao.narrativa}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricas.map((item) => (
          <div key={item.titulo} className="min-w-0 rounded-lg border bg-muted/10 p-3">
            <p className="text-xs font-medium text-muted-foreground">{item.titulo}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{brl(item.valor)}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.descricao}</p>
          </div>
        ))}
      </div>
      {valores.limiteVigente > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
            <strong>{situacao.titulo}</strong>
            <span className="text-muted-foreground">{situacao.percentual}% do limite comprometido</span>
          </div>
          <div
            role="img"
            aria-label="Distribuição do limite vigente: notas de empenho, reservas e saldo disponível"
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary" style={{ width: `${situacao.distribuicao.ne}%` }} />
            <div className="h-full bg-amber-500" style={{ width: `${situacao.distribuicao.reserva}%` }} />
            <div className="h-full bg-emerald-500/60" style={{ width: `${situacao.distribuicao.livre}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span><span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary" />Em NEs</span>
            <span><span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" />Em reserva</span>
            <span><span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500/60" />Livre</span>
          </div>
        </div>
      )}
      <p className="border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
        Valores de controle orçamentário. NE emitida não equivale a recurso liberado nem a pagamento realizado.
        Liberações, comprovantes e pagamentos são acompanhados nos lançamentos.
      </p>
    </section>
  );
}
