import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Check, CheckCircle2, ClipboardCheck, LockKeyhole, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateTime } from "@/lib/format";
import { PVH_ETAPAS } from "@/lib/pvh/etapas";

type Props = {
  competenciaId: string;
  competencia: any;
  participantes: any[];
  concluidas: Record<string, boolean>;
  reconferir: number[];
  podeEncerrar: boolean;
  onSelecionarEtapa: (etapa: number) => void;
};

function confere(a: number, b: number) {
  return Math.abs(a - b) < 0.01;
}

function Indicador({
  titulo, valor, legenda,
}: {
  titulo: string; valor: number; legenda: string;
}) {
  return (
    <div className="rounded-xl border bg-background/95 p-4 shadow-sm">
      <p className="text-[11px] font-medium text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-primary">{brl(valor)}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{legenda}</p>
    </div>
  );
}

function Estado({
  ok, texto,
}: {
  ok: boolean; texto: string;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      )}
      <span>{texto}</span>
    </div>
  );
}

export function EtapaEncerramentoPvh({
  competenciaId, competencia, participantes, concluidas, reconferir,
  podeEncerrar, onSelecionarEtapa,
}: Props) {
  const qc = useQueryClient();
  const [conferido, setConferido] = useState(false);
  const [confirmarAberto, setConfirmarAberto] = useState(false);
  const [reabrirAberto, setReabrirAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const encerrada = competencia.status === "encerrada";
  const ids = participantes.map((p) => p.id);

  const alocacoes = useQuery({
    queryKey: ["pvh_encerramento_alocacoes", competenciaId],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_empenho_alocacoes")
        .select("id,participante_id,valor_alocado,pvh_subempenhos(id,valor)")
        .in("participante_id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });
  const pagamentos = useQuery({
    queryKey: ["pvh_pagamentos", competenciaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pvh_pagamentos")
        .select("id,participante_id,valor_pago")
        .eq("competencia_id", competenciaId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const comunicacoes = useQuery({
    queryKey: ["pvh_encerramento_comunicacoes", competenciaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pvh_notificacoes_email")
        .select("id,participante_id,enviado_em")
        .eq("competencia_id", competenciaId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const carregando = (ids.length > 0 && alocacoes.isLoading) ||
    pagamentos.isLoading || comunicacoes.isLoading;
  const erro = alocacoes.isError || pagamentos.isError || comunicacoes.isError;

  const resumo = useMemo(() => {
    const linhas = participantes.map((participante) => {
      const vinculadas = (alocacoes.data ?? []).filter(
        (a) => a.participante_id === participante.id,
      );
      const pago = (pagamentos.data ?? [])
        .filter((p) => p.participante_id === participante.id)
        .reduce((v, p) => v + Number(p.valor_pago ?? 0), 0);
      const alocado = vinculadas.reduce(
        (v, a) => v + Number(a.valor_alocado ?? 0), 0,
      );
      const subempenhado = vinculadas.reduce(
        (v, a) => v + (a.pvh_subempenhos ?? []).reduce(
          (total, sub) => total + Number(sub.valor ?? 0), 0,
        ), 0,
      );
      const estado = Number(participante.valor_estadual ?? 0);
      const municipio = Number(participante.valor_municipal ?? 0);
      const prestador = Array.isArray(participante.prestadores)
        ? participante.prestadores[0] : participante.prestadores;
      const comunicada = !participante.notificar_email ||
        (comunicacoes.data ?? []).some(
          (email) => email.participante_id === participante.id && email.enviado_em,
        );
      return {
        id: participante.id,
        nome: prestador?.nome_instituicao ?? "Instituição",
        estado, municipio, alocado, subempenhado, pago,
        exigePrestacao: Boolean(participante.exige_prestacao_contas),
        exigeComunicacao: Boolean(participante.notificar_email),
        comunicada,
        conciliada: estado > 0 && municipio > 0 &&
          confere(estado, municipio) &&
          confere(municipio, alocado) &&
          confere(alocado, subempenhado) &&
          confere(municipio, pago) &&
          confere(pago, Number(participante.valor_pago ?? 0)),
      };
    });
    return {
      linhas,
      estado: linhas.reduce((v, l) => v + l.estado, 0),
      municipio: linhas.reduce((v, l) => v + l.municipio, 0),
      alocado: linhas.reduce((v, l) => v + l.alocado, 0),
      subempenhado: linhas.reduce((v, l) => v + l.subempenhado, 0),
      pago: linhas.reduce((v, l) => v + l.pago, 0),
      aPrestar: linhas.filter((l) => l.exigePrestacao).length,
      conciliadas: linhas.filter((l) => l.conciliada && l.comunicada).length,
    };
  }, [participantes, alocacoes.data, pagamentos.data, comunicacoes.data]);

  const etapasPendentes = PVH_ETAPAS.filter(
    (etapa) => etapa.n < 7 &&
      (concluidas[String(etapa.n)] !== true || reconferir.includes(etapa.n)),
  );
  const passosValidos = etapasPendentes.length === 0 && reconferir.length === 0;
  const recurso = Number(competencia.recurso_fms_valor ?? 0);
  const conciliacaoGeral = resumo.linhas.length > 0 &&
    resumo.linhas.every((l) => l.conciliada && l.comunicada) &&
    resumo.estado > 0 &&
    confere(resumo.estado, resumo.municipio) &&
    confere(resumo.estado, recurso) &&
    confere(resumo.municipio, resumo.alocado) &&
    confere(resumo.alocado, resumo.subempenhado) &&
    confere(resumo.subempenhado, resumo.pago) &&
    Boolean(competencia.recurso_fms_data);
  const podeFinalizar = !encerrada && podeEncerrar && !carregando && !erro &&
    passosValidos && conciliacaoGeral;
  const progresso = PVH_ETAPAS.filter(
    (etapa) => concluidas[String(etapa.n)] && !reconferir.includes(etapa.n),
  ).length;

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
    qc.invalidateQueries({ queryKey: ["pvh_logs", competenciaId] });
  };

  const encerrar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("pvh_encerrar_competencia", {
        p_comp: competenciaId,
        p_conferido: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      setConfirmarAberto(false);
      toast.success("Competência PVH encerrada e registrada no histórico.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const reabrir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("pvh_reabrir_competencia", {
        p_comp: competenciaId,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      setReabrirAberto(false);
      setConferido(false);
      setMotivo("");
      toast.success("Competência reaberta. A justificativa ficou registrada.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-primary/20">
        <CardContent className="bg-gradient-to-br from-primary/10 via-background to-background px-5 py-6 md:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-primary/15 bg-background p-2.5 text-primary">
                {encerrada ? <LockKeyhole className="h-5 w-5" /> : <ClipboardCheck className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Etapa 7 · Conferência final
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  {encerrada ? "Competência encerrada" : "Tudo pronto para fechar a competência?"}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Painel de conferência financeira de {competencia.competencia}.
                  Não substitui o relatório executivo nem a prestação de contas.
                </p>
              </div>
            </div>
            <Badge variant={encerrada ? "default" : "outline"}>
              {encerrada ? "Encerrada" : "Aguardando conferência"}
            </Badge>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador titulo="Crédito no FMS" valor={recurso} legenda="Recebimento efetivo" />
            <Indicador titulo="Empenhos alocados" valor={resumo.alocado} legenda="Somente nesta competência" />
            <Indicador titulo="Subempenhado" valor={resumo.subempenhado} legenda="Avisos de movimento" />
            <Indicador titulo="Pago" valor={resumo.pago} legenda="Pagamentos registrados" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span>Publicado pelo Estado: <strong className="text-foreground">{brl(resumo.estado)}</strong></span>
            <span>Publicado pelo Município: <strong className="text-foreground">{brl(resumo.municipio)}</strong></span>
            <span>{resumo.linhas.length} instituição(ões)</span>
            <span>{resumo.aPrestar} com prestação de contas exigida</span>
          </div>
          {encerrada && (
            <p className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-foreground">
              <CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-600" />
              Encerramento registrado em {dateTime(competencia.encerrada_em)}. Os registros ficam em modo de leitura.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Conferência do processo</CardTitle>
            <CardDescription className="text-xs">Indicadores de conclusão das sete etapas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">Etapas concluídas</span>
                <strong>{progresso} de 7</strong>
              </div>
              <Progress value={(progresso / 7) * 100} />
            </div>
            <div className="space-y-2.5">
              {PVH_ETAPAS.slice(0, 6).map((etapa) => {
                const ok = concluidas[String(etapa.n)] === true && !reconferir.includes(etapa.n);
                return (
                  <button
                    key={etapa.n}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                    onClick={() => onSelecionarEtapa(etapa.n)}
                  >
                    <span className="flex items-center gap-2 text-xs">
                      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
                      {etapa.n}. {etapa.curto}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Conciliação por instituição</CardTitle>
            <CardDescription className="text-xs">
              Conferência individual das etapas financeiras e das obrigações de comunicação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {carregando ? (
              <p className="text-sm text-muted-foreground">Carregando valores da competência…</p>
            ) : erro ? (
              <p className="text-sm text-destructive">Não foi possível buscar todos os lançamentos. O encerramento está bloqueado.</p>
            ) : resumo.linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Não há instituições vinculadas.</p>
            ) : resumo.linhas.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{item.nome}</p>
                  <Badge variant={item.conciliada && item.comunicada ? "default" : "outline"}>
                    {item.conciliada && item.comunicada ? "Conferência sem divergências" : "Conferir"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  {[
                    ["Estado", item.estado], ["Município", item.municipio],
                    ["NE alocada", item.alocado], ["Subempenho", item.subempenhado],
                    ["Pago", item.pago],
                  ].map(([nome, valor]) => (
                    <div key={String(nome)} className="rounded-md bg-muted/40 px-2.5 py-2">
                      <div className="text-[10px] text-muted-foreground">{nome}</div>
                      <div className="mt-0.5 font-semibold">{brl(Number(valor))}</div>
                    </div>
                  ))}
                  <div className="rounded-md bg-muted/40 px-2.5 py-2">
                    <div className="text-[10px] text-muted-foreground">Diferença a pagar</div>
                    <div className="mt-0.5 font-semibold">{brl(item.municipio - item.pago)}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <Estado ok={item.conciliada} texto="Valores oficiais, alocados, subempenhados e pagos conciliados" />
                  <Estado
                    ok={item.comunicada}
                    texto={item.exigeComunicacao ? "Comunicação institucional enviada" : "Comunicação institucional não aplicável"}
                  />
                  <p className="pl-5 text-[11px] text-muted-foreground">
                    Prestação de contas: {item.exigePrestacao
                      ? "obrigatória — acompanhar em processo próprio"
                      : "não exigida nesta configuração"}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {!encerrada && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Validação e encerramento</CardTitle>
            <CardDescription className="text-xs">
              O fechamento é administrativo-financeiro. As prestações de contas exigidas permanecem como obrigação posterior, sem serem dadas como recebidas ou aprovadas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-xs md:grid-cols-2">
              <Estado ok={passosValidos} texto="Etapas 1 a 6 concluídas, sem reconferências abertas" />
              <Estado ok={!carregando && !erro && conciliacaoGeral} texto="FMS, Estado, Município, empenhos, subempenhos e pagamentos sem divergência" />
            </div>
            {!passosValidos && (
              <p className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-300">
                Existem etapas não concluídas ou aguardando reconferência. Acesse o item correspondente acima para regularizar.
              </p>
            )}
            {podeEncerrar ? (
              <>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-xs">
                  <Checkbox
                    className="mt-0.5"
                    checked={conferido}
                    disabled={!podeFinalizar}
                    onCheckedChange={(value) => setConferido(value === true)}
                  />
                  <span>Conferi os valores e os registros apresentados e confirmo o encerramento financeiro da competência.</span>
                </label>
                <div className="flex justify-end">
                  <Button disabled={!podeFinalizar || !conferido || encerrar.isPending} onClick={() => setConfirmarAberto(true)}>
                    <Check className="mr-2 h-4 w-4" />
                    Encerrar competência PVH
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">A finalização é reservada aos perfis Administração e ACP.</p>
            )}
          </CardContent>
        </Card>
      )}

      {encerrada && podeEncerrar && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setReabrirAberto(true)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reabrir com justificativa
          </Button>
        </div>
      )}

      <AlertDialog open={confirmarAberto} onOpenChange={setConfirmarAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar encerramento de {competencia.competencia}?</AlertDialogTitle>
            <AlertDialogDescription>
              A competência será marcada como encerrada, com seu responsável e data registrados no histórico. Seus lançamentos ficarão bloqueados para edição, com reabertura justificada disponível à ACP/Admin.
              A prestação de contas exigida continua sendo acompanhada separadamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar à conferência</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); encerrar.mutate(); }} disabled={encerrar.isPending}>
              Confirmar encerramento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reabrirAberto} onOpenChange={setReabrirAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir competência encerrada</AlertDialogTitle>
            <AlertDialogDescription>
              Descreva por que os lançamentos precisam ser revisados. A reabertura e sua justificativa serão auditadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Justificativa (mínimo de 10 caracteres)"
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={motivo.trim().length < 10 || reabrir.isPending}
              onClick={(e) => { e.preventDefault(); reabrir.mutate(); }}
            >
              Confirmar reabertura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
