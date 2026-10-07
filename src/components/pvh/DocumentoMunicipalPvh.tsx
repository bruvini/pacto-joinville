import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AssinaturasDocumentoPvh } from "@/components/pvh/AssinaturasDocumentoPvh";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  alertasNormativosDocumentoPvh,
  documentoEtapa2CompletoPvh,
  TIPO_MEMORANDO_PVH,
  TIPO_MINUTA_PVH,
  TIPO_PORTARIA_MUNICIPAL_PVH,
} from "@/lib/pvh/etapa2";
import { hrefSei, linkValido } from "@/lib/sei";

type TipoDocumentoPvh = {
  codigo: string;
  titulo: string;
  descricao: string | null;
  exige_numero: boolean;
  exige_numero_sei: boolean;
  exige_link: boolean;
  exige_data: boolean;
  exige_assinatura: boolean;
};

export function DocumentoMunicipalPvh({
  competenciaId,
  competencia,
  normativaCompetenciaId,
  tipo,
  documento,
  assinaturas,
  normativas,
  podeEditar,
  onChange,
}: {
  competenciaId: string;
  competencia: string;
  normativaCompetenciaId?: string | null;
  tipo: TipoDocumentoPvh;
  documento?: any;
  assinaturas: any[];
  normativas: any[];
  podeEditar: boolean;
  onChange: () => void;
}) {
  const documentoIdRef = useRef<string | null>(documento?.id ?? null);
  const [form, setForm] = useState({
    numero: "",
    numero_sei: "",
    link_documento: "",
    data_documento: "",
    normativa_referenciada_id: normativaCompetenciaId ?? "",
    referencia_normativa_texto: "",
  });

  useEffect(() => {
    documentoIdRef.current = documento?.id ?? documentoIdRef.current;
    setForm({
      numero: documento?.numero ?? "",
      numero_sei: documento?.numero_sei ?? "",
      link_documento: documento?.link_documento ?? "",
      data_documento: documento?.data_documento ?? "",
      normativa_referenciada_id:
        documento?.normativa_referenciada_id ?? normativaCompetenciaId ?? "",
      referencia_normativa_texto: documento?.referencia_normativa_texto ?? "",
    });
  }, [documento?.id, documento?.updated_at, normativaCompetenciaId]);

  const assinaturasDocumento = documento?.id
    ? assinaturas.filter((assinatura) => assinatura.documento_id === documento.id)
    : [];
  const completo = documentoEtapa2CompletoPvh(documento, assinaturas);
  const mostrarNormativa = tipo.codigo !== TIPO_MEMORANDO_PVH;

  const alertasNormativos = alertasNormativosDocumentoPvh({
    competencia,
    normativaCompetenciaId,
    normativaDocumentoId: form.normativa_referenciada_id || null,
    referenciaTexto: form.referencia_normativa_texto,
  });

  const espelharLegado = async (
    idDocumento: string,
    dadosForm: typeof form,
  ) => {
    const patch: Record<string, string | null> = {};

    if (tipo.codigo === TIPO_MINUTA_PVH) {
      patch.minuta_municipal_numero = dadosForm.numero_sei.trim() || null;
      patch.minuta_municipal_link = dadosForm.link_documento.trim() || null;
    } else if (tipo.codigo === TIPO_MEMORANDO_PVH) {
      patch.memorando_municipal_numero = dadosForm.numero_sei.trim() || null;
      patch.memorando_municipal_link = dadosForm.link_documento.trim() || null;
    } else if (tipo.codigo === TIPO_PORTARIA_MUNICIPAL_PVH) {
      patch.portaria_municipal_numero = dadosForm.numero.trim() || null;
      patch.portaria_municipal_data = dadosForm.data_documento || null;
      patch.portaria_municipal_link = dadosForm.link_documento.trim() || null;
    }

    if (!Object.keys(patch).length) return;

    const { error } = await supabase
      .from("pvh_competencias")
      .update(patch as any)
      .eq("id", competenciaId);

    if (error) {
      throw new Error(
        `Documento ${idDocumento} foi salvo, mas não foi possível sincronizar o resumo legado: ${error.message}`,
      );
    }
  };

  const salvar = async (override: Partial<typeof form> = {}) => {
    if (!podeEditar) return;
    const dadosForm = { ...form, ...override };

    const temConteudo = Boolean(
      dadosForm.numero.trim() ||
        dadosForm.numero_sei.trim() ||
        dadosForm.link_documento.trim() ||
        dadosForm.data_documento ||
        dadosForm.referencia_normativa_texto.trim(),
    );
    if (!temConteudo && !documentoIdRef.current) return;

    if (dadosForm.link_documento.trim() && !linkValido(dadosForm.link_documento)) {
      toast.error("O link informado não parece válido.");
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", auth.user?.id ?? "")
      .maybeSingle();

    const patch = {
      numero: dadosForm.numero.trim() || null,
      numero_sei: dadosForm.numero_sei.trim() || null,
      link_documento: dadosForm.link_documento.trim() || null,
      data_documento: dadosForm.data_documento || null,
      normativa_referenciada_id: mostrarNormativa
        ? dadosForm.normativa_referenciada_id || null
        : null,
      referencia_normativa_texto: mostrarNormativa
        ? dadosForm.referencia_normativa_texto.trim() || null
        : null,
      updated_by: auth.user?.id ?? null,
      updated_by_nome: profile?.nome ?? auth.user?.email ?? null,
    };

    let idDocumento = documentoIdRef.current;
    if (idDocumento) {
      const { error } = await supabase
        .from("pvh_documentos")
        .update(patch)
        .eq("id", idDocumento);
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { data: criado, error } = await supabase
        .from("pvh_documentos")
        .insert({
          ...patch,
          competencia_id: competenciaId,
          tipo_codigo: tipo.codigo,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }
      idDocumento = criado.id;
      documentoIdRef.current = criado.id;
    }

    if (!idDocumento) return;

    try {
      await espelharLegado(idDocumento, dadosForm);
    } catch (error: any) {
      toast.error(error.message);
    }
    onChange();
  };

  return (
    <div className={`rounded-lg border p-3 ${completo ? "border-success/40" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{tipo.titulo}</h3>
            {completo ? (
              <Badge className="bg-success text-success-foreground">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Completo
              </Badge>
            ) : (
              <Badge variant="outline">Pendente</Badge>
            )}
          </div>
          {tipo.descricao && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{tipo.descricao}</p>
          )}
        </div>

        {form.link_documento && linkValido(form.link_documento) && (
          <a
            href={hrefSei(form.link_documento)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Abrir documento
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <div
        className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            void salvar();
          }
        }}
      >
        {tipo.exige_numero && (
          <div>
            <Label className="text-xs">Número da Portaria</Label>
            <Input
              className="mt-1 h-9"
              value={form.numero}
              onChange={(e) => setForm({ ...form, numero: e.target.value })}
              placeholder="Ex.: 232/2026"
              disabled={!podeEditar}
            />
          </div>
        )}

        {tipo.exige_numero_sei && (
          <div>
            <Label className="text-xs">Nº SEI</Label>
            <Input
              className="mt-1 h-9"
              value={form.numero_sei}
              onChange={(e) => setForm({ ...form, numero_sei: e.target.value })}
              placeholder="Número do documento no SEI"
              disabled={!podeEditar}
            />
          </div>
        )}

        {tipo.exige_data && (
          <div>
            <Label className="text-xs">Data da Portaria</Label>
            <Input
              className="mt-1 h-9"
              type="date"
              value={form.data_documento}
              onChange={(e) => setForm({ ...form, data_documento: e.target.value })}
              disabled={!podeEditar}
            />
          </div>
        )}

        {tipo.exige_link && (
          <div className={tipo.exige_numero || tipo.exige_numero_sei || tipo.exige_data ? "" : "md:col-span-2"}>
            <Label className="text-xs">
              {tipo.codigo === TIPO_PORTARIA_MUNICIPAL_PVH ? "Link oficial" : "Link SEI"}
            </Label>
            <Input
              className="mt-1 h-9"
              value={form.link_documento}
              onChange={(e) => setForm({ ...form, link_documento: e.target.value })}
              placeholder="https://…"
              disabled={!podeEditar}
            />
          </div>
        )}

        {mostrarNormativa && (
          <>
            <div>
              <Label className="text-xs">Base normativa associada</Label>
              <Select
                value={form.normativa_referenciada_id || "none"}
                onValueChange={(value) => {
                  const normativa_referenciada_id = value === "none" ? "" : value;
                  setForm({
                    ...form,
                    normativa_referenciada_id,
                  });
                  void salvar({ normativa_referenciada_id });
                }}
                disabled={!podeEditar}
              >
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informada</SelectItem>
                  {normativas.map((normativa) => (
                    <SelectItem key={normativa.id} value={normativa.id}>
                      {normativa.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="xl:col-span-2">
              <Label className="text-xs">Referência escrita no documento</Label>
              <Input
                className="mt-1 h-9"
                value={form.referencia_normativa_texto}
                onChange={(e) =>
                  setForm({ ...form, referencia_normativa_texto: e.target.value })
                }
                placeholder="Ex.: Deliberação 416/CIB/2026, de 17/06/2026"
                disabled={!podeEditar}
              />
            </div>
          </>
        )}
      </div>

      {alertasNormativos.length > 0 && (
        <div className="mt-3 space-y-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
          {alertasNormativos.map((alerta) => (
            <div key={alerta} className="flex items-start gap-2 text-xs text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{alerta}</span>
            </div>
          ))}
          <p className="pl-5 text-[10px] text-muted-foreground">
            O sistema sinaliza a inconsistência, mas não reescreve o conteúdo histórico.
          </p>
        </div>
      )}

      {tipo.exige_assinatura && (
        <div className="mt-3">
          {documentoIdRef.current ? (
            <AssinaturasDocumentoPvh
              documentoId={documentoIdRef.current}
              assinaturas={assinaturasDocumento}
              podeEditar={podeEditar}
              onChange={onChange}
            />
          ) : (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Informe Nº SEI ou link do documento para habilitar o registro das assinaturas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
