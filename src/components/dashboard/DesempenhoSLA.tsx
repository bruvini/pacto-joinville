import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/HelpTip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  type AtividadeUsuario,
  type SlaModulo,
  type SlaSignatario,
  mediaSlaEtapas,
} from "@/lib/dashboard/modulos";
import { Download, Timer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  gerarCsvSla,
  type ContextoExportacaoSla,
} from "@/lib/dashboard/exportar-sla";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export const ATIVIDADE_MODULOS = [
  { key: "convenios", label: "Convênios", cor: "var(--success)" },
  { key: "piso", label: "Piso da Enfermagem", cor: "var(--primary)" },
  { key: "cacon", label: "Dieta CACON", cor: "var(--warning)" },
  { key: "pvh", label: "PVH", cor: "var(--acp)" },
  { key: "prestacao", label: "Prestação de contas", cor: "var(--destructive)" },
] as const;

function fmtDias(d: number | null): string {
  if (d == null) return "—";
  const segundos = Math.max(0, Math.round(d * 86_400));
  if (segundos < 60) return segundos === 0 ? "0s" : `${segundos}s`;
  const minutos = segundos / 60;
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const horas = minutos / 60;
  if (horas < 24)
    return Number.isInteger(horas) ? `${horas}h` : `${horas.toFixed(1)}h`;
  return `${d.toFixed(1)} dias`;
}

export function SlaScorecards({
  leadTime,
  modulos,
  slaSignatarios,
  contextoExportacao,
  pisoHistoricoIndisponivel = false,
  exibirLeadTime = true,
}: {
  leadTime: { media: number | null; n: number; real?: boolean };
  modulos: SlaModulo[];
  slaSignatarios: SlaSignatario[];
  contextoExportacao: ContextoExportacaoSla;
  pisoHistoricoIndisponivel?: boolean;
  exibirLeadTime?: boolean;
}) {
  const exportar = () => {
    const csv = gerarCsvSla({
      modulos, assinaturasConsolidadas: slaSignatarios,
      leadTime, incluirLeadTime: exibirLeadTime, contexto: contextoExportacao,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `desempenho-sla-processos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-1 text-base">
          <Timer className="h-4 w-4 text-primary" /> Desempenho e SLA do Processo
          <HelpTip text="O Lead Time contabiliza exclusivamente lançamentos de Convênios concluídos; o SLA por etapa é medido individualmente para cada módulo selecionado. Piso usa a conclusão auditada de cada etapa; CACON usa os eventos de recebimento, processamento e encaminhamento. O SLA de assinatura incorpora assinaturas dos convênios, Piso, CACON e PVH." />
        </CardTitle>
        <Button type="button" variant="outline" size="sm"
          className="shrink-0 gap-1.5" onClick={exportar}
          title="Exportar CSV gerencial com tempos por etapa e por signatário, nos filtros do dashboard">
          <Download className="h-4 w-4" aria-hidden />
          Exportar CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {exibirLeadTime && <div className="flex items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tempo médio dos lançamentos de Convênios (Lead Time)
            </div>
            <div className="text-xs text-muted-foreground">
              criação → conclusão · dias corridos · {leadTime.n} lançamento(s) concluído(s)
              <span
                className={`ml-1.5 ${
                  leadTime.real ? "text-success" : "text-warning-foreground"
                }`}
              >
                · {leadTime.real ? "medição real (marcos)" : "estimativa (proxy)"}
              </span>
            </div>
          </div>
          <div className="text-3xl font-bold tabular-nums text-primary">
            {fmtDias(leadTime.media)}
          </div>
        </div>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Timer className="h-3.5 w-3.5" />
              SLA real de retenção por etapa
              <HelpTip text="Os tempos usam marcos auditáveis de conclusão. No Piso, a Etapa 5 começa com a abertura da competência independentemente das Etapas 1–4; a Etapa 6 depende da 5, e Pagamento/Notificação avançam em paralelo após a 6. Na 13ª, a Etapa 1 não é aplicável. A ausência de histórico não significa duração zero." />
            </div>
            {pisoHistoricoIndisponivel && (
              <p role="alert" className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                Não foi possível carregar o histórico de conclusão do Piso.
                As estatísticas desse módulo estão incompletas; atualize a página antes de utilizá-las.
              </p>
            )}
            <div className="overflow-hidden rounded-lg border bg-card">
              <Accordion type="single" collapsible>
                {modulos.map((modulo) => {
                  const mediaModulo = mediaSlaEtapas(modulo.etapas);
                  const amostras = modulo.etapas.reduce((s, etapa) => s + etapa.n, 0);
                  return (
                    <AccordionItem
                      key={modulo.id}
                      value={modulo.id}
                      className="last:border-b-0"
                    >
                      <AccordionTrigger className="px-3 py-2.5 hover:no-underline">
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-3">
                          <div className="min-w-0 text-left">
                            <p className="truncate text-sm font-semibold">{modulo.nome}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {amostras > 0
                                ? `${amostras} intervalo(s) observado(s)`
                                : "Ainda sem amostra temporal suficiente"}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              Média das etapas
                            </p>
                            <p className="font-bold tabular-nums text-primary">
                              {fmtDias(mediaModulo)}
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-3">
                        <div className="divide-y rounded-md border">
                          {modulo.etapas.map((etapa) => (
                            <div
                              key={etapa.etapa}
                              className="flex items-center justify-between gap-3 px-3 py-1.5"
                            >
                              <span className="min-w-0 truncate text-xs text-muted-foreground">
                                {etapa.etapa}
                              </span>
                              <div className="flex shrink-0 items-baseline gap-2">
                                <span className="font-semibold tabular-nums text-primary">
                                  {fmtDias(etapa.media)}
                                </span>
                                <span className="w-16 text-right text-[10px] text-muted-foreground">
                                  {etapa.n} am.
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> SLA médio até a assinatura, por signatário
              <HelpTip text="Indicador de intervalo entre marcos documentais e o horário registrado para assinaturas, consolidado por pessoa. Atenção: assinaturas cadastradas em lote utilizam o horário do cadastro no sistema, que pode ser posterior à assinatura efetiva no SEI. Não interprete a média como atraso exclusivo do signatário ou setor." />
            </div>
            {slaSignatarios.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sem assinaturas suficientes para calcular o SLA neste recorte.
              </p>
            ) : (
              <div className="max-h-[330px] divide-y overflow-y-auto rounded-lg border bg-card">
                {slaSignatarios.map((item) => (
                  <div
                    key={item.signatario.normalize("NFKC").toLocaleLowerCase("pt-BR")}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{item.signatario}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.modulo || "Módulo não identificado"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-2">
                      <span className="text-base font-bold tabular-nums text-primary">
                        {fmtDias(item.media)}
                      </span>
                      <span className="w-16 text-right text-[10px] text-muted-foreground">
                        {item.n} assin.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DistribuicaoSetorChart({
  data,
}: {
  data: { setor: string; nome: string; valor: number }[];
}) {
  const total = data.reduce((s, d) => s + d.valor, 0);
  const cores: Record<string, string> = { ACP: "var(--acp)", UFI: "var(--aco)" };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1 text-base">
          Processos por Setor Responsável
          <HelpTip text="Volume de processos ativos sob a custódia de cada área no fluxo regular de convênios." />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Nenhum processo ativo neste recorte.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                dataKey="valor"
                nameKey="setor"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={2}
                label={({ setor, valor }: any) => `${setor}: ${valor}`}
              >
                {data.map((d) => (
                  <Cell key={d.setor} fill={cores[d.setor] ?? "var(--muted)"} />
                ))}
              </Pie>
              <ReTooltip
                formatter={(v: any, _n: any, p: any) => [
                  `${v} processo(s)`,
                  p?.payload?.nome ?? p?.payload?.setor,
                ]}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function AtividadeUsuarioChart({ data }: { data: AtividadeUsuario[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1 text-base">
          Atividade por Usuário (Ações Empilhadas)
          <HelpTip text="Contabiliza somente ações humanas atribuídas a usuários por módulo. Registros rotulados como Importação SQL documental (não representa assinatura de servidor) são excluídos, mesmo quando associados ao nome de um usuário." />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Nenhuma atividade humana registrada neste recorte.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="usuario"
                tick={{ fontSize: 10 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
              <ReTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {ATIVIDADE_MODULOS.map((modulo) => (
                <Bar
                  key={modulo.key}
                  dataKey={modulo.key}
                  name={modulo.label}
                  stackId="a"
                  fill={modulo.cor}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
