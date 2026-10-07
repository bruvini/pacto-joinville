import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Copy, Mail, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CampoBlur } from "@/components/piso/campos";
import { SeiButton } from "@/components/inputs/SeiLink";
import { linkValido } from "@/lib/sei";
import { montarNotificacaoPiso } from "@/lib/piso/notificacao-email";
import type { CtxPiso } from "@/lib/piso/regras";
import type { Database } from "@/integrations/supabase/types";

type NotificacaoInsert =
  Database["public"]["Tables"]["piso_notificacoes_email"]["Insert"];
type NotificacaoUpdate =
  Database["public"]["Tables"]["piso_notificacoes_email"]["Update"];

const nomeInst = (participante: any) =>
  participante?.prestadores?.nome_instituicao ?? "Instituição";

export function EtapaNotificacaoEmail({
  ctx,
  competenciaId,
  canEdit,
  usuarioNome,
  onChange,
}: {
  ctx: CtxPiso;
  competenciaId: string;
  canEdit: boolean;
  usuarioNome?: string | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const modeloEmail = montarNotificacaoPiso(
    ctx.comp.competencia,
    usuarioNome || "Usuário logado",
  );
  const participantes = ctx.parts.filter((participante) => !participante.sem_elegiveis);
  const notificacaoDe = (participanteId: string) =>
    (ctx.notificacoesEmail ?? []).find(
      (item) => item.participante_id === participanteId,
    );
  const contatosDe = (prestadorId: string) =>
    (ctx.emailsPrestador ?? []).filter((item) => item.prestador_id === prestadorId);

  const erro = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : String(e));

  const copiarTexto = async (texto: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${rotulo} copiado`);
    } catch {
      toast.error(`Não foi possível copiar ${rotulo.toLowerCase()}.`);
    }
  };

  const salvarNotificacao = async (
    participante: any,
    patch: NotificacaoUpdate,
  ) => {
    const atual = notificacaoDe(participante.id);
    const modelo = montarNotificacaoPiso(
      ctx.comp.competencia,
      usuarioNome || "Usuário logado",
    );
    const payload: NotificacaoInsert = {
      competencia_id: competenciaId,
      participante_id: participante.id,
      destinatarios: atual?.destinatarios ?? [],
      assunto: atual?.assunto?.trim() ? atual.assunto : modelo.assunto,
      corpo: atual?.corpo?.trim() ? atual.corpo : modelo.corpo,
      ...patch,
    };
    const { error } = await supabase
      .from("piso_notificacoes_email")
      .upsert(payload, { onConflict: "participante_id" });
    if (error) {
      erro(error);
      return false;
    }
    onChange();
    return true;
  };

  const alternarDestinatario = async (
    participante: any,
    email: string,
    marcado: boolean,
  ) => {
    const atual = notificacaoDe(participante.id);
    if (atual?.enviado_em) {
      toast.error("Reabra o registro do envio antes de alterar os destinatários.");
      return;
    }
    const selecionados = new Set<string>(
      Array.isArray(atual?.destinatarios) ? atual.destinatarios : [],
    );
    if (marcado) selecionados.add(email);
    else selecionados.delete(email);
    await salvarNotificacao(participante, { destinatarios: [...selecionados] });
  };

  const registrarEnvioEmail = async (participante: any) => {
    const atual = notificacaoDe(participante.id);
    const destinatarios = Array.isArray(atual?.destinatarios)
      ? atual.destinatarios.filter(Boolean)
      : [];
    if (!destinatarios.length) {
      toast.error("Selecione ao menos um destinatário.");
      return;
    }
    setBusy(`email-envio-${participante.id}`);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user)
        throw authError ?? new Error("Usuário não autenticado.");

      let nome = usuarioNome?.trim();
      if (!nome) {
        const { data: perfil, error: perfilError } = await supabase
          .from("profiles")
          .select("nome")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (perfilError) throw perfilError;
        nome = perfil?.nome?.trim();
      }
      if (!nome)
        throw new Error(
          "Não foi possível identificar o usuário responsável pelo envio.",
        );

      const modelo = montarNotificacaoPiso(ctx.comp.competencia, nome);
      const salvo = await salvarNotificacao(participante, {
        destinatarios,
        assunto: modelo.assunto,
        corpo: modelo.corpo,
        enviado_em: new Date().toISOString(),
        enviado_por: auth.user.id,
        enviado_por_nome: nome,
      });
      if (salvo) toast.success(`Envio registrado — ${nomeInst(participante)}`);
    } catch (e) {
      erro(e);
    } finally {
      setBusy(null);
    }
  };

  const reabrirEnvioEmail = async (registro: any) => {
    setBusy(`email-reabrir-${registro.participante_id}`);
    try {
      const { error } = await supabase
        .from("piso_notificacoes_email")
        .update({
          enviado_em: null,
          enviado_por: null,
          enviado_por_nome: null,
          processo_sei_numero: null,
          processo_sei_link: null,
        })
        .eq("id", registro.id);
      if (error) throw error;
      toast.success("Registro de envio reaberto para correção.");
      onChange();
    } catch (e) {
      erro(e);
    } finally {
      setBusy(null);
    }
  };

  const salvarCampoNotificacao = async (
    id: string,
    campo: "processo_sei_numero" | "processo_sei_link",
    valor: string | null,
  ) => {
    const patch: NotificacaoUpdate =
      campo === "processo_sei_numero"
        ? { processo_sei_numero: valor }
        : { processo_sei_link: valor };
    const { error } = await supabase
      .from("piso_notificacoes_email")
      .update(patch)
      .eq("id", id);
    if (error) {
      erro(error);
      return false;
    }
    onChange();
    return true;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="font-semibold">Comunicação do pagamento às instituições</p>
            <p className="text-sm text-muted-foreground">
              Selecione os contatos cadastrados, copie o conteúdo para o envio de e-mail pelo
              SEI e, após o envio, registre o processo SEI correspondente. O sistema preserva
              destinatários e texto da competência para auditoria.
            </p>
          </div>
        </div>
      </div>

      {participantes.map((participante) => {
        const contatos = contatosDe(participante.prestador_id);
        const registro = notificacaoDe(participante.id);
        const enviado = Boolean(registro?.enviado_em);
        const destinatarios: string[] = Array.isArray(registro?.destinatarios)
          ? registro.destinatarios
          : [];
        const assunto = enviado ? registro.assunto : modeloEmail.assunto;
        const corpoEmail = enviado ? registro.corpo : modeloEmail.corpo;
        const processoCompleto =
          enviado &&
          Boolean(registro?.processo_sei_numero?.trim()) &&
          linkValido(registro?.processo_sei_link);

        return (
          <section key={participante.id} className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-auto">
                <h4 className="font-semibold">{nomeInst(participante)}</h4>
                <p className="text-xs text-muted-foreground">
                  Escolha um ou mais e-mails do cadastro mestre do prestador.
                </p>
              </div>
              <Badge
                variant={processoCompleto ? "default" : "outline"}
                className={processoCompleto ? "bg-success text-success-foreground" : ""}
              >
                {processoCompleto
                  ? "Notificação concluída"
                  : enviado
                    ? "Envio registrado · falta conferir o SEI"
                    : "Aguardando envio"}
              </Badge>
            </div>

            {enviado ? (
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Destinatários do envio
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {destinatarios.map((email) => (
                    <Badge key={email} variant="secondary">
                      {email}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : contatos.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <AlertTriangle className="h-4 w-4" />
                <span className="mr-auto">
                  Nenhum e-mail de contato cadastrado para esta instituição.
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link to="/prestadores">Abrir cadastro de prestadores</Link>
                </Button>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {contatos.map((contato) => {
                  const marcado = destinatarios.includes(contato.email);
                  return (
                    <label
                      key={contato.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted/30"
                    >
                      <Checkbox
                        checked={marcado}
                        disabled={!canEdit}
                        onCheckedChange={(valor) =>
                          void alternarDestinatario(
                            participante,
                            contato.email,
                            Boolean(valor),
                          )
                        }
                      />
                      <span className="break-all">{contato.email}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="space-y-3 rounded-md border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="mr-auto">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Assunto
                  </p>
                  <p className="font-medium">{assunto}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copiarTexto(assunto, "Assunto")}
                >
                  <Copy className="mr-1.5 h-4 w-4" />
                  Copiar assunto
                </Button>
              </div>
              <div className="border-t pt-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="mr-auto text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Corpo do e-mail
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copiarTexto(corpoEmail, "Corpo do e-mail")}
                  >
                    <Copy className="mr-1.5 h-4 w-4" />
                    Copiar corpo
                  </Button>
                </div>
                <pre className="whitespace-pre-wrap rounded bg-muted/30 p-3 font-sans text-sm leading-relaxed">
                  {corpoEmail}
                </pre>
              </div>
            </div>

            {!enviado ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={
                    !canEdit ||
                    destinatarios.length === 0 ||
                    busy === `email-envio-${participante.id}`
                  }
                  onClick={() => registrarEnvioEmail(participante)}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Registrar envio realizado no SEI
                </Button>
                {destinatarios.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copiarTexto(destinatarios.join("; "), "Destinatários")
                    }
                  >
                    <Copy className="mr-1.5 h-4 w-4" />
                    Copiar destinatários
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3 rounded-md border border-primary/20 bg-primary/[0.025] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="mr-auto text-sm">
                    <p className="font-semibold">Envio realizado</p>
                    <p className="text-muted-foreground">
                      {new Date(registro.enviado_em).toLocaleString("pt-BR")} ·{" "}
                      {registro.enviado_por_nome || "Responsável não identificado"}
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy === `email-reabrir-${participante.id}`}
                      onClick={() => reabrirEnvioEmail(registro)}
                    >
                      <RotateCcw className="mr-1.5 h-4 w-4" />
                      Corrigir destinatários / envio
                    </Button>
                  )}
                </div>
                <div className="grid items-end gap-2 sm:grid-cols-[.9fr_1.5fr_auto]">
                  <CampoBlur
                    label="Número do processo SEI do e-mail enviado"
                    value={registro.processo_sei_numero}
                    disabled={!canEdit}
                    hint="Informe o processo em que o e-mail ficou registrado."
                    onSave={(valor) =>
                      salvarCampoNotificacao(
                        registro.id,
                        "processo_sei_numero",
                        valor,
                      )
                    }
                  />
                  <CampoBlur
                    label="Link do processo SEI do e-mail enviado"
                    value={registro.processo_sei_link}
                    disabled={!canEdit}
                    invalid={Boolean(
                      registro.processo_sei_link &&
                        !linkValido(registro.processo_sei_link),
                    )}
                    onSave={(valor) =>
                      salvarCampoNotificacao(registro.id, "processo_sei_link", valor)
                    }
                  />
                  {linkValido(registro.processo_sei_link) && (
                    <div className="self-end pb-[18px]">
                      <SeiButton href={registro.processo_sei_link} label="Abrir no SEI" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
