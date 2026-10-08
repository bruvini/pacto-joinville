import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AssinaturaManualHistorica = {
  nome: string;
  slot: "comissao" | "sefaz";
};

/**
 * Catálogo derivado do histórico real de assinaturas manuais.
 *
 * Não cria um cadastro paralelo: os nomes continuam tendo origem nos
 * documentos efetivamente assinados. O catálogo apenas deduplica grafias já
 * utilizadas e respeita as correções/ocultações administrativas existentes.
 */
export function useHistoricoAssinaturasManuais() {
  return useQuery({
    queryKey: ["assinaturas-historico-manual"],
    queryFn: async () => {
      const [
        { data: lancamentos, error: erroLancamentos },
        { data: piso, error: erroPiso },
        { data: empenhosPvh, error: erroEmpenhos },
        { data: subempenhosPvh, error: erroSubempenhos },
        { data: overrides, error: erroOverrides },
      ] = await Promise.all([
        supabase
          .from("assinaturas_etapa")
          .select("servidor_nome,slot"),
        supabase
          .from("piso_documento_assinaturas")
          .select("servidor_nome,slot"),
        supabase
          .from("pvh_empenho_solicitacao_assinaturas")
          .select("servidor_nome,slot"),
        supabase
          .from("pvh_subempenho_assinaturas")
          .select("assinante_nome,slot"),
        supabase
          .from("assinaturas_manual_override")
          .select("nome_original,nome_novo,oculto"),
      ]);

      const erro =
        erroLancamentos ||
        erroPiso ||
        erroEmpenhos ||
        erroSubempenhos ||
        erroOverrides;
      if (erro) throw erro;

      const overridePorOriginal = new Map(
        (overrides ?? []).map((item: any) => [item.nome_original, item]),
      );
      const vistos = new Set<string>();
      const itens: AssinaturaManualHistorica[] = [];

      const adicionar = (nomeBruto: unknown, slotBruto: unknown) => {
        const slot = String(slotBruto ?? "");
        if (!["comissao", "sefaz"].includes(slot)) return;

        const original = String(nomeBruto ?? "").trim();
        if (!original) return;

        const override = overridePorOriginal.get(original) as any;
        if (override?.oculto) return;

        const nome =
          String(override?.nome_novo ?? "").trim() || original;
        const chave = `${slot}|${nome.toLocaleLowerCase("pt-BR")}`;
        if (vistos.has(chave)) return;

        vistos.add(chave);
        itens.push({
          nome,
          slot: slot as AssinaturaManualHistorica["slot"],
        });
      };

      for (const item of lancamentos ?? []) {
        adicionar(item.servidor_nome, item.slot);
      }
      for (const item of piso ?? []) {
        adicionar(item.servidor_nome, item.slot);
      }
      for (const item of empenhosPvh ?? []) {
        adicionar(item.servidor_nome, item.slot);
      }
      for (const item of subempenhosPvh ?? []) {
        adicionar(item.assinante_nome, item.slot);
      }

      return itens.sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR"),
      );
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
