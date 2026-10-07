import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Settings2 } from "lucide-react";
import { AjudaAntesCompetenciaPvh } from "@/components/pvh/AjudaPvh";
import { ConfiguracoesInstituicoesPvh } from "@/components/pvh/config/ConfiguracoesInstituicoesPvh";
import { NormativasPvh } from "@/components/pvh/config/NormativasPvh";
import { ProcessosAnuaisPvh } from "@/components/pvh/config/ProcessosAnuaisPvh";

export const Route = createFileRoute("/_authenticated/pvh/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações do PVH — SMS Joinville" },
      {
        name: "description",
        content:
          "Configurações, bases normativas e processos SEI anuais do Programa de Valorização dos Hospitais.",
      },
    ],
  }),
  component: PvhConfiguracoesPage,
});

function PvhConfiguracoesPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/pvh"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar ao PVH
          </Link>

          <div className="flex items-center gap-1">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-primary">
              <Settings2 className="h-6 w-6" />
              Configurações do PVH
            </h1>
            <AjudaAntesCompetenciaPvh />
          </div>

          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            Organize aqui três coisas diferentes: <b>regras institucionais por competência</b>,
            <b> base normativa por vigência</b> e <b>processos SEI por exercício</b>. A classificação
            orçamentária não é fixa: ela é informada na Nota de Empenho.
          </p>
        </div>
      </div>

      <ConfiguracoesInstituicoesPvh />
      <ProcessosAnuaisPvh />
      <NormativasPvh />
    </div>
  );
}
