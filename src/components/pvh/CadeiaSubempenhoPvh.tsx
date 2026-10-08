import { CheckCircle2, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AssinaturasSubempenhoPvh } from "@/components/pvh/AssinaturasSubempenhoPvh";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiLink } from "@/components/inputs/SeiLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { linkValido } from "@/lib/sei";

type Form = {
  solicitacao_sei_numero: string;
  solicitacao_sei_link: string;
  movimento_liquidacao_sei_numero: string;
  movimento_liquidacao_sei_link: string;
  movimento_subempenho_sei_numero: string;
  movimento_subempenho_sei_link: string;
};

const vazio: Form = {
  solicitacao_sei_numero: "",
  solicitacao_sei_link: "",
  movimento_liquidacao_sei_numero: "",
  movimento_liquidacao_sei_link: "",
  movimento_subempenho_sei_numero: "",
  movimento_subempenho_sei_link: "",
};

export function CadeiaSubempenhoPvh({
  alocacao,
  subempenho,
  indice,
  assinaturas,
  pool,
  podeEditar,
  onChange,
}: {
  alocacao: any;
  subempenho: any;
  indice: number;
  assinaturas: any[];
  pool: any[];
  podeEditar: boolean;
  onChange: () => void;
}) {
  const [form, setForm] = useState<Form>(vazio);
  const [valor, setValor] = useState<number>(Number(subempenho?.valor ?? 0));
  const [encaminhado, setEncaminhado] = useState(false);

  useEffect(() => {
    setForm({
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
    });
    setValor(Number(subempenho?.valor ?? 0));
    setEncaminhado(
      subempenho?.movimento_liquidacao_encaminhado_sefaz === true,
    );
  }, [subempenho?.id, subempenho?.updated_at]);

  const registroId = subempenho.id;
  const assinaturasDoSub = registroId
    ? assinaturas.filter((item) => item.subempenho_id === registroId)
    : [];
  const comissaoSolicitacao = assinaturasDoSub.some(
    (item) =>
      item.documento_tipo === "solicitacao" &&
      item.slot === "comissao" &&
      !item.revogado_em,
  );
  const comissaoLiquidacao = assinaturasDoSub.some(
    (item) =>
      item.documento_tipo === "movimento_liquidacao" &&
      item.slot === "comissao" &&
      !item.revogado_em,
  );

  const solicitacaoOk = Boolean(
    form.solicitacao_sei_numero.trim() &&
      linkValido(form.solicitacao_sei_link) &&
      comissaoSolicitacao,
  );
  const liquidacaoOk = Boolean(
    form.movimento_liquidacao_sei_numero.trim() &&
      linkValido(form.movimento_liquidacao_sei_link) &&
      comissaoLiquidacao &&
      encaminhado,
  );
  const subempenhoOk = Boolean(
    form.movimento_subempenho_sei_numero.trim() &&
      linkValido(form.movimento_subempenho_sei_link),
  );
  const completo =
    valor > 0 && solicitacaoOk && liquidacaoOk && subempenhoOk;

  const persistir = useMutation({
    mutationFn: async ({
      campo,
      valor,
    }: {
      campo: keyof Form;
      valor: string;
    }) => {
      const normalizado = valor.trim() || null;
      const atual = subempenho?.[campo] ?? null;
      if ((normalizado ?? null) === (atual ?? null) && subempenho?.id) return;

      const { error } = await supabase
        .from("pvh_subempenhos")
        .update({ [campo]: normalizado })
        .eq("id", registroId);
      if (error) throw error;
    },
    onSuccess: () => onChange(),
    onError: (error: any) => toast.error(error.message),
  });

  const salvar = (campo: keyof Form) => {
    if (!podeEditar || persistir.isPending) return;
    persistir.mutate({ campo, valor: form[campo] });
  };

  const persistirValor = useMutation({
    mutationFn: async (novoValor: number) => {
      if (!Number.isFinite(novoValor) || novoValor <= 0) {
        throw new Error("O valor do fluxo de subempenho deve ser maior que zero.");
      }
      const { error } = await supabase
        .from("pvh_subempenhos")
        .update({ valor: novoValor })
        .eq("id", registroId);
      if (error) throw error;
    },
    onSuccess: () => onChange(),
    onError: (error: any) => {
      setValor(Number(subempenho?.valor ?? 0));
      toast.error(error.message);
    },
  });

  const confirmarEncaminhamento = useMutation({
    mutationFn: async () => {
      if (!registroId)
        throw new Error("Registre primeiro o Aviso de Movimento em Liquidação.");
      const { error } = await supabase.rpc(
        "pvh_confirmar_movimento_liquidacao_sefaz",
        { p_subempenho: registroId },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setEncaminhado(true);
      onChange();
      toast.success("Encaminhamento para SEFAZ.UAF.ADE confirmado.");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const Documento = ({
    titulo,
    numeroCampo,
    linkCampo,
    assinaturasTipo,
    encaminhamento = false,
  }: {
    titulo: string;
    numeroCampo:
      | "solicitacao_sei_numero"
      | "movimento_liquidacao_sei_numero"
      | "movimento_subempenho_sei_numero";
    linkCampo:
      | "solicitacao_sei_link"
      | "movimento_liquidacao_sei_link"
      | "movimento_subempenho_sei_link";
    assinaturasTipo?: "solicitacao" | "movimento_liquidacao";
    encaminhamento?: boolean;
  }) => (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="text-sm font-semibold">{titulo}</div>

      <div className="grid gap-2 md:grid-cols-[190px_minmax(260px,1fr)]">
        <div>
          <Label className="text-xs">Número SEI</Label>
          <Input
            className="mt-1 h-9"
            value={form[numeroCampo]}
            disabled={!podeEditar}
            placeholder="Número do documento no SEI"
            onChange={(e) =>
              setForm((atual) => ({
                ...atual,
                [numeroCampo]: e.target.value,
              }))
            }
            onBlur={() => salvar(numeroCampo)}
          />
        </div>

        <div>
          <Label className="text-xs">Link SEI</Label>
          <div className="mt-1" onBlur={() => salvar(linkCampo)}>
            <SeiLink
              value={form[linkCampo]}
              editable={podeEditar}
              onChange={(value) =>
                setForm((atual) => ({
                  ...atual,
                  [linkCampo]: value,
                }))
              }
            />
          </div>
        </div>
      </div>

      {assinaturasTipo && (
        <AssinaturasSubempenhoPvh
          subempenhoId={registroId}
          documentoTipo={assinaturasTipo}
          assinaturas={assinaturas}
          pool={pool}
          podeEditar={podeEditar}
          onChange={onChange}
        />
      )}

      {encaminhamento && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/10 p-2.5">
          <div>
            <div className="text-xs font-medium">Encaminhamento à SEFAZ.UAF.ADE</div>
            <div className="text-[10px] text-muted-foreground">
              Liberado após o documento e a assinatura obrigatória da Comissão.
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
                !registroId ||
                !form.movimento_liquidacao_sei_numero.trim() ||
                !linkValido(form.movimento_liquidacao_sei_link) ||
                !comissaoLiquidacao ||
                confirmarEncaminhamento.isPending
              }
              onClick={() => confirmarEncaminhamento.mutate()}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Confirmar envio
            </Button>
          )}
        </div>
      )}
    </section>
  );

  const empenho = Array.isArray(alocacao.pvh_empenhos)
    ? alocacao.pvh_empenhos[0]
    : alocacao.pvh_empenhos;

  return (
    <div className="space-y-3 rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">
            Fluxo {indice} · NE {empenho?.numero_ne ?? "—"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Este fluxo está vinculado exclusivamente à alocação desta Nota de Empenho.
          </div>
        </div>
        <Badge variant={completo ? "default" : "outline"}>
          {completo ? "Fluxo completo" : "Pendente"}
        </Badge>
      </div>

      <div
        className="max-w-xs"
        onBlur={() => {
          if (
            podeEditar &&
            !persistirValor.isPending &&
            Number(valor) !== Number(subempenho?.valor ?? 0)
          ) {
            persistirValor.mutate(valor);
          }
        }}
      >
        <Label className="text-xs">Valor deste fluxo de subempenho</Label>
        <CurrencyInput
          className="mt-1 h-9"
          value={valor}
          disabled={!podeEditar}
          onChange={setValor}
        />
        <div className="mt-1 flex justify-between gap-3 text-[10px] text-muted-foreground">
          <span>NE alocada: {brl(Number(alocacao.valor_alocado ?? 0))}</span>
          <span>Salvamento automático</span>
        </div>
      </div>

      <Documento
        titulo="1. Solicitação de Subempenho / Liquidação"
        numeroCampo="solicitacao_sei_numero"
        linkCampo="solicitacao_sei_link"
        assinaturasTipo="solicitacao"
      />

      <Documento
        titulo="2. Aviso de Movimento — Empenho em Liquidação"
        numeroCampo="movimento_liquidacao_sei_numero"
        linkCampo="movimento_liquidacao_sei_link"
        assinaturasTipo="movimento_liquidacao"
        encaminhamento
      />

      <Documento
        titulo="3. Aviso de Movimento — Subempenho"
        numeroCampo="movimento_subempenho_sei_numero"
        linkCampo="movimento_subempenho_sei_link"
      />
    </div>
  );
}
