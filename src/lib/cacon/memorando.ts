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

const esc = (v: unknown) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

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

function dadosMemorando(c: any) {
  const numeroSms = c?.sms_memorando_numero?.trim?.() || "[Nº SEI do Memorando SMS]";
  const ano =
    c?.sms_memorando_data?.slice?.(0, 4) ||
    String(c?.competencia ?? "").slice(-4) ||
    "[ano]";
  const numeroSmsCompleto =
    numeroSms.startsWith("[") || numeroSms.includes("/") ? numeroSms : `${numeroSms}/${ano}`;
  return {
    numeroSmsCompleto,
    ano,
    portaria:
      c?.portaria_referencia?.trim?.() || "Portaria SES/SC nº 68, de 29/01/2014",
    portariaSei: c?.portaria_sei_numero?.trim?.() || "[SEI da Portaria]",
    memoHmsj: c?.hmsj_memorando_numero?.trim?.() || "[SEI do Memorando HMSJ]",
    anexo: c?.hmsj_anexo_numero?.trim?.() || "[SEI do Anexo CACON]",
    data: dataExtensoCacon(c?.sms_memorando_data),
    competencia: competenciaExtensoCacon(c?.competencia),
    valor: brl(c?.valor_fornecido),
  };
}

export function gerarTextoMemorandoCacon(c: any) {
  const d = dadosMemorando(c);
  return `MEMORANDO SEI Nº ${d.numeroSmsCompleto} - SES.UCP.ACP

Joinville, ${d.data}.

À Gerência Financeira (SES.UFI)

Assunto: Produção Dieta CACON - Hospital Municipal São José de Joinville

Prezada,

Cumprimentando-a cordialmente e consoante a ${d.portaria} (SEI ${d.portariaSei}), que prevê o fluxo para apresentação da produção da terapia nutricional ambulatorial, segundo o Termo de Compromisso assumido por cada unidade habilitada, conforme definição do Plano Estadual de Oncologia, e sendo o Hospital Municipal São José referência em Oncologia, compreendendo atendimentos em consultas especializadas e dispensação de Dieta CACON;

Encaminhamos para conhecimento e providências a relação dos pacientes atendidos no Ambulatório de Oncologia do HMSJ, bem como o valor da produção, apresentados no Memorando SEI Nº ${d.memoHmsj}/${d.ano} - HMSJ.SUP.NUT e no Relatório de Dietas fornecidas pelo Serviço de Terapia Nutricional no Ambulatório de Oncologia (${d.anexo}).

Estabelecimento: Hospital Municipal São José
Objeto: Dieta CACON
Base Legal: ${d.portaria}
Competência: ${d.competencia}

Documento | Data | Período do objeto | Valor de Dietas Fornecidas
Memorando SEI SES.UCP.ACP ${d.numeroSmsCompleto} | ${d.data} | ${d.competencia} | ${d.valor}

Atenciosamente,`;
}

export function gerarHtmlMemorandoCacon(c: any) {
  const d = dadosMemorando(c);
  const memoHmsjCompleto = d.memoHmsj.includes("/") ? d.memoHmsj : `${d.memoHmsj}/${d.ano}`;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827">
      <p style="text-align:center;font-family:Georgia,'Times New Roman',serif;font-weight:700;margin:0 0 28px">
        MEMORANDO SEI Nº ${esc(d.numeroSmsCompleto)} - SES.UCP.ACP
      </p>

      <p style="text-align:right;margin:0 0 26px">Joinville, ${esc(d.data)}.</p>

      <p style="margin:0 0 18px"><strong>À Gerência Financeira (SES.UFI)</strong></p>

      <p style="margin:0 0 22px"><strong>Assunto:</strong> Produção Dieta CACON - Hospital Municipal São José de Joinville</p>

      <p style="margin:0 0 18px">Prezada,</p>

      <p style="margin:0 0 16px;text-align:justify;text-indent:28px">
        Cumprimentando-a cordialmente e consoante a ${esc(d.portaria)}
        (SEI ${esc(d.portariaSei)}), que prevê o fluxo para apresentação da produção da terapia
        nutricional ambulatorial, segundo o Termo de Compromisso assumido por cada unidade habilitada,
        conforme definição do Plano Estadual de Oncologia, e sendo o Hospital Municipal São José
        referência em Oncologia, compreendendo atendimentos em consultas especializadas e dispensação
        de Dieta CACON;
      </p>

      <p style="margin:0 0 22px;text-align:justify;text-indent:28px">
        Encaminhamos para conhecimento e providências a relação dos pacientes atendidos no Ambulatório
        de Oncologia do HMSJ, bem como o valor da produção, apresentados no Memorando SEI Nº
        ${esc(memoHmsjCompleto)} - HMSJ.SUP.NUT e no Relatório de Dietas fornecidas pelo Serviço de
        Terapia Nutricional no Ambulatório de Oncologia (${esc(d.anexo)}).
      </p>

      <table style="width:100%;border-collapse:collapse;font-family:Georgia,'Times New Roman',serif;font-size:13px;margin:12px 0 28px">
        <tbody>
          <tr>
            <td colspan="4" style="border:1px solid #111;padding:5px 7px"><strong>Estabelecimento:</strong> Hospital Municipal São José</td>
          </tr>
          <tr>
            <td colspan="4" style="border:1px solid #111;padding:5px 7px"><strong>Objeto:</strong> Dieta CACON</td>
          </tr>
          <tr>
            <td colspan="4" style="border:1px solid #111;padding:5px 7px"><strong>Base Legal:</strong> ${esc(d.portaria)}</td>
          </tr>
          <tr>
            <td colspan="4" style="border:1px solid #111;padding:5px 7px"><strong>Competência:</strong> ${esc(d.competencia)}</td>
          </tr>
          <tr>
            <th style="border:1px solid #111;padding:5px 7px;text-align:center">Documento</th>
            <th style="border:1px solid #111;padding:5px 7px;text-align:center">Data</th>
            <th style="border:1px solid #111;padding:5px 7px;text-align:center">Período do objeto</th>
            <th style="border:1px solid #111;padding:5px 7px;text-align:center">Valor de Dietas Fornecidas</th>
          </tr>
          <tr>
            <td style="border:1px solid #111;padding:5px 7px;text-align:center">Memorando SEI SES.UCP.ACP ${esc(d.numeroSmsCompleto)}</td>
            <td style="border:1px solid #111;padding:5px 7px;text-align:center">${esc(d.data)}</td>
            <td style="border:1px solid #111;padding:5px 7px;text-align:center">${esc(d.competencia)}</td>
            <td style="border:1px solid #111;padding:5px 7px;text-align:center">${esc(d.valor)}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin-top:30px">Atenciosamente,</p>
    </div>
  `;
}
