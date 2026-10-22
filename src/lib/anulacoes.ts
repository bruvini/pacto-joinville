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

/** Integra a auditoria do Piso sem apresentar previsão como anulação efetiva.
 * O registro é identificado pelo ID da obrigação e aponta para a competência-mãe.
 */
export function derivarAnulacoesPiso(competencias: any[], documentos: any[]) {
  const porObrigacao = new Map<string, any[]>();
  for (const documento of documentos) {
    if (!documento.obrigacao_id) continue;
    const lista = porObrigacao.get(documento.obrigacao_id) ?? [];
    lista.push(documento);
    porObrigacao.set(documento.obrigacao_id, lista);
  }
  const result: AnulacaoDerivada[] = [];
  for (const c of competencias) {
    for (const participante of c.piso_participantes ?? []) {
      for (const o of participante.piso_obrigacoes ?? []) {
        if (o.valor_empenhado == null || o.valor_a_liquidar == null) continue;
        const empenhado = Math.round(Number(o.valor_empenhado) * 100);
        const devido = Math.round(Number(o.valor_a_liquidar) * 100);
        if (empenhado <= devido) continue;
        const docs = porObrigacao.get(o.id) ?? [];
        const solicitacao = docs.find(d => d.tipo === "solicitacao_anulacao");
        const aviso = docs.find(d => d.tipo === "aviso_anulacao");
        const avisoComprovado = Boolean(
          aviso?.numero_sei && linkValido(aviso?.link_sei) && aviso?.data_documento
        );
        const efetivo = avisoComprovado && o.valor_anulado != null
          ? Number(o.valor_anulado) : 0;
        result.push({
          id: o.id, _origem: "piso", competencia_id: c.id, competencia: c.competencia,
          prestador_id: participante.prestador_id,
          prestadores: participante.prestadores,
          convenios: { objeto: "Piso da Enfermagem", numero_processo_sei_mae: c.processo_sei },
          convenio_id: null, _solic: empenhado / 100, _atest: devido / 100,
          _anulado: efetivo, _previsto: (empenhado - devido) / 100,
          link_solicitacao_anulacao: solicitacao?.link_sei ?? null,
          link_anulacao_sei: avisoComprovado ? aviso.link_sei : null,
          numero_solicitacao_sei: solicitacao?.numero_sei ?? null,
          numero_aviso_sei: aviso?.numero_sei ?? null,
        });
      }
    }
  }
  return result;
}
