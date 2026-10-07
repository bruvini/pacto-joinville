import { Check, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
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

const formVazio = (ano: number) => ({
  id: "",
  prestador_id: "",
  processo_anual_id: "",
  ano: String(ano),
  numero_ne: "",
  solicitacao_sei_numero: "",
  solicitacao_sei_link: "",
  solicitacao_data: "",
  nota_empenho_sei_numero: "",
  nota_empenho_sei_link: "",
  data_emissao: "",
  valor_total: "",
  cr_dotacao: "",
  natureza_despesa: "",
  fonte_recurso: "",
  observacao: "",
});

export function EtapaEmpenhosPvh({
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
  const anoComp = Number(competencia.split("/")[1]) || new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(formVazio(anoComp));
  const [alocacoesInput, setAlocacoesInput] = useState<Record<string, string>>({});

  const prestadorIds = participantes.map((p) => p.prestador_id);

  const empenhos = useQuery({
    queryKey: ["pvh_empenhos", prestadorIds],
    enabled: prestadorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_empenhos")
        .select(
          "*,pvh_processos_anuais(id,numero_sei,link_sei,ano,tipo),pvh_empenho_alocacoes(id,participante_id,valor_alocado,observacao,created_at)",
        )
        .in("prestador_id", prestadorIds)
        .eq("status", "ativo")
        .order("ano", { ascending: false })
        .order("created_at", { ascending: false });
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
        .order("ano", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["pvh_empenhos"] });
    qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_participantes", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
  };

  const marcarReconferencia = async () => {
    if (concluidas["3"] === true) {
      await supabase.rpc("pvh_marcar_reconferencia", {
        p_comp: competenciaId,
        p_etapa: 3,
      });
    }
  };

  const salvarEmpenho = useMutation({
    mutationFn: async () => {
      if (!form.prestador_id) throw new Error("Selecione a instituição.");
      if (!form.numero_ne.trim()) throw new Error("Informe o número da Nota de Empenho.");
      if (n(form.valor_total) <= 0) throw new Error("Informe o valor total da Nota de Empenho.");
      if (!form.solicitacao_sei_numero.trim())
        throw new Error("Informe o número SEI da Solicitação de Nota de Empenho.");
      if (!form.nota_empenho_sei_numero.trim())
        throw new Error("Informe o número SEI da Nota de Empenho.");

      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        prestador_id: form.prestador_id,
        processo_anual_id: form.processo_anual_id || null,
        ano: Number(form.ano),
        numero_ne: form.numero_ne.trim(),
        solicitacao_sei_numero: form.solicitacao_sei_numero.trim() || null,
        solicitacao_sei_link: form.solicitacao_sei_link.trim() || null,
        solicitacao_data: form.solicitacao_data || null,
        nota_empenho_sei_numero: form.nota_empenho_sei_numero.trim() || null,
        nota_empenho_sei_link: form.nota_empenho_sei_link.trim() || null,
        data_emissao: form.data_emissao || null,
        valor_total: n(form.valor_total),
        cr_dotacao: form.cr_dotacao.trim() || null,
        natureza_despesa: form.natureza_despesa.trim() || null,
        fonte_recurso: form.fonte_recurso.trim() || null,
        observacao: form.observacao.trim() || null,
      };

      if (form.id) {
        const { error } = await supabase.from("pvh_empenhos").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pvh_empenhos").insert({
          ...payload,
          created_by: auth.user?.id ?? null,
        });
        if (error) {
          if (error.code === "23505")
            throw new Error("Essa Nota de Empenho já está cadastrada para a instituição.");
          throw error;
        }
      }
      await marcarReconferencia();
    },
    onSuccess: () => {
      invalidar();
      setOpen(false);
      toast.success(form.id ? "Nota de Empenho atualizada." : "Nota de Empenho cadastrada.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const alocar = useMutation({
    mutationFn: async ({
      empenho,
      participante,
    }: {
      empenho: any;
      participante: any;
    }) => {
      const valor = n(alocacoesInput[empenho.id] ?? "");
      if (valor <= 0) throw new Error("Informe o valor que esta NE cobrirá nesta competência.");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("pvh_empenho_alocacoes").insert({
        empenho_id: empenho.id,
        participante_id: participante.id,
        valor_alocado: valor,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
      await marcarReconferencia();
    },
    onSuccess: (_, vars) => {
      invalidar();
      setAlocacoesInput((atual) => ({ ...atual, [vars.empenho.id]: "" }));
      toast.success("Valor da NE alocado à competência.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const removerAlocacao = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pvh_empenho_alocacoes").delete().eq("id", id);
      if (error) throw error;
      await marcarReconferencia();
    },
    onSuccess: () => {
      invalidar();
      toast.success("Alocação removida.");
    },
    onError: (error: any) =>
      toast.error(
        error.code === "23503"
          ? "A alocação já possui subempenho vinculado e não pode ser removida."
          : error.message,
      ),
  });

  const empenhosPorPrestador = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const empenho of empenhos.data ?? []) {
      const lista = map.get(empenho.prestador_id) ?? [];
      lista.push(empenho);
      map.set(empenho.prestador_id, lista);
    }
    return map;
  }, [empenhos.data]);

  const coberturaPorParticipante = useMemo(() => {
    const map = new Map<string, number>();
    for (const empenho of empenhos.data ?? []) {
      for (const aloc of empenho.pvh_empenho_alocacoes ?? []) {
        map.set(
          aloc.participante_id,
          (map.get(aloc.participante_id) ?? 0) + Number(aloc.valor_alocado ?? 0),
        );
      }
    }
    return map;
  }, [empenhos.data]);

  const todosCobertos =
    participantes.length > 0 &&
    participantes.every((p) => {
      const devido = Number(p.valor_municipal ?? p.valor_estadual ?? 0);
      const coberto = coberturaPorParticipante.get(p.id) ?? 0;
      return devido > 0 && Math.abs(coberto - devido) < 0.01;
    });

  const concluir = useMutation({
    mutationFn: async () => {
      if (!todosCobertos)
        throw new Error("Todas as instituições precisam estar integralmente cobertas por empenhos.");

      const usados = (empenhos.data ?? []).filter((empenho) =>
        (empenho.pvh_empenho_alocacoes ?? []).some((a: any) =>
          participantes.some((p) => p.id === a.participante_id),
        ),
      );

      for (const empenho of usados) {
        if (!empenho.solicitacao_sei_numero || !empenho.nota_empenho_sei_numero) {
          throw new Error(
            "Toda NE utilizada deve ter a Solicitação de Empenho e a Nota de Empenho rastreadas.",
          );
        }
      }

      const novasEtapas = { ...concluidas, "3": true };
      const novaReconferencia = (reconferir ?? []).filter((n) => n !== 3);
      const { error } = await supabase
        .from("pvh_competencias")
        .update({
          etapas_concluidas: novasEtapas,
          etapas_reconferir: novaReconferencia,
        })
        .eq("id", competenciaId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Etapa 3 concluída: cobertura de empenho fechada.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const abrirNovo = (prestadorId: string) => {
    setForm({ ...formVazio(anoComp), prestador_id: prestadorId });
    setOpen(true);
  };

  const abrirEdicao = (empenho: any) => {
    setForm({
      id: empenho.id,
      prestador_id: empenho.prestador_id,
      processo_anual_id: empenho.processo_anual_id ?? "",
      ano: String(empenho.ano),
      numero_ne: empenho.numero_ne ?? "",
      solicitacao_sei_numero: empenho.solicitacao_sei_numero ?? "",
      solicitacao_sei_link: empenho.solicitacao_sei_link ?? "",
      solicitacao_data: empenho.solicitacao_data ?? "",
      nota_empenho_sei_numero: empenho.nota_empenho_sei_numero ?? "",
      nota_empenho_sei_link: empenho.nota_empenho_sei_link ?? "",
      data_emissao: empenho.data_emissao ?? "",
      valor_total: moneyInput(empenho.valor_total),
      cr_dotacao: empenho.cr_dotacao ?? "",
      natureza_despesa: empenho.natureza_despesa ?? "",
      fonte_recurso: empenho.fonte_recurso ?? "",
      observacao: empenho.observacao ?? "",
    });
    setOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Etapa 3 · Empenhos e alocações</CardTitle>
          <CardDescription>
            Cadastre a NE uma vez e aloque parcelas dela às competências. O saldo é compartilhado:
            uma NE pode cobrir vários meses e um mês pode usar mais de uma NE.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-4 text-sm leading-relaxed text-sky-950 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100">
            <b>Exemplo real que motivou esta modelagem:</b> em 09/2026 o HMSJ utilizou a NE
            4086/2026 (R$ 1.416.115,56 remanescentes) + 6016/2026 (R$ 359.386,53 complementar);
            o Bethesda utilizou 4083/2026 (R$ 640.000,00) + 6015/2026 (R$ 600.000,00).
            Por isso não existe relação “1 competência = 1 empenho”.
          </div>

          {empenhos.isError || processos.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar a estrutura financeira do PVH. Verifique se a migration de
              empenhos/alocações foi aplicada.
            </div>
          ) : (
            participantes.map((participante) => {
              const prestador = Array.isArray(participante.prestadores)
                ? participante.prestadores[0]
                : participante.prestadores;
              const devido = Number(
                participante.valor_municipal ?? participante.valor_estadual ?? 0,
              );
              const coberto = coberturaPorParticipante.get(participante.id) ?? 0;
              const restante = Math.max(0, devido - coberto);
              const lista = empenhosPorPrestador.get(participante.prestador_id) ?? [];
              const usaReferenciaEstadual = participante.valor_municipal == null;

              return (
                <div key={participante.id} className="rounded-xl border">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 p-4">
                    <div>
                      <div className="font-semibold">{prestador?.nome_instituicao ?? "Instituição"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Necessidade da competência: <b>{devido ? brl(devido) : "não informada"}</b>
                        {usaReferenciaEstadual && devido > 0
                          ? " · usando valor estadual enquanto a Portaria Municipal não está registrada"
                          : ""}
                      </div>
                      <div className="mt-1 text-xs">
                        Coberto: <b>{brl(coberto)}</b> · Restante:{" "}
                        <b className={restante > 0.009 ? "text-amber-700" : "text-emerald-700"}>
                          {brl(restante)}
                        </b>
                      </div>
                    </div>
                    {podeEditar && (
                      <Button size="sm" variant="outline" onClick={() => abrirNovo(participante.prestador_id)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Cadastrar NE
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3 p-4">
                    {lista.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        Nenhuma Nota de Empenho cadastrada para esta instituição.
                      </div>
                    ) : (
                      lista.map((empenho) => {
                        const alocs = empenho.pvh_empenho_alocacoes ?? [];
                        const totalAlocado = alocs.reduce(
                          (s: number, a: any) => s + Number(a.valor_alocado ?? 0),
                          0,
                        );
                        const saldo = Number(empenho.valor_total ?? 0) - totalAlocado;
                        const atual = alocs.find((a: any) => a.participante_id === participante.id);
                        const classificacaoCompleta =
                          empenho.cr_dotacao && empenho.fonte_recurso && empenho.natureza_despesa;

                        return (
                          <div key={empenho.id} className="rounded-lg border p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold">NE {empenho.numero_ne}</span>
                                  <Badge variant="outline">{empenho.ano}</Badge>
                                  {!classificacaoCompleta && (
                                    <Badge variant="secondary">classificação incompleta</Badge>
                                  )}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Valor total {brl(empenho.valor_total)} · Alocado globalmente{" "}
                                  {brl(totalAlocado)} · Saldo {brl(saldo)}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  CR/dotação: {empenho.cr_dotacao ?? "—"} · Natureza:{" "}
                                  {empenho.natureza_despesa ?? "—"} · Fonte:{" "}
                                  {empenho.fonte_recurso ?? "—"}
                                </div>
                                {empenho.pvh_processos_anuais?.numero_sei && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    Processo anual: {empenho.pvh_processos_anuais.numero_sei}
                                  </div>
                                )}
                              </div>

                              <div className="flex gap-1">
                                {empenho.pvh_processos_anuais?.link_sei && (
                                  <Button asChild size="icon" variant="ghost" title="Abrir processo anual">
                                    <a
                                      href={empenho.pvh_processos_anuais.link_sei}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                )}
                                {podeEditar && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    title="Editar Nota de Empenho"
                                    onClick={() => abrirEdicao(empenho)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>

                            <div className="mt-3 rounded-md bg-muted/20 p-3">
                              {atual ? (
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="text-sm">
                                    Alocação nesta competência:{" "}
                                    <b>{brl(atual.valor_alocado)}</b>
                                  </div>
                                  {podeEditar && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() =>
                                        confirm(
                                          "Remover esta alocação? Isso só é possível antes de existir subempenho vinculado.",
                                        ) && removerAlocacao.mutate(atual.id)
                                      }
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Remover
                                    </Button>
                                  )}
                                </div>
                              ) : podeEditar ? (
                                <div className="flex flex-wrap items-end gap-2">
                                  <div className="min-w-48 flex-1">
                                    <Label className="text-xs">Valor desta NE para {competencia}</Label>
                                    <Input
                                      inputMode="decimal"
                                      value={alocacoesInput[empenho.id] ?? ""}
                                      onChange={(e) =>
                                        setAlocacoesInput({
                                          ...alocacoesInput,
                                          [empenho.id]: e.target.value,
                                        })
                                      }
                                      placeholder={
                                        saldo > 0 && restante > 0
                                          ? moneyInput(Math.min(saldo, restante))
                                          : "0,00"
                                      }
                                    />
                                  </div>
                                  <Button
                                    size="sm"
                                    disabled={
                                      saldo <= 0.009 ||
                                      n(alocacoesInput[empenho.id] ?? "") <= 0 ||
                                      alocar.isPending
                                    }
                                    onClick={() => alocar.mutate({ empenho, participante })}
                                  >
                                    Alocar à competência
                                  </Button>
                                </div>
                              ) : (
                                <div className="text-sm text-muted-foreground">
                                  Esta NE não possui alocação nesta competência.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}

          {podeEditar && (
            <div className="flex justify-end">
              <Button onClick={() => concluir.mutate()} disabled={!todosCobertos || concluir.isPending}>
                <Check className="mr-2 h-4 w-4" />
                {reconferir.includes(3) ? "Reconferir e concluir Etapa 3" : "Concluir Etapa 3"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar Nota de Empenho" : "Cadastrar Nota de Empenho"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
              A classificação orçamentária é registrada <b>nesta NE</b>, não na configuração fixa do
              hospital. Se o CR, natureza ou fonte mudar em outra emissão, a nova NE recebe sua
              própria classificação.
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Ano / exercício</Label>
                <Input
                  type="number"
                  value={form.ano}
                  onChange={(e) => setForm({ ...form, ano: e.target.value })}
                />
              </div>
              <div>
                <Label>Processo SEI anual de empenhos</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.processo_anual_id}
                  onChange={(e) => setForm({ ...form, processo_anual_id: e.target.value })}
                >
                  <option value="">Sem vínculo</option>
                  {(processos.data ?? [])
                    .filter(
                      (p) =>
                        p.prestador_id === form.prestador_id &&
                        p.tipo === "empenho" &&
                        p.ano === Number(form.ano),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.numero_sei}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <Label>Número da NE</Label>
                <Input
                  value={form.numero_ne}
                  onChange={(e) => setForm({ ...form, numero_ne: e.target.value })}
                  placeholder="Ex.: 4086/2026"
                />
              </div>
              <div>
                <Label>Valor total da NE (R$)</Label>
                <Input
                  inputMode="decimal"
                  value={form.valor_total}
                  onChange={(e) => setForm({ ...form, valor_total: e.target.value })}
                  placeholder="0,00"
                />
              </div>

              <div>
                <Label>Nº SEI da Solicitação de NE</Label>
                <Input
                  value={form.solicitacao_sei_numero}
                  onChange={(e) =>
                    setForm({ ...form, solicitacao_sei_numero: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Link da Solicitação de NE</Label>
                <Input
                  value={form.solicitacao_sei_link}
                  onChange={(e) => setForm({ ...form, solicitacao_sei_link: e.target.value })}
                  placeholder="https://sei.joinville.sc.gov.br/..."
                />
              </div>

              <div>
                <Label>Data da solicitação</Label>
                <Input
                  type="date"
                  value={form.solicitacao_data}
                  onChange={(e) => setForm({ ...form, solicitacao_data: e.target.value })}
                />
              </div>
              <div />

              <div>
                <Label>Nº SEI da Nota de Empenho</Label>
                <Input
                  value={form.nota_empenho_sei_numero}
                  onChange={(e) =>
                    setForm({ ...form, nota_empenho_sei_numero: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Link da Nota de Empenho</Label>
                <Input
                  value={form.nota_empenho_sei_link}
                  onChange={(e) => setForm({ ...form, nota_empenho_sei_link: e.target.value })}
                  placeholder="https://sei.joinville.sc.gov.br/..."
                />
              </div>
              <div>
                <Label>Data de emissão</Label>
                <Input
                  type="date"
                  value={form.data_emissao}
                  onChange={(e) => setForm({ ...form, data_emissao: e.target.value })}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 font-medium">Classificação da própria NE</div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>CR / dotação</Label>
                  <Input
                    value={form.cr_dotacao}
                    onChange={(e) => setForm({ ...form, cr_dotacao: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Natureza da despesa</Label>
                  <Input
                    value={form.natureza_despesa}
                    onChange={(e) => setForm({ ...form, natureza_despesa: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Fonte</Label>
                  <Input
                    value={form.fonte_recurso}
                    onChange={(e) => setForm({ ...form, fonte_recurso: e.target.value })}
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
                placeholder="Ex.: saldo remanescente de empenho trimestral; empenho complementar…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => salvarEmpenho.mutate()} disabled={salvarEmpenho.isPending}>
              {form.id ? "Salvar alterações" : "Cadastrar NE"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
