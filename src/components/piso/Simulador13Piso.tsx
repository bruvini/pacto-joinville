import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Calculator, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  simular13PorCnes, type CnesInstituicaoPiso,
  type FonteMensalPiso,
} from "@/lib/piso/simulador13";

type Participante = { prestador_id: string; prestadores?: { nome_instituicao?: string } | null };
type Cnes = { prestador_id: string; cnes: string };

const moedaCentavos = (valor: number) =>
  (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O cálculo local é uma prévia. A confirmação recalcula todos os dados
 * no PostgreSQL, compara à Portaria GM/MS e registra o histórico auditável.
 */
export function Simulador13Piso({
  competenciaId, exercicio, participantes, cnes,
  valorHomologado, portariaRegistrada, origemAtual, canEdit, onChange,
}: {
  competenciaId: string;
  exercicio: number;
  participantes: Participante[];
  cnes: Cnes[];
  valorHomologado: number | null;
  portariaRegistrada: boolean;
  origemAtual?: string | null;
  canEdit: boolean;
  onChange: () => void;
}) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["piso13", "memoria-mensal", exercicio],
    queryFn: async () => {
      const { data, error } = await supabase.from("piso_competencias")
        .select("id,competencia,tipo_parcela,valor_homologado,portaria_gm_numero,etapas_concluidas,investsus_resumo")
        .eq("tipo_parcela", "mensal")
        .eq("exercicio_referencia", exercicio)
        .limit(24);
      if (error) throw error;
      return (data ?? []) as unknown as FonteMensalPiso[];
    },
    enabled: exercicio >= 2020,
    staleTime: 120000,
  });
  const participantesIds = new Set(participantes.map(p => p.prestador_id));
  const instituicoes: CnesInstituicaoPiso[] = cnes
    .filter(c => participantesIds.has(c.prestador_id))
    .map(c => ({
      prestador_id: c.prestador_id,
      cnes: String(c.cnes),
      nome_instituicao: participantes.find(p => p.prestador_id === c.prestador_id)
        ?.prestadores?.nome_instituicao,
    }));
  const simulacao = simular13PorCnes(exercicio, data, instituicoes);
  const valorSugeridoCentavos = simulacao.porInstituicao.reduce(
    (total, inst) => total + inst.total_centesimos, 0,
  );
  const conciliado = origemAtual === "simulacao13_conferida";
  const compativel = valorHomologado != null &&
    Math.abs(valorSugeridoCentavos - Math.round(valorHomologado * 100)) <= 1;
  const confirmar = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("piso13_confirmar_calculo_cnes", {
        p_competencia: competenciaId,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      toast.success("Memória por CNES confirmada e registrada para a Minuta Municipal.");
      onChange();
    },
    onError: (e: Error) => toast.error("Cálculo não confirmado", { description: e.message }),
  });

  return (
    <section className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start gap-2">
        <Calculator className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h3 className="font-semibold">Conferência interna da 13ª por CNES</h3>
          <p className="text-xs text-muted-foreground">
            Consulta os valores homologados já processados no PACTO nas 11 competências mensais
            de janeiro a novembro do exercício. Uma instituição com dois CNES terá duas
            memórias independentes. O cálculo não modifica valores oficiais nem pagamentos.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Conferindo competências mensais…
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as competências mensais: {error.message}
        </p>
      ) : !simulacao.disponivel ? (
        <div className="space-y-2 rounded-md border bg-background p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            Cálculo interno indisponível
          </p>
          <p className="text-xs text-muted-foreground">
            Cadastre e processe os meses ausentes, inclusive as memórias homologadas por CNES,
            antes de tentar calcular. A Portaria GM/MS e a execução financeira da 13ª
            continuam independentes desta simulação.
          </p>
          <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-muted-foreground">
            {simulacao.problemas.map((motivo, indice) => <li key={indice}>{motivo}</li>)}
          </ul>
          <a className="inline-flex items-center gap-1 text-xs text-primary underline"
            href="/piso">
            Abrir competências mensais <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium">
            Método de referência: {simulacao.regra?.fonte}. Média com divisor {simulacao.regra?.divisor}.
          </p>
          {simulacao.porInstituicao.map(inst => (
            <div key={inst.prestador_id} className="rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {participantes.find(p => p.prestador_id === inst.prestador_id)
                    ?.prestadores?.nome_instituicao ?? "Instituição"}
                </p>
                <span className="text-sm font-bold">{moedaCentavos(inst.total_centesimos)}</span>
              </div>
              {inst.cnes.map(linha => (
                <details key={linha.cnes} className="mt-2 border-t pt-2 text-xs">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                    <span>CNES {linha.cnes} · 11 meses verificados</span>
                    <b>{moedaCentavos(linha.media_centesimos)}</b>
                  </summary>
                  <div className="mt-2 grid gap-x-6 gap-y-1 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
                    {simulacao.mesesExigidos.map((mes, indice) => (
                      <div key={mes} className="flex justify-between gap-3">
                        <span className="text-muted-foreground">{mes}</span>
                        <span className="tabular-nums">
                          {moedaCentavos(linha.valores_centesimos[indice])}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Média simples de 11 competências, arredondada por CNES.
                  </p>
                </details>
              ))}
            </div>
          ))}
          <div className="space-y-2 rounded-md border bg-background p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Total sugerido da 13ª</span>
              <strong>{moedaCentavos(valorSugeridoCentavos)}</strong>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>Homologado na Portaria GM/MS</span>
              <strong>{valorHomologado == null ? "Não informado" : moedaCentavos(Math.round(valorHomologado * 100))}</strong>
            </div>
            {conciliado ? (
              <p className="text-xs font-medium text-success">
                Memória de cálculo já conciliada e registrada para o Anexo Municipal.
              </p>
            ) : !portariaRegistrada ? (
              <p className="text-xs text-amber-800">
                Importe e confira a Portaria Federal abaixo antes de confirmar a memória por CNES.
              </p>
            ) : !compativel ? (
              <p className="text-xs text-destructive">
                Valores divergentes. Confira CNES, históricos e Portaria Federal.
                A memória não poderá alimentar a Minuta sem conciliação.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Cálculo compatível com a Portaria. A confirmação recalcula os onze meses
                no banco e registra fontes, responsável e valores por CNES.
              </p>
            )}
            {canEdit && !conciliado && (
              <Button size="sm" disabled={!simulacao.disponivel || !portariaRegistrada ||
                !compativel || confirmar.isPending}
                onClick={() => confirmar.mutate()}>
                {confirmar.isPending ? "Conferindo no servidor…" : "Confirmar cálculo e preencher valores por CNES"}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            A sugestão não autoriza despesa. Somente a memória reconciliada com a Portaria
            Federal alimenta o Anexo Municipal. Pagamentos seguem as etapas financeiras.
          </p>
        </div>
      )}
    </section>
  );
}
