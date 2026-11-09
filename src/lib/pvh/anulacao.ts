import { numeroMoedaBrl } from "@/lib/pvh/moeda";
import {
  saldoDisponivelEmpenhoPvh,
  totalAlocadoEmpenhoPvh,
  type EmpenhoComAlocacoesPvh,
} from "@/lib/pvh/empenhos";

export type AnulacaoContabilPvh = {
  valor_anulado: number;
  data_anulacao: string;
  numero_sei: string;
  link_sei: string;
  motivo: string;
  created_at?: string;
};

export const anulacaoDaNePvh = (empenho: {
  pvh_empenho_anulacoes?: AnulacaoContabilPvh | AnulacaoContabilPvh[] | null;
}): AnulacaoContabilPvh | null => {
  const dados = empenho.pvh_empenho_anulacoes;
  return Array.isArray(dados) ? dados[0] ?? null : dados ?? null;
};

export function validarAnulacaoResidualPvh({
  valorInformado,
  saldo,
  data,
  numeroSei,
  linkSei,
  motivo,
  declaracao,
}: {
  valorInformado: string;
  saldo: number;
  data: string;
  numeroSei: string;
  linkSei: string;
  motivo: string;
  declaracao: boolean;
}) {
  const valor = numeroMoedaBrl(valorInformado);
  const erros: string[] = [];
  if (!valorInformado.trim() || !Number.isFinite(valor) ||
      valor <= 0 || Math.abs(Math.round(valor * 100) - valor * 100) > 0.000001 ||
      Math.round(valor * 100) !== Math.round(saldo * 100)) {
    erros.push("O valor do ato contábil deve coincidir exatamente com o saldo residual da NE.");
  }
  const matchData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  const dataInterpretada = matchData ? new Date(data + "T12:00:00") : null;
  if (!matchData || !dataInterpretada ||
      dataInterpretada.getFullYear() !== Number(matchData[1]) ||
      dataInterpretada.getMonth() + 1 !== Number(matchData[2]) ||
      dataInterpretada.getDate() !== Number(matchData[3])) {
    erros.push("Informe uma data válida do ato de anulação.");
  }
  if (!numeroSei.trim()) erros.push("Informe o número SEI do ato contábil.");
  if (!/^https:\/\/[^\s]+$/i.test(linkSei.trim())) {
    erros.push("Informe o link HTTPS completo do documento SEI.");
  }
  if (motivo.trim().length < 15) {
    erros.push("Descreva o motivo contábil em pelo menos 15 caracteres.");
  }
  if (!declaracao) {
    erros.push("Confirme a inexistência de utilização futura do saldo.");
  }
  return { valor, erros };
}

const campoCsv = (valor: unknown) => {
  const texto = String(valor ?? "");
  // Impede que campos informados por pessoas virem fórmulas no Excel.
  const seguro = /^[\s]*[=+@-]/.test(texto) ? "'" + texto : texto;
  return '"' + seguro.replaceAll('"', '""') + '"';
};

export function construirExtratoNePvh(
  empenhos: (EmpenhoComAlocacoesPvh & {
    ano?: number;
    prestadores?: { nome_instituicao?: string | null } | null;
    nota_empenho_sei_numero?: string | null;
    pvh_empenho_anulacoes?: AnulacaoContabilPvh | AnulacaoContabilPvh[] | null;
  })[],
  ano: number,
) {
  const cabecalho = [
    "Exercício","Instituição","NE","SEI da NE","Emitido (R$)",
    "Alocado em todas as competências (R$)","Anulado contabilmente (R$)",
    "Saldo global (R$)","Situação da anulação","Data da anulação",
    "SEI da anulação","Link SEI da anulação","Motivo",
  ];
  const linhas = empenhos
    .filter((e) => e.ano === ano && e.status === "ativo" && Boolean(e.numero_ne))
    .sort((a,b) => String(a.numero_ne).localeCompare(String(b.numero_ne),"pt-BR"))
    .map((e) => {
      const anulacao = anulacaoDaNePvh(e);
      return [
        String(ano),e.prestadores?.nome_instituicao ?? "",e.numero_ne ?? "",
        e.nota_empenho_sei_numero ?? "",
        Number(e.valor_total ?? 0).toFixed(2).replace(".",","),
        totalAlocadoEmpenhoPvh(e).toFixed(2).replace(".",","),
        Number(anulacao?.valor_anulado ?? 0).toFixed(2).replace(".",","),
        saldoDisponivelEmpenhoPvh(e).toFixed(2).replace(".",","),
        anulacao ? "Anulação contabilizada" : "Sem anulação contabilizada",
        anulacao?.data_anulacao ?? "",anulacao?.numero_sei ?? "",
        anulacao?.link_sei ?? "",anulacao?.motivo ?? "",
      ].map(campoCsv).join(";");
    });
  return "\uFEFF" + [cabecalho.map(campoCsv).join(";"), ...linhas].join("\r\n");
}
