import { CheckCircle2, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AssinaturasDocumentoPvh } from "@/components/pvh/AssinaturasDocumentoPvh";
import { TextoBaseSeiPvh } from "@/components/pvh/TextoBaseSeiPvh";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeiLink } from "@/components/inputs/SeiLink";
import { supabase } from "@/integrations/supabase/client";
import {
  assinaturasDocumentoCompletasPvh,
  documentoEtapa2CompletoPvh,
  SLOTS_MEMORANDO_PVH,
  TIPO_MEMORANDO_PVH,
} from "@/lib/pvh/etapa2";
import { gerarMemorandoPortariaPvh } from "@/lib/pvh/portariaMunicipal";
import { linkValido } from "@/lib/sei";

type Destinatario = { unidade: string; nome: string; cargo: string };

type FormMemorando = {
  numero_sei: string;
  link_documento: string;
  data_documento: string;
  destinatarios: Destinatario[];
  memorando_pgm_numero: string;
  memorando_pgm_unidade: string;
  memorando_sap_numero: string;
  memorando_sap_unidade: string;
  processo_referencia: string;
  encaminhado_ses_uap: boolean;
  encaminhado_ses_uap_apa: boolean;
  encaminhado_ses_uap_em?: string | null;
  encaminhado_ses_uap_apa_em?: string | null;
};

const DESTINATARIOS_PADRAO: Destinatario[] = [
  { unidade: "SES.UAP", nome: "Ana Paula Baraúna", cargo: "Gerente" },
  { unidade: "SES.UAP.APA", nome: "Renata Mira", cargo: "Coordenadora" },
];

export function MemorandoPortariaMunicipalPvh({
  competenciaId,
  competencia,
  documento,
  minuta,
  assinaturas,
  pool,
  podeEditar,
  onChange,
}: {
  competenciaId: string;
  competencia: any;
  documento?: any;
  minuta?: any;
  assinaturas: any[];
  pool: any[];
  podeEditar: boolean;
  onChange: () => void;
}) {
  const documentoIdRef = useRef<string | null>(documento?.id ?? null);

  const defaults = useMemo<FormMemorando>(() => {
    const dados = (documento?.dados ?? {}) as Record<string, any>;
    return {
      numero_sei: documento?.numero_sei ?? "",
      link_documento: documento?.link_documento ?? "",
      data_documento: documento?.data_documento ?? "",
      destinatarios:
        Array.isArray(dados.destinatarios) && dados.destinatarios.length
          ? dados.destinatarios
          : DESTINATARIOS_PADRAO,
      memorando_pgm_numero: dados.memorando_pgm_numero ?? "0020700582/2024",
      memorando_pgm_unidade: dados.memorando_pgm_unidade ?? "PGM.UAD",
      memorando_sap_numero: dados.memorando_sap_numero ?? "0020731294/2024",
      memorando_sap_unidade: dados.memorando_sap_unidade ?? "SAP.CVN",
      processo_referencia: dados.processo_referencia ?? "23.0.271636-6",
      encaminhado_ses_uap: dados.encaminhado_ses_uap === true,
      encaminhado_ses_uap_apa: dados.encaminhado_ses_uap_apa === true,
      encaminhado_ses_uap_em: dados.encaminhado_ses_uap_em ?? null,
      encaminhado_ses_uap_apa_em: dados.encaminhado_ses_uap_apa_em ?? null,
    };
  }, [documento?.id, documento?.updated_at, competenciaId]);

  const [form, setForm] = useState<FormMemorando>(defaults);
  useEffect(() => {
    documentoIdRef.current = documento?.id ?? documentoIdRef.current;
    setForm(defaults);
  }, [defaults]);

  const norma = Array.isArray(competencia.pvh_normativas)
    ? competencia.pvh_normativas[0]
    : competencia.pvh_normativas;
  const dadosMinuta = (minuta?.dados ?? {}) as Record<string, any>;

  const gerado = gerarMemorandoPortariaPvh({
    competencia: competencia.competencia,
    dataDocumento: form.data_documento,
    numeroMemorandoSei: form.numero_sei,
    numeroMinutaSei: minuta?.numero_sei,
    unidadeResponsavel: dadosMinuta.unidade_responsavel ?? "SES.UCP.ACP",
    normativaNumero: norma?.numero ?? norma?.titulo,
    normativaData: norma?.data_ato,
    portariaEstadualNumero: competencia.portaria_estadual_numero,
    portariaEstadualData: competencia.portaria_estadual_data,
    portariaGeralNumero: dadosMinuta.portaria_geral_numero,
    portariaGeralSei: dadosMinuta.portaria_geral_sei,
    memorandoPgmNumero: form.memorando_pgm_numero,
    memorandoPgmUnidade: form.memorando_pgm_unidade,
    memorandoSapNumero: form.memorando_sap_numero,
    memorandoSapUnidade: form.memorando_sap_unidade,
    processoReferencia: form.processo_referencia,
    destinatarios: form.destinatarios,
  });

  const docVirtual = documentoIdRef.current
    ? {
        ...(documento ?? {}),
        id: documentoIdRef.current,
        tipo_codigo: TIPO_MEMORANDO_PVH,
        numero_sei: form.numero_sei,
        link_documento: form.link_documento,
        data_documento: form.data_documento,
        dados: {
          destinatarios: form.destinatarios,
          memorando_pgm_numero: form.memorando_pgm_numero,
          memorando_pgm_unidade: form.memorando_pgm_unidade,
          memorando_sap_numero: form.memorando_sap_numero,
          memorando_sap_unidade: form.memorando_sap_unidade,
          processo_referencia: form.processo_referencia,
          encaminhado_ses_uap: form.encaminhado_ses_uap,
          encaminhado_ses_uap_apa: form.encaminhado_ses_uap_apa,
        },
      }
    : undefined;

  const completo = documentoEtapa2CompletoPvh(docVirtual, assinaturas);
  const assinaturasOk = documentoIdRef.current
    ? assinaturasDocumentoCompletasPvh(
        documentoIdRef.current,
        assinaturas,
        SLOTS_MEMORANDO_PVH,
      )
    : false;
  const destinatariosOk =
    form.destinatarios.length >= 2 &&
    form.destinatarios.every(
      (item) => item.unidade.trim() && item.nome.trim() && item.cargo.trim(),
    );
  const dadosBasicosOk = Boolean(
    form.numero_sei.trim() &&
      form.data_documento &&
      linkValido(form.link_documento) &&
      destinatariosOk &&
      form.memorando_pgm_numero.trim() &&
      form.memorando_sap_numero.trim() &&
      form.processo_referencia.trim() &&
      minuta?.numero_sei &&
      dadosMinuta.portaria_geral_numero &&
      dadosMinuta.portaria_geral_sei &&
      assinaturasOk,
  );

  const salvar = async (override: Partial<FormMemorando> = {}) => {
    if (!podeEditar) return;
    const dadosForm = { ...form, ...override };

    if (dadosForm.link_documento && !linkValido(dadosForm.link_documento)) {
      toast.error("Link SEI inválido.");
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", auth.user?.id ?? "")
      .maybeSingle();

    const patch = {
      numero_sei: dadosForm.numero_sei.trim() || null,
      link_documento: dadosForm.link_documento.trim() || null,
      data_documento: dadosForm.data_documento || null,
      normativa_referenciada_id: competencia.normativa_id ?? null,
      referencia_normativa_texto: null,
      dados: {
        destinatarios: dadosForm.destinatarios,
        memorando_pgm_numero: dadosForm.memorando_pgm_numero.trim(),
        memorando_pgm_unidade: dadosForm.memorando_pgm_unidade.trim(),
        memorando_sap_numero: dadosForm.memorando_sap_numero.trim(),
        memorando_sap_unidade: dadosForm.memorando_sap_unidade.trim(),
        processo_referencia: dadosForm.processo_referencia.trim(),
        encaminhado_ses_uap: dadosForm.encaminhado_ses_uap,
        encaminhado_ses_uap_apa: dadosForm.encaminhado_ses_uap_apa,
        encaminhado_ses_uap_em: dadosForm.encaminhado_ses_uap_em ?? null,
        encaminhado_ses_uap_apa_em: dadosForm.encaminhado_ses_uap_apa_em ?? null,
      },
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
          tipo_codigo: TIPO_MEMORANDO_PVH,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      documentoIdRef.current = criado.id;
    }

    await supabase
      .from("pvh_competencias")
      .update({
        memorando_municipal_numero: dadosForm.numero_sei.trim() || null,
        memorando_municipal_link: dadosForm.link_documento.trim() || null,
      } as any)
      .eq("id", competenciaId);

    onChange();
  };

  const salvarDestinatario = (
    index: number,
    campo: keyof Destinatario,
    valor: string,
  ) => {
    const destinatarios = form.destinatarios.map((item, i) =>
      i === index ? { ...item, [campo]: valor } : item,
    );
    setForm({ ...form, destinatarios });
  };

  const confirmarEncaminhamento = (
    campo: "encaminhado_ses_uap" | "encaminhado_ses_uap_apa",
    checked: boolean,
  ) => {
    const campoData =
      campo === "encaminhado_ses_uap"
        ? "encaminhado_ses_uap_em"
        : "encaminhado_ses_uap_apa_em";
    const patch = {
      [campo]: checked,
      [campoData]: checked ? new Date().toISOString() : null,
    } as Partial<FormMemorando>;
    setForm((atual) => ({ ...atual, ...patch }));
    void salvar(patch);
  };

  return (
    <section className={`space-y-4 rounded-xl border p-4 ${completo ? "border-success/40" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Documento 2</p>
          <h3 className="text-lg font-semibold">Memorando de encaminhamento</h3>
          <p className="text-sm text-muted-foreground">
            O texto herda automaticamente a Minuta, a deliberação e as Portarias da competência;
            aqui ficam apenas os dados próprios do encaminhamento.
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

      <div className="grid gap-2 md:grid-cols-[180px_minmax(300px,1fr)_180px]">
        <div>
          <Label className="text-xs">Nº SEI do Memorando</Label>
          <Input
            className="mt-1 h-9"
            value={form.numero_sei}
            onChange={(e) => setForm({ ...form, numero_sei: e.target.value })}
            onBlur={() => void salvar()}
            disabled={!podeEditar}
            placeholder="Ex.: 30999337"
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
        <div>
          <Label className="text-xs">Data do Memorando</Label>
          <Input
            className="mt-1 h-9"
            type="date"
            value={form.data_documento}
            onChange={(e) => setForm({ ...form, data_documento: e.target.value })}
            onBlur={() => void salvar()}
            disabled={!podeEditar}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/10 p-3">
        <div className="mb-2">
          <div className="text-sm font-semibold">Destinatários</div>
          <p className="text-[11px] text-muted-foreground">
            As unidades padrão são SES.UAP e SES.UAP.APA; nomes e cargos podem ser atualizados sem alterar o modelo do documento.
          </p>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {form.destinatarios.map((destinatario, index) => (
            <div key={index} className="grid gap-2 rounded-lg border bg-background p-2.5 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Unidade SEI</Label>
                <Input
                  className="mt-1 h-8 text-xs"
                  value={destinatario.unidade}
                  onChange={(e) => salvarDestinatario(index, "unidade", e.target.value)}
                  onBlur={() => void salvar()}
                  disabled={!podeEditar}
                />
              </div>
              <div>
                <Label className="text-xs">Nome</Label>
                <Input
                  className="mt-1 h-8 text-xs"
                  value={destinatario.nome}
                  onChange={(e) => salvarDestinatario(index, "nome", e.target.value)}
                  onBlur={() => void salvar()}
                  disabled={!podeEditar}
                />
              </div>
              <div>
                <Label className="text-xs">Cargo</Label>
                <Input
                  className="mt-1 h-8 text-xs"
                  value={destinatario.cargo}
                  onChange={(e) => salvarDestinatario(index, "cargo", e.target.value)}
                  onBlur={() => void salvar()}
                  disabled={!podeEditar}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-muted/10 p-3">
        <div className="mb-2">
          <div className="text-sm font-semibold">Referências institucionais do Memorando</div>
          <p className="text-[11px] text-muted-foreground">
            Minuta SEI, Portaria SES mensal, deliberação e Portaria geral do PVH são herdadas automaticamente.
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <div>
            <Label className="text-xs">Memorando PGM</Label>
            <Input
              className="mt-1 h-9"
              value={form.memorando_pgm_numero}
              onChange={(e) => setForm({ ...form, memorando_pgm_numero: e.target.value })}
              onBlur={() => void salvar()}
              disabled={!podeEditar}
            />
          </div>
          <div>
            <Label className="text-xs">Memorando SAP</Label>
            <Input
              className="mt-1 h-9"
              value={form.memorando_sap_numero}
              onChange={(e) => setForm({ ...form, memorando_sap_numero: e.target.value })}
              onBlur={() => void salvar()}
              disabled={!podeEditar}
            />
          </div>
          <div>
            <Label className="text-xs">Processo SEI de referência</Label>
            <Input
              className="mt-1 h-9"
              value={form.processo_referencia}
              onChange={(e) => setForm({ ...form, processo_referencia: e.target.value })}
              onBlur={() => void salvar()}
              disabled={!podeEditar}
            />
          </div>
        </div>
      </div>

      <TextoBaseSeiPvh titulo="texto do Memorando" documento={gerado} />

      {documentoIdRef.current ? (
        <AssinaturasDocumentoPvh
          documentoId={documentoIdRef.current}
          assinaturas={assinaturas}
          slots={SLOTS_MEMORANDO_PVH}
          pool={pool}
          podeEditar={podeEditar}
          onChange={onChange}
        />
      ) : (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Salve os dados do Memorando para habilitar as assinaturas.
        </p>
      )}

      <div className="rounded-lg border p-3">
        <div className="mb-2 flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">Confirmação de encaminhamento</div>
            <p className="text-[11px] text-muted-foreground">
              Libera após o Memorando e suas assinaturas estarem completos.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.encaminhado_ses_uap}
              disabled={!podeEditar || !dadosBasicosOk}
              onCheckedChange={(checked) =>
                confirmarEncaminhamento("encaminhado_ses_uap", checked === true)
              }
            />
            Encaminhado para SES.UAP
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.encaminhado_ses_uap_apa}
              disabled={!podeEditar || !dadosBasicosOk}
              onCheckedChange={(checked) =>
                confirmarEncaminhamento("encaminhado_ses_uap_apa", checked === true)
              }
            />
            Encaminhado para SES.UAP.APA
          </label>
        </div>
      </div>
    </section>
  );
}
