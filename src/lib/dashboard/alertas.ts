import { emAtraso, vencendoEmBreve } from "@/lib/etapa";
import { pagamentoLiberado, situacaoPrestacao } from "@/lib/prestacao";
import { anulacoesSemRastreabilidadeSei } from "@/lib/anulacoes";
import { lancamentoAcimaTeto } from "@/lib/lancamentos/limites";
import type { PendenciaCompetenciaCacon } from "@/lib/cacon/prazos";

export type SeveridadeAcao = "critico" | "alerta" | "preventivo";
export type ModuloAcao = "CONV" | "PC" | "PISO" | "CACON" | "SEI";

export type AcaoNecessaria = {
  id: string;
  n: number;
  label: string;
  acao: string;
  to: string;
  search?: Record<string, unknown>;
  hash?: string;
  severidade: SeveridadeAcao;
  modulo: ModuloAcao;
  prioridade: number;
};

type Params = {
  lancamentos: any[];
  lancamentosTodos?: any[];
  convenios: any[];
  convById: Record<string, any>;
  termos: any[];
  prestacoes: any[];
  pisoCompetencias: any[];
  caconCompetencias: any[];
  aberturasPendentes: any[];
  caconPendenciasMensais?: PendenciaCompetenciaCacon[];
  urgenciasPrazoProximas?: number;
  hoje?: Date;
};

const dataLocal = (valor: unknown): Date | null => {
  if (!valor) return null;
  const texto = String(valor).slice(0, 10);
  const [ano, mes, dia] = texto.split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
};

const soData = (data: Date) =>
  new Date(data.getFullYear(), data.getMonth(), data.getDate());

const diasAte = (de: Date, ate: Date) =>
  Math.floor((soData(ate).getTime() - soData(de).getTime()) / 86_400_000);

const somarDias = (data: Date, dias: number) => {
  const out = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  out.setDate(out.getDate() + dias);
  return out;
};

const objeto = (valor: unknown): Record<string, any> =>
  valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, any>)
    : {};

const etapaPisoConcluida = (competencia: any, etapa: number) =>
  objeto(competencia?.etapas_concluidas)[String(etapa)] === true;

function fimVigenciaEfetiva(convenio: any, termos: any[]): Date | null {
  const candidatos: Date[] = [];

  const inicio = dataLocal(convenio?.data_inicio_vigencia);
  const parcelas = Number(convenio?.total_parcelas ?? 0);
  if (inicio && parcelas > 0) {
    const fimBase = new Date(inicio);
    fimBase.setMonth(fimBase.getMonth() + parcelas);
    candidatos.push(fimBase);
  }

  termos
    .filter((termo) => termo.convenio_id === convenio?.id)
    .forEach((termo) => {
      const fim = dataLocal(termo.vigencia_fim);
      if (fim) candidatos.push(fim);
    });

  if (!candidatos.length) return null;
  return candidatos.sort((a, b) => b.getTime() - a.getTime())[0];
}

function prazoRetorno(
  inicio: unknown,
  fim: unknown,
  prazoDias: unknown,
  hoje: Date,
): { pendente: boolean; dias: number | null } {
  if (fim) return { pendente: false, dias: null };
  const dataInicio = dataLocal(inicio);
  const prazo = Number(prazoDias ?? 0);
  if (!dataInicio || prazo <= 0) return { pendente: false, dias: null };
  const limite = somarDias(dataInicio, prazo);
  return { pendente: true, dias: diasAte(hoje, limite) };
}

const item = (
  id: string,
  n: number,
  label: string,
  acao: string,
  to: string,
  severidade: SeveridadeAcao,
  modulo: ModuloAcao,
  prioridade: number,
  search?: Record<string, unknown>,
  hash?: string,
): AcaoNecessaria | null =>
  n > 0
    ? { id, n, label, acao, to, severidade, modulo, prioridade, search, hash }
    : null;

/**
 * Catálogo único da faixa "Ação necessária".
 *
 * Princípios:
 * - só entra sinal com providência objetiva;
 * - severidade separa ruptura, risco próximo e prevenção;
 * - alertas históricos sem ação operacional são evitados quando possível;
 * - regras de qualidade/rastreabilidade permanecem quando a correção ainda é possível.
 */
export function gerarAcoesNecessarias({
  lancamentos,
  lancamentosTodos,
  convenios,
  convById,
  termos,
  prestacoes,
  pisoCompetencias,
  caconCompetencias,
  aberturasPendentes,
  caconPendenciasMensais = [],
  urgenciasPrazoProximas,
  hoje = new Date(),
}: Params): AcaoNecessaria[] {
  const termosPorId = new Map(termos.map((termo) => [termo.id, termo]));
  const baseCompleta = lancamentosTodos ?? lancamentos;
  const pcPorLancamento = new Map(
    prestacoes.map((prestacao) => [prestacao.lancamento_id, prestacao]),
  );

  const atrasados = lancamentos.filter((lancamento) =>
    emAtraso(lancamento, convById[lancamento.convenio_id], hoje),
  );
  const vencendo = lancamentos.filter((lancamento) =>
    vencendoEmBreve(lancamento, convById[lancamento.convenio_id], hoje),
  );

  const anulacoesSemSei = anulacoesSemRastreabilidadeSei(baseCompleta);

  const processosAcimaTetoIds: string[] = [];
  const processosRaiz = baseCompleta.filter((item) => !item.parent_id);
  for (const processo of processosRaiz) {
    const filhos = baseCompleta.filter((item) => item.parent_id === processo.id);
    const unidades = filhos.length > 0 ? filhos : [processo];
    if (
      unidades.some(
        (unidade) =>
          !unidade.concluido &&
          lancamentoAcimaTeto(
            unidade,
            convById[unidade.convenio_id],
            termosPorId,
          ),
      )
    ) {
      processosAcimaTetoIds.push(processo.id);
    }
  }
  let prestacaoAtrasada = 0;
  let prestacaoVencendo = 0;
  let prestacaoReprovada = 0;
  let retornoExternoAtrasado = 0;
  let retornoExternoVencendo = 0;

  for (const lancamento of lancamentos) {
    const convenio = convById[lancamento.convenio_id];

    if (!pagamentoLiberado(lancamento) || convenio?.exige_prestacao_contas === false)
      continue;

    const pc = pcPorLancamento.get(lancamento.id) ?? null;
    const situacao = situacaoPrestacao(lancamento, convenio, pc, hoje);
    const status = pc?.status ?? "aguardando";

    if (situacao.nivel === "grave" && status !== "reprovada")
      prestacaoAtrasada += 1;
    if (situacao.nivel === "alerta") prestacaoVencendo += 1;
    if (status === "reprovada") prestacaoReprovada += 1;

    if (pc && status !== "aprovada") {
      const entidade = prazoRetorno(
        pc.data_envio_entidade,
        pc.data_retorno_entidade,
        convenio?.prazo_retorno_entidade_dias,
        hoje,
      );
      const cgm = prazoRetorno(
        pc.data_enc_cgm,
        pc.data_retorno_cgm,
        convenio?.prazo_retorno_cgm_dias,
        hoje,
      );

      for (const retorno of [entidade, cgm]) {
        if (!retorno.pendente || retorno.dias == null) continue;
        if (retorno.dias < 0) retornoExternoAtrasado += 1;
        else if (retorno.dias <= 3) retornoExternoVencendo += 1;
      }
    }
  }

  let vigenciaExpiradaAtiva = 0;
  let vigenciaSeteDias = 0;
  let pcSemPrazo = 0;

  for (const convenio of convenios) {
    if (convenio?.status_convenio !== "ativo") continue;

    if (
      convenio.exige_prestacao_contas !== false &&
      Number(convenio.prazo_prestacao_contas_dias ?? 0) <= 0
    ) {
      pcSemPrazo += 1;
    }

    const fim = fimVigenciaEfetiva(convenio, termos);
    if (!fim) continue;
    const dias = diasAte(hoje, fim);
    if (dias < 0) vigenciaExpiradaAtiva += 1;
    else if (dias <= 7) vigenciaSeteDias += 1;
  }

  const pisoReconferir = pisoCompetencias.filter(
    (competencia) => (competencia.etapas_reconferir?.length ?? 0) > 0,
  ).length;

  const pisoComunicacaoPendente = pisoCompetencias.filter(
    (competencia) =>
      competencia.status !== "encerrada" &&
      etapaPisoConcluida(competencia, 7) &&
      !etapaPisoConcluida(competencia, 8),
  ).length;

  let caconCritica = 0;
  let caconManual = 0;
  let caconConfirmacao = 0;

  for (const competencia of caconCompetencias) {
    if (competencia.status === "concluida") continue;
    const auditoria = objeto(competencia.auditoria);
    const extracao = objeto(competencia.extracao);
    const criticas = Number(auditoria.criticas ?? 0);

    if (criticas > 0) {
      caconCritica += 1;
      continue;
    }
    if (extracao.status === "requer_preenchimento_manual") {
      caconManual += 1;
      continue;
    }
    if (
      competencia.processado_em &&
      !extracao.confirmada_em &&
      extracao.status !== "confirmada"
    ) {
      caconConfirmacao += 1;
    }
  }

  const caconSemRegistroVencido = caconPendenciasMensais.filter(
    (pendencia) => pendencia.severidade === "critico",
  ).length;
  const caconParaAbrir = caconPendenciasMensais.filter(
    (pendencia) => pendencia.severidade !== "critico",
  ).length;
  const proximosPrazo =
    urgenciasPrazoProximas == null ? vencendo.length : urgenciasPrazoProximas;

  const itens: Array<AcaoNecessaria | null> = [
    item(
      "processos-atrasados",
      atrasados.length,
      "processo(s) com prazo operacional estourado",
      "regularizar a etapa vencida",
      "/lancamentos",
      "critico",
      "CONV",
      100,
      { status: "atrasados" },
    ),
    item(
      "prestacoes-atrasadas",
      prestacaoAtrasada,
      "prestação(ões) de contas vencida(s)",
      "cobrar/registrar a entrega",
      "/prestacao-contas",
      "critico",
      "PC",
      98,
    ),
    item(
      "cacon-critica",
      caconCritica,
      "competência(s) CACON com crítica bloqueante",
      "corrigir a auditoria",
      "/cacon",
      "critico",
      "CACON",
      97,
    ),
    item(
      "cacon-manual",
      caconManual,
      "competência(s) CACON sem extração confiável",
      "preencher e confirmar manualmente",
      "/cacon",
      "critico",
      "CACON",
      96,
    ),
    item(
      "cacon-sem-registro-vencido",
      caconSemRegistroVencido,
      "competência(s) CACON encerrada(s) sem registro",
      "regularizar a competência mensal",
      "/cacon",
      "critico",
      "CACON",
      95,
    ),
    item(
      "vigencia-expirada",
      vigenciaExpiradaAtiva,
      "instrumento(s) com vigência expirada ainda ativo(s)",
      "encerrar, prorrogar ou revisar cadastro",
      "/convenios",
      "critico",
      "CONV",
      95,
    ),
    item(
      "acima-teto",
      processosAcimaTetoIds.length,
      "processo(s) com solicitação acima do teto mensal",
      "revisar valor ou instrumento vigente",
      "/lancamentos",
      "critico",
      "CONV",
      94,
      {
        status: "acima-teto",
        ids: processosAcimaTetoIds.join(","),
      },
    ),
    item(
      "retorno-externo-atrasado",
      retornoExternoAtrasado,
      "retorno(s) de entidade/CGM fora do prazo",
      "cobrar e registrar providência",
      "/prestacao-contas",
      "critico",
      "PC",
      92,
    ),
    item(
      "prestacao-reprovada",
      prestacaoReprovada,
      "prestação(ões) reprovada(s) com pendência",
      "tratar a pendência e definir desfecho",
      "/prestacao-contas",
      "critico",
      "PC",
      90,
    ),
    item(
      "anulacao-sem-sei",
      anulacoesSemSei.length,
      "anulação(ões) sem rastreabilidade SEI",
      "registrar link do documento",
      "/auditoria",
      "alerta",
      "SEI",
      86,
      {
        situacao: "sem_link",
        ids: anulacoesSemSei.map((item) => item.id).join(","),
      },
    ),
    item(
      "vigencia-7",
      vigenciaSeteDias,
      "instrumento(s) vencendo em até 7 dias",
      "iniciar renovação, aditivo ou encerramento",
      "/convenios",
      "alerta",
      "CONV",
      84,
    ),
    item(
      "piso-reconferir",
      pisoReconferir,
      "competência(s) do Piso para reconferir",
      "resolver a etapa marcada",
      "/piso",
      "alerta",
      "PISO",
      82,
    ),
    item(
      "piso-comunicacao",
      pisoComunicacaoPendente,
      "competência(s) do Piso paga(s) sem comunicação concluída",
      "finalizar notificação por e-mail/SEI",
      "/piso",
      "alerta",
      "PISO",
      80,
    ),
    item(
      "cacon-confirmacao",
      caconConfirmacao,
      "competência(s) CACON aguardando conferência humana",
      "validar os dados extraídos",
      "/cacon",
      "alerta",
      "CACON",
      78,
    ),
    item(
      "cacon-competencia-abrir",
      caconParaAbrir,
      "competência(s) CACON para abrir no mês",
      "registrar antes do fechamento da competência",
      "/cacon",
      "alerta",
      "CACON",
      77,
    ),
    item(
      "processos-vencendo",
      proximosPrazo,
      "item(ns) próximo(s) do prazo / atenção",
      "consultar o Aging consolidado",
      "/dashboard",
      "alerta",
      "CONV",
      76,
      undefined,
      "urgencias-aging",
    ),
    item(
      "prestacoes-vencendo",
      prestacaoVencendo,
      "prestação(ões) vencendo em até 7 dias",
      "cobrar entrega preventivamente",
      "/prestacao-contas",
      "alerta",
      "PC",
      74,
    ),
    item(
      "retorno-externo-vencendo",
      retornoExternoVencendo,
      "retorno(s) de entidade/CGM vencendo em até 3 dias",
      "acompanhar antes do estouro",
      "/prestacao-contas",
      "alerta",
      "PC",
      72,
    ),
    item(
      "competencias-abrir",
      aberturasPendentes.length,
      "competência(s) no ponto de abertura",
      "abrir o processo e iniciar preparação",
      "/lancamentos",
      "preventivo",
      "CONV",
      60,
    ),
    item(
      "pc-sem-prazo",
      pcSemPrazo,
      "convênio(s) com prestação de contas sem prazo cadastrado",
      "definir o prazo do instrumento",
      "/convenios",
      "preventivo",
      "PC",
      46,
    ),
  ];

  const pesoSeveridade: Record<SeveridadeAcao, number> = {
    critico: 3,
    alerta: 2,
    preventivo: 1,
  };

  return itens
    .filter((alerta): alerta is AcaoNecessaria => Boolean(alerta))
    .sort(
      (a, b) =>
        pesoSeveridade[b.severidade] - pesoSeveridade[a.severidade] ||
        b.prioridade - a.prioridade ||
        b.n - a.n ||
        a.label.localeCompare(b.label),
    );
}
