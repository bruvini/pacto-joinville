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
  href?: "/lancamentos" | "/piso" | "/cacon" | "/pvh";
};

export function EsteiraProcesso({
  colunas,
  titulo = "Convênios / lançamentos",
  descricao = "clique em uma etapa para abrir o módulo",
}: {
  colunas: EsteiraColuna[];
  titulo?: string;
  descricao?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <GitBranch className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <span className="text-xs text-muted-foreground">· {descricao}</span>
      </div>
      <div className="flex overflow-x-auto">
        {colunas.map((c, i) => (
          <div key={c.slug} className="flex min-w-[118px] flex-1 items-stretch">
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
  const temp = c.atrasados > 0 ? "critico" : c.vencendo > 0 ? "alerta" : "neutro";
  const dot =
    temp === "critico"
      ? "bg-destructive"
      : temp === "alerta"
        ? "bg-warning"
        : "bg-muted-foreground/30";
  const tit =
    temp === "critico"
      ? `${c.atrasados} em atraso/revisão`
      : temp === "alerta"
        ? `${c.vencendo} requer atenção`
        : "Fluxo normal";

  return (
    <Link
      to={c.href ?? "/lancamentos"}
      search={
        c.href === "/piso" || c.href === "/cacon" || c.href === "/pvh"
          ? undefined
          : { status: c.slug as any }
      }
      className="min-w-0 flex-1 rounded-none px-3 py-3 transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      title={`${c.label} · ${tit}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {c.curto}
        </span>
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums leading-none">{c.n}</span>
      </div>
      <div className="mt-1 truncate text-[11px] tabular-nums text-muted-foreground">
        {c.valor > 0 ? brlCompact(c.valor) : "—"}
      </div>
    </Link>
  );
}
