import { CheckCircle2, Landmark, LockKeyhole, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AssinaturasSolicitacaoEmpenhoPvh } from "@/components/pvh/AssinaturasSolicitacaoEmpenhoPvh";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiButton, SeiLink } from "@/components/inputs/SeiLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  assinaturasSolicitacaoEmpenhoCompletasPvh,
  normalizarNumeroNePvh,
  notaEmpenhoProntaPvh,
  solicitacaoEmpenhoProntaPvh,
} from "@/lib/pvh/empenhos";

type FormEmpenho = {
  solicitacao_sei_numero: string;
  solicitacao_sei_link: string;
  solicitacao_data: string;
  cr_dotacao: string;
  fonte_recurso: string;
  solicitacao_enviada_sefaz: boolean;
  solicitacao_enviada_em: string | null;
  numero_ne: string;
  valor_total: number | null;
  nota_empenho_sei_numero: string;
  nota_empenho_sei_link: string;
};

const vazio = (): FormEmpenho => ({
  solicitacao_sei_numero: "",
  solicitacao_sei_link: "",
  solicitacao_data: "",
  cr_dotacao: "",
  fonte_recurso: "",
  solicitacao_enviada_sefaz: false,
  solicitacao_enviada_em: null,
  numero_ne: "",
  valor_total: null,
  nota_empenho_sei_numero: "",
  nota_empenho_sei_link: "",
});

export function SolicitacaoEmpenhoModalPvh({
  open,
  onOpenChange,
  competenciaId,
  competencia,
  prestadorId,
  instituicaoNome,
  empenho,
  processos,
  assinaturas,
  pool,
  podeEditar,
  onCreated,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competenciaId: string;
  competencia: string;
  prestadorId: string;
  instituicaoNome: string;
  empenho?: any;
  processos: any[];
  assinaturas: any[];
  pool: any[];
  podeEditar: boolean;
  onCreated: (id: string) => void;
  onChange: () => void;
}) {
  const ano = Number(competencia.split("/")[1]) || new Date().getFullYear();
  const idLocalRef = useRef<string | null>(empenho?.id ?? null);
  const [form, setForm] = useState<FormEmpenho>(vazio());

  useEffect(() => {
    if (!open) return;
    idLocalRef.current = empenho?.id ?? idLocalRef.current;
    setForm({
      solicitacao_sei_numero: empenho?.solicitacao_sei_numero ?? "",
      solicitacao_sei_link: empenho?.solicitacao_sei_link ?? "",
      solicitacao_data: empenho?.solicitacao_data ?? "",
      cr_dotacao: empenho?.cr_dotacao ?? "",
      fonte_recurso: empenho?.fonte_recurso ?? "",
      solicitacao_enviada_sefaz: empenho?.solicitacao_enviada_sefaz === true,
      solicitacao_enviada_em: empenho?.solicitacao_enviada_em ?? null,
      numero_ne: empenho?.numero_ne ?? "",
      valor_total:
        empenho?.valor_total == null ? null : Number(empenho.valor_total),
      nota_empenho_sei_numero: empenho?.nota_empenho_sei_numero ?? "",
      nota_empenho_sei_link: empenho?.nota_empenho_sei_link ?? "",
    });
  }, [open, empenho?.id, empenho?.updated_at]);

  useEffect(() => {
    if (!open) idLocalRef.current = empenho?.id ?? null;
  }, [open, empenho?.id]);

  const registroId = empenho?.id ?? idLocalRef.current;
  const assinaturasRegistro = registroId
    ? assinaturas.filter((assinatura) => assinatura.empenho_id === registroId)
    : [];
  const assinaturasOk =
    registroId != null &&
    assinaturasSolicitacaoEmpenhoCompletasPvh(assinaturasRegistro);

  const solicitacaoPronta = solicitacaoEmpenhoProntaPvh(form);
  const notaPronta = notaEmpenhoProntaPvh(form, ano);
  const fluxoLegado =
    Boolean(empenho?.id) &&
    !empenho?.solicitacao_competencia_id &&
    empenho?.status === "ativo";
  const notaLiberada = fluxoLegado || form.solicitacao_enviada_sefaz;

  const processoVinculado = useMemo(() => {
    if (empenho?.processo_anual_id) {
      const existente = processos.find((item) => item.id === empenho.processo_anual_id);
      if (existente) return existente;
    }

    return processos.find(
      (item) =>
        item.prestador_id === prestadorId &&
        item.tipo === "empenho" &&
        Number(item.ano) === ano,
    );
  }, [empenho?.processo_anual_id, processos, prestadorId, ano]);

  const salvarSolicitacao = useMutation({
    mutationFn: async () => {
      if (!solicitacaoPronta) {
        throw new Error(
          "Preencha Nº SEI, Link SEI, data, dotação e fonte da Solicitação de NE.",
        );
      }

      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        prestador_id: prestadorId,
        processo_anual_id: processoVinculado?.id ?? empenho?.processo_anual_id ?? null,
        ano,
        solicitacao_competencia_id: empenho?.id
          ? empenho.solicitacao_competencia_id ?? null
          : competenciaId,
        solicitacao_sei_numero: form.solicitacao_sei_numero.trim(),
        solicitacao_sei_link: form.solicitacao_sei_link.trim(),
        solicitacao_data: form.solicitacao_data,
        cr_dotacao: form.cr_dotacao.trim(),
        fonte_recurso: form.fonte_recurso.trim(),
      };

      if (registroId) {
        const { data, error } = await supabase
          .from("pvh_empenhos")
          .update(payload)
          .eq("id", registroId)
          .select("*")
          .single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from("pvh_empenhos")
        .insert({
          ...payload,
          numero_ne: null,
          valor_total: null,
          status: "solicitada",
          created_by: auth.user?.id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (salvo) => {
      idLocalRef.current = salvo.id;
      setForm((atual) => ({
        ...atual,
        solicitacao_enviada_sefaz: salvo.solicitacao_enviada_sefaz === true,
        solicitacao_enviada_em: salvo.solicitacao_enviada_em ?? null,
      }));
      onCreated(salvo.id);
      onChange();
      toast.success(
        salvo.solicitacao_enviada_sefaz
          ? "Solicitação de NE salva."
          : "Solicitação salva. Agora registre as assinaturas.",
      );
    },
    onError: (error: any) => toast.error(error.message),
  });

  const confirmarEnvio = useMutation({
    mutationFn: async () => {
      if (!registroId) throw new Error("Salve a Solicitação de NE antes do envio.");
      if (!solicitacaoPronta)
        throw new Error("Complete os dados da Solicitação de NE antes do envio.");
      if (!assinaturasOk)
        throw new Error("Registre todas as cinco assinaturas antes do envio à SEFAZ.");

      // Persiste o que está na tela imediatamente antes da confirmação. Assim,
      // o usuário não consegue confirmar uma versão antiga do documento por
      // esquecer de clicar em "Salvar solicitação" após uma correção.
      const { error: salvarError } = await supabase
        .from("pvh_empenhos")
        .update({
          solicitacao_sei_numero: form.solicitacao_sei_numero.trim(),
          solicitacao_sei_link: form.solicitacao_sei_link.trim(),
          solicitacao_data: form.solicitacao_data,
          cr_dotacao: form.cr_dotacao.trim(),
          fonte_recurso: form.fonte_recurso.trim(),
        })
        .eq("id", registroId);
      if (salvarError) throw salvarError;

      const { error } = await supabase.rpc("pvh_confirmar_envio_solicitacao_empenho", {
        p_empenho: registroId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm((atual) => ({
        ...atual,
        solicitacao_enviada_sefaz: true,
        solicitacao_enviada_em: new Date().toISOString(),
      }));
      onChange();
      toast.success("Envio à SEFAZ.UCG.AEO confirmado.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const salvarNota = useMutation({
    mutationFn: async () => {
      if (!registroId) throw new Error("Registre primeiro a Solicitação de NE.");
      if (!notaLiberada)
        throw new Error("Confirme o envio da Solicitação à SEFAZ.UCG.AEO antes de registrar a NE.");
      if (!notaPronta)
        throw new Error(
          `Informe Número da NE no formato XXXX/${ano}, valor total, Nº SEI e Link SEI da Nota de Empenho.`,
        );

      const numeroNe = normalizarNumeroNePvh(form.numero_ne, ano);
      const { data, error } = await supabase
        .from("pvh_empenhos")
        .update({
          numero_ne: numeroNe,
          valor_total: Number(form.valor_total),
          nota_empenho_sei_numero: form.nota_empenho_sei_numero.trim(),
          nota_empenho_sei_link: form.nota_empenho_sei_link.trim(),
          status: "ativo",
        })
        .eq("id", registroId)
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505")
          throw new Error("Essa Nota de Empenho já está cadastrada para a instituição.");
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      onChange();
      toast.success("Nota de Empenho registrada e liberada para alocação.");
      onOpenChange(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const titulo = empenho?.numero_ne
    ? `NE ${empenho.numero_ne}`
    : empenho?.solicitacao_sei_numero
      ? `Solicitação SEI ${empenho.solicitacao_sei_numero}`
      : "Nova Solicitação de Nota de Empenho";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(1180px,calc(100vw-2rem))] max-w-none p-0 sm:max-w-[1180px]">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-7">
            <div>
              <DialogTitle>{titulo}</DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {instituicaoNome} · competência {competencia} · exercício {ano}
              </p>
            </div>
            {processoVinculado && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs">
                <Landmark className="h-3.5 w-3.5 text-primary" />
                <span>
                  Processo anual <b>{processoVinculado.numero_sei}</b>
                </span>
                {processoVinculado.link_sei && (
                  <SeiButton href={processoVinculado.link_sei} label="Abrir" />
                )}
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 text-[10px]">
            {[
              ["Solicitação", Boolean(registroId)],
              ["5 assinaturas", fluxoLegado || assinaturasOk],
              ["Envio SEFAZ", fluxoLegado || form.solicitacao_enviada_sefaz],
              ["NE emitida", empenho?.status === "ativo" && Boolean(empenho?.numero_ne)],
            ].map(([rotulo, ok], index) => (
              <div key={String(rotulo)} className="flex items-center gap-2">
                <span
                  className={
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border font-semibold " +
                    (ok
                      ? "border-success bg-success text-success-foreground"
                      : "border-muted-foreground/30 text-muted-foreground")
                  }
                >
                  {ok ? "✓" : index + 1}
                </span>
                <span className={ok ? "font-medium text-foreground" : "text-muted-foreground"}>
                  {rotulo}
                </span>
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="grid gap-0 lg:grid-cols-[1.15fr_.85fr]">
          <section className="space-y-3 border-b p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  1 · Solicitação
                </p>
                <h3 className="font-semibold">Solicitação de Nota de Empenho</h3>
              </div>
              {form.solicitacao_enviada_sefaz ? (
                <Badge className="bg-success text-success-foreground">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Enviada à SEFAZ
                </Badge>
              ) : (
                <Badge variant="outline">Em preparação</Badge>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-[160px_1fr_160px]">
              <div>
                <Label className="text-xs">Nº SEI da Solicitação</Label>
                <Input
                  className="mt-1 h-9"
                  value={form.solicitacao_sei_numero}
                  onChange={(e) =>
                    setForm({ ...form, solicitacao_sei_numero: e.target.value })
                  }
                  disabled={!podeEditar}
                  placeholder="Ex.: 31001234"
                />
              </div>
              <div>
                <Label className="text-xs">Link SEI</Label>
                <div className="mt-1">
                  <SeiLink
                    value={form.solicitacao_sei_link}
                    editable={podeEditar}
                    onChange={(value) =>
                      setForm({ ...form, solicitacao_sei_link: value })
                    }
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Data da solicitação</Label>
                <Input
                  className="mt-1 h-9"
                  type="date"
                  value={form.solicitacao_data}
                  onChange={(e) => setForm({ ...form, solicitacao_data: e.target.value })}
                  disabled={!podeEditar}
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Dotação / CR</Label>
                <Input
                  className="mt-1 h-9"
                  value={form.cr_dotacao}
                  onChange={(e) => setForm({ ...form, cr_dotacao: e.target.value })}
                  disabled={!podeEditar}
                  placeholder="Dotação utilizada na solicitação"
                />
              </div>
              <div>
                <Label className="text-xs">Fonte</Label>
                <Input
                  className="mt-1 h-9"
                  value={form.fonte_recurso}
                  onChange={(e) => setForm({ ...form, fonte_recurso: e.target.value })}
                  disabled={!podeEditar}
                  placeholder="Fonte do recurso"
                />
              </div>
            </div>

            {podeEditar && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] text-muted-foreground">
                  Salve a solicitação para habilitar a matriz de assinaturas.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!solicitacaoPronta || salvarSolicitacao.isPending}
                  onClick={() => salvarSolicitacao.mutate()}
                >
                  {registroId ? "Salvar solicitação" : "Criar solicitação"}
                </Button>
              </div>
            )}

            {fluxoLegado ? (
              <div className="rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground">
                Esta NE já existia antes do fluxo de assinaturas da Etapa 3. O sistema preserva o
                histórico e não exige assinatura ou confirmação de envio retroativas.
              </div>
            ) : registroId ? (
              <AssinaturasSolicitacaoEmpenhoPvh
                empenhoId={registroId}
                assinaturas={assinaturas}
                pool={pool}
                podeEditar={podeEditar}
                onChange={onChange}
              />
            ) : (
              <div className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                A matriz de assinaturas aparece aqui assim que a Solicitação de NE for salva.
              </div>
            )}

            {!fluxoLegado && (
              <div
                className={
                  "rounded-lg border p-3 " +
                  (form.solicitacao_enviada_sefaz
                    ? "border-success/40 bg-success/5"
                    : "bg-muted/10")
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Encaminhamento à SEFAZ.UCG.AEO</div>
                    <p className="text-[10px] text-muted-foreground">
                      A confirmação só é liberada com os dados da solicitação e as cinco assinaturas.
                    </p>
                  </div>
                  {form.solicitacao_enviada_sefaz ? (
                    <div className="flex items-center gap-2 text-xs font-medium text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      Envio confirmado
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      disabled={
                        !podeEditar ||
                        !registroId ||
                        !solicitacaoPronta ||
                        !assinaturasOk ||
                        confirmarEnvio.isPending
                      }
                      onClick={() => confirmarEnvio.mutate()}
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Confirmar envio
                    </Button>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="relative space-y-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  2 · Retorno da SEFAZ
                </p>
                <h3 className="font-semibold">Nota de Empenho emitida</h3>
              </div>
              {empenho?.status === "ativo" && empenho?.numero_ne ? (
                <Badge className="bg-success text-success-foreground">NE emitida</Badge>
              ) : (
                <Badge variant="outline">Aguardando NE</Badge>
              )}
            </div>

            {!notaLiberada && (
              <div className="rounded-lg border border-dashed bg-muted/20 p-3">
                <div className="flex items-start gap-2 text-sm">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Aguardando envio da Solicitação</div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Esta parte é liberada depois da confirmação de envio à SEFAZ.UCG.AEO.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {fluxoLegado && (
              <div className="rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground">
                Registro criado antes do fluxo de assinaturas/encaminhamento. A NE permanece editável
                para preservar o histórico já existente.
              </div>
            )}

            <fieldset
              disabled={!podeEditar || !notaLiberada}
              className={!notaLiberada ? "opacity-50" : ""}
            >
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-[170px_1fr]">
                  <div>
                    <Label className="text-xs">Número da NE</Label>
                    <Input
                      className="mt-1 h-9"
                      value={form.numero_ne}
                      onChange={(e) => setForm({ ...form, numero_ne: e.target.value })}
                      onBlur={() =>
                        setForm((atual) => ({
                          ...atual,
                          numero_ne: normalizarNumeroNePvh(atual.numero_ne, ano),
                        }))
                      }
                      placeholder={`Ex.: 4086/${ano}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Valor total da NE</Label>
                    <CurrencyInput
                      className="mt-1 h-9"
                      value={form.valor_total}
                      onChange={(valor) => setForm({ ...form, valor_total: valor || null })}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Nº SEI da Nota de Empenho</Label>
                  <Input
                    className="mt-1 h-9"
                    value={form.nota_empenho_sei_numero}
                    onChange={(e) =>
                      setForm({ ...form, nota_empenho_sei_numero: e.target.value })
                    }
                    placeholder="Número do documento no SEI"
                  />
                </div>

                <div>
                  <Label className="text-xs">Link SEI da Nota de Empenho</Label>
                  <div className="mt-1">
                    <SeiLink
                      value={form.nota_empenho_sei_link}
                      editable={podeEditar && notaLiberada}
                      onChange={(value) =>
                        setForm({ ...form, nota_empenho_sei_link: value })
                      }
                    />
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/10 p-3 text-[11px] text-muted-foreground">
                  O valor total pertence à NE e poderá ser distribuído entre várias competências.
                  A alocação para {competencia} é feita na tela principal depois que a NE for registrada.
                </div>
              </div>
            </fieldset>
          </section>
        </div>

        <DialogFooter className="border-t px-6 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            disabled={
              !podeEditar ||
              !notaLiberada ||
              !notaPronta ||
              salvarNota.isPending
            }
            onClick={() => salvarNota.mutate()}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            {empenho?.numero_ne ? "Salvar Nota de Empenho" : "Registrar Nota de Empenho"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
