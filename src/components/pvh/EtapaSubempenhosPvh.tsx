import { Check, ExternalLink, Pencil, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const n = (value: string) => {
  const clean = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
};

const moneyInput = (value: number | null | undefined) =>
  value == null
    ? ""
    : Number(value).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const vazio = {
  id: "",
  alocacao_id: "",
  processo_anual_id: "",
  valor: "",
  solicitacao_sei_numero: "",
  solicitacao_sei_link: "",
  solicitacao_data: "",
  movimento_liquidacao_sei_numero: "",
  movimento_liquidacao_sei_link: "",
  movimento_liquidacao_data: "",
  movimento_subempenho_sei_numero: "",
  movimento_subempenho_sei_link: "",
  movimento_subempenho_data: "",
  numero_subempenho: "",
  programacao_pagamento_sei_numero: "",
  programacao_pagamento_sei_link: "",
  programacao_pagamento_data: "",
  observacao: "",
};

export function EtapaSubempenhosPvh({
  competenciaId,
  competencia,
  participantes,
  concluidas,
  reconferir,
  podeEditar,
}: {
  competenciaId: string;
  competencia: string;
  participantes: any[];
  concluidas: Record<string, boolean>;
  reconferir: number[];
  podeEditar: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(vazio);
  const participanteIds = participantes.map((p) => p.id);
  const anoComp = Number(competencia.split("/")[1]) || new Date().getFullYear();

  const alocacoes = useQuery({
    queryKey: ["pvh_alocacoes_competencia", competenciaId],
    enabled: participanteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_empenho_alocacoes")
        .select(
          "*,pvh_empenhos(id,numero_ne,ano,valor_total,prestador_id,cr_dotacao,natureza_despesa,fonte_recurso),pvh_participantes(id,prestador_id,prestadores(id,nome_instituicao)),pvh_subempenhos(*)",
        )
        .in("participante_id", participanteIds)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const processos = useQuery({
    queryKey: ["pvh_processos_anuais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_processos_anuais")
        .select("*")
        .eq("ativo", true)
        .eq("tipo", "liquidacao_pagamento")
        .order("ano", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["pvh_alocacoes_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_empenhos"] });
    qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
  };

  const marcarReconferencia = async () => {
    if (concluidas["5"] === true) {
      const { error } = await supabase.rpc("pvh_marcar_reconferencia", {
        p_comp: competenciaId,
        p_etapa: 5,
      });
      if (error) throw error;
    }
  };

  const salvar = useMutation({
    mutationFn: async () => {
      const valor = n(form.valor);
      if (!form.alocacao_id) throw new Error("Alocação não identificada.");
      if (valor <= 0) throw new Error("Informe o valor do subempenho.");
      if (!form.solicitacao_sei_numero.trim())
        throw new Error("Informe o SEI da Solicitação de Subempenho/Liquidação.");
      if (!form.movimento_liquidacao_sei_numero.trim())
        throw new Error("Informe o SEI do movimento de Empenho em Liquidação.");
      if (!form.movimento_subempenho_sei_numero.trim())
        throw new Error("Informe o SEI do Aviso de Movimento/Subempenho.");

      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        alocacao_id: form.alocacao_id,
        processo_anual_id: form.processo_anual_id || null,
        valor,
        solicitacao_sei_numero: form.solicitacao_sei_numero.trim(),
        solicitacao_sei_link: form.solicitacao_sei_link.trim() || null,
        solicitacao_data: form.solicitacao_data || null,
        movimento_liquidacao_sei_numero: form.movimento_liquidacao_sei_numero.trim(),
        movimento_liquidacao_sei_link: form.movimento_liquidacao_sei_link.trim() || null,
        movimento_liquidacao_data: form.movimento_liquidacao_data || null,
        movimento_subempenho_sei_numero: form.movimento_subempenho_sei_numero.trim(),
        movimento_subempenho_sei_link: form.movimento_subempenho_sei_link.trim() || null,
        movimento_subempenho_data: form.movimento_subempenho_data || null,
        numero_subempenho: form.numero_subempenho.trim() || null,
        programacao_pagamento_sei_numero:
          form.programacao_pagamento_sei_numero.trim() || null,
        programacao_pagamento_sei_link:
          form.programacao_pagamento_sei_link.trim() || null,
        programacao_pagamento_data: form.programacao_pagamento_data || null,
        observacao: form.observacao.trim() || null,
      };

      if (form.id) {
        const { error } = await supabase.from("pvh_subempenhos").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pvh_subempenhos").insert({
          ...payload,
          created_by: auth.user?.id ?? null,
        });
        if (error) throw error;
      }
      await marcarReconferencia();
    },
    onSuccess: () => {
      invalidar();
      setOpen(false);
      toast.success(form.id ? "Subempenho atualizado." : "Subempenho registrado.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const resumo = useMemo(
    () =>
      (alocacoes.data ?? []).map((alocacao) => {
        const subs = alocacao.pvh_subempenhos ?? [];
        const total = subs.reduce((s: number, item: any) => s + Number(item.valor ?? 0), 0);
        const valorAlocado = Number(alocacao.valor_alocado ?? 0);
        const completoDocs = subs.every(
          (item: any) =>
            item.solicitacao_sei_numero &&
            item.movimento_liquidacao_sei_numero &&
            item.movimento_subempenho_sei_numero,
        );
        return {
          alocacao,
          subs,
          total,
          valorAlocado,
          restante: Math.max(0, valorAlocado - total),
          fechado:
            subs.length > 0 && Math.abs(total - valorAlocado) < 0.01 && completoDocs,
        };
      }),
    [alocacoes.data],
  );

  const todosFechados = resumo.length > 0 && resumo.every((item) => item.fechado);

  const concluir = useMutation({
    mutationFn: async () => {
      if (!todosFechados)
        throw new Error(
          "Todas as alocações precisam estar integralmente subempenhadas e com os três documentos obrigatórios rastreados.",
        );
      const { error } = await supabase
        .from("pvh_competencias")
        .update({
          etapas_concluidas: { ...concluidas, "5": true },
          etapas_reconferir: (reconferir ?? []).filter((x) => x !== 5),
        })
        .eq("id", competenciaId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Etapa 5 concluída.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const novo = (item: (typeof resumo)[number]) => {
    const participante = Array.isArray(item.alocacao.pvh_participantes)
      ? item.alocacao.pvh_participantes[0]
      : item.alocacao.pvh_participantes;
    const processo =
      (processos.data ?? []).find(
        (p) =>
          p.prestador_id === participante?.prestador_id &&
          p.ano === anoComp &&
          p.tipo === "liquidacao_pagamento",
      ) ?? null;

    setForm({
      ...vazio,
      alocacao_id: item.alocacao.id,
      processo_anual_id: processo?.id ?? "",
      valor: moneyInput(item.restante),
    });
    setOpen(true);
  };

  const editar = (sub: any) => {
    setForm({
      id: sub.id,
      alocacao_id: sub.alocacao_id,
      processo_anual_id: sub.processo_anual_id ?? "",
      valor: moneyInput(sub.valor),
      solicitacao_sei_numero: sub.solicitacao_sei_numero ?? "",
      solicitacao_sei_link: sub.solicitacao_sei_link ?? "",
      solicitacao_data: sub.solicitacao_data ?? "",
      movimento_liquidacao_sei_numero: sub.movimento_liquidacao_sei_numero ?? "",
      movimento_liquidacao_sei_link: sub.movimento_liquidacao_sei_link ?? "",
      movimento_liquidacao_data: sub.movimento_liquidacao_data ?? "",
      movimento_subempenho_sei_numero: sub.movimento_subempenho_sei_numero ?? "",
      movimento_subempenho_sei_link: sub.movimento_subempenho_sei_link ?? "",
      movimento_subempenho_data: sub.movimento_subempenho_data ?? "",
      numero_subempenho: sub.numero_subempenho ?? "",
      programacao_pagamento_sei_numero: sub.programacao_pagamento_sei_numero ?? "",
      programacao_pagamento_sei_link: sub.programacao_pagamento_sei_link ?? "",
      programacao_pagamento_data: sub.programacao_pagamento_data ?? "",
      observacao: sub.observacao ?? "",
    });
    setOpen(true);
  };

  const alocacaoForm = (alocacoes.data ?? []).find((item) => item.id === form.alocacao_id);
  const participanteForm = Array.isArray(alocacaoForm?.pvh_participantes)
    ? alocacaoForm?.pvh_participantes?.[0]
    : alocacaoForm?.pvh_participantes;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Etapa 5 · Subempenho, liquidação e programação
          </CardTitle>
          <CardDescription>
            Cada subempenho nasce de uma alocação de NE da Etapa 3. Se a competência usar duas NEs,
            ela terá duas cadeias financeiras independentes e conciliáveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-4 text-sm leading-relaxed text-sky-950 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100">
            <b>O que o sistema exige para fechar esta etapa?</b> Para cada parcela de NE alocada à
            competência: Solicitação de Subempenho/Liquidação, movimento de Empenho em Liquidação
            e movimento de Subempenho. A Programação de Pagamento pode ser registrada aqui quando
            já existir, mas não é usada para mascarar uma cadeia documental incompleta.
          </div>

          {alocacoes.isError || processos.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar as alocações/subempenhos do PVH. Verifique a migration financeira.
            </div>
          ) : resumo.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Nenhuma alocação de empenho encontrada para esta competência. Conclua primeiro a Etapa 3.
            </div>
          ) : (
            resumo.map((item) => {
              const empenho = Array.isArray(item.alocacao.pvh_empenhos)
                ? item.alocacao.pvh_empenhos[0]
                : item.alocacao.pvh_empenhos;
              const participante = Array.isArray(item.alocacao.pvh_participantes)
                ? item.alocacao.pvh_participantes[0]
                : item.alocacao.pvh_participantes;
              const prestador = Array.isArray(participante?.prestadores)
                ? participante?.prestadores[0]
                : participante?.prestadores;

              return (
                <div key={item.alocacao.id} className="rounded-xl border">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 p-4">
                    <div>
                      <div className="font-semibold">
                        {prestador?.nome_instituicao ?? "Instituição"} · NE {empenho?.numero_ne}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Alocado {brl(item.valorAlocado)} · Subempenhado {brl(item.total)} · Restante{" "}
                        {brl(item.restante)}
                      </div>
                    </div>
                    <Badge variant={item.fechado ? "default" : "outline"}>
                      {item.fechado ? "Cadeia fechada" : "Pendente"}
                    </Badge>
                  </div>

                  <div className="space-y-3 p-4">
                    {item.subs.map((sub: any) => {
                      const obrigatorios =
                        Boolean(sub.solicitacao_sei_numero) &&
                        Boolean(sub.movimento_liquidacao_sei_numero) &&
                        Boolean(sub.movimento_subempenho_sei_numero);
                      return (
                        <div key={sub.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">
                                {sub.numero_subempenho
                                  ? "Subempenho " + sub.numero_subempenho
                                  : "Subempenho"}{" "}
                                · {brl(sub.valor)}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Solicitação SEI {sub.solicitacao_sei_numero ?? "—"} · Liquidação SEI{" "}
                                {sub.movimento_liquidacao_sei_numero ?? "—"} · Movimento SEI{" "}
                                {sub.movimento_subempenho_sei_numero ?? "—"}
                              </div>
                              {sub.programacao_pagamento_sei_numero && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Programação de Pagamento SEI {sub.programacao_pagamento_sei_numero}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge variant={obrigatorios ? "secondary" : "destructive"}>
                                {obrigatorios ? "Documentos OK" : "Incompleto"}
                              </Badge>
                              {podeEditar && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Editar subempenho"
                                  onClick={() => editar(sub)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {podeEditar && item.restante > 0.009 && (
                      <Button size="sm" variant="outline" onClick={() => novo(item)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Registrar subempenho
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {podeEditar && (
            <div className="flex justify-end">
              <Button
                disabled={!todosFechados || concluir.isPending}
                onClick={() => concluir.mutate()}
              >
                <Check className="mr-2 h-4 w-4" />
                {reconferir.includes(5) ? "Reconferir e concluir Etapa 5" : "Concluir Etapa 5"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar subempenho" : "Registrar subempenho"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
              Este registro pertence a uma alocação específica da NE. O banco impede que a soma dos
              subempenhos ultrapasse o valor reservado para esta competência.
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Valor do subempenho (R$)</Label>
                <Input
                  inputMode="decimal"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                />
              </div>

              <div>
                <Label>Processo SEI anual de liquidação/pagamento</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.processo_anual_id}
                  onChange={(e) => setForm({ ...form, processo_anual_id: e.target.value })}
                >
                  <option value="">Sem vínculo</option>
                  {(processos.data ?? [])
                    .filter(
                      (p) =>
                        p.prestador_id === participanteForm?.prestador_id &&
                        p.ano === anoComp,
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.numero_sei}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <DocumentoSei
              titulo="1. Solicitação de Subempenho / Liquidação"
              numero={form.solicitacao_sei_numero}
              link={form.solicitacao_sei_link}
              data={form.solicitacao_data}
              setNumero={(v) => setForm({ ...form, solicitacao_sei_numero: v })}
              setLink={(v) => setForm({ ...form, solicitacao_sei_link: v })}
              setData={(v) => setForm({ ...form, solicitacao_data: v })}
            />

            <DocumentoSei
              titulo="2. Aviso de Movimento — Empenho em Liquidação"
              numero={form.movimento_liquidacao_sei_numero}
              link={form.movimento_liquidacao_sei_link}
              data={form.movimento_liquidacao_data}
              setNumero={(v) => setForm({ ...form, movimento_liquidacao_sei_numero: v })}
              setLink={(v) => setForm({ ...form, movimento_liquidacao_sei_link: v })}
              setData={(v) => setForm({ ...form, movimento_liquidacao_data: v })}
            />

            <div className="rounded-lg border p-4">
              <div className="font-semibold">3. Aviso de Movimento — Subempenho</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Nº SEI do documento</Label>
                  <Input
                    value={form.movimento_subempenho_sei_numero}
                    onChange={(e) =>
                      setForm({ ...form, movimento_subempenho_sei_numero: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Número do subempenho, se houver</Label>
                  <Input
                    value={form.numero_subempenho}
                    onChange={(e) => setForm({ ...form, numero_subempenho: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Link do documento</Label>
                  <Input
                    value={form.movimento_subempenho_sei_link}
                    onChange={(e) =>
                      setForm({ ...form, movimento_subempenho_sei_link: e.target.value })
                    }
                    placeholder="https://sei.joinville.sc.gov.br/..."
                  />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={form.movimento_subempenho_data}
                    onChange={(e) =>
                      setForm({ ...form, movimento_subempenho_data: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-dashed p-4">
              <div className="font-semibold">4. Programação de Pagamento (se já disponível)</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Pode ser registrada nesta cadeia, mas não é requisito para concluir a etapa de
                subempenho. O pagamento efetivo será conciliado na etapa seguinte.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Nº SEI</Label>
                  <Input
                    value={form.programacao_pagamento_sei_numero}
                    onChange={(e) =>
                      setForm({ ...form, programacao_pagamento_sei_numero: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={form.programacao_pagamento_data}
                    onChange={(e) =>
                      setForm({ ...form, programacao_pagamento_data: e.target.value })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Link</Label>
                  <Input
                    value={form.programacao_pagamento_sei_link}
                    onChange={(e) =>
                      setForm({ ...form, programacao_pagamento_sei_link: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>Observação</Label>
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              {form.id ? "Salvar alterações" : "Registrar subempenho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DocumentoSei({
  titulo,
  numero,
  link,
  data,
  setNumero,
  setLink,
  setData,
}: {
  titulo: string;
  numero: string;
  link: string;
  data: string;
  setNumero: (value: string) => void;
  setLink: (value: string) => void;
  setData: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">{titulo}</div>
        {link && (
          <Button asChild size="sm" variant="ghost">
            <a href={link} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir
            </a>
          </Button>
        )}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <Label>Nº SEI do documento</Label>
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
        </div>
        <div>
          <Label>Data</Label>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Link</Label>
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://sei.joinville.sc.gov.br/..."
          />
        </div>
      </div>
    </div>
  );
}
