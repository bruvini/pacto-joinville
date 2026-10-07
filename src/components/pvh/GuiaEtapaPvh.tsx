import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Info,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PvhEtapa } from "@/lib/pvh/etapas";

function Bloco({
  icon: Icon,
  titulo,
  itens,
}: {
  icon: typeof Info;
  titulo: string;
  itens: string[];
}) {
  if (!itens.length) return null;
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
        <Icon className="h-4 w-4" />
        {titulo}
      </div>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {itens.map((item, index) => (
          <li key={titulo + "-" + index} className="flex gap-2">
            <span className="mt-0.5 shrink-0 font-semibold text-primary/70">
              {index + 1}.
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GuiaEtapaPvh({ etapa }: { etapa: PvhEtapa }) {
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary/70">
          Manual operacional · Etapa {etapa.n}
        </div>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BookOpenCheck className="h-5 w-5 text-primary" />
          {etapa.titulo}
        </CardTitle>
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
          {etapa.objetivo}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <Info className="h-4 w-4" />
            Se é seu primeiro dia fazendo PVH
          </div>
          <p>
            Siga os blocos abaixo na ordem. O sistema foi desenhado para explicar
            <b> o que fazer, por que fazer e qual evidência guardar</b>. Quando uma etapa
            depender de outra, ela ficará bloqueada ou marcada como pendente.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Bloco
            icon={ClipboardList}
            titulo="Antes de começar"
            itens={etapa.antesDeComecar}
          />
          <Bloco
            icon={FileCheck2}
            titulo="Evidências e registros"
            itens={etapa.evidencias}
          />
        </div>

        <Bloco icon={BookOpenCheck} titulo="Passo a passo" itens={etapa.passoAPasso} />

        <div className="grid gap-4 xl:grid-cols-2">
          <Bloco
            icon={CheckCircle2}
            titulo="Você pode concluir quando"
            itens={etapa.concluirQuando}
          />
          <Bloco icon={ShieldAlert} titulo="Atenção / erros comuns" itens={etapa.atencao} />
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <FileCheck2 className="h-4 w-4 text-primary" />
            Base normativa e documental
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {etapa.baseNormativa.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
