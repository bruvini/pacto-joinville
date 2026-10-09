import { FileUp, RefreshCw } from "lucide-react";
import { CampoBlur } from "@/components/piso/campos";
import { ArquivosEvidencia } from "@/components/piso/ArquivosEvidencia";
import { Button } from "@/components/ui/button";

type Props = {
  competencia: any;
  arquivos: any[];
  canEdit: boolean;
  busy: boolean;
  onUploadPortaria: (file: File) => void;
  onReprocessPortaria: () => void;
  onUploadMemoria: (file: File) => void;
  onSave: (campo: string, valor: any) => Promise<boolean>;
  onChange: () => void;
};

/**
 * Concentra a Portaria federal na primeira etapa VISÍVEL da 13ª.
 * A distribuição oficial por CNES não é uma Planilha de Carga mensal.
 */
export function PortariaFederal13Piso({
  competencia: c, arquivos, canEdit, busy,
  onUploadPortaria, onReprocessPortaria, onUploadMemoria, onSave, onChange,
}: Props) {
  const temPortaria = arquivos.some((a) => a.categoria === "portaria_gm");
  const temMemoria = arquivos.some((a) => a.categoria === "afc13_cnes");
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
          <Button size="sm" variant="outline" disabled={busy}
            onClick={onReprocessPortaria}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reprocessar PDF
          </Button>
        )}
      </div>
      <ArquivosEvidencia arquivos={arquivos} competenciaId={c.id}
        categoria="portaria_gm" canEdit={false} onChange={onChange}/>
      <div className="grid gap-2 sm:grid-cols-3">
        <CampoBlur label="Portaria GM/MS" value={c.portaria_gm_numero}
          disabled onSave={() => {}}/>
        <CampoBlur label="Data de publicação" type="date"
          value={c.portaria_gm_data_publicacao} disabled onSave={() => {}}/>
        <CampoBlur label="Valor homologado" type="moeda"
          value={c.valor_homologado} disabled onSave={() => {}}/>
      </div>
      <CampoBlur label="Link da Portaria no Diário Oficial da União"
        value={c.portaria_gm_url_dou} disabled={!canEdit}
        onSave={v => onSave("portaria_gm_url_dou", v)}/>

      <div className="space-y-2 rounded-md border bg-background p-3">
        <h4 className="text-sm font-semibold">Distribuição oficial por CNES para o Anexo Municipal</h4>
        <p className="text-xs text-muted-foreground">
          Caso o FNS disponibilize a relação detalhada dos valores da 13ª,
          anexe o extrato conferido com a fonte oficial, em colunas CNES e
          VALOR AFC 13ª. Esta evidência é distinta das cargas mensais e não
          pode ser substituída pela simulação histórica. Preserve a fonte original.
        </p>
        {canEdit && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary">
            <FileUp className="h-4 w-4" /> {temMemoria ? "Atualizar" : "Anexar"} distribuição oficial por CNES
            <input hidden type="file" accept=".xlsx,.csv" disabled={busy}
              onChange={e => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) onUploadMemoria(file);
              }} />
          </label>
        )}
        <ArquivosEvidencia arquivos={arquivos} competenciaId={c.id}
          categoria="afc13_cnes" canEdit={false} onChange={onChange}/>
        {!temMemoria && (
          <p className="text-xs text-amber-800">
            A distribuição por CNES ainda não está documentada. A publicação
            do Anexo Municipal ficará pendente, sem valores presumidos.
          </p>
        )}
      </div>
    </section>
  );
}
