import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/HelpTip";
import { brl } from "@/lib/format";
import { Wallet } from "lucide-react";

/**
 * Zona B — Fluxo de Caixa e Execução Orçamentária.
 * Um único card consolidado: valor total empenhado + decomposição linear
 * (Atestado | Glosa | A complementar | Em execução) e taxa de execução.
 */
export function FluxoExecucaoCard({
  empenhado,
  atestado,
  glosa,
  complementar,
  qtd,
}: {
  empenhado: number;
  atestado: number;
  glosa: number;
  complementar: number;
  qtd: number;
}) {
  const base = Math.max(empenhado, atestado + glosa);
  const emExec = Math.max(0, empenhado - atestado - glosa);
  const pct = (v: number) => (base > 0 ? (v / base) * 100 : 0);
  const taxa = empenhado > 0 ? Math.round((atestado / empenhado) * 100) : 0;

  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              Fluxo de execução orçamentária
              <HelpTip text="Decomposição do valor empenhado no recorte: quanto foi efetivamente atestado (executado), quanto foi glosado (devolvido ao orçamento), quanto ainda cabe complementar e o que segue em execução." />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums tracking-tight text-primary">{brl(empenhado)}</span>
              <span className="text-xs text-muted-foreground">empenhado · {qtd} lançamento(s)</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Taxa de execução</div>
            <div className={`text-2xl font-bold tabular-nums ${taxa >= 95 ? "text-success" : taxa >= 70 ? "text-primary" : "text-warning-foreground"}`}>
              {taxa}%
            </div>
          </div>
        </div>

        {/* Barra linear empilhada */}
        <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex" role="img" aria-label="Decomposição do valor empenhado">
          <div className="h-full bg-success" style={{ width: `${pct(atestado)}%` }} title={`Atestado: ${brl(atestado)}`} />
          <div className="h-full bg-warning" style={{ width: `${pct(glosa)}%` }} title={`Glosa: ${brl(glosa)}`} />
          <div className="h-full bg-primary/40" style={{ width: `${pct(emExec)}%` }} title={`Em execução: ${brl(emExec)}`} />
        </div>

        {/* Legenda tabular */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Linha cor="bg-success" rotulo="Atestado" valor={atestado} />
          <Linha cor="bg-warning" rotulo="Glosa (anulado)" valor={glosa} />
          <Linha cor="bg-primary/40" rotulo="Em execução" valor={emExec} />
          <Linha cor="bg-transparent border border-dashed border-muted-foreground/50" rotulo="A complementar" valor={complementar} />
        </div>
      </CardContent>
    </Card>
  );
}

function Linha({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: number }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`h-2.5 w-2.5 rounded-sm shrink-0 ${cor}`} />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{rotulo}</div>
        <div className="tabular-nums font-semibold truncate">{brl(valor)}</div>
      </div>
    </div>
  );
}
