import { Link } from "@tanstack/react-router";
import { AlertTriangle, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type AgingModulo = "convenios" | "piso" | "cacon" | "pvh" | "prestacao";

export type AgingItem = {
  id: string;
  modulo: AgingModulo;
  href: string;
  hrefParams?: Record<string, string>;
  titulo: string;
  subtitulo: string;
  motivo: string;
  dias: number;
  prazoLabel?: string;
  severidade: "critico" | "alerta" | "preventivo";
};

const MODULOS: Array<{ id: AgingModulo; label: string }> = [
  { id: "convenios", label: "Convênios / lançamentos" },
  { id: "piso", label: "Piso da Enfermagem" },
  { id: "cacon", label: "Dieta CACON" },
  { id: "pvh", label: "Programa de Valorização dos Hospitais" },
  { id: "prestacao", label: "Prestação de contas" },
];

const DEFAULT_MODULOS: AgingModulo[] = ["convenios", "piso", "cacon", "pvh"];

const DOT: Record<AgingItem["severidade"], string> = {
  critico: "bg-destructive",
  alerta: "bg-warning",
  preventivo: "bg-primary/70",
};

const TEXTO_DIAS = (dias: number) => {
  if (dias < 0) return `${-dias}d atraso/idade`;
  if (dias === 0) return "hoje";
  return `+${dias}d`;
};

export function AgingList({ itens, limite = 10 }: { itens: AgingItem[]; limite?: number }) {
  const [verTudo, setVerTudo] = useState(false);
  const [modulos, setModulos] = useState<Set<AgingModulo>>(
    () => new Set(DEFAULT_MODULOS),
  );

  const ord = useMemo(
    () =>
      itens
        .filter((item) => modulos.has(item.modulo))
        .sort((a, b) => a.dias - b.dias),
    [itens, modulos],
  );
  const mostrar = verTudo ? ord : ord.slice(0, limite);
  const restantes = ord.length - mostrar.length;

  const alternarModulo = (id: AgingModulo, checked: boolean) => {
    setModulos((atual) => {
      const proximo = new Set(atual);
      if (checked) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });
    setVerTudo(false);
  };

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Urgências (aging)</h2>
          <span className="text-xs text-muted-foreground">· prioridade por tempo</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {ord.length} item(ns)
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Exibir
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Fontes da lista
              </p>
              <div className="space-y-2">
                {MODULOS.map((modulo) => (
                  <label
                    key={modulo.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={modulos.has(modulo.id)}
                      onCheckedChange={(valor) =>
                        alternarModulo(modulo.id, Boolean(valor))
                      }
                    />
                    {modulo.label}
                  </label>
                ))}
              </div>
              <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
                Prestação de contas começa desmarcada para manter o foco operacional do painel.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {ord.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Sem urgências nos módulos selecionados.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {mostrar.map((it) => (
            <li key={it.id}>
              <Link
                to={it.href as any}
                params={it.hrefParams as any}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${DOT[it.severidade]}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{it.titulo}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {it.subtitulo} · {it.motivo}
                  </div>
                </div>
                <div
                  className={`whitespace-nowrap text-xs font-semibold tabular-nums ${
                    it.severidade === "critico"
                      ? "text-destructive"
                      : it.severidade === "alerta"
                        ? "text-warning-foreground"
                        : "text-primary"
                  }`}
                >
                  {it.prazoLabel ?? TEXTO_DIAS(it.dias)}
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
