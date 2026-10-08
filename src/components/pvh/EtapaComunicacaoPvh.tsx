import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Mail,
  RotateCcw,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SeiButton } from "@/components/inputs/SeiLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { montarComunicacaoPvh } from "@/lib/pvh/comunicacao";
import { linkValido } from "@/lib/sei";

export function EtapaComunicacaoPvh({
  competenciaId,
  competencia,
  portariaMunicipalNumero,
  participantes,
  concluidas,
  reconferir,
  podeEditar,
}: {
  competenciaId: string;
  competencia: string;
  portariaMunicipalNumero?: string | null;
  participantes: any[];
  concluidas: Record<string, boolean>;
  reconferir: number[];
  podeEditar: boolean;
}) {
  const qc = useQueryClient();
  const [destinatariosLocais, setDestinatariosLocais] = useState<
    Record<string, string[]>
  >({});

  const prestadorIds = participantes.map((item) => item.prestador_id);

  const emails = useQuery({
    queryKey: ["prestador_emails", ...prestadorIds],
    enabled: prestadorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prestador_emails")
        .select("*")
        .in("prestador_id", prestadorIds)
        .order("email");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const notificacoes = useQuery({
    queryKey: ["pvh_notificacoes_email", competenciaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pvh_notificacoes_email")
        .select("*")
        .eq("competencia_id", competenciaId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const alocacoes = useQuery({
    queryKey: ["pvh_empenhos_comunicacao", competenciaId],
    enabled: participantes.length > 0,
    queryFn: async () => {
      const ids = participantes.map((item) => item.id);
      const { data, error } = await supabase
        .from("pvh_empenho_alocacoes")
        .select("participante_id,pvh_empenhos(numero_ne)")
        .in("participante_id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  const perfil = useQuery({
    queryKey: ["pvh_usuario_comunicacao"],
    queryFn: async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) {
        throw authError ?? new Error("Usuário não autenticado.");
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id,nome")
        .eq("id", auth.user.id)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["pvh_notificacoes_email", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencia", competenciaId] });
    qc.invalidateQueries({ queryKey: ["pvh_competencias"] });
  };

  const notificacaoDe = (participanteId: string) =>
    (notificacoes.data ?? []).find(
      (item: any) => item.participante_id === participanteId,
    );

  const contatosDe = (prestadorId: string) =>
    (emails.data ?? []).filter(
      (item: any) => item.prestador_id === prestadorId,
    );

  const empenhosDe = (participanteId: string) =>
    (alocacoes.data ?? [])
      .filter((item: any) => item.participante_id === participanteId)
      .map((item: any) => {
        const empenho = Array.isArray(item.pvh_empenhos)
          ? item.pvh_empenhos[0]
          : item.pvh_empenhos;
        return empenho?.numero_ne;
      })
      .filter(Boolean) as string[];

  const modeloDe = (participante: any) =>
    montarComunicacaoPvh({
      competencia,
      valor: Number(
        participante.valor_municipal ?? participante.valor_estadual ?? 0,
      ),
      empenhos: empenhosDe(participante.id),
      portariaMunicipal: portariaMunicipalNumero,
      usuarioNome: perfil.data?.nome ?? "Usuário logado",
    });

  const salvar = async (
    participante: any,
    patch: Record<string, any>,
  ) => {
    const atual = notificacaoDe(participante.id);
    if (atual?.enviado_em) {
      toast.error("Reabra o registro do envio antes de alterar esta comunicação.");
      return false;
    }

    const modelo = modeloDe(participante);
    const selecionados =
      destinatariosLocais[participante.id] ??
      (Array.isArray(atual?.destinatarios) ? atual.destinatarios : []);

    const merged = {
      destinatarios: selecionados,
      assunto: modelo.assunto,
      corpo: modelo.corpo,
      processo_sei_numero: atual?.processo_sei_numero ?? null,
      processo_sei_link: atual?.processo_sei_link ?? null,
      ...patch,
    };

    const pronto =
      merged.destinatarios.length > 0 &&
      String(merged.processo_sei_numero ?? "").trim() &&
      linkValido(merged.processo_sei_link);

    const payload: any = {
      competencia_id: competenciaId,
      participante_id: participante.id,
      destinatarios: merged.destinatarios,
      assunto: merged.assunto,
      corpo: merged.corpo,
      processo_sei_numero:
        String(merged.processo_sei_numero ?? "").trim() || null,
      processo_sei_link:
        String(merged.processo_sei_link ?? "").trim() || null,
      enviado_em: pronto ? new Date().toISOString() : null,
      enviado_por: pronto ? perfil.data?.id ?? null : null,
      enviado_por_nome: pronto ? perfil.data?.nome ?? null : null,
    };

    const { error } = await supabase
      .from("pvh_notificacoes_email")
      .upsert(payload, { onConflict: "participante_id" });
    if (error) {
      toast.error(error.message);
      return false;
    }

    invalidar();
    if (pronto) {
      toast.success("Comunicação registrada como enviada.");
    }
    return true;
  };

  const alternarDestinatario = async (
    participante: any,
    email: string,
    marcado: boolean,
  ) => {
    const atual = notificacaoDe(participante.id);
    if (atual?.enviado_em) return;

    const base =
      destinatariosLocais[participante.id] ??
      (Array.isArray(atual?.destinatarios) ? atual.destinatarios : []);
    const set = new Set(base);
    if (marcado) set.add(email);
    else set.delete(email);
    const novos = [...set];

    setDestinatariosLocais((estado) => ({
      ...estado,
      [participante.id]: novos,
    }));
    const ok = await salvar(participante, { destinatarios: novos });
    if (!ok) {
      setDestinatariosLocais((estado) => ({
        ...estado,
        [participante.id]: base,
      }));
    }
  };

  const reabrir = useMutation({
    mutationFn: async (registro: any) => {
      const { error } = await supabase
        .from("pvh_notificacoes_email")
        .update({
          enviado_em: null,
          enviado_por: null,
          enviado_por_nome: null,
          processo_sei_numero: null,
          processo_sei_link: null,
        })
        .eq("id", registro.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Comunicação reaberta para correção.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const completas =
    participantes.length > 0 &&
    participantes.every((participante) => {
      if (!participante.notificar_email) return true;
      const atual = notificacaoDe(participante.id);
      return Boolean(
        atual?.enviado_em &&
          atual?.destinatarios?.length &&
          atual?.processo_sei_numero?.trim() &&
          linkValido(atual?.processo_sei_link),
      );
    });

  const concluir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("pvh_concluir_etapa6", {
        p_comp: competenciaId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success(
        reconferir.includes(6)
          ? "Etapa 6 reconferida."
          : "Etapa 6 concluída: comunicações obrigatórias registradas.",
      );
    },
    onError: (error: any) => toast.error(error.message),
  });

  const copiar = async (texto: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${rotulo} copiado.`);
    } catch {
      toast.error(`Não foi possível copiar ${rotulo.toLowerCase()}.`);
    }
  };

  const carregando =
    emails.isLoading ||
    notificacoes.isLoading ||
    alocacoes.isLoading ||
    perfil.isLoading;
  const erro =
    emails.isError ||
    notificacoes.isError ||
    alocacoes.isError ||
    perfil.isError;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Etapa 6 · Comunicação institucional
        </CardTitle>
        <CardDescription className="max-w-4xl text-xs">
          A obrigação de comunicar vem do snapshot da configuração da
          instituição. Somente quem possui notificação por e-mail habilitada
          precisa concluir este bloco.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {erro ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            A estrutura da comunicação do PVH ainda não está disponível. Aplique
            a migration mais recente.
          </div>
        ) : carregando ? (
          <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            Carregando comunicações…
          </div>
        ) : (
          participantes.map((participante) => {
            const prestador = Array.isArray(participante.prestadores)
              ? participante.prestadores[0]
              : participante.prestadores;
            const atual = notificacaoDe(participante.id);
            const contatos = contatosDe(participante.prestador_id);
            const selecionados =
              destinatariosLocais[participante.id] ??
              (Array.isArray(atual?.destinatarios)
                ? atual.destinatarios
                : []);
            const modelo = modeloDe(participante);
            const completa = Boolean(
              atual?.enviado_em &&
                atual?.destinatarios?.length &&
                atual?.processo_sei_numero?.trim() &&
                linkValido(atual?.processo_sei_link),
            );

            return (
              <section key={participante.id} className="rounded-xl border">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 p-4">
                  <div>
                    <div className="font-semibold">
                      {prestador?.nome_instituicao ?? "Instituição"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {participante.notificar_email
                        ? "Comunicação por e-mail obrigatória nesta competência."
                        : "A configuração vigente não exige comunicação por e-mail."}
                    </div>
                  </div>
                  <Badge
                    variant={
                      participante.notificar_email
                        ? completa
                          ? "default"
                          : "outline"
                        : "secondary"
                    }
                  >
                    {!participante.notificar_email
                      ? "Não aplicável"
                      : completa
                        ? "Enviado"
                        : "Pendente"}
                  </Badge>
                </div>

                {!participante.notificar_email ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    Esta instituição não bloqueia a Etapa 6.
                  </div>
                ) : (
                  <div className="space-y-4 p-4">
                    <div>
                      <Label className="text-xs">Destinatários</Label>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!podeEditar || Boolean(atual?.enviado_em)}
                            >
                              <Mail className="mr-2 h-4 w-4" />
                              {selecionados.length
                                ? `${selecionados.length} selecionado(s)`
                                : "Selecionar e-mails"}
                              <ChevronDown className="ml-2 h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80" align="start">
                            <div className="space-y-2">
                              {contatos.length ? (
                                contatos.map((contato: any) => {
                                  const marcado = selecionados.includes(
                                    contato.email,
                                  );
                                  return (
                                    <label
                                      key={contato.id}
                                      className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"
                                    >
                                      <Checkbox
                                        checked={marcado}
                                        onCheckedChange={(checked) =>
                                          alternarDestinatario(
                                            participante,
                                            contato.email,
                                            checked === true,
                                          )
                                        }
                                      />
                                      <span className="min-w-0 truncate">
                                        {contato.email}
                                      </span>
                                    </label>
                                  );
                                })
                              ) : (
                                <p className="text-xs text-destructive">
                                  Nenhum e-mail cadastrado para este prestador.
                                </p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>

                        {selecionados.map((email) => (
                          <Badge
                            key={email}
                            variant="secondary"
                            className="gap-1 py-1"
                          >
                            {email}
                            {podeEditar && !atual?.enviado_em && (
                              <button
                                type="button"
                                title="Remover destinatário"
                                onClick={() =>
                                  alternarDestinatario(
                                    participante,
                                    email,
                                    false,
                                  )
                                }
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[.7fr_1.3fr]">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-xs">Assunto</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copiar(modelo.assunto, "Assunto")}
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Copiar
                          </Button>
                        </div>
                        <div className="rounded-md border bg-muted/10 p-3 text-sm">
                          {modelo.assunto}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-xs">Corpo do e-mail</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copiar(modelo.corpo, "Corpo do e-mail")}
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Copiar
                          </Button>
                        </div>
                        <Textarea
                          readOnly
                          value={modelo.corpo}
                          className="min-h-56 resize-y bg-muted/10 text-xs leading-5"
                        />
                      </div>
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold">
                            Registro do e-mail enviado no SEI
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Ao completar Número SEI e Link SEI com destinatários
                            selecionados, o envio é registrado automaticamente
                            com o usuário logado.
                          </div>
                        </div>
                        {atual?.enviado_em && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!podeEditar || reabrir.isPending}
                            onClick={() => reabrir.mutate(atual)}
                          >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            Reabrir para correção
                          </Button>
                        )}
                      </div>

                      <div className="grid gap-2 md:grid-cols-[190px_minmax(260px,1fr)]">
                        <div>
                          <Label className="text-xs">Número SEI</Label>
                          <Input
                            className="mt-1 h-9"
                            defaultValue={atual?.processo_sei_numero ?? ""}
                            key={`${atual?.id ?? participante.id}-numero-${atual?.updated_at ?? ""}`}
                            disabled={!podeEditar || Boolean(atual?.enviado_em)}
                            onBlur={(e) =>
                              salvar(participante, {
                                processo_sei_numero:
                                  e.target.value.trim() || null,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Link SEI</Label>
                          <div className="mt-1 flex items-center gap-2">
                            <Input
                              key={`${atual?.id ?? participante.id}-link-${atual?.updated_at ?? ""}`}
                              defaultValue={atual?.processo_sei_link ?? ""}
                              disabled={!podeEditar || Boolean(atual?.enviado_em)}
                              placeholder="Cole o link direto do e-mail no SEI"
                              onBlur={(e) =>
                                salvar(participante, {
                                  processo_sei_link:
                                    e.target.value.trim() || null,
                                })
                              }
                            />
                            {linkValido(atual?.processo_sei_link) && (
                              <SeiButton
                                href={atual.processo_sei_link}
                                label="Abrir"
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      {completa && (
                        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Envio registrado por {atual.enviado_por_nome}.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })
        )}

        {podeEditar && !erro && (
          <div className="flex justify-end border-t pt-3">
            <Button
              disabled={
                !completas ||
                concluir.isPending ||
                (concluidas["6"] === true && !reconferir.includes(6))
              }
              onClick={() => concluir.mutate()}
            >
              <Check className="mr-2 h-4 w-4" />
              {concluidas["6"] === true && !reconferir.includes(6)
                ? "Etapa 6 concluída"
                : reconferir.includes(6)
                  ? "Reconferir e concluir Etapa 6"
                  : "Concluir Etapa 6"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
