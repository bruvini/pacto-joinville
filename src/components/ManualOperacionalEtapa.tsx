import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Info,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ConteudoManualOperacional = {
  numero?: number;
  titulo: string;
  objetivo: string;
  antesDeComecar: string[];
  passoAPasso: string[];
  evidencias: string[];
  concluirQuando: string[];
  atencao: string[];
  baseNormativa: string[];
};

function BlocoManual({
  icon: Icon,
  titulo,
  itens,
  numerado = true,
}: {
  icon: typeof Info;
  titulo: string;
  itens: string[];
  numerado?: boolean;
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
              {numerado ? String(index + 1) + "." : "•"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ManualOperacionalEtapa({
  conteudo,
  modulo,
  primeiroDiaTexto,
}: {
  conteudo: ConteudoManualOperacional;
  modulo: string;
  primeiroDiaTexto?: string;
}) {
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary/70">
          Manual operacional
          {conteudo.numero ? " · Etapa " + conteudo.numero : ""}
          {" · "}
          {modulo}
        </div>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BookOpenCheck className="h-5 w-5 text-primary" />
          {conteudo.titulo}
        </CardTitle>
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
          {conteudo.objetivo}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <Info className="h-4 w-4" />
            Se é seu primeiro dia fazendo este processo
          </div>
          <p>
            {primeiroDiaTexto ??
              "Siga os blocos abaixo na ordem. O sistema explica o que fazer, por que fazer e qual evidência guardar. Dependências e pendências devem ser sinalizadas pela própria etapa."}
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <BlocoManual
            icon={ClipboardList}
            titulo="Antes de começar"
            itens={conteudo.antesDeComecar}
          />
          <BlocoManual
            icon={FileCheck2}
            titulo="Evidências e registros"
            itens={conteudo.evidencias}
          />
        </div>

        <BlocoManual
          icon={BookOpenCheck}
          titulo="Passo a passo"
          itens={conteudo.passoAPasso}
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <BlocoManual
            icon={CheckCircle2}
            titulo="Você pode concluir quando"
            itens={conteudo.concluirQuando}
          />
          <BlocoManual
            icon={ShieldAlert}
            titulo="Atenção / erros comuns"
            itens={conteudo.atencao}
          />
        </div>

        <BlocoManual
          icon={FileCheck2}
          titulo="Base normativa e documental"
          itens={conteudo.baseNormativa}
          numerado={false}
        />
      </CardContent>
    </Card>
  );
}
