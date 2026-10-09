import { CheckCircle2, LockKeyhole, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AssinaturasSubempenhoPvh } from "@/components/pvh/AssinaturasSubempenhoPvh";
import { TutorialAvisoMovimentoPvh } from "@/components/pvh/TutorialAvisoMovimentoPvh";
import { SeiLink } from "@/components/inputs/SeiLink";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { linkValido } from "@/lib/sei";
import { encaminharDepoisDePersistir } from "@/lib/pvh/encaminhamento";
import {
  cadeiaSubempenhoCompletaPvh,
  patchAutosaveSubempenhoPvh,
  statusSubetapasSubempenhoPvh,
  type CampoAutosaveSubempenhoPvh,
  type FormAutosaveSubempenhoPvh,
} from "@/lib/pvh/subempenhos";

type Form = FormAutosaveSubempenhoPvh;

const vazio: Form = {
  solicitacao_sei_numero: "",
  solicitacao_sei_link: "",
  movimento_liquidacao_sei_numero: "",
  movimento_liquidacao_sei_link: "",
  movimento_subempenho_sei_numero: "",
  movimento_subempenho_sei_link: "",
  movimento_subempenho_data: "",
};

function BadgeConclusao({
  completa,
  bloqueada = false,
}: {
  completa: boolean;
  bloqueada?: boolean;
}) {
  if (completa) {
    return (
      <Badge className="bg-success text-success-foreground">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Concluída
      </Badge>
    );
  }

  if (bloqueada) {
    return (
      <Badge variant="secondary">
        <LockKeyhole className="mr-1 h-3 w-3" />
        Aguardando anterior
      </Badge>
    );
  }

  return <Badge variant="outline">Pendente</Badge>;
}

export function CadeiaSubempenhoPvh({
  alocacao,
  subempenho,
  assinaturas,
  pool,
  podeEditar,
  aberto,
  onChange,
}: {
  alocacao: any;
  subempenho: any;
  assinaturas: any[];
  pool: any[];
  podeEditar: boolean;
  aberto: boolean;
  onChange: () => void;
}) {
  const [form, setForm] = useState<Form>(vazio);
  const [encaminhado, setEncaminhado] = useState(false);
  const [subetapaAberta, setSubetapaAberta] = useState("");
  const [salvando, setSalvando] = useState(false);
  const formRef = useRef<Form>(vazio);
  const persistidoRef = useRef<Form>(vazio);
  const filaPersistenciaRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const timerAutosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistenciasPendentesRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const hidratado: Form = {
      solicitacao_sei_numero: subempenho?.solicitacao_sei_numero ?? "",
      solicitacao_sei_link: subempenho?.solicitacao_sei_link ?? "",
      movimento_liquidacao_sei_numero:
        subempenho?.movimento_liquidacao_sei_numero ?? "",
      movimento_liquidacao_sei_link:
        subempenho?.movimento_liquidacao_sei_link ?? "",
      movimento_subempenho_sei_numero:
        subempenho?.movimento_subempenho_sei_numero ?? "",
      movimento_subempenho_sei_link:
        subempenho?.movimento_subempenho_sei_link ?? "",
      movimento_subempenho_data:
        subempenho?.movimento_subempenho_data ?? "",
    };

    setForm(hidratado);
    formRef.current = hidratado;
    persistidoRef.current = hidratado;
    setEncaminhado(
      subempenho?.movimento_liquidacao_encaminhado_sefaz === true,
    );
  }, [subempenho?.id]);

  const registroId = subempenho.id;

  const persistirAgora = useCallback(() => {
    if (!podeEditar) return Promise.resolve(false);

    if (timerAutosaveRef.current) {
      clearTimeout(timerAutosaveRef.current);
      timerAutosaveRef.current = null;
    }

    const snapshot = { ...formRef.current };
    const patch = patchAutosaveSubempenhoPvh(
      snapshot,
      persistidoRef.current,
    );

    if (Object.keys(patch).length === 0) {
      return filaPersistenciaRef.current;
    }

    persistenciasPendentesRef.current += 1;
    setSalvando(true);

    const tarefa = filaPersistenciaRef.current.then(async () => {
      const { error } = await supabase
        .from("pvh_subempenhos")
        .update(patch)
        .eq("id", registroId);

      if (error) throw error;

      persistidoRef.current = {
        ...persistidoRef.current,
        ...Object.fromEntries(
          Object.entries(patch).map(([campo, valor]) => [
            campo,
            valor ?? "",
          ]),
        ),
      } as Form;

      onChangeRef.current();
      return true;
    });

    filaPersistenciaRef.current = tarefa
      .catch((error: any) => {
        toast.error(
          error.message ??
            "Não foi possível salvar os dados da cadeia de Subempenho.",
        );
        // A confirmação de envio NÃO pode avançar se o autosave falhou.
        return false;
      })
      .finally(() => {
        persistenciasPendentesRef.current = Math.max(
          0,
          persistenciasPendentesRef.current - 1,
        );
        if (persistenciasPendentesRef.current === 0) {
          setSalvando(false);
        }
      });

    return filaPersistenciaRef.current;
  }, [podeEditar, registroId]);

  const atualizarCampo = useCallback(
    (campo: CampoAutosaveSubempenhoPvh, valor: string) => {
      // Não aguarda o commit assíncrono do estado React. O blur pode
      // disparar a gravação no mesmo frame em que o usuário escolhe a data.
      const proximo = { ...formRef.current, [campo]: valor };
      formRef.current = proximo;
      setForm(proximo);

      if (timerAutosaveRef.current) {
        clearTimeout(timerAutosaveRef.current);
      }

      timerAutosaveRef.current = setTimeout(() => {
        void persistirAgora();
      }, 500);
    },
    [persistirAgora],
  );

  useEffect(() => {
    if (!aberto) {
      void persistirAgora();
      setSubetapaAberta("");
    }
  }, [aberto, persistirAgora]);

  useEffect(
    () => () => {
      if (timerAutosaveRef.current) {
        clearTimeout(timerAutosaveRef.current);
      }
    },
    [],
  );
  const subempenhoAtual = {
    ...subempenho,
    ...form,
    movimento_liquidacao_encaminhado_sefaz: encaminhado,
  };
  const status = statusSubetapasSubempenhoPvh(
    subempenhoAtual,
    assinaturas,
  );
  const completo = cadeiaSubempenhoCompletaPvh(
    subempenhoAtual,
    assinaturas,
  );

  useEffect(() => {
    if (subetapaAberta === "liquidacao" && !status.solicitacao) {
      setSubetapaAberta("");
    }
    if (subetapaAberta === "subempenho" && !status.liquidacao) {
      setSubetapaAberta("");
    }
  }, [status.solicitacao, status.liquidacao, subetapaAberta]);

  const confirmarEncaminhamento = useMutation({
    mutationFn: () =>
      encaminharDepoisDePersistir(persistirAgora, async () => {
        const { error } = await supabase.rpc(
          "pvh_confirmar_movimento_liquidacao_sefaz",
          { p_subempenho: registroId },
        );
        if (error) throw error;
      }),
    onSuccess: () => {
      setEncaminhado(true);
      onChange();
      toast.success("Encaminhamento para SEFAZ.UAF.ADE confirmado.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const CamposSei = ({
    numeroCampo,
    linkCampo,
    disabled = false,
  }: {
    numeroCampo:
      | "solicitacao_sei_numero"
      | "movimento_liquidacao_sei_numero"
      | "movimento_subempenho_sei_numero";
    linkCampo:
      | "solicitacao_sei_link"
      | "movimento_liquidacao_sei_link"
      | "movimento_subempenho_sei_link";
    disabled?: boolean;
  }) => (
    <div
      className="grid gap-2 md:grid-cols-[190px_minmax(280px,1fr)]"
      onBlur={(event) => {
        const proximoFoco = event.relatedTarget as Node | null;
        if (!proximoFoco || !event.currentTarget.contains(proximoFoco)) {
          void persistirAgora();
        }
      }}
    >
      <div>
        <Label className="text-xs">Número SEI</Label>
        <Input
          className="mt-1 h-9"
          value={form[numeroCampo]}
          disabled={!podeEditar || disabled}
          placeholder="Número do documento no SEI"
          onChange={(e) => atualizarCampo(numeroCampo, e.target.value)}
        />
      </div>

      <div>
        <Label className="text-xs">Link SEI</Label>
        <div className="mt-1">
          <SeiLink
            value={form[linkCampo]}
            editable={podeEditar && !disabled}
            onChange={(value) => atualizarCampo(linkCampo, value)}
          />
        </div>
      </div>
    </div>
  );

  const empenho = Array.isArray(alocacao.pvh_empenhos)
    ? alocacao.pvh_empenhos[0]
    : alocacao.pvh_empenhos;

  return (
    <div className="space-y-3 rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">
            Fluxo de Subempenho · NE {empenho?.numero_ne ?? "—"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {status.completas}/{status.total} subetapas concluídas · valor da
            cadeia {brl(Number(alocacao.valor_alocado ?? subempenho?.valor ?? 0))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {salvando ? "Salvando automaticamente…" : "Salvamento automático"}
          </span>
          <Badge variant={completo ? "default" : "outline"}>
            {completo ? "Fluxo completo" : "Pendente"}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/10 px-3 py-2">
        <div className="text-xs text-muted-foreground">
          O valor do subempenho vem da cobertura da NE definida na Etapa 3.
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {brl(Number(alocacao.valor_alocado ?? subempenho?.valor ?? 0))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
        <div>
          <div className="text-xs font-medium">
            Tutorial do Aviso de Movimento no e-Pública
          </div>
          <div className="text-[10px] text-muted-foreground">
            Passo a passo operacional da subetapa 2, incluindo transmissão ao
            SEI e encaminhamento à SEFAZ.UAF.ADE.
          </div>
        </div>
        <TutorialAvisoMovimentoPvh />
      </div>

      <Accordion
        type="single"
        collapsible
        value={subetapaAberta}
        onValueChange={(value) => {
          void persistirAgora();
          setSubetapaAberta(value);
        }}
        className="overflow-hidden rounded-lg border"
      >
        <AccordionItem value="solicitacao">
          <AccordionTrigger className="px-3 py-3 hover:no-underline">
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-3 text-left">
              <div>
                <p className="text-sm font-semibold">
                  1. Solicitação de Subempenho / Liquidação
                </p>
                <p className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                  Nº SEI + Link SEI + assinatura obrigatória da Comissão.
                </p>
              </div>
              <BadgeConclusao completa={status.solicitacao} />
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-3 pb-4">
            <CamposSei
              numeroCampo="solicitacao_sei_numero"
              linkCampo="solicitacao_sei_link"
            />
            <AssinaturasSubempenhoPvh
              subempenhoId={registroId}
              documentoTipo="solicitacao"
              assinaturas={assinaturas}
              pool={pool}
              podeEditar={podeEditar}
              onChange={onChange}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="liquidacao">
          <AccordionTrigger
            disabled={!status.solicitacao}
            className="px-3 py-3 hover:no-underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-3 text-left">
              <div>
                <p className="text-sm font-semibold">
                  2. Aviso de Movimento — Empenho em Liquidação
                </p>
                <p className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                  Emitir no e-Pública, transmitir ao SEI, assinar e encaminhar
                  à SEFAZ.UAF.ADE.
                </p>
              </div>
              <BadgeConclusao
                completa={status.liquidacao}
                bloqueada={!status.solicitacao}
              />
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-3 pb-4">
            <CamposSei
              numeroCampo="movimento_liquidacao_sei_numero"
              linkCampo="movimento_liquidacao_sei_link"
            />

            <AssinaturasSubempenhoPvh
              subempenhoId={registroId}
              documentoTipo="movimento_liquidacao"
              assinaturas={assinaturas}
              pool={pool}
              podeEditar={podeEditar}
              onChange={onChange}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/10 p-2.5">
              <div>
                <div className="text-xs font-medium">
                  Encaminhamento à SEFAZ.UAF.ADE
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Obrigatório depois do documento e da assinatura da Comissão.
                  Esta confirmação libera a subetapa 3.
                </div>
              </div>

              {encaminhado ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Envio confirmado
                </span>
              ) : (
                <Button
                  size="sm"
                  disabled={
                    !podeEditar ||
                    !form.movimento_liquidacao_sei_numero.trim() ||
                    !linkValido(form.movimento_liquidacao_sei_link) ||
                    !assinaturas.some(
                      (item) =>
                        item.subempenho_id === registroId &&
                        item.documento_tipo === "movimento_liquidacao" &&
                        item.slot === "comissao" &&
                        !item.revogado_em,
                    ) ||
                    confirmarEncaminhamento.isPending
                  }
                  onClick={() => confirmarEncaminhamento.mutate()}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Confirmar envio
                </Button>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="subempenho">
          <AccordionTrigger
            disabled={!status.liquidacao}
            className="px-3 py-3 hover:no-underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-3 text-left">
              <div>
                <p className="text-sm font-semibold">
                  3. Aviso de Movimento — Subempenho
                </p>
                <p className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                  Liberado somente após o encaminhamento da subetapa 2.
                </p>
              </div>
              <BadgeConclusao
                completa={status.subempenho}
                bloqueada={!status.liquidacao}
              />
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-3 pb-4">
            <div className="grid gap-2 md:grid-cols-[190px_minmax(280px,1fr)_170px]">
              <div>
                <Label className="text-xs">Número SEI</Label>
                <Input
                  className="mt-1 h-9"
                  value={form.movimento_subempenho_sei_numero}
                  disabled={!podeEditar}
                  placeholder="Número do documento no SEI"
                  onChange={(e) =>
                    atualizarCampo(
                      "movimento_subempenho_sei_numero",
                      e.target.value,
                    )
                  }
                  onBlur={() => void persistirAgora()}
                />
              </div>

              <div>
                <Label className="text-xs">Link SEI</Label>
                <div className="mt-1" onBlur={() => void persistirAgora()}>
                  <SeiLink
                    value={form.movimento_subempenho_sei_link}
                    editable={podeEditar}
                    onChange={(value) =>
                      atualizarCampo("movimento_subempenho_sei_link", value)
                    }
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Data do aviso</Label>
                <Input
                  type="date"
                  className="mt-1 h-9"
                  value={form.movimento_subempenho_data}
                  disabled={!podeEditar}
                  onChange={(e) =>
                    atualizarCampo(
                      "movimento_subempenho_data",
                      e.target.value,
                    )
                  }
                  onBlur={(e) => {
                    atualizarCampo("movimento_subempenho_data", e.currentTarget.value);
                    void persistirAgora();
                  }}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
