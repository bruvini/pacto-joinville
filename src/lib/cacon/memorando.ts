const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const brl = (valor: number | null | undefined) =>
  valor == null
    ? "[valor da produção]"
    : Number(valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

export function dataExtensoCacon(valor?: string | null) {
  if (!valor) return "[data]";
  const [ano, mes, dia] = valor.split("-").map(Number);
  if (!ano || !mes || !dia) return "[data]";
  return `${dia} de ${MESES[mes - 1]} de ${ano}`;
}

export function competenciaExtensoCacon(competencia?: string | null) {
  const [mes, ano] = String(competencia ?? "").split("/");
  const indice = Number(mes) - 1;
  if (indice < 0 || indice > 11 || !ano) return competencia || "[competência]";
  return `${MESES[indice]}/${ano}`;
}

export function gerarTextoMemorandoCacon(c: any) {
  const numeroSms = c?.sms_memorando_numero?.trim?.() || "[Nº SEI do Memorando SMS]";
  const ano = c?.sms_memorando_data?.slice?.(0, 4) || String(c?.competencia ?? "").slice(-4) || "[ano]";
  const numeroSmsCompleto =
    numeroSms.startsWith("[") || numeroSms.includes("/") ? numeroSms : `${numeroSms}/${ano}`;
  const portaria =
    c?.portaria_referencia?.trim?.() || "Portaria SES/SC nº 68, de 29/01/2014";
  const portariaSei = c?.portaria_sei_numero?.trim?.() || "[SEI da Portaria]";
  const memoHmsj = c?.hmsj_memorando_numero?.trim?.() || "[SEI do Memorando HMSJ]";
  const anexo = c?.hmsj_anexo_numero?.trim?.() || "[SEI do Anexo CACON]";
  const data = dataExtensoCacon(c?.sms_memorando_data);
  const competencia = competenciaExtensoCacon(c?.competencia);

  return `MEMORANDO SEI Nº ${numeroSmsCompleto} - SES.UCP.ACP

Joinville, ${data}.

À Gerência Financeira (SES.UFI)

Assunto: Produção Dieta CACON - Hospital Municipal São José de Joinville

Prezada,

Cumprimentando-a cordialmente e consoante a ${portaria} (SEI ${portariaSei}), que prevê o fluxo para apresentação da produção da terapia nutricional ambulatorial, segundo o Termo de Compromisso assumido por cada unidade habilitada, conforme definição do Plano Estadual de Oncologia, e sendo o Hospital Municipal São José referência em Oncologia, compreendendo atendimentos em consultas especializadas e dispensação de Dieta CACON;

Encaminhamos para conhecimento e providências a relação dos pacientes atendidos no Ambulatório de Oncologia do HMSJ, bem como o valor da produção, apresentados nos documentos SEI ${memoHmsj} e ${anexo}.

Estabelecimento: Hospital Municipal São José
Objeto: Dieta CACON
Base Legal: ${portaria}
Competência: ${competencia}
Documento: Memorando SEI SES.UCP.ACP ${numeroSmsCompleto}
Data: ${data}
Valor de Dietas Fornecidas: ${brl(c?.valor_fornecido)}

Atenciosamente,`;
}
