import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AssinaturasDocumentoPvh } from "@/components/pvh/AssinaturasDocumentoPvh";
import { TextoBaseSeiPvh } from "@/components/pvh/TextoBaseSeiPvh";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeiLink } from "@/components/inputs/SeiLink";
import { supabase } from "@/integrations/supabase/client";
import {
  documentoEtapa2CompletoPvh,
  SLOTS_MINUTA_PVH,
  TIPO_MINUTA_PVH,
} from "@/lib/pvh/etapa2";
import { gerarMinutaPortariaPvh } from "@/lib/pvh/portariaMunicipal";
import { linkValido } from "@/lib/sei";

type FormMinuta = {
  numero_sei: string;
  link_documento: string;
  data_documento: string;
  autoridade_nome: string;
  autoridade_cargo: string;
  portaria_geral_numero: string;
  portaria_geral_sei: string;
  cnes_por_prestador: Record<string, string>;
};

export function MinutaPortariaMunicipalPvh({
  competenciaId,
  competencia,
  participantes,
  documento,
  assinaturas,
  pool,
  cnes,
  podeEditar,
  onChange,
}: {
  competenciaId: string;
  competencia: any;
  participantes: any[];
  documento?: any;
  assinaturas: any[];
  pool: any[];
  cnes: any[];
  podeEditar: boolean;
  onChange: () => void;
}) {
  const documentoIdRef = useRef<string | null>(documento?.id ?? null);
  const ano = String(competencia.competencia ?? "").split("/")[1] ?? "";
  const secretariaPool = pool.find((pessoa) =>
    ["Secretária de Saúde", "Secretária da Saúde"].includes(pessoa.cargo),
  );

  const defaults = useMemo<FormMinuta>(() => {
    const dados = (documento?.dados ?? {}) as Record<string, any>;
    const cnesSalvos = (dados.cnes_por_prestador ?? {}) as Record<string, string>;
    const cnesSnapshot: Record<string, string> = {};

    participantes.forEach((participante) => {
      const opcoes = cnes.filter((item) => item.prestador_id === participante.prestador_id)
        .sort((a, b) => String(a.cnes).localeCompare(String(b.cnes)));
      cnesSnapshot[participante.prestador_id] =
        cnesSalvos[participante.prestador_id] ?? opcoes[0]?.cnes ?? "";
    });

    return {
      numero_sei: documento?.numero_sei ?? "",
      link_documento: documento?.link_documento ?? "",
      data_documento: documento?.data_documento ?? "",
      autoridade_nome:
        dados.autoridade_nome ?? secretariaPool?.nome_servidor ?? "",
      autoridade_cargo: dados.autoridade_cargo ?? "Secretária da Saúde",
      portaria_geral_numero:
        dados.portaria_geral_numero ?? (ano === "2026" ? "195/2026/SES" : ""),
      portaria_geral_sei:
        dados.portaria_geral_sei ?? (ano === "2026" ? "30392890" : ""),
      cnes_por_prestador: cnesSnapshot,
    };
  }, [
    documento?.id,
    documento?.updated_at,
    competenciaId,
    participantes,
    cnes,
    secretariaPool?.id,
  ]);

  const [form, setForm] = useState<FormMinuta>(defaults);
  useEffect(() => {
    documentoIdRef.current = documento?.id ?? documentoIdRef.current;
    setForm(defaults);
  }, [defaults]);

  const norma = Array.isArray(competencia.pvh_normativas)
    ? competencia.pvh_normativas[0]
    : competencia.pvh_normativas;

  const linhas = participantes.map((participante) => {
    const prestador = Array.isArray(participante.prestadores)
      ? participante.prestadores[0]
      : participante.prestadores;
    return {
      cnes: form.cnes_por_prestador[participante.prestador_id] ?? "",
      nome: prestador?.nome_instituicao ?? "Instituição",
      valor: Number(participante.valor_estadual ?? 0),
    };
  });

  const gerado = gerarMinutaPortariaPvh({
    competencia: competencia.competencia,
    numeroMinutaSei: form.numero_sei,
    dataDocumento: form.data_documento,
    unidadeResponsavel: "SES.UCP.ACP",
    autoridadeNome: form.autoridade_nome,
    autoridadeCargo: form.autoridade_cargo,
    normativaNumero: norma?.numero ?? norma?.titulo,
    normativaData: norma?.data_ato,
    portariaEstadualNumero: competencia.portaria_estadual_numero,
    portariaEstadualData: competencia.portaria_estadual_data,
    portariaGeralNumero: form.portaria_geral_numero,
    portariaGeralSei: form.portaria_geral_sei,
    linhas,
  });

  const completo = documentoEtapa2CompletoPvh(
    documentoIdRef.current
      ? {
          ...(documento ?? {}),
          id: documentoIdRef.current,
          tipo_codigo: TIPO_MINUTA_PVH,
          numero_sei: form.numero_sei,
          link_documento: form.link_documento,
          data_documento: form.data_documento,
          dados: {
            autoridade_nome: form.autoridade_nome,
            autoridade_cargo: form.autoridade_cargo,
            portaria_geral_numero: form.portaria_geral_numero,
            portaria_geral_sei: form.portaria_geral_sei,
            unidade_responsavel: "SES.UCP.ACP",
            cnes_por_prestador: form.cnes_por_prestador,
          },
        }
      : undefined,
    assinaturas,
  );

  const salvar = async (override: Partial<FormMinuta> = {}) => {
    if (!podeEditar) return;
    const dadosForm = { ...form, ...override };

    if (dadosForm.link_documento && !linkValido(dadosForm.link_documento)) {
      toast.error("Link SEI inválido.");
      return;
    }

    const temConteudo = Boolean(
      dadosForm.numero_sei.trim() ||
        dadosForm.link_documento.trim() ||
        dadosForm.data_documento ||
        dadosForm.autoridade_nome.trim() ||
        dadosForm.portaria_geral_numero.trim(),
    );
    if (!temConteudo && !documentoIdRef.current) return;

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
        autoridade_nome: dadosForm.autoridade_nome.trim(),
        autoridade_cargo: dadosForm.autoridade_cargo.trim(),
        portaria_geral_numero: dadosForm.portaria_geral_numero.trim(),
        portaria_geral_sei: dadosForm.portaria_geral_sei.trim(),
        unidade_responsavel: "SES.UCP.ACP",
        cnes_por_prestador: dadosForm.cnes_por_prestador,
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
          tipo_codigo: TIPO_MINUTA_PVH,
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
        minuta_municipal_numero: dadosForm.numero_sei.trim() || null,
        minuta_municipal_link: dadosForm.link_documento.trim() || null,
      } as any)
      .eq("id", competenciaId);

    onChange();
  };

  const salvarCampo = <K extends keyof FormMinuta>(campo: K, valor: FormMinuta[K]) => {
    const next = { ...form, [campo]: valor };
    setForm(next);
    void salvar({ [campo]: valor } as Partial<FormMinuta>);
  };

  return (
    <section className={`space-y-4 rounded-xl border p-4 ${completo ? "border-success/40" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Documento 1</p>
          <h3 className="text-lg font-semibold">Minuta da Portaria Municipal</h3>
          <p className="text-sm text-muted-foreground">
            O texto usa automaticamente a competência, a Portaria SES, a deliberação vigente e os
            valores oficiais registrados na Etapa 1.
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
          <Label className="text-xs">Nº SEI da Minuta</Label>
          <Input
            className="mt-1 h-9"
            value={form.numero_sei}
            onChange={(e) => setForm({ ...form, numero_sei: e.target.value })}
            onBlur={() => void salvar()}
            disabled={!podeEditar}
            placeholder="Ex.: 30999330"
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
          <Label className="text-xs">Data da Minuta</Label>
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
          <div className="text-sm font-semibold">Dados usados para montar a Minuta</div>
          <p className="text-[11px] text-muted-foreground">
            A base normativa é a própria deliberação escolhida na competência ({norma?.titulo ?? "não informada"}).
          </p>
        </div>
        <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label className="text-xs">Portaria geral do PVH</Label>
            <Input
              className="mt-1 h-9"
              value={form.portaria_geral_numero}
              onChange={(e) => setForm({ ...form, portaria_geral_numero: e.target.value })}
              onBlur={() => void salvar()}
              disabled={!podeEditar}
              placeholder="195/2026/SES"
            />
          </div>
          <div>
            <Label className="text-xs">SEI da Portaria geral</Label>
            <Input
              className="mt-1 h-9"
              value={form.portaria_geral_sei}
              onChange={(e) => setForm({ ...form, portaria_geral_sei: e.target.value })}
              onBlur={() => void salvar()}
              disabled={!podeEditar}
              placeholder="30392890"
            />
          </div>
          <div>
            <Label className="text-xs">Nome da autoridade</Label>
            <Input
              className="mt-1 h-9"
              value={form.autoridade_nome}
              onChange={(e) => setForm({ ...form, autoridade_nome: e.target.value })}
              onBlur={() => void salvar()}
              disabled={!podeEditar}
              placeholder="Nome da Secretária da Saúde"
            />
          </div>
          <div>
            <Label className="text-xs">Cargo da autoridade</Label>
            <Input
              className="mt-1 h-9"
              value={form.autoridade_cargo}
              onChange={(e) => setForm({ ...form, autoridade_cargo: e.target.value })}
              onBlur={() => void salvar()}
              disabled={!podeEditar}
            />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        O Anexo I é gerado no texto da Portaria com os CNES cadastrados e os valores oficiais da Etapa 1.
      </p>

      <TextoBaseSeiPvh titulo="texto da Minuta" documento={gerado} />

      {documentoIdRef.current ? (
        <AssinaturasDocumentoPvh
          documentoId={documentoIdRef.current}
          assinaturas={assinaturas}
          slots={SLOTS_MINUTA_PVH}
          pool={pool}
          podeEditar={podeEditar}
          onChange={onChange}
        />
      ) : (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Salve os dados da Minuta para habilitar as assinaturas.
        </p>
      )}
    </section>
  );
}
