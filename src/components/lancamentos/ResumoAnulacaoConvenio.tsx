import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import { valorAnulacaoParaCopiar } from "@/lib/lancamentos/valorAnulacao";

/** Mesmo valor da diferença Solicitação − Atesto, sem arredondamentos visuais. */
export function ResumoAnulacaoConvenio({
  valor, solicitado, atestado, pai = false,
}: {
  valor: number;
  solicitado: number;
  atestado: number;
  pai?: boolean;
}) {
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valorAnulacaoParaCopiar(valor));
      toast.success("Valor de anulação copiado com duas casas decimais.");
    } catch {
      toast.error("Não foi possível copiar. Verifique a área de transferência.");
    }
  };

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <span>
        {pai ? "Todas as competências foram concluídas. " : ""}
        Há <b>{brl(valor)}</b> a anular {pai
          ? <>no empenho pai — total Solicitado <b>{brl(solicitado)}</b> − total Atestado das competências <b>{brl(atestado)}</b>.</>
          : "(Solicitado − Atestado)."}
      </span>
      <Button type="button" variant="outline" size="sm"
        title="Copiar valor numérico sem R$ ou separador de milhar"
        onClick={() => void copiar()} className="shrink-0">
        <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar valor
      </Button>
    </div>
  );
}
