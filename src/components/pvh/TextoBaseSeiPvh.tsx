import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  copiarDocumentoFormatadoPvh,
  type DocumentoGeradoPvh,
} from "@/lib/pvh/portariaMunicipal";

export function TextoBaseSeiPvh({
  titulo,
  documento,
}: {
  titulo: string;
  documento: DocumentoGeradoPvh;
}) {
  const copiar = async () => {
    try {
      const modo = await copiarDocumentoFormatadoPvh(documento);
      toast.success(
        modo === "formatado"
          ? "Texto copiado com formatação para colar no SEI."
          : "Texto copiado. Seu navegador usou o modo de texto simples.",
      );
    } catch (error: any) {
      toast.error("Não foi possível copiar o texto: " + (error?.message ?? String(error)));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Texto-base para o SEI
          </div>
          <p className="text-[11px] text-muted-foreground">
            Pré-visualização gerada com os dados desta competência.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void copiar()}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copiar {titulo}
        </Button>
      </div>
      <div
        className="max-h-[620px] overflow-auto rounded-lg border bg-white p-5 font-serif text-[13px] leading-6 text-slate-900 shadow-inner"
        dangerouslySetInnerHTML={{ __html: documento.html }}
      />
    </div>
  );
}
