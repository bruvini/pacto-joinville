import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Botão padrão "Limpar Filtros" para os blocos de filtro do sistema.
 * Fica desabilitado quando nenhum filtro está aplicado; ao limpar, exibe toast.
 */
export function LimparFiltrosButton({
  ativo,
  onClear,
  className = "",
}: {
  ativo: boolean;
  onClear: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={`h-9 gap-1.5 ${className}`}
      disabled={!ativo}
      title={ativo ? "Limpar todos os filtros aplicados" : "Nenhum filtro aplicado"}
      onClick={() => {
        onClear();
        toast.success("Filtros limpos com sucesso");
      }}
    >
      <Trash2 className="h-4 w-4" />
      Limpar Filtros
    </Button>
  );
}
