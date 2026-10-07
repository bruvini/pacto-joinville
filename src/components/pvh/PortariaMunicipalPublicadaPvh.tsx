import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeiLink } from "@/components/inputs/SeiLink";
import { supabase } from "@/integrations/supabase/client";
import {
  documentoEtapa2CompletoPvh,
  TIPO_PORTARIA_MUNICIPAL_PVH,
} from "@/lib/pvh/etapa2";
import { linkValido } from "@/lib/sei";

type FormPortaria = {
  numero: string;
  data_documento: string;
  link_documento: string;
};

export function PortariaMunicipalPublicadaPvh({
  competenciaId,
  documento,
  podeEditar,
  onChange,
}: {
  competenciaId: string;
  documento?: any;
  podeEditar: boolean;
  onChange: () => void;
}) {
  const documentoIdRef = useRef<string | null>(documento?.id ?? null);
  const [form, setForm] = useState<FormPortaria>({
    numero: documento?.numero ?? "",
    data_documento: documento?.data_documento ?? "",
    link_documento: documento?.link_documento ?? "",
  });

  useEffect(() => {
    documentoIdRef.current = documento?.id ?? documentoIdRef.current;
    setForm({
      numero: documento?.numero ?? "",
      data_documento: documento?.data_documento ?? "",
      link_documento: documento?.link_documento ?? "",
    });
  }, [documento?.id, documento?.updated_at, competenciaId]);

  const completo = documentoEtapa2CompletoPvh(
    documentoIdRef.current
      ? {
          ...(documento ?? {}),
          id: documentoIdRef.current,
          tipo_codigo: TIPO_PORTARIA_MUNICIPAL_PVH,
          numero: form.numero,
          data_documento: form.data_documento,
          link_documento: form.link_documento,
        }
      : undefined,
    [],
  );

  const salvar = async () => {
    if (!podeEditar) return;
    if (form.link_documento && !linkValido(form.link_documento)) {
      toast.error("Link SEI inválido.");
      return;
    }
    if (!form.numero.trim() && !form.data_documento && !form.link_documento.trim() && !documentoIdRef.current) {
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", auth.user?.id ?? "")
      .maybeSingle();

    const patch = {
      numero: form.numero.trim() || null,
      data_documento: form.data_documento || null,
      link_documento: form.link_documento.trim() || null,
      normativa_referenciada_id: null,
      referencia_normativa_texto: null,
      updated_by: auth.user?.id ?? null,
      updated_by_nome: profile?.nome ?? auth.user?.email ?? null,
    };

    if (documentoIdRef.current) {
      const { error } = await supabase
        .from("pvh_documentos")
        .update(patch)
        .eq("id", documentoIdRef.current);
      if (error) return toast.error(error.message);
    } else {
      const { data: criado, error } = await supabase
        .from("pvh_documentos")
        .insert({
          ...patch,
          competencia_id: competenciaId,
          tipo_codigo: TIPO_PORTARIA_MUNICIPAL_PVH,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      documentoIdRef.current = criado.id;
    }

    const { error: resumoError } = await supabase
      .from("pvh_competencias")
      .update({
        portaria_municipal_numero: form.numero.trim() || null,
        portaria_municipal_data: form.data_documento || null,
        portaria_municipal_link: form.link_documento.trim() || null,
      } as any)
      .eq("id", competenciaId);
    if (resumoError) return toast.error(resumoError.message);

    onChange();
  };

  return (
    <section className={`space-y-3 rounded-xl border p-4 ${completo ? "border-success/40" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Documento 3</p>
          <h3 className="text-lg font-semibold">Portaria Municipal publicada</h3>
          <p className="text-sm text-muted-foreground">
            Registre somente os dados finais da publicação no SEI.
          </p>
        </div>
        {completo ? (
          <Badge className="bg-success text-success-foreground">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completo
          </Badge>
        ) : (
          <Badge variant="outline">Pendente</Badge>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-[180px_180px_minmax(300px,1fr)]">
        <div>
          <Label className="text-xs">Número da Portaria</Label>
          <Input
            className="mt-1 h-9"
            value={form.numero}
            onChange={(e) => setForm({ ...form, numero: e.target.value })}
            onBlur={() => void salvar()}
            disabled={!podeEditar}
            placeholder="Ex.: 232/2026/SMS"
          />
        </div>
        <div>
          <Label className="text-xs">Data da Portaria</Label>
          <Input
            className="mt-1 h-9"
            type="date"
            value={form.data_documento}
            onChange={(e) => setForm({ ...form, data_documento: e.target.value })}
            onBlur={() => void salvar()}
            disabled={!podeEditar}
          />
        </div>
        <div>
          <Label className="text-xs">Link SEI</Label>
          <div className="mt-1" onBlur={() => void salvar()}>
            <SeiLink
              value={form.link_documento}
              editable={podeEditar}
              onChange={(value) => setForm({ ...form, link_documento: value })}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
