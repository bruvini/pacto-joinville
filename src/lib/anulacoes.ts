import { linkValido } from "@/lib/sei";

export type AnulacaoDerivada = any & {
  _solic: number;
  _atest: number;
  _anulado: number;
};

export function derivarAnulacoes(lancamentos: any[]): AnulacaoDerivada[] {
  const arr = lancamentos ?? [];
  const isParent = (l: any) =>
    !l.parent_id &&
    String(l.competencia ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean).length > 1;

  const out: AnulacaoDerivada[] = [];
  const filhosPorPai = new Map<string, any[]>();
  for (const item of arr) {
    if (!item.parent_id) continue;
    const filhos = filhosPorPai.get(item.parent_id) ?? [];
    filhos.push(item);
    filhosPorPai.set(item.parent_id, filhos);
  }

  for (const l of arr) {
    if (l.parent_id) continue;

    if (isParent(l)) {
      const filhos = filhosPorPai.get(l.id) ?? [];
      if (filhos.length === 0 || !filhos.every((c) => c.concluido)) continue;

      const atestado = filhos.reduce(
        (s, c) => s + Number(c.valor_atestado ?? 0),
        0,
      );
      const solicitado =
        Number(l.valor_solicitado ?? 0) ||
        filhos.reduce((s, c) => s + Number(c.valor_solicitado ?? 0), 0);
      const anulado = Math.max(0, solicitado - atestado);

      if (anulado > 0)
        out.push({
          ...l,
          _solic: solicitado,
          _atest: atestado,
          _anulado: anulado,
        });
      continue;
    }

    const atestado = Number(l.valor_atestado ?? 0);
    const anulado = Number(l.valor_anulado ?? 0);
    if (atestado > 0 && anulado > 0) {
      out.push({
        ...l,
        _solic: Number(l.valor_solicitado ?? 0),
        _atest: atestado,
        _anulado: anulado,
      });
    }
  }

  return out;
}

export function anulacoesSemRastreabilidadeSei(lancamentos: any[]) {
  return derivarAnulacoes(lancamentos).filter(
    (l) => !linkValido(l.link_anulacao_sei),
  );
}
