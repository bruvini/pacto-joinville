import { Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSidebar } from "@/components/ui/sidebar";
import { EsteiraCompetenciaPvh } from "@/components/pvh/EsteiraCompetenciaPvh";
import { brl } from "@/lib/format";
import { STATUS_PVH } from "@/lib/pvh/etapas";
import { cn } from "@/lib/utils";

type NormaPvh = {
  titulo?: string | null;
  codigo?: string | null;
  url_oficial?: string | null;
  observacao?: string | null;
} | null;

type CabecalhoCompetenciaPvhProps = {
  competencia: string;
  status: string;
  norma: NormaPvh;
  totais: {
    estadual: number;
    municipal: number;
    pago: number;
  };
  instituicoes: number;
  concluidas: Record<string, boolean>;
  reconferir: number[];
  etapaSelecionada: number;
  onSelecionarEtapa: (etapa: number) => void;
};

function Kpi({
  rotulo,
  valor,
  discreto = false,
}: {
  rotulo: string;
  valor: string;
  discreto?: boolean;
}) {
  return (
    <div className={cn(discreto ? "min-w-0" : "px-4 py-3")}>
      <div className={cn("uppercase text-muted-foreground", discreto ? "text-[9px]" : "text-[10px]")}>
        {rotulo}
      </div>
      <div className={cn("truncate font-bold text-primary", discreto ? "text-xs" : "mt-0.5 text-base")}>
        {valor}
      </div>
    </div>
  );
}

export function CabecalhoCompetenciaPvh({
  competencia,
  status,
  norma,
  totais,
  instituicoes,
  concluidas,
  reconferir,
  etapaSelecionada,
  onSelecionarEtapa,
}: CabecalhoCompetenciaPvhProps) {
  const blocoPrincipalRef = useRef<HTMLDivElement>(null);
  const [mostrarCompacto, setMostrarCompacto] = useState(false);
  const { state: estadoSidebar, isMobile } = useSidebar();

  useEffect(() => {
    let frame = 0;
    const avaliar = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bloco = blocoPrincipalRef.current;
        if (!bloco) return;
        // O header institucional tem 56px (h-14). O morph só entra quando o
        // cabeçalho completo já passou totalmente por baixo dele.
        setMostrarCompacto(bloco.getBoundingClientRect().bottom < 56);
      });
    };

    avaliar();
    window.addEventListener("scroll", avaliar, { passive: true });
    window.addEventListener("resize", avaliar);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", avaliar);
      window.removeEventListener("resize", avaliar);
    };
  }, []);

  const normaCurta = norma?.codigo || norma?.titulo || "Sem base normativa";
  const kpis = [
    ["Estado", totais.estadual ? brl(totais.estadual) : "—"],
    ["Município", totais.municipal ? brl(totais.municipal) : "—"],
    ["Pago", totais.pago ? brl(totais.pago) : "—"],
    ["Instituições", String(instituicoes)],
  ] as const;

  return (
    <>
      <div ref={blocoPrincipalRef}>
        <Card className="overflow-hidden border-primary/15 shadow-sm">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 md:px-5">
              <div>
                <Link
                  to="/pvh"
                  className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar às competências
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-primary">PVH · {competencia}</h1>
                  <Badge variant={status === "encerrada" ? "secondary" : "outline"}>
                    {STATUS_PVH[status] ?? status}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Programa de Valorização dos Hospitais · execução mensal rastreável
                </p>
              </div>

              <Button asChild variant="outline" size="sm">
                <Link to="/pvh/configuracoes">
                  <Settings2 className="mr-2 h-4 w-4" />
                  Configurações PVH
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-2 divide-x divide-y border-y bg-muted/10 md:grid-cols-4 md:divide-y-0">
              {kpis.map(([rotulo, valor]) => (
                <Kpi key={rotulo} rotulo={rotulo} valor={valor} />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 md:px-5">
              <div className="min-w-0">
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Base normativa
                </span>
                <span className="text-sm font-semibold">{normaCurta}</span>
                {norma?.observacao && (
                  <span className="ml-2 hidden text-xs text-muted-foreground xl:inline">
                    {norma.observacao}
                  </span>
                )}
              </div>
              {norma?.url_oficial && (
                <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                  <a href={norma.url_oficial} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Fonte oficial
                  </a>
                </Button>
              )}
            </div>

            <div className="px-3 py-3 md:px-4">
              <div className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
                Esteira da competência
              </div>
              <EsteiraCompetenciaPvh
                embedded
                concluidas={concluidas}
                reconferir={reconferir}
                status={status}
                etapaSelecionada={etapaSelecionada}
                onSelecionar={onSelecionarEtapa}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div
        className={cn(
          "fixed top-14 z-40 overflow-hidden rounded-b-2xl border border-t-0 border-white/20 bg-background/90 shadow-xl shadow-black/5 backdrop-blur-2xl transition-[left,right,transform,opacity] duration-300 supports-[backdrop-filter]:bg-background/80",
          isMobile
            ? "left-2 right-2"
            : estadoSidebar === "collapsed"
              ? "left-[calc(var(--sidebar-width-icon)+1.5rem)] right-6"
              : "left-[calc(var(--sidebar-width)+1.5rem)] right-6",
          mostrarCompacto
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-full opacity-0",
        )}
        aria-hidden={!mostrarCompacto}
      >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-primary">PVH · {competencia}</span>
              <Badge variant={status === "encerrada" ? "secondary" : "outline"} className="h-5 px-1.5 text-[9px]">
                {STATUS_PVH[status] ?? status}
              </Badge>
            </div>

            <div className="hidden flex-1 items-center justify-center gap-5 lg:flex">
              {kpis.map(([rotulo, valor]) => (
                <Kpi key={rotulo} rotulo={rotulo} valor={valor} discreto />
              ))}
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-1.5 text-[10px]">
              <span className="text-muted-foreground">Norma</span>
              <span className="max-w-[210px] truncate font-semibold">{normaCurta}</span>
              {norma?.url_oficial && (
                <a
                  href={norma.url_oficial}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                  title="Abrir fonte oficial"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
          <div className="px-2 py-2">
            <EsteiraCompetenciaPvh
              embedded
              compacta
              mostrarLegenda={false}
              concluidas={concluidas}
              reconferir={reconferir}
              status={status}
              etapaSelecionada={etapaSelecionada}
              onSelecionar={onSelecionarEtapa}
            />
          </div>
      </div>
    </>
  );
}
