import { CheckCircle2, CircleAlert } from "lucide-react";

/**
 * A 13ª parcela usa a memória anual e a portaria federal na Etapa 2.
 * Na Etapa 1, confere-se a composição institucional sem reproduzir a
 * coleta de Planilhas de Carga própria das competências mensais.
 */
export function PreparacaoDecimoTerceiroPiso({
  participantes,
  cnes,
}: {
  participantes: any[];
  cnes: any[];
}) {
  return (
    <section className="space-y-4" aria-label="Preparação da décima terceira parcela">
      <div className="rounded-lg border p-4">
        <h3 className="font-semibold">1. Conferência das instituições e dos CNES</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Confira a relação de instituições participantes e seus CNES.
          Os valores e a memória de cálculo da 13ª serão conferidos separadamente
          na Etapa 2, com a fonte oficial e a Portaria GM/MS correspondente.
          Não é necessário importar a Planilha de Carga mensal.
        </p>
      </div>

      <div className="space-y-3">
        {participantes.map((p) => {
          const cadastrados = cnes.filter((item) =>
            item.prestador_id === p.prestador_id && String(item.cnes ?? "").trim(),
          );
          const pronto = cadastrados.length > 0;
          return (
            <div key={p.id} className="flex flex-wrap items-start gap-3 rounded-lg border p-4">
              {pronto
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold">
                  {p.prestadores?.nome_instituicao ?? "Instituição"}
                </p>
                <p className="text-xs text-muted-foreground">
                  CNES: {cadastrados.map((item) => item.cnes).join(", ") || "Nenhum cadastrado"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {pronto ? "Cadastro disponível para conferência" : "Cadastrar CNES antes de concluir"}
              </span>
            </div>
          );
        })}
      </div>

      <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
        Após conferir as instituições e os CNES, utilize o botão
        <strong> Concluir preparação da 13ª parcela</strong>.
        A Etapa 1 não é concluída automaticamente.
      </p>
    </section>
  );
}
