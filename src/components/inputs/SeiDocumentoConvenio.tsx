import { Input } from "@/components/ui/input";
import { SeiLink } from "@/components/inputs/SeiLink";

/**
 * Convênios: número SEI e link SEI identificam o MESMO documento.
 * O número é digitado pelo fiscal: id_documento na URL não é número SEI.
 * Campo opcional para manter processos históricos acessíveis sem migração retroativa.
 */
export function SeiDocumentoConvenio({
  numero,
  link,
  onNumeroChange,
  onLinkChange,
  editable = true,
}: {
  numero: string;
  link: string;
  onNumeroChange?: (numero: string) => void;
  onLinkChange?: (link: string) => void;
  editable?: boolean;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(145px,0.38fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Número SEI
          <Input
            className="mt-1"
            aria-label="Número SEI do documento"
            placeholder="Ex.: 31567825"
            autoComplete="off"
            value={numero ?? ""}
            disabled={!editable}
            onChange={(event) => onNumeroChange?.(event.target.value)}
          />
        </label>
      </div>
      <div className="min-w-0 space-y-1">
        <span className="block text-[11px] font-medium text-muted-foreground">Link SEI</span>
        <SeiLink value={link ?? ""} editable={editable} onChange={onLinkChange} manterInput />
      </div>
    </div>
  );
}
