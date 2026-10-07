import { CircleHelp } from "lucide-react";
import { ManualOperacionalEtapa } from "@/components/ManualOperacionalEtapa";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PvhEtapa } from "@/lib/pvh/etapas";

export function GuiaEtapaPvh({ etapa }: { etapa: PvhEtapa }) {
  const label = `Abrir manual operacional da Etapa ${etapa.n}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary"
          title={label}
          aria-label={label}
        >
          <CircleHelp className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Como executar a Etapa {etapa.n}</DialogTitle>
          <DialogDescription>
            Manual operacional do PVH com pré-requisitos, evidências, critérios de conclusão e base documental.
          </DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
