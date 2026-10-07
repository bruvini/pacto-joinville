import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/HelpTip";
import { brl } from "@/lib/format";
import { ArrowUpRight, Wallet } from "lucide-react";

export type FluxoModulo = {
  id: string;
  nome: string;
  href: "/piso" | "/cacon";
  descricao: string;
  metricas: Array<{ rotulo: string; valor: number; destaque?: boolean }>;
};

/**
 * Zona B — execução financeira integrada.
 * Mantém a semântica contábil dos lançamentos contratuais separada dos módulos
 * mensais, mas apresenta os três no mesmo bloco de gestão.
 */
export function FluxoExecucaoCard({
  empenhado,
  atestado,
  glosa,
  complementar,
  qtd,
  modulos = [],
}: {
  empenhado: number;
  atestado: number;
  glosa: number;
  complementar: number;
  qtd: number;
  modulos?: FluxoModulo[];
}) {
  const base = Math.max(empenhado, atestado + glosa);
  const emExec = Math.max(0, empenhado - atestado - glosa);
  const pct = (v: number) => (base > 0 ? (v / base) * 100 : 0);
  const taxa = empenhado > 0 ? Math.round((atestado / empenhado) * 100) : 0;

  return (
    <Card>
      <CardContent className="space-y-4 pb-5 pt-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              Fluxo de execução orçamentária
              <HelpTip text="O fluxo contratual mantém empenhado, atestado e anulado com sua semântica própria. Piso da Enfermagem e Dieta CACON aparecem no mesmo bloco, em cartões separados, para não somar grandezas financeiras diferentes como se fossem equivalentes." />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums tracking-tight text-primary">
                {brl(empenhado)}
              </span>
              <span className="text-xs text-muted-foreground">
                empenhado nos convênios · {qtd} lançamento(s)
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Taxa de execução dos convênios
            </div>
            <div
              className={`text-2xl font-bold tabular-nums ${
                taxa >= 95
                  ? "text-success"
                  : taxa >= 70
                    ? "text-primary"
                    : "text-warning-foreground"
              }`}
            >
              {taxa}%
            </div>
          </div>
        </div>

        <div
          className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label="Decomposição do valor empenhado dos convênios"
        >
          <div
            className="h-full bg-success"
            style={{ width: `${pct(atestado)}%` }}
            title={`Atestado: ${brl(atestado)}`}
          />
          <div
            className="h-full bg-warning"
            style={{ width: `${pct(glosa)}%` }}
            title={`Anulado (Efetivo): ${brl(glosa)}`}
          />
          <div
            className="h-full bg-primary/40"
            style={{ width: `${pct(emExec)}%` }}
            title={`Em execução: ${brl(emExec)}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Linha cor="bg-success" rotulo="Atestado" valor={atestado} />
          <Linha cor="bg-warning" rotulo="Anulado (Efetivo)" valor={glosa} />
          <Linha cor="bg-primary/40" rotulo="Em execução" valor={emExec} />
          <Linha
            cor="border border-dashed border-muted-foreground/50 bg-transparent"
            rotulo="A complementar"
            valor={complementar}
          />
        </div>

        {modulos.length > 0 && (
          <div className="border-t pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Módulos mensais integrados ao recorte
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {modulos.map((modulo) => (
                <Link
                  key={modulo.id}
                  to={modulo.href}
                  className="group rounded-lg border bg-muted/15 p-3 transition hover:border-primary/40 hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{modulo.nome}</p>
                      <p className="text-[11px] text-muted-foreground">{modulo.descricao}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {modulo.metricas.map((metrica) => (
                      <div key={metrica.rotulo}>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {metrica.rotulo}
                        </p>
                        <p
                          className={`mt-0.5 font-semibold tabular-nums ${
                            metrica.destaque ? "text-primary" : ""
                          }`}
                        >
                          {brl(metrica.valor)}
                        </p>
                      </div>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Linha({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${cor}`} />
      <div className="min-w-0">
        <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
          {rotulo}
        </div>
        <div className="truncate font-semibold tabular-nums">{brl(valor)}</div>
      </div>
    </div>
  );
}
