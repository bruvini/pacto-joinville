import { brl } from "@/lib/format";

export type LinhaAnexoMunicipal = {
  cnes: string;
  nome: string;
  total: number;
};

export type DestinatarioMunicipal = {
  nome?: string | null;
  cargo?: string | null;
  unidade?: string | null;
};

export type DadosModeloMunicipal = {
  competencia: string;
  minutaSei?: string | null;
  minutaData?: string | null;
  memorandoSei?: string | null;
  memorandoData?: string | null;
  autoridade?: string | null;
  cargo?: string | null;
  portariaFederal?: string | null;
  portariaFederalData?: string | null;
  consultaInvestsus?: string | null;
  valorHomologado?: number | null;
  valorTransferido?: number | null;
  descontoSaldo?: number | null;
  descontoIdentificacao?: string | null;
  acertoContas?: number | null;
  acertoIdentificacao?: string | null;
  totalPublicado?: number | null;
  linhas: LinhaAnexoMunicipal[];
  destinatarios?: DestinatarioMunicipal[];
};

export function anoCompetencia(competencia: string): string {
  return competencia.split("/")[1] || new Date().getFullYear().toString();
}

export function competenciaExtenso(competencia: string): string {
  const [mes, ano] = competencia.split("/").map(Number);
  if (!mes || !ano) return competencia || "[COMPETÊNCIA]";
  return new Date(ano, mes - 1, 1, 12).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

export function dataExtensoMunicipal(iso?: string | null): string {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function dataBrMunicipal(iso?: string | null): string {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

export function numeroSeiComAno(numero: string | null | undefined, competencia: string): string {
  const valor = String(numero ?? "").trim();
  if (!valor) return "[SEI]";
  return /\/20\d{2}\b/.test(valor) ? valor : `${valor}/${anoCompetencia(competencia)}`;
}

export function rotuloPortariaFederal(numero?: string | null): string {
  const valor = String(numero ?? "").trim();
  if (!valor) return "[PORTARIA GM/MS]";
  if (/portaria/i.test(valor)) return valor;
  if (/gm\/?ms/i.test(valor)) return `Portaria ${valor}`;
  return `Portaria GM/MS nº ${valor}`;
}

export function notaFederalMunicipal(d: DadosModeloMunicipal): string {
  const portaria = rotuloPortariaFederal(d.portariaFederal);
  const dataPortaria = dataExtensoMunicipal(d.portariaFederalData) || "[DATA DA PORTARIA GM/MS]";
  const consulta = dataBrMunicipal(d.consultaInvestsus) || "[DATA DA CONSULTA]";
  let texto =
    `*Os valores foram estabelecidos com base na ${portaria}, de ${dataPortaria}, e na planilha disponibilizada no sistema InvestSUS (consulta em ${consulta}).`;

  const detalhes: string[] = [];
  const desconto = Math.abs(Number(d.descontoSaldo ?? 0));
  const acerto = Number(d.acertoContas ?? 0);

  if (desconto > 0.005) {
    detalhes.push(
      `A referida Portaria registra valor homologado de ${brl(d.valorHomologado)} e valor transferido de ${brl(d.valorTransferido)}, com desconto de saldo em conta de ${brl(desconto)}. Identificação do saldo: ${String(d.descontoIdentificacao || "[IDENTIFICAR O SALDO UTILIZADO]").trim()}.`,
    );
  }
  if (Math.abs(acerto) > 0.005) {
    detalhes.push(
      `Foi considerado acerto de contas de ${brl(acerto)}. Identificação do acerto: ${String(d.acertoIdentificacao || "[IDENTIFICAR O ACERTO DE CONTAS]").trim()}.`,
    );
  }
  if (detalhes.length) texto += `\n\n${detalhes.join(" ")}`;
  return texto;
}

export function gerarMinutaMunicipal(d: DadosModeloMunicipal): string {
  const competencia = competenciaExtenso(d.competencia);
  const minuta = numeroSeiComAno(d.minutaSei, d.competencia);
  const autoridade = String(d.autoridade || "[AUTORIDADE]");
  const cargo = String(d.cargo || "Secretária da Saúde");
  const portaria = rotuloPortariaFederal(d.portariaFederal);
  const dataPortaria = dataExtensoMunicipal(d.portariaFederalData) || "[DATA DA PORTARIA GM/MS]";
  const dataMinuta = dataExtensoMunicipal(d.minutaData) || "[DATA DA MINUTA]";
  const linhas = d.linhas
    .map((x) => `${x.cnes}\t${x.nome}\t${brl(x.total)}`)
    .join("\n");

  return `MINUTA SEI Nº ${minuta} - SES.UCP.ACP

Joinville, ${dataMinuta}.

Dispõe sobre a relação de estabelecimentos elegíveis para o recebimento da assistência financeira complementar destinada ao cumprimento do piso salarial nacional de enfermeiros, técnicos e auxiliares de enfermagem e parteiras, e os respectivos valores destinados a cada um, conforme relatório e cálculo do Ministério da Saúde, referente a ${competencia}.

A ${cargo}, ${autoridade}, em conformidade com a Lei Municipal nº 9.868 de 15 de julho de 2025, e tendo em vista o Título IX-A da Portaria de Consolidação GM/MS nº 6/2017, a ${portaria}, de ${dataPortaria} e a Portaria nº 307/2023/SES,

RESOLVE:

Art. 1º Divulgar a relação de estabelecimentos elegíveis para o recebimento da assistência financeira complementar destinada ao cumprimento do piso salarial nacional de enfermeiros, técnicos e auxiliares de enfermagem e parteiras, e os respectivos valores destinados a cada um, conforme relatório e cálculo extraído do portal do Ministério da Saúde.

§1º Para os fins desta Portaria, consideram-se estabelecimentos elegíveis aqueles que atendem os requisitos estabelecidos no Título IX-A da Portaria de Consolidação GM/MS nº 6/2017 e na Portaria nº 307/2023/SES.

§2º A relação dos estabelecimentos considerados elegíveis consta no Anexo I desta Portaria.

Art. 2º A assistência financeira de que trata esta Portaria refere-se à parcela de ${competencia}, conforme ${portaria}, de ${dataPortaria}.

Art. 3º Esta Portaria entra em vigor na data de sua publicação.

${autoridade}
${cargo}

ANEXO I
CNES\tNOME\t${competencia.toUpperCase()}
${linhas}
TOTAL\t\t${brl(d.totalPublicado)}

${notaFederalMunicipal(d)}`;
}

export function gerarMemorandoMunicipal(d: DadosModeloMunicipal): string {
  const memo = numeroSeiComAno(d.memorandoSei, d.competencia);
  const minuta = numeroSeiComAno(d.minutaSei, d.competencia);
  const dataMemo = dataExtensoMunicipal(d.memorandoData) || "[DATA DO MEMORANDO]";
  const rec = (d.destinatarios ?? []).filter((r) => r.nome || r.cargo || r.unidade);
  const pessoas = rec.length
    ? rec
        .map(
          (r, i) =>
            `${i === 0 ? "À" : "e"} ${r.unidade || "[UNIDADE SEI]"}\n${r.nome || "[DESTINATÁRIO]"}\n${r.cargo || "[CARGO]"}`,
        )
        .join("\n\n")
    : "[DESTINATÁRIOS]";

  return `MEMORANDO SEI Nº ${memo} - SES.UCP.ACP

Joinville, ${dataMemo}.

${pessoas}

Assunto: Publicação de Portaria - Minuta SEI Nº ${minuta} - SES.UCP.ACP.

Prezadas(os),

Conforme estabelecido na Portaria Nº 307/2023/SES, solicita-se a elaboração e publicação de portaria conforme minuta em epígrafe.

Atenciosamente,`;
}
