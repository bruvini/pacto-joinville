import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/HelpTip";
import { brl } from "@/lib/format";
import { ArrowUpRight, Wallet } from "lucide-react";
import { calcularVolumeFinanceiroAcompanhado, type OrigemFinanceira } from "@/lib/dashboard/fluxoFinanceiro";

export type FluxoModulo = {
  id: OrigemFinanceira;
  nome: string;
  href: "/lancamentos" | "/piso" | "/cacon" | "/pvh";
  /** Uma única referência monetária de cada módulo entra no volume total. */
  valorReferencia: number;
  rotuloReferencia: string;
  descricao: string;
  metricas: Array<{ rotulo: string; valor: number; destaque?: boolean }>;
};

/**
 * Zona B — execução financeira integrada.
 * Volume gerencial: uma referência por módulo (empenhado, homologado,
 * produzido, publicado). A barra abaixo é EXCLUSIVA dos convênios.
 * Não confundir a soma heterogênea com caixa ou execução contábil.
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
  const volume = calcularVolumeFinanceiroAcompanhado(modulos);

  return (
    <Card>
      <CardContent className="space-y-4 pb-5 pt-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              Fluxo de execução orçamentária
              <HelpTip text="Volume financeiro gerencial dos quatro módulos no recorte: valor empenhado nos convênios, homologado no Piso, produção auditada da Dieta CACON e valor publicado no PVH. É a soma de referências de fases diferentes; pode haver interseção de recursos. Não representa caixa, pagamentos realizados nem execução orçamentária consolidada." />
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-bold tabular-nums tracking-tight text-primary">
                {brl(volume)}
              </span>
              <span className="text-xs text-muted-foreground">
                volume financeiro acompanhado no recorte · {modulos.length} módulos
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Referências somadas uma vez por módulo: empenhado nos convênios,
          homologado no Piso, produção auditada da Dieta CACON e publicado no PVH.
          Indicador gerencial, não equivalente ao valor pago ou à execução consolidada.
        </p>

        {modulos.length > 0 && (
          <section aria-label="Valores por módulo do volume financeiro acompanhado">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Módulos integrados ao recorte
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {modulos.map((modulo) => (
                <Link
                  key={modulo.id}
                  to={modulo.href}
                  className="group flex min-w-0 flex-col rounded-lg border bg-muted/15 p-3 transition hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{modulo.nome}</p>
                      <p className="text-[11px] text-muted-foreground">{modulo.descricao}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Referência no total: {modulo.rotuloReferencia}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {modulo.metricas.map((metrica) => (
                      <div key={metrica.rotulo} className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {metrica.rotulo}
                        </p>
                        <p
                          className={`mt-0.5 break-words text-sm font-semibold tabular-nums ${metrica.destaque ? "text-primary" : ""}`}
                        >
                          {brl(metrica.valor)}
                        </p>
                      </div>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3 border-t pt-4" aria-label="Execução financeira exclusiva dos convênios">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Execução específica dos convênios
                <HelpTip text="A barra e seus indicadores se referem somente aos lançamentos de convênios. Não incluem Piso, Dieta CACON ou PVH. As demais modalidades possuem estágios de execução diferentes." />
              </p>
              <p className="text-xs text-muted-foreground">
                {brl(empenhado)} empenhados · {qtd} lançamento(s) no recorte
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Taxa de execução dos convênios
              </p>
              <p className={`text-2xl font-bold tabular-nums ${
                taxa >= 95 ? "text-success" : taxa >= 70 ? "text-primary" : "text-warning-foreground"
              }`}>
                {taxa}%
              </p>
            </div>
          </div>

          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
            role="img" aria-label="Decomposição somente do valor empenhado nos convênios">
            <div className="h-full bg-success"
              style={{ width: `${pct(atestado)}%` }}
              title={`Atestado: ${brl(atestado)}`} />
            <div className="h-full bg-warning"
              style={{ width: `${pct(glosa)}%` }}
              title={`Anulado (efetivo): ${brl(glosa)}`} />
            <div className="h-full bg-primary/40"
              style={{ width: `${pct(emExec)}%` }}
              title={`Em execução: ${brl(emExec)}`} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Linha cor="bg-success" rotulo="Atestado" valor={atestado} />
            <Linha cor="bg-warning" rotulo="Anulado (Efetivo)" valor={glosa} />
            <Linha cor="bg-primary/40" rotulo="Em execução" valor={emExec} />
            <Linha cor="border border-dashed border-muted-foreground/50 bg-transparent"
              rotulo="A complementar" valor={complementar} />
          </div>
        </section>
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
