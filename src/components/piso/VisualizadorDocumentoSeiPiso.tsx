import { ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { gerarHtmlDocumentoSeiPiso, type TipoDocumentoSeiPiso } from "@/lib/piso/documentos-sei";

type Props = {
  tipo: TipoDocumentoSeiPiso;
  texto: string;
  disabled?: boolean;
};

export function VisualizadorDocumentoSeiPiso({ tipo, texto, disabled }: Props) {
  const html = gerarHtmlDocumentoSeiPiso(texto, tipo);
  const copiar = async () => {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error("Clipboard HTML indisponível");
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([texto], { type: "text/plain" }),
      })]);
      toast.success("Documento copiado com formatação. Cole no editor do SEI.");
    } catch {
      try {
        await navigator.clipboard.writeText(texto);
        toast.warning("O navegador não autorizou copiar HTML. Foi copiado apenas o texto, sem os recuos e a formatação.");
      } catch {
        toast.error("Não foi possível copiar o documento. Verifique as permissões de área de transferência do navegador.");
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => void copiar()}>
          <ClipboardCopy className="mr-2 h-4 w-4" />
          Copiar {tipo === "minuta" ? "Minuta" : "Memorando"} com formatação
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Prévia em formato de documento, com recuos, alinhamentos, espaçamento e tabela.
        A cópia usa HTML e texto; o editor do SEI pode ajustar alguns estilos ao colar.
      </p>
      <div className="max-h-[720px] overflow-auto rounded-lg border bg-slate-100 p-3 shadow-inner sm:p-6">
        <div
          className="mx-auto min-h-[430px] w-full max-w-[794px] bg-white px-6 py-10 shadow-sm sm:px-12 sm:py-14"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
