import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";

export type AtencaoItem = {
  n: number;
  label: string;
  to: string;
  search?: any;
  severidade: "critico" | "alerta";
};

/**
 * Zona A — "Andon cord". Faixa fina que só aparece quando há desvio.
 * Ausência é sinal positivo (não renderiza o cartão verde "tudo ok").
 */
export function BarraAtencao({ itens }: { itens: AtencaoItem[] }) {
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        Ação necessária
      </div>
      <div className="h-4 w-px bg-border mx-1" />
      <div className="flex flex-wrap items-center gap-1.5">
        {itens.map((a, i) => (
          <Link
            key={i}
            to={a.to as any}
            search={a.search}
            className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              a.severidade === "critico"
                ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
                : "border-warning/40 bg-warning/10 text-warning-foreground hover:bg-warning/15"
            }`}
          >
            <span className="tabular-nums font-bold">{a.n}</span>
            <span className="font-normal">{a.label}</span>
            <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        ))}
      </div>
    </div>
  );
}
