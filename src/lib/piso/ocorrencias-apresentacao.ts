/**
 * Apresentação da conciliação InvestSUS sem inferir motivo de ausência
 * na homologação. CPFs completos e nomes não devem ser persistidos aqui.
 */
export interface AusenciaHomologacao {
  complementoEstimado?: number | null;
  pisoReferencia?: number | null;
  salarioBaseDeclarado?: number | null;
  jornadaSemanal?: number | null;
}

const moeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(valor).replace(/[\u00a0\u202f]/g, " ");

export function descricaoAusenciaHomologacao({
  complementoEstimado, pisoReferencia, salarioBaseDeclarado, jornadaSemanal,
}: AusenciaHomologacao = {}): string {
  const abertura =
    "O vínculo consta na Planilha de Carga, mas não foi localizado na relação de complementos homologados do InvestSUS. " +
    "A inclusão na carga e a homologação do complemento são etapas diferentes.";
  const temEstimativa = complementoEstimado != null &&
    Number.isFinite(complementoEstimado) && complementoEstimado > 0;
  const temCalculo = pisoReferencia != null && salarioBaseDeclarado != null &&
    Number.isFinite(pisoReferencia) && Number.isFinite(salarioBaseDeclarado);
  const detalhe = !temEstimativa ? "" :
    temCalculo
      ? ` Pela carga${jornadaSemanal != null ? ` (${jornadaSemanal}h semanais)` : ""}: ` +
        `piso de referência ${moeda(pisoReferencia!)} − salário-base declarado ` +
        `${moeda(salarioBaseDeclarado!)} = diferença potencial de ${moeda(complementoEstimado!)}.`
      : ` Pela carga, a diferença potencial estimada é ${moeda(complementoEstimado!)}.`;
  return abertura + detalhe +
    (temEstimativa ? " Esse valor não foi homologado e não deve ser somado ao repasse." : "") +
    " As planilhas não informam o motivo da ausência. Confira competência, CPF/CNES e situação do vínculo no InvestSUS.";
}

interface OcorrenciaExibicao {
  regra?: string | null;
  descricao?: string | null;
  dados?: Record<string, unknown> | null;
}

export function tituloOcorrenciaPiso(regra: string | null | undefined): string {
  if (regra === "nao_homologado_investsus") return "Registro da carga ausente na homologação";
  if (regra === "ausencia_sem_complemento") return "Ausente da homologação · sem diferença positiva";
  return String(regra ?? "Ocorrência").replaceAll("_", " ");
}

/** Reformata inclusive ocorrências antigas, já persistidas no banco, sem reimportação. */
export function descricaoOcorrenciaPiso(ocorrencia: OcorrenciaExibicao): string {
  if (ocorrencia.regra !== "nao_homologado_investsus") return String(ocorrencia.descricao ?? "");
  const dados = ocorrencia.dados ?? {};
  const numero = (chave: string): number | null =>
    typeof dados[chave] === "number" && Number.isFinite(dados[chave])
      ? dados[chave] as number : null;
  let estimativa = numero("complemento_estimado");
  if (estimativa == null) {
    const antigo = String(ocorrencia.descricao ?? "").match(/complemento estimado seria R\$\s*([\d.,]+)/i);
    if (antigo) {
      const calculado = Number(antigo[1].replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(calculado)) estimativa = calculado;
    }
  }
  const retorno = typeof dados.resultado_retorno === "string"
    ? dados.resultado_retorno.trim().slice(0, 240) : "";
  const observacao = typeof dados.observacao_retorno === "string"
    ? dados.observacao_retorno.trim().slice(0, 240) : "";
  return descricaoAusenciaHomologacao({
    complementoEstimado: estimativa,
    pisoReferencia: numero("piso_referencia"),
    salarioBaseDeclarado: numero("salario_base_declarado"),
    jornadaSemanal: numero("jornada_semanal"),
  }) + (retorno ? ` Confirmação do envio: “${retorno}”.` : "") +
    (observacao ? ` Observação do retorno: “${observacao}”.` : "");
}
