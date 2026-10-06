import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Send, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BlocoAssinaturas, type Slot } from "@/components/BlocoAssinaturas";
import { SeiLink } from "@/components/inputs/SeiLink";
import { linkValido } from "@/lib/sei";
import { dateTime } from "@/lib/format";
import { DOC_LABEL, acharDoc, docCompleto, encaminhado, type CtxPiso } from "@/lib/piso/regras";

export interface DocProps {
  ctx: CtxPiso;
  competenciaId: string;
  tipo: string;
  participanteId?: string | null;
  obrigacaoId?: string | null;
  pool: any[];
  canEdit: boolean;
  encaminhavel?: boolean;
  destinoEncaminhamento?: string;
  onChange: () => void;
}

/** Cartão de documento do Piso: nº SEI, link, data, assinaturas (matriz), encaminhamento e "alterado por". */
export function DocumentoCard({
  ctx,
  competenciaId,
  tipo,
  participanteId = null,
  obrigacaoId = null,
  pool,
  canEdit,
  encaminhavel,
  destinoEncaminhamento = "e-Pública / SEFAZ",
  onChange,
}: DocProps) {
  const doc: any = acharDoc(ctx.docs, tipo, {
    participante_id: participanteId,
    obrigacao_id: obrigacaoId,
  });
  const [f, setF] = useState({ numero_sei: "", link_sei: "", data_documento: "" });
  const documentoIdRef = useRef<string | null>(doc?.id ?? null);
  useEffect(() => {
    documentoIdRef.current = doc?.id ?? documentoIdRef.current;
    setF({
      numero_sei: doc?.numero_sei ?? "",
      link_sei: doc?.link_sei ?? "",
      data_documento: doc?.data_documento ?? "",
    });
  }, [doc?.id, doc?.updated_at]);

  const salvar = async () => {
    if (!canEdit) return;
    if (!f.numero_sei && !f.link_sei && !f.data_documento && !documentoIdRef.current) return;
    if (f.link_sei && !linkValido(f.link_sei)) return toast.error("Link SEI inválido.");
    const { data: u } = await supabase.auth.getUser();
    const { data: p } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", u.user?.id ?? "")
      .maybeSingle();
    const patch = {
      numero_sei: f.numero_sei || null,
      link_sei: f.link_sei || null,
      data_documento: f.data_documento || null,
      updated_by: u.user?.id,
      updated_by_nome: p?.nome ?? u.user?.email,
    };
    const idAtual = documentoIdRef.current ?? doc?.id ?? null;
    if (idAtual) {
      const { error } = await supabase.from("piso_documentos").update(patch).eq("id", idAtual);
      if (error) return toast.error(error.message);
    } else {
      const { data: criado, error } = await supabase
        .from("piso_documentos")
        .insert({
          ...patch,
          competencia_id: competenciaId,
          participante_id: participanteId,
          obrigacao_id: obrigacaoId,
          tipo,
        })
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      documentoIdRef.current = criado.id;
    }
    onChange();
  };

  const encaminhar = async (acao: "encaminhado" | "revertido") => {
    let motivo: string | null = null;
    if (acao === "revertido") {
      motivo = prompt("Motivo da reversão do encaminhamento:");
      if (!motivo?.trim()) return;
    }
    const { data: u } = await supabase.auth.getUser();
    const { data: p } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", u.user?.id ?? "")
      .maybeSingle();
    const { error } = await supabase.from("piso_encaminhamentos").insert({
      documento_id: doc.id,
      acao,
      destino: destinoEncaminhamento,
      motivo,
      usuario_id: u.user?.id,
      usuario_nome: p?.nome ?? u.user?.email,
    });
    if (error) return toast.error(error.message);
    onChange();
  };

  const slots: Slot[] = ctx.matriz
    .filter((m: any) => m.tipo_documento === tipo)
    .sort((a: any, b: any) => a.ordem - b.ordem)
    .map((m: any) => ({
      key: m.slot_key,
      label: m.label,
      cargos: m.cargos,
      manual: m.manual,
      cargoManual:
        m.manual && m.slot_key === "comissao"
          ? "Membro da Comissão de Gestão e Controle de Despesa"
          : m.manual
            ? "SEFAZ"
            : undefined,
      qualquer: m.qualquer,
      opcional: m.opcional,
    }));
  const assin = ctx.assinaturas
    .filter((a) => a.documento_id === doc?.id)
    .map((a) => ({ ...a, bloco: tipo }));
  const completo = docCompleto(ctx, doc);
  const encs = ctx.encaminhamentos
    .filter((e) => e.documento_id === doc?.id)
    .sort((a, b) => b.ocorrido_em.localeCompare(a.ocorrido_em));
  const enc = encaminhado(ctx.encaminhamentos, doc?.id);

  return (
    <div className={`rounded-lg border p-3 space-y-3 ${completo ? "border-success/40" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm">{DOC_LABEL[tipo] ?? tipo}</span>
        {completo ? (
          <Badge className="bg-success text-success-foreground gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Completo
          </Badge>
        ) : (
          <Badge variant="outline">Pendente</Badge>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <div className="space-y-1">
          <Label className="text-xs">Nº SEI</Label>
          <Input
            value={f.numero_sei}
            disabled={!canEdit}
            onChange={(e) => setF({ ...f, numero_sei: e.target.value })}
            onBlur={salvar}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Link SEI</Label>
          <div onBlur={salvar}>
            <SeiLink
              value={f.link_sei}
              editable={canEdit}
              onChange={(v) => setF({ ...f, link_sei: v })}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Data</Label>
          <Input
            type="date"
            value={f.data_documento}
            disabled={!canEdit}
            onChange={(e) => setF({ ...f, data_documento: e.target.value })}
            onBlur={salvar}
          />
        </div>
      </div>
      {canEdit && (
        <p className="text-[11px] text-muted-foreground">
          Salvamento automático ao sair de cada campo.
        </p>
      )}
      {doc?.updated_by_nome && (
        <p className="text-[11px] text-muted-foreground">
          Alterado por {doc.updated_by_nome} em {dateTime(doc.updated_at)}
        </p>
      )}
      {doc && slots.length > 0 && (
        <BlocoAssinaturas
          documentoId={doc.id}
          bloco={tipo}
          slots={slots}
          pool={pool}
          assinaturas={assin}
          canEdit={canEdit}
          onChange={onChange}
        />
      )}
      {!doc && slots.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Preencha ao menos um campo do documento; o registro será criado automaticamente para habilitar as assinaturas.
        </p>
      )}
      {encaminhavel && doc && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {enc ? (
              <Badge className="bg-success text-success-foreground">Encaminhado</Badge>
            ) : (
              <Badge variant="outline">Não encaminhado</Badge>
            )}
            {canEdit &&
              (enc ? (
                <Button size="sm" variant="ghost" onClick={() => encaminhar("revertido")}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" />
                  Reverter
                </Button>
              ) : (
                <Button size="sm" onClick={() => encaminhar("encaminhado")} disabled={!completo}>
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Encaminhar para {destinoEncaminhamento}
                </Button>
              ))}
          </div>
          {encs.slice(0, 3).map((e: any) => (
            <p key={e.id} className="text-[11px] text-muted-foreground">
              {dateTime(e.ocorrido_em)} — {e.acao} por {e.usuario_nome}
              {e.motivo ? ` (${e.motivo})` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
