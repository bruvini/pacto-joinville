import { PVH_ETAPAS, etapaPrincipalPvh } from "@/lib/pvh/etapas";
import { somarDiasUteisJoinville } from "@/lib/calendario";

const DIA = 86_400_000;

const dataLocal = (valor?: string | null) => {
  if (!valor) return null;
  const texto = String(valor).slice(0, 10);
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const inicioDia = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

const diasAte = (hoje: Date, prazo: Date) =>
  Math.floor((inicioDia(prazo).getTime() - inicioDia(hoje).getTime()) / DIA);

export type PendenciaPrazoPvh = {
  id: string;
  competenciaId?: string;
  competencia: string;
  tipo: "abertura" | "pagamento_limite" | "repasse_5_dias";
  motivo: string;
  dias: number;
  severidade: "critico" | "alerta" | "preventivo";
  prazoLabel: string;
};

export function competenciaAtualPvh(hoje = new Date()) {
  return `${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
}

export function prazoPagamentoCompetenciaPvh(competencia: string): Date | null {
  const m = competencia.match(/^(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const mes = Number(m[1]);
  const ano = Number(m[2]);
  return new Date(ano, mes + 1, 0);
}

export function pendenciasPvh(
  competencias: any[],
  hoje = new Date(),
): PendenciaPrazoPvh[] {
  const itens: PendenciaPrazoPvh[] = [];
  const atual = competenciaAtualPvh(hoje);
  const existeAtual = competencias.some((c) => c.competencia === atual);

  if (!existeAtual) {
    const limite = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const dias = diasAte(hoje, limite);
    itens.push({
      id: `pvh-abertura-${atual}`,
      competencia: atual,
      tipo: "abertura",
      motivo: "A competência PVH deve estar aberta no primeiro dia do mês.",
      dias,
      severidade: dias < 0 ? "critico" : "alerta",
      prazoLabel:
        dias < 0
          ? `${Math.abs(dias)}d atraso`
          : dias === 0
            ? "abrir hoje"
            : `${dias}d`,
    });
  }

  for (const comp of competencias) {
    if (comp.status === "encerrada") continue;
    const valorDevido = (comp.pvh_participantes ?? []).reduce(
      (s: number, p: any) =>
        s + Number(p.valor_municipal ?? p.valor_estadual ?? 0),
      0,
    );
    const valorPago = (comp.pvh_participantes ?? []).reduce(
      (s: number, p: any) => s + Number(p.valor_pago ?? 0),
      0,
    );
    const pago = valorDevido > 0 && Math.abs(valorDevido - valorPago) < 0.01;

    if (!pago) {
      const prazo = prazoPagamentoCompetenciaPvh(comp.competencia);
      if (prazo) {
        const dias = diasAte(hoje, prazo);
        if (dias <= 10) {
          itens.push({
            id: `pvh-pagamento-${comp.id}`,
            competenciaId: comp.id,
            competencia: comp.competencia,
            tipo: "pagamento_limite",
            motivo:
              "O pagamento da competência deve ocorrer, no máximo, até o fim do mês seguinte.",
            dias,
            severidade: dias < 0 ? "critico" : dias <= 5 ? "alerta" : "preventivo",
            prazoLabel:
              dias < 0
                ? `${Math.abs(dias)}d atraso`
                : dias === 0
                  ? "vence hoje"
                  : `${dias}d`,
          });
        }
      }
    }

    const credito = dataLocal(comp.recurso_fms_data);
    if (credito && !pago) {
      const prazo = somarDiasUteisJoinville(credito, 5);
      const dias = diasAte(hoje, prazo);
      if (dias <= 3) {
        itens.push({
          id: `pvh-repasse-${comp.id}`,
          competenciaId: comp.id,
          competencia: comp.competencia,
          tipo: "repasse_5_dias",
          motivo:
            "O repasse às unidades hospitalares vence em até 5 dias úteis após o crédito no FMS.",
          dias,
          severidade: dias < 0 ? "critico" : "alerta",
          prazoLabel:
            dias < 0
              ? `${Math.abs(dias)}d atraso`
              : dias === 0
                ? "vence hoje"
                : `${dias}d`,
        });
      }
    }
  }

  return itens.sort((a, b) => a.dias - b.dias);
}

const instante = (v: unknown) => {
  if (typeof v !== "string" || !v) return null;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
};

const objeto = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};

export function calcularSlaPvh(
  competencias: any[],
  logs: any[],
) {
  const ids = new Set(competencias.map((c) => c.id));
  const conclusoes = new Map<string, Map<number, number>>();

  [...logs]
    .filter((log) => log.pvh_competencia_id && ids.has(log.pvh_competencia_id))
    .sort((a, b) => (instante(a.data_hora) ?? 0) - (instante(b.data_hora) ?? 0))
    .forEach((log) => {
      const quando = instante(log.data_hora);
      if (quando == null) return;
      const detalhes = objeto(log.detalhes);
      const depois =
        objeto(objeto(detalhes.etapas_concluidas).para);
      const mapa = conclusoes.get(log.pvh_competencia_id) ?? new Map<number, number>();

      for (const etapa of PVH_ETAPAS) {
        const chave = String(etapa.n);
        if (depois[chave] === true && !mapa.has(etapa.n)) {
          mapa.set(etapa.n, quando);
        }
      }

      const m = String(log.acao ?? "").match(/Etapa\s+(\d+)/i);
      if (m) {
        const etapa = Number(m[1]);
        if (etapa >= 1 && etapa <= 7 && /conclu/i.test(String(log.acao)) && !mapa.has(etapa)) {
          mapa.set(etapa, quando);
        }
      }
      conclusoes.set(log.pvh_competencia_id, mapa);
    });

  const amostras = new Map(PVH_ETAPAS.map((e) => [e.n, [] as number[]]));

  for (const comp of competencias) {
    const inicio = instante(comp.created_at);
    const mapa = conclusoes.get(comp.id);
    if (inicio == null || !mapa) continue;
    let anterior = inicio;
    for (const etapa of PVH_ETAPAS) {
      const fim = mapa.get(etapa.n);
      if (fim == null || fim < anterior) break;
      amostras.get(etapa.n)?.push((fim - anterior) / DIA);
      anterior = fim;
    }
  }

  return PVH_ETAPAS.map((etapa) => {
    const valores = amostras.get(etapa.n) ?? [];
    return {
      etapa: `Etapa ${etapa.n} · ${etapa.titulo}`,
      media: valores.length
        ? valores.reduce((s, v) => s + v, 0) / valores.length
        : null,
      n: valores.length,
    };
  });
}

export function etapaPrincipalDashboardPvh(comp: any) {
  return etapaPrincipalPvh(
    comp.etapas_concluidas ?? {},
    comp.status,
    comp.etapas_reconferir ?? [],
  );
}
