import { linkValido } from "@/lib/sei";

/** O Piso é um programa financeiro, não um convênio cadastrado na tabela convenios.
 * As opções têm prefixos para que "Piso" nunca coincida com o UUID de um contrato.
 */
export type FiltrosAnulacoes = {
  prestador: string;
  contrato: string;
  mes: string;
  situacao: string;
};

export type OpcaoContratoAnulacao = { value: string; label: string };

export function correspondeContratoAnulacao(registro: any, contrato: string): boolean {
  if (contrato === "all") return true;
  const piso = registro._origem === "piso";
  if (contrato === "piso") return piso;
  if (contrato === "convenios") return !piso;
  return !piso && contrato.startsWith("convenio:") &&
    registro.convenio_id === contrato.slice("convenio:".length);
}

export function situacaoAnulacao(registro: any):
  "sem_link" | "apenas_solicitacao" | "aviso_movimento" | "anulacao_concluida" {
  if (registro._origem === "piso" && linkValido(registro.link_anulacao_sei))
    return Number(registro._anulado ?? 0) > 0 ? "anulacao_concluida" : "aviso_movimento";
  if (linkValido(registro.link_anulacao_sei)) return "anulacao_concluida";
  if (registro.sefaz_etapa5_em) return "aviso_movimento";
  if (linkValido(registro.link_solicitacao_anulacao)) return "apenas_solicitacao";
  return "sem_link";
}

export function filtrarAnulacoes(
  registros: any[],
  filtros: FiltrosAnulacoes,
  ids: string[] = [],
): any[] {
  const idsSet = new Set(ids);
  const mes = filtros.mes.trim();
  return registros.filter(registro =>
    (idsSet.size === 0 || idsSet.has(registro.id)) &&
    (filtros.prestador === "all" || registro.prestador_id === filtros.prestador) &&
    correspondeContratoAnulacao(registro, filtros.contrato) &&
    (!mes || String(registro.competencia ?? "").includes(mes)) &&
    (filtros.situacao === "all" || situacaoAnulacao(registro) === filtros.situacao)
  );
}

/** Apenas contratos com anulações no prestador selecionado são apresentados.
 * Usa também o número SEI para desambiguar objetos homônimos.
 */
export function opcoesContratoAnulacoes(
  registros: any[],
  convenios: Array<{
    id: string;
    prestador_id: string;
    objeto?: string | null;
    numero_processo_sei_mae?: string | null;
  }>,
  prestador: string,
): OpcaoContratoAnulacao[] {
  const visiveis = registros.filter(registro =>
    prestador === "all" || registro.prestador_id === prestador);
  const resultado: OpcaoContratoAnulacao[] = [
    { value: "all", label: "Todos os contratos e programas" },
  ];
  if (visiveis.some(registro => registro._origem === "piso")) {
    resultado.push({ value: "piso", label: "Piso da Enfermagem" });
  }
  const conveniosVisiveis = visiveis.filter(registro => registro._origem !== "piso");
  if (conveniosVisiveis.length) {
    resultado.push({ value: "convenios", label: "Todos os convênios" });
  }
  const cadastrados = new Map(convenios.map(convenio => [convenio.id, convenio]));
  const nomes = new Map<string, string>();
  for (const registro of conveniosVisiveis) {
    const id = String(registro.convenio_id ?? "");
    if (!id || nomes.has(id)) continue;
    const cadastrado = cadastrados.get(id);
    const objeto = cadastrado?.objeto ?? registro.convenios?.objeto ?? "Contrato sem objeto";
    const numero = cadastrado?.numero_processo_sei_mae ??
      registro.convenios?.numero_processo_sei_mae;
    const rotulo = numero ? `${objeto} · SEI ${numero}` : objeto;
    nomes.set(id, String(rotulo));
  }
  return resultado.concat(
    [...nomes].sort((a,b) => a[1].localeCompare(b[1], "pt-BR"))
      .map(([id, label]) => ({ value: `convenio:${id}`, label })),
  );
}
