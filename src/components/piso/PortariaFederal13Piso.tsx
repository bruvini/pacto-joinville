import { FileUp, RefreshCw } from "lucide-react";
import { useState } from "react";
import { CampoBlur } from "@/components/piso/campos";
import { ArquivosEvidencia } from "@/components/piso/ArquivosEvidencia";
import { Button } from "@/components/ui/button";

type Props = {
  competencia: any;
  arquivos: any[];
  canEdit: boolean;
  busy: boolean;
  onUploadPortaria: (file: File) => void;
  onReprocessPortaria: (arquivo?: any) => void;
  onSave: (campo: string, valor: any) => Promise<boolean>;
  onChange: () => void;
};

/**
 * Concentra a Portaria federal na primeira etapa VISÍVEL da 13ª.
 * A memória por CNES virá do cálculo interno validado, não de importação extra.
 */
export function PortariaFederal13Piso({
  competencia: c, arquivos, canEdit, busy,
  onUploadPortaria, onReprocessPortaria, onSave, onChange,
}: Props) {
  const temPortaria = arquivos.some((a) => a.categoria === "portaria_gm");
  const [pdfSelecionadoId, setPdfSelecionadoId] = useState("");
  return (
    <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div>
        <h3 className="font-semibold">Portaria federal específica da 13ª parcela</h3>
        <p className="text-xs text-muted-foreground">
          Não é necessário enviar Planilhas de Carga às instituições nem ao InvestSUS
          nesta competência. Registre o ato da 13ª e os valores oficiais antes
          de elaborar a Portaria Municipal.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {canEdit && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary">
            <FileUp className="h-4 w-4" /> Importar Portaria GM/MS (PDF)
            <input hidden type="file" accept=".pdf" disabled={busy} onChange={e => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) onUploadPortaria(file);
            }}/>
          </label>
        )}
        {canEdit && temPortaria && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="piso13-pdf" className="text-xs font-medium">PDF para reprocessar</label>
            <select id="piso13-pdf" className="h-9 max-w-[360px] rounded-md border bg-background px-2 text-xs"
              value={pdfSelecionadoId} disabled={busy}
              onChange={e => setPdfSelecionadoId(e.target.value)}>
              <option value="">Selecione um arquivo anexado</option>
              {arquivos.filter(a => a.categoria === "portaria_gm").map(a =>
                <option key={a.id} value={a.id}>{a.nome_original} ({Math.round((a.tamanho ?? 0) / 1024)} KB)</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={busy || !pdfSelecionadoId}
              onClick={() => {
                const arquivo = arquivos.find(a => a.id === pdfSelecionadoId && a.categoria === "portaria_gm");
                if (arquivo) onReprocessPortaria(arquivo);
              }}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reprocessar PDF selecionado
            </Button>
          </div>
        )}
      </div>
      <ArquivosEvidencia arquivos={arquivos} competenciaId={c.id}
        categoria="portaria_gm" canEdit={false} onChange={onChange}
        canRetry={() => canEdit && !busy} onRetry={async (arquivo) => { await onReprocessPortaria(arquivo); }}/>
      <div className="grid gap-2 sm:grid-cols-3">
        <CampoBlur label="Portaria GM/MS" value={c.portaria_gm_numero}
          disabled={!canEdit} onSave={v => onSave("portaria_gm_numero", v)}/>
        <CampoBlur label="Data de publicação" type="date"
          value={c.portaria_gm_data_publicacao} disabled={!canEdit}
          onSave={v => onSave("portaria_gm_data_publicacao", v)}/>
        <CampoBlur label="Valor homologado" type="moeda"
          value={c.valor_homologado} disabled={!canEdit}
          onSave={v => onSave("valor_homologado", v)}/>
      </div>
      <CampoBlur label="Link da Portaria no Diário Oficial da União"
        value={c.portaria_gm_url_dou} disabled={!canEdit}
        onSave={v => onSave("portaria_gm_url_dou", v)}/>

    </section>
  );
}
