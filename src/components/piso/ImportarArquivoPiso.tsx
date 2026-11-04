import { useRef } from "react";
import { FileSpreadsheet, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  tipo: "planilha" | "pdf";
  accept: string;
  busy: boolean;
  label: string;
  onSelect: (arquivo: File) => void;
};

/** A ação de importar é um botão real; o arquivo original continua sendo preservado. */
export function ImportarArquivoPiso({ tipo, accept, busy, label, onSelect }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const Icone = tipo === "pdf" ? FileUp : FileSpreadsheet;
  return (
    <>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept={accept}
        disabled={busy}
        tabIndex={-1}
        onChange={(e) => {
          const arquivo = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (arquivo) onSelect(arquivo);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="h-9 gap-2 border-primary/30 bg-primary/5 px-4 font-medium text-primary shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
      >
        <Icone className="h-4 w-4" />
        {busy ? "Processando…" : label}
      </Button>
    </>
  );
}
