import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

export type AgingItem = {
  id: string;
  href: string;
  hrefParams?: Record<string, string>;
  titulo: string;
  subtitulo: string;
  motivo: string;
  dias: number; // <0 vencido; 0 hoje; >0 futuro
  severidade: "critico" | "alerta" | "preventivo";
};

const DOT: Record<AgingItem["severidade"], string> = {
  critico: "bg-destructive",
  alerta: "bg-warning",
  preventivo: "bg-primary/70",
};

const TEXTO_DIAS = (dias: number) => {
  if (dias < 0) return `${-dias}d atraso`;
  if (dias === 0) return "hoje";
  return `+${dias}d`;
};

/**
 * Zona D — Aging List. Uma única lista priorizada por dias de desvio (decrescente).
 * Semáforo estrito de 3 cores. Ordenação estável pelo valor `dias` (mais negativo primeiro).
 */
export function AgingList({ itens, limite = 10 }: { itens: AgingItem[]; limite?: number }) {
  const [verTudo, setVerTudo] = useState(false);
  const ord = [...itens].sort((a, b) => a.dias - b.dias);
  const mostrar = verTudo ? ord : ord.slice(0, limite);
  const restantes = ord.length - mostrar.length;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Urgências (aging)</h2>
          <span className="text-xs text-muted-foreground">· ordenado por dias de atraso</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{ord.length} item(ns)</span>
      </div>
      {ord.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted-foreground">Sem urgências no momento.</div>
      ) : (
        <ul className="divide-y divide-border">
          {mostrar.map((it) => (
            <li key={it.id}>
              <Link
                to={it.href as any}
                params={it.hrefParams as any}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
              >
                <span className={`h-2 w-2 rounded-full shrink-0 ${DOT[it.severidade]}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{it.titulo}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {it.subtitulo} · {it.motivo}
                  </div>
                </div>
                <div
                  className={`text-xs font-semibold tabular-nums whitespace-nowrap ${
                    it.severidade === "critico"
                      ? "text-destructive"
                      : it.severidade === "alerta"
                      ? "text-warning-foreground"
                      : "text-primary"
                  }`}
                >
                  {TEXTO_DIAS(it.dias)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {restantes > 0 && (
        <button
          onClick={() => setVerTudo(true)}
          className="w-full border-t border-border px-4 py-2 text-xs font-medium text-primary hover:bg-muted/50"
        >
          Ver todas ({restantes} restantes)
        </button>
      )}
    </div>
  );
}
