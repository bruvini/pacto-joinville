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
 * produzido, publicado). Não confundir a soma heterogênea com caixa
 * ou execução contábil.
 */
export function FluxoExecucaoCard({ modulos = [] }: { modulos?: FluxoModulo[] }) {
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

      </CardContent>
    </Card>
  );
}

