import { Link } from "@tanstack/react-router";
import { ChevronRight, GitBranch } from "lucide-react";
import { brlCompact } from "@/lib/format";

export type EsteiraColuna = {
  slug: string;
  label: string;
  curto: string;
  n: number;
  valor: number;
  atrasados: number;
  vencendo: number;
};

/**
 * Zona C — Esteira do Processo (funil de operação).
 * 7 colunas clicáveis (uma por etapa canônica). Cor = temperatura de urgência,
 * não identidade da coluna: cinza padrão, âmbar vencendo, vermelho atrasado.
 */
export function EsteiraProcesso({ colunas }: { colunas: EsteiraColuna[] }) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <GitBranch className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Esteira do processo</h2>
        <span className="text-xs text-muted-foreground">· clique em uma coluna para filtrar</span>
      </div>
      <div className="flex overflow-x-auto">
        {colunas.map((c, i) => (
          <div key={c.slug} className="flex items-stretch flex-1 min-w-[130px]">
            <ColunaEtapa {...c} />
            {i < colunas.length - 1 && (
              <div className="flex items-center px-0.5 text-muted-foreground/50">
                <ChevronRight className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ColunaEtapa(c: EsteiraColuna) {
  const temp =
    c.atrasados > 0 ? "critico" : c.vencendo > 0 ? "alerta" : "neutro";
  const dot =
    temp === "critico" ? "bg-destructive" : temp === "alerta" ? "bg-warning" : "bg-muted-foreground/30";
  const tit =
    temp === "critico"
      ? `${c.atrasados} em atraso`
      : temp === "alerta"
      ? `${c.vencendo} vencendo`
      : "Fluxo normal";
  // O slug já é o rótulo do grupo (ex.: "Liberação de Orçamento"), aceito direto
  // pelo filtro de Etapa da página de Lançamentos.
  return (
    <Link
      to="/lancamentos"
      search={{ status: c.slug as any }}
      className="flex-1 min-w-0 px-3 py-3 hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-none"
      title={`${c.label} · ${tit}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground truncate">{c.curto}</span>
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums leading-none">{c.n}</span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground tabular-nums truncate">
        {c.valor > 0 ? brlCompact(c.valor) : "—"}
      </div>
    </Link>
  );
}
