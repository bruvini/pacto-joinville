import { ManualOperacionalEtapa } from "@/components/ManualOperacionalEtapa";
import type { PvhEtapa } from "@/lib/pvh/etapas";

export function GuiaEtapaPvh({ etapa }: { etapa: PvhEtapa }) {
  return (
    <ManualOperacionalEtapa
      modulo="PVH"
      conteudo={{
        numero: etapa.n,
        titulo: etapa.titulo,
        objetivo: etapa.objetivo,
        antesDeComecar: etapa.antesDeComecar,
        passoAPasso: etapa.passoAPasso,
        evidencias: etapa.evidencias,
        concluirQuando: etapa.concluirQuando,
        atencao: etapa.atencao,
        baseNormativa: etapa.baseNormativa,
      }}
    />
  );
}
