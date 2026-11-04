import { CampoBlur } from "@/components/piso/campos";
import { ArquivosEvidencia } from "@/components/piso/ArquivosEvidencia";
import { ImportarArquivoPiso } from "@/components/piso/ImportarArquivoPiso";

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
      {canEdit && (
        <ImportarArquivoPiso
          tipo="pdf"
          accept=".pdf"
          busy={busy}
          label="Importar Portaria em PDF"
          onSelect={onUploadPortaria}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Use Reprocessar ao lado de cada PDF anexado para escolher o documento exato.
      </p>
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
