import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  CircleDollarSign,
  ExternalLink,
  LockKeyhole,
  Save,
  Settings2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GuiaEtapaPvh } from "@/components/pvh/GuiaEtapaPvh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { brl } from "@/lib/format";
import {
  PVH_ETAPAS,
  STATUS_PVH,
  etapaAtualPvh,
  etapaLiberadaPvh,
} from "@/lib/pvh/etapas";

export const Route = createFileRoute("/_authenticated/pvh/$id")({
  head: () => ({ meta: [{ title: "Competência PVH — SMS Joinville" }] }),
  component: PvhCompetenciaPage,
});

const numero = (valor: string) => {
  const limpo = valor.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
};

function PvhCompetenciaPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { roles } = useAuth();
  const podeEditar = hasRole(roles, "acp") || hasRole(roles, "aco");

  const competencia = useQuery({
    queryKey: ["pvh_competencia", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_competencias")
        .select("*,pvh_normativas(id,titulo,codigo,vigencia_inicio,url_oficial,observacao)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const participantes = useQuery({
    queryKey: ["pvh_participantes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_participantes")
        .select("*,prestadores(id,nome_instituicao,cnpj)")
        .eq("competencia_id", id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const comp = competencia.data;
  const concluidas = (comp?.etapas_concluidas ?? {}) as Record<string, boolean>;
  const reconferir = comp?.etapas_reconferir ?? [];
  const atual = comp ? etapaAtualPvh(concluidas, comp.status) : 1;
  const [etapaSelecionada, setEtapaSelecionada] = useState(1);

  useEffect(() => {
    if (comp) setEtapaSelecionada(atual);
  }, [comp?.id, atual]);

  const [ato, setAto] = useState({
    portaria_estadual_numero: "",
    portaria_estadual_data: "",
    portaria_estadual_url: "",
    portaria_estadual_sei_numero: "",
    portaria_estadual_sei_link: "",
  });
  const [valoresEstado, setValoresEstado] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!comp) return;
    setAto({
      portaria_estadual_numero: comp.portaria_estadual_numero ?? "",
      portaria_estadual_data: comp.portaria_estadual_data ?? "",
      portaria_estadual_url: comp.portaria_estadual_url ?? "",
      portaria_estadual_sei_numero: comp.portaria_estadual_sei_numero ?? "",
      portaria_estadual_sei_link: comp.portaria_estadual_sei_link ?? "",
    });
  }, [comp?.id, comp?.updated_at]);

  useEffect(() => {
    const mapa: Record<string, string> = {};
    for (const participante of participantes.data ?? []) {
      mapa[participante.id] =
        participante.valor_estadual == null
          ? ""
          : Number(participante.valor_estadual).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
    }
    setValoresEstado(mapa);
  }, [participantes.data]);

  const totais = useMemo(() => {
    const lista = participantes.data ?? [];
    return {
      estadual: lista.reduce((s, item) => s + Number(item.valor_estadual ?? 0), 0),
      municipal: lista.reduce((s, item) => s + Number(item.valor_municipal ?? 0), 0),
      pago: lista.reduce((s, item) => s + Number(item.valor_pago ?? 0), 0),
    };
  }, [participantes.data]);

  const salvarEtapa1 = useMutation({
    mutationFn: async ({ concluir }: { concluir: boolean }) => {
      if (!comp) throw new Error("Competência não carregada.");

      const valores = (participantes.data ?? []).map((participante) => ({
        id: participante.id,
        valor: numero(valoresEstado[participante.id] ?? ""),
      }));

      if (concluir) {
        if (!ato.portaria_estadual_numero.trim())
          throw new Error("Informe o número da Portaria estadual.");
        if (!ato.portaria_estadual_data)
          throw new Error("Informe a data da Portaria estadual.");
        if (!ato.portaria_estadual_url.trim())
          throw new Error("Informe o link oficial da Portaria estadual.");
        if (!valores.length || valores.some((item) => item.valor <= 0))
          throw new Error("Informe o valor estadual de todas as instituições antes de concluir.");
      }

      const etapas = {
        ...(concluidas ?? {}),
        ...(concluir ? { "1": true } : {}),
      };

      const { error: compError } = await supabase
        .from("pvh_competencias")
        .update({
          portaria_estadual_numero: ato.portaria_estadual_numero.trim() || null,
          portaria_estadual_data: ato.portaria_estadual_data || null,
          portaria_estadual_url: ato.portaria_estadual_url.trim() || null,
          portaria_estadual_sei_numero: ato.portaria_estadual_sei_numero.trim() || null,
          portaria_estadual_sei_link: ato.portaria_estadual_sei_link.trim() || null,
          etapas_concluidas: etapas,
          status: concluir && comp.status === "preparacao" ? "ativa" : comp.status,
        })
        .eq("id", id);
      if (compError) throw compError;

      for (const item of valores) {
        const { error } = await supabase
          .from("pvh_participantes")
          .update({ valor_estadual: item.valor || null })
          .eq("id", item.id)
          .eq("competencia_id", id);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pvh_competencia", id] });
      qc.invalidateQueries({ queryKey: ["pvh_participantes", id] });
      qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
      toast.success(vars.concluir ? "Etapa 1 concluída." : "Rascunho da Etapa 1 salvo.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  if (competencia.isLoading || participantes.isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Carregando competência PVH…</div>;
  }

  if (competencia.isError || !comp) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        Não foi possível abrir a competência PVH. Verifique se a migration do módulo foi aplicada.
      </div>
    );
  }

  const norma = Array.isArray(comp.pvh_normativas) ? comp.pvh_normativas[0] : comp.pvh_normativas;
  const guia = PVH_ETAPAS[etapaSelecionada - 1];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/pvh"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar às competências
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-primary">
              PVH · {comp.competencia}
            </h1>
            <Badge variant={comp.status === "encerrada" ? "secondary" : "outline"}>
              {STATUS_PVH[comp.status] ?? comp.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Processo mensal do Programa de Valorização dos Hospitais.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/pvh/configuracoes">
            <Settings2 className="mr-2 h-4 w-4" />
            Configurações PVH
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Publicado pelo Estado</div>
            <div className="mt-1 text-xl font-bold text-primary">
              {totais.estadual ? brl(totais.estadual) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Portaria Municipal</div>
            <div className="mt-1 text-xl font-bold text-primary">
              {totais.municipal ? brl(totais.municipal) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Pago</div>
            <div className="mt-1 text-xl font-bold text-primary">
              {totais.pago ? brl(totais.pago) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Instituições</div>
            <div className="mt-1 text-xl font-bold text-primary">
              {(participantes.data ?? []).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Esteira da competência</CardTitle>
          <CardDescription>
            Clique em qualquer etapa para consultar o manual. Azul = etapa principal atual;
            verde = concluída; cadeado = ainda não liberada para execução.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {PVH_ETAPAS.map((etapa) => {
              const feita = concluidas[String(etapa.n)] === true;
              const liberada = etapaLiberadaPvh(etapa.n, concluidas, reconferir);
              const corrente = etapa.n === atual && comp.status !== "encerrada";
              return (
                <button
                  key={etapa.n}
                  type="button"
                  onClick={() => setEtapaSelecionada(etapa.n)}
                  className={
                    "rounded-lg border p-3 text-left transition " +
                    (etapaSelecionada === etapa.n ? "ring-2 ring-primary/30 " : "") +
                    (feita
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20"
                      : corrente
                        ? "border-primary bg-primary/5"
                        : "bg-background")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Etapa {etapa.n}
                    </span>
                    {feita ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : liberada ? (
                      <CircleDollarSign className="h-4 w-4 text-primary" />
                    ) : (
                      <LockKeyhole className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="mt-1 text-sm font-semibold">{etapa.curto}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {norma && (
        <Card className="border-primary/15 bg-muted/15">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Base normativa da competência</div>
              <div className="font-semibold">{norma.titulo}</div>
              {norma.observacao && (
                <div className="mt-1 text-xs text-muted-foreground">{norma.observacao}</div>
              )}
            </div>
            {norma.url_oficial && (
              <Button asChild size="sm" variant="outline">
                <a href={norma.url_oficial} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir fonte oficial
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <GuiaEtapaPvh etapa={guia} />

      {etapaSelecionada === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Execução da Etapa 1 · Portaria estadual e valores oficiais</CardTitle>
            <CardDescription>
              Salve o rascunho enquanto estiver preparando. Só conclua depois de conferir a publicação oficial e os valores de todas as instituições.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Número da Portaria SES</Label>
                <Input
                  value={ato.portaria_estadual_numero}
                  onChange={(e) => setAto({ ...ato, portaria_estadual_numero: e.target.value })}
                  placeholder="Ex.: SES nº 3186/2026"
                  disabled={!podeEditar}
                />
              </div>
              <div>
                <Label>Data da Portaria</Label>
                <Input
                  type="date"
                  value={ato.portaria_estadual_data}
                  onChange={(e) => setAto({ ...ato, portaria_estadual_data: e.target.value })}
                  disabled={!podeEditar}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Link oficial</Label>
                <Input
                  value={ato.portaria_estadual_url}
                  onChange={(e) => setAto({ ...ato, portaria_estadual_url: e.target.value })}
                  placeholder="Link da publicação oficial da SES/SC"
                  disabled={!podeEditar}
                />
              </div>
              <div>
                <Label>Número SEI (opcional)</Label>
                <Input
                  value={ato.portaria_estadual_sei_numero}
                  onChange={(e) =>
                    setAto({ ...ato, portaria_estadual_sei_numero: e.target.value })
                  }
                  disabled={!podeEditar}
                />
              </div>
              <div>
                <Label>Link SEI (opcional)</Label>
                <Input
                  value={ato.portaria_estadual_sei_link}
                  onChange={(e) => setAto({ ...ato, portaria_estadual_sei_link: e.target.value })}
                  disabled={!podeEditar}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 font-medium">Valores oficiais por instituição</div>
              <div className="divide-y rounded-lg border">
                {(participantes.data ?? []).map((participante) => {
                  const prestador = Array.isArray(participante.prestadores)
                    ? participante.prestadores[0]
                    : participante.prestadores;
                  return (
                    <div
                      key={participante.id}
                      className="grid gap-3 p-3 md:grid-cols-[1fr_220px] md:items-center"
                    >
                      <div>
                        <div className="font-medium">
                          {prestador?.nome_instituicao ?? "Instituição"}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>
                            E-mail: {participante.notificar_email ? "obrigatório" : "não aplicável"}
                          </span>
                          <span>·</span>
                          <span>
                            Prestação: {participante.exige_prestacao_contas ? "sim" : "não"}
                          </span>
                          {participante.fonte_recurso && (
                            <>
                              <span>·</span>
                              <span>Fonte {participante.fonte_recurso}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Valor estadual (R$)</Label>
                        <Input
                          inputMode="decimal"
                          value={valoresEstado[participante.id] ?? ""}
                          onChange={(e) =>
                            setValoresEstado({
                              ...valoresEstado,
                              [participante.id]: e.target.value,
                            })
                          }
                          placeholder="0,00"
                          disabled={!podeEditar}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {podeEditar && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={salvarEtapa1.isPending}
                  onClick={() => salvarEtapa1.mutate({ concluir: false })}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Salvar rascunho
                </Button>
                <Button
                  disabled={salvarEtapa1.isPending}
                  onClick={() => salvarEtapa1.mutate({ concluir: true })}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Concluir Etapa 1
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-7">
            <div className="flex items-start gap-3">
              <BookOpenCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold">
                  Manual operacional já disponível · formulário em próxima entrega
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Nesta primeira fundação do PVH, a Etapa 1 já é operacional. As demais etapas
                  já possuem regra de dependência e manual completo para validarmos o desenho antes
                  de acrescentar empenhos, alocações N:N, subempenhos, pagamentos, comunicação e
                  prestação de contas.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
