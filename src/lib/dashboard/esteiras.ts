import { PISO_ETAPAS, etapaAtualPiso } from "@/lib/piso/etapas";
import { CACON_ETAPAS, etapaAtualCacon } from "@/lib/cacon/etapas";

export type ColunaEsteiraModulo = {
  slug: string;
  label: string;
  curto: string;
  n: number;
  valor: number;
  atrasados: number;
  vencendo: number;
  href: "/piso" | "/cacon";
};

const pisoConcluido = (competencia: any) =>
  competencia.status === "encerrada" ||
  PISO_ETAPAS.every((etapa) => competencia.etapas_concluidas?.[String(etapa.n)] === true);

export function montarEsteiraPiso(competencias: any[]): ColunaEsteiraModulo[] {
  const concluidas = competencias.filter(pisoConcluido);
  const ativas = competencias.filter((competencia) => !pisoConcluido(competencia));

  const etapas = PISO_ETAPAS.map((etapa) => {
    const naEtapa = ativas.filter(
      (competencia) => etapaAtualPiso(competencia.etapas_concluidas) === etapa.n,
    );
    return {
      slug: `piso-${etapa.n}`,
      label: `Etapa ${etapa.n} · ${etapa.titulo}`,
      curto: `E${etapa.n} · ${etapa.titulo}`,
      n: naEtapa.length,
      valor: naEtapa.reduce(
        (s, competencia) => s + Number(competencia.valor_homologado ?? 0),
        0,
      ),
      atrasados: competencias.filter((competencia) =>
        (competencia.etapas_reconferir ?? []).includes(etapa.n),
      ).length,
      vencendo: 0,
      href: "/piso" as const,
    };
  });

  return [
    ...etapas,
    {
      slug: "piso-concluidos",
      label: "Concluídos",
      curto: "Concluídos",
      n: concluidas.length,
      valor: concluidas.reduce(
        (s, competencia) => s + Number(competencia.valor_homologado ?? 0),
        0,
      ),
      atrasados: 0,
      vencendo: 0,
      href: "/piso" as const,
    },
  ];
}

export function montarEsteiraCacon(competencias: any[]): ColunaEsteiraModulo[] {
  const concluidas = competencias.filter(
    (competencia) => competencia.status === "concluida",
  );
  const ativas = competencias.filter(
    (competencia) => competencia.status !== "concluida",
  );

  const etapas = CACON_ETAPAS.map((etapa) => {
    const naEtapa = ativas.filter(
      (competencia) => etapaAtualCacon(competencia) === etapa.n,
    );
    return {
      slug: `cacon-${etapa.n}`,
      label: `Etapa ${etapa.n} · ${etapa.titulo}`,
      curto: `E${etapa.n} · ${etapa.titulo}`,
      n: naEtapa.length,
      valor: naEtapa.reduce(
        (s, competencia) => s + Number(competencia.valor_fornecido ?? 0),
        0,
      ),
      atrasados:
        etapa.n === 2
          ? naEtapa.filter(
              (competencia) => Number(competencia.auditoria?.criticas ?? 0) > 0,
            ).length
          : 0,
      vencendo: 0,
      href: "/cacon" as const,
    };
  });

  return [
    ...etapas,
    {
      slug: "cacon-concluidos",
      label: "Concluídos",
      curto: "Concluídos",
      n: concluidas.length,
      valor: concluidas.reduce(
        (s, competencia) => s + Number(competencia.valor_fornecido ?? 0),
        0,
      ),
      atrasados: 0,
      vencendo: 0,
      href: "/cacon" as const,
    },
  ];
}
