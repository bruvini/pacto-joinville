import { competenciaExtenso } from "./municipal";

export function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase();
}

export function emailValido(valor: string | null | undefined): boolean {
  if (!valor) return false;
  const email = normalizarEmail(valor);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function capitalizarPrimeira(valor: string): string {
  return valor ? valor.charAt(0).toLocaleUpperCase("pt-BR") + valor.slice(1) : valor;
}

export function montarNotificacaoPiso(competencia: string, usuarioNome: string) {
  const competenciaPorExtenso = competenciaExtenso(competencia);
  const competenciaTitulo = capitalizarPrimeira(competenciaPorExtenso);
  const assinatura = usuarioNome.trim() || "[Usuário logado]";

  return {
    assunto: `Piso de Enfermagem - ${competenciaTitulo}`,
    corpo: `Bom dia,

Encaminhamos a programação de repasse referente à competência de ${competenciaPorExtenso} do recurso relativo ao Piso da Enfermagem, em consonância com as Portarias mensais e demais documentos.

Seguem em anexo:
- Portaria mensal;
- Notas de empenho;
- Avisos de movimentos - Subempenho

Favor confirmar o recebimento.

Atenciosamente,

${assinatura}
Área de Convênios e Parcerias
Secretaria Municipal de Saúde de Joinville`,
  };
}
