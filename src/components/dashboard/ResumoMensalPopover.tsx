import { ChartColumnIncreasing } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { brl, brlCompact } from "@/lib/format";
import type { ResumoSerieMensal } from "@/lib/dashboard/evolucao";

/** Ícone discreto de estatísticas para os quatro gráficos financeiros.
 * Abre por clique, toque ou teclado, sem alterar a área útil dos gráficos.
 */
export function ResumoMensalPopover({
  titulo, indicador, resumo,
}: {
  titulo: string;
  indicador: string;
  resumo: ResumoSerieMensal;
}) {
  const percentual = resumo.variacaoPct == null
    ? "—"
    : `${resumo.variacaoPct > 0 ? "+" : ""}${resumo.variacaoPct.toLocaleString("pt-BR", {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      })}%`;
  const comparacao = resumo.anteriorCompetencia && resumo.ultimaCompetencia
    ? `${resumo.anteriorCompetencia} → ${resumo.ultimaCompetencia}`
    : "Sem competência anterior";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Estatísticas mensais · ${titulo}`}
          aria-label={`Ver média, mediana e variação mensal de ${titulo}`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChartColumnIncreasing className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={7} className="w-72 space-y-3 p-3">
        <div>
          <p className="text-sm font-semibold">Resumo mensal · {titulo}</p>
          <p className="text-xs text-muted-foreground">
            Indicador: {indicador} · {resumo.meses} competência(s) no recorte
          </p>
        </div>
        <dl className="space-y-2 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">Média mensal</dt>
            <dd className="font-semibold tabular-nums" title={resumo.media == null ? undefined : brl(resumo.media)}>
              {resumo.media == null ? "—" : brlCompact(resumo.media)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">Mediana mensal</dt>
            <dd className="font-semibold tabular-nums" title={resumo.mediana == null ? undefined : brl(resumo.mediana)}>
              {resumo.mediana == null ? "—" : brlCompact(resumo.mediana)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t pt-2">
            <dt className="text-muted-foreground">Variação mensal</dt>
            <dd className="font-semibold tabular-nums">{percentual}</dd>
          </div>
        </dl>
        <p className="text-[11px] text-muted-foreground">
          {comparacao}
          {resumo.variacaoPct == null && resumo.anteriorValor === 0
            ? " · base anterior igual a zero"
            : ""}
        </p>
        <p className="border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
          Média e mediana consideram somente os meses com competência do módulo,
          inclusive valores zero registrados. A variação compara os dois últimos
          meses disponíveis; não inclui saldos, anulações nem meses vazios de outros módulos.
        </p>
      </PopoverContent>
    </Popover>
  );
}
