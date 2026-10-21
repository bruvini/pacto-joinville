/** Projeção das fontes reais de dotação/fonte dos módulos. Não fabrica registros.
 * Piso: dotação e fonte pertencem à obrigação financeira.
 * PVH: pertencem à solicitação de empenho (pode atender competências distintas).
 */
export type ModuloLote = "piso" | "pvh";
export type LinhaDotacaoFonte = {
  id: string;
  competenciaId: string;
  competencia: string;
  instituicao: string;
  detalhe: string;
  dotacao: string;
  fonte: string;
  atualizadoEm: string;
};

const texto = (v: unknown) => String(v ?? "").trim();
const primeiro = (v: any) => Array.isArray(v) ? v[0] : v;
const nome = (v: any) => texto(primeiro(v)?.nome_instituicao) || "Instituição não identificada";

export function linhasPendentesPiso(competencias: any[]): LinhaDotacaoFonte[] {
  const linhas: LinhaDotacaoFonte[] = [];
  for (const c of competencias) {
    if (c.status === "encerrada") continue;
    for (const p of c.piso_participantes ?? []) {
      for (const o of p.piso_obrigacoes ?? []) {
        if (texto(o.cr_dotacao) && texto(o.fonte)) continue;
        linhas.push({
          id: o.id, competenciaId: c.id, competencia: texto(c.competencia),
          instituicao: nome(p.prestadores),
          detalhe: `${c.tipo_parcela === "decimo_terceiro" ? "13ª" : "Mensal"} · ${texto(o.origem_recurso) || "Obrigação financeira"}`,
          dotacao: texto(o.cr_dotacao), fonte: texto(o.fonte),
          atualizadoEm: texto(o.updated_at),
        });
      }
    }
  }
  return ordenar(linhas);
}

export function linhasPendentesPvh(empenhos: any[]): LinhaDotacaoFonte[] {
  const linhas: LinhaDotacaoFonte[] = [];
  for (const e of empenhos) {
    const competencia = primeiro(e.pvh_competencias);
    if (!e.solicitacao_competencia_id || !competencia || competencia.status === "encerrada") continue;
    // Solicitação já enviada/NE emitida deve ser corrigida no fluxo individual.
    if (e.solicitacao_enviada_sefaz || e.numero_ne || e.status === "ativo") continue;
    if (texto(e.cr_dotacao) && texto(e.fonte_recurso)) continue;
    linhas.push({
      id: e.id, competenciaId: competencia.id,
      competencia: texto(competencia.competencia),
      instituicao: nome(e.prestadores),
      detalhe: `Solicitação de NE${e.solicitacao_sei_numero ? " · " + texto(e.solicitacao_sei_numero) : ""}`,
      dotacao: texto(e.cr_dotacao), fonte: texto(e.fonte_recurso),
      atualizadoEm: texto(e.updated_at),
    });
  }
  return ordenar(linhas);
}

function ordenar(linhas: LinhaDotacaoFonte[]) {
  return linhas.sort((a, b) =>
    a.instituicao.localeCompare(b.instituicao, "pt-BR") ||
    b.competencia.localeCompare(a.competencia, "pt-BR") ||
    a.detalhe.localeCompare(b.detalhe, "pt-BR"));
}

/** Proteção comum: preenche lacunas, nunca sobrescreve dotação/fonte existente. */
export function montarAtualizacaoPendente(
  atual: { cr_dotacao?: string | null; fonte?: string | null; fonte_recurso?: string | null },
  rascunho: { dotacao: string; fonte: string },
  modulo: ModuloLote,
) {
  const atualDotacao = texto(atual.cr_dotacao);
  const atualFonte = texto(modulo === "piso" ? atual.fonte : atual.fonte_recurso);
  const novaDotacao = texto(rascunho.dotacao);
  const novaFonte = texto(rascunho.fonte);
  if (!novaDotacao || !novaFonte) throw new Error("Preencha dotação e fonte antes de salvar.");
  if (novaDotacao.length > 100 || novaFonte.length > 100)
    throw new Error("Dotação ou fonte excede 100 caracteres.");
  if ((atualDotacao && atualDotacao !== novaDotacao) ||
      (atualFonte && atualFonte !== novaFonte))
    throw new Error("O registro foi alterado. Reabra o modal para conferir os valores.");
  if (atualDotacao && atualFonte) throw new Error("Dotação e fonte já estão preenchidas.");
  return modulo === "piso"
    ? { cr_dotacao: novaDotacao, fonte: novaFonte }
    : { cr_dotacao: novaDotacao, fonte_recurso: novaFonte };
}
