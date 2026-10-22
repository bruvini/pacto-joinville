import { PISO_ETAPAS, etapasVisiveisPiso, ETAPA_ANULACAO_PISO } from "@/lib/piso/etapas";
import { requerAnulacaoPiso } from "@/lib/piso/anulacao";
import { CACON_ETAPAS } from "@/lib/cacon/etapas";

const DIA = 86_400_000;

export type SlaEtapa = {
  etapa: string;
  media: number | null;
  n: number;
};

export type SlaModulo = {
  id: "convenios" | "piso" | "cacon" | "pvh";
  nome: string;
  etapas: SlaEtapa[];
};

export type SlaSignatario = {
  signatario: string;
  modulo: string;
  media: number;
  n: number;
  /** Separação observada por módulo, conservando a média geral exibida. */
  porModulo?: Array<{ modulo: string; media: number; n: number; cargos?: string[] }>;
};

export type ModuloAtividade = "convenios" | "piso" | "cacon" | "pvh" | "prestacao";

export type AtividadeUsuario = {
  usuario: string;
  total: number;
  convenios: number;
  piso: number;
  cacon: number;
  pvh: number;
  prestacao: number;
};

const objeto = (valor: unknown): Record<string, unknown> =>
  valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};

const instante = (valor: unknown): number | null => {
  if (typeof valor !== "string" || !valor) return null;
  const n = new Date(valor).getTime();
  return Number.isFinite(n) ? n : null;
};

function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((s, valor) => s + valor, 0) / valores.length : null;
}

export function mediaSlaEtapas(etapas: SlaEtapa[]): number | null {
  const ponderada = etapas.filter((etapa) => etapa.media != null && etapa.n > 0);
  const n = ponderada.reduce((s, etapa) => s + etapa.n, 0);
  if (!n) return null;
  return (
    ponderada.reduce((s, etapa) => s + Number(etapa.media) * etapa.n, 0) / n
  );
}

export function calcularSlaPiso(
  competencias: Array<{
    id: string; created_at?: string | null; tipo_parcela?: string | null;
    piso_participantes?: Array<{ piso_obrigacoes?: any[] }>;
  }>,
  logs: Array<{
    piso_competencia_id?: string | null;
    data_hora?: string | null;
    detalhes?: unknown;
  }>,
): SlaEtapa[] {
  const conclusoes = new Map<string, Map<number, number>>();

  [...logs]
    .sort(
      (a, b) =>
        (instante(a.data_hora) ?? Number.MAX_SAFE_INTEGER) -
        (instante(b.data_hora) ?? Number.MAX_SAFE_INTEGER),
    )
    .forEach((log) => {
      if (!log.piso_competencia_id) return;
      const quando = instante(log.data_hora);
      if (quando == null) return;
      const detalhes = objeto(log.detalhes);
      const mudanca = objeto(detalhes.etapas_concluidas);
      const antes = objeto(mudanca.de);
      const depois = objeto(mudanca.para);
      if (!Object.keys(depois).length) return;

      const porEtapa =
        conclusoes.get(log.piso_competencia_id) ?? new Map<number, number>();
      for (const etapa of [...PISO_ETAPAS, ETAPA_ANULACAO_PISO]) {
        const chave = String(etapa.n);
        if (
          depois[chave] === true &&
          antes[chave] !== true &&
          !porEtapa.has(etapa.n)
        ) {
          porEtapa.set(etapa.n, quando);
        }
      }
      conclusoes.set(log.piso_competencia_id, porEtapa);
    });

  const amostras = new Map<number, number[]>(
    [...PISO_ETAPAS, ETAPA_ANULACAO_PISO].map((etapa) => [etapa.n, []] as [number, number[]]),
  );

  for (const competencia of competencias) {
    const criadaEm = instante(competencia.created_at);
    const porEtapa = conclusoes.get(competencia.id);
    if (criadaEm == null || !porEtapa) continue;

    // O Piso não é um stepper linear: a Etapa 5 pode iniciar com a
    // abertura da competência, independentemente da 1→2→3→4.
    // Pagamento (7) e Notificação (8) iniciam após a 6, em paralelo.
    // Para a 13ª, a Etapa 1 não é aplicável; a 2 inicia na criação.
    const anteriores: Record<number, number[]> = {
      1: [], 2: competencia.tipo_parcela === "decimo_terceiro" ? [] : [1],
      3: [2], 4: [3], 5: [], 6: [5], 7: [6], 8: [6],
      10: [7], 9: [4, 7, 8],
    };
    const obr = (competencia.piso_participantes ?? []).flatMap(p=>p.piso_obrigacoes ?? []);
    const exige = requerAnulacaoPiso(obr);
    if(exige){anteriores[8]=[10];anteriores[9]=[4,7,8,10];}
    for (const etapa of etapasVisiveisPiso(competencia.tipo_parcela, exige)) {
      const fim = porEtapa.get(etapa.n);
      if (fim == null) continue;
      const predecessoras = anteriores[etapa.n] ?? [];
      const anterioresConcluidas = predecessoras.map(n => porEtapa.get(n));
      // Sem um marco temporal prévio comprovado, não existe amostra.
      if (anterioresConcluidas.some(t => t == null)) continue;
      const inicio = anterioresConcluidas.length
        ? Math.max(...(anterioresConcluidas as number[]))
        : criadaEm;
      if (fim >= inicio) amostras.get(etapa.n)?.push((fim - inicio) / DIA);
    }
  }

  const temAnulacao = competencias.some(c => requerAnulacaoPiso(
    (c.piso_participantes??[]).flatMap(p=>p.piso_obrigacoes??[])));
  return [...PISO_ETAPAS.slice(0,7),
    ...(temAnulacao ? [ETAPA_ANULACAO_PISO] : []),
    ...PISO_ETAPAS.slice(7)].map((etapa) => {
    const valores = amostras.get(etapa.n) ?? [];
    return {
      etapa: `Etapa ${etapa.n===10?"7A":etapa.n} · ${etapa.titulo}`,
      media: media(valores),
      n: valores.length,
    };
  });
}

export function calcularSlaCacon(
  competencias: Array<{
    id: string;
    created_at?: string | null;
    processado_em?: string | null;
    encaminhado_ses_ufi_em?: string | null;
    extracao?: unknown;
    status?: string | null;
  }>,
  logs: Array<{
    competencia_id: string;
    ocorrido_em?: string | null;
    acao?: string | null;
    detalhes?: unknown;
  }>,
): SlaEtapa[] {
  const camposEtapa1 = new Set([
    "data_recebimento",
    "hmsj_memorando_numero",
    "hmsj_memorando_link",
    "hmsj_anexo_numero",
    "hmsj_anexo_link",
  ]);
  const primeirosCampos = new Map<string, Map<string, number>>();

  [...logs]
    .sort(
      (a, b) =>
        (instante(a.ocorrido_em) ?? Number.MAX_SAFE_INTEGER) -
        (instante(b.ocorrido_em) ?? Number.MAX_SAFE_INTEGER),
    )
    .forEach((log) => {
      const quando = instante(log.ocorrido_em);
      if (quando == null) return;
      const campo = objeto(log.detalhes).campo;
      if (typeof campo !== "string" || !camposEtapa1.has(campo)) return;
      const mapa = primeirosCampos.get(log.competencia_id) ?? new Map<string, number>();
      if (!mapa.has(campo)) mapa.set(campo, quando);
      primeirosCampos.set(log.competencia_id, mapa);
    });

  const amostras = new Map<number, number[]>(
    CACON_ETAPAS.map((etapa) => [etapa.n, []] as [number, number[]]),
  );

  for (const competencia of competencias) {
    const inicio1 = instante(competencia.created_at);
    const campos = primeirosCampos.get(competencia.id);
    const fim1 =
      campos && [...camposEtapa1].every((campo) => campos.has(campo))
        ? Math.max(...[...camposEtapa1].map((campo) => campos.get(campo) as number))
        : null;
    const extracao = objeto(competencia.extracao);
    const fim2 =
      instante(extracao.confirmada_em) ??
      (competencia.status === "concluida" ? instante(competencia.processado_em) : null);
    const fim3 = instante(competencia.encaminhado_ses_ufi_em);

    if (inicio1 != null && fim1 != null && fim1 >= inicio1)
      amostras.get(1)?.push((fim1 - inicio1) / DIA);
    if (fim1 != null && fim2 != null && fim2 >= fim1)
      amostras.get(2)?.push((fim2 - fim1) / DIA);
    if (fim2 != null && fim3 != null && fim3 >= fim2)
      amostras.get(3)?.push((fim3 - fim2) / DIA);
  }

  return CACON_ETAPAS.map((etapa) => {
    const valores = amostras.get(etapa.n) ?? [];
    return {
      etapa: `Etapa ${etapa.n===10?"7A":etapa.n} · ${etapa.titulo}`,
      media: media(valores),
      n: valores.length,
    };
  });
}

type AccAssinatura = {
  soma: number;
  n: number;
  signatario: string;
  modulos: Set<string>;
  porModulo: Map<string, { soma: number; n: number; cargos: Set<string> }>;
};

function chaveSignatario(signatario: string) {
  return signatario
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function acumularAssinatura(
  acc: Map<string, AccAssinatura>,
  modulo: string,
  signatario: string,
  dias: number,
  cargo?: string | null,
) {
  if (!Number.isFinite(dias) || dias < 0) return;

  const nome = signatario.trim().replace(/\s+/g, " ");
  const chave = chaveSignatario(nome);
  const atual = acc.get(chave) ?? {
    soma: 0,
    n: 0,
    signatario: nome,
    modulos: new Set<string>(),
    porModulo: new Map<string, { soma: number; n: number; cargos: Set<string> }>(),
  };

  atual.soma += dias;
  atual.n += 1;
  atual.modulos.add(modulo);
  const parcial = atual.porModulo.get(modulo) ?? { soma: 0, n: 0, cargos: new Set<string>() };
  parcial.soma += dias;
  parcial.n += 1;
  if (cargo?.trim()) parcial.cargos.add(cargo.trim());
  atual.porModulo.set(modulo, parcial);
  acc.set(chave, atual);
}

export function calcularSlaSignatarios({
  lancamentos,
  assinaturasConvenios,
  documentosPiso,
  assinaturasPiso,
  competenciasCacon,
  assinaturasCacon,
  assinaturasPvh = [],
}: {
  lancamentos: Array<{ id: string; created_at?: string | null }>;
  assinaturasConvenios: Array<{
    lancamento_id: string;
    cargo?: string | null;
    servidor_nome?: string | null;
    assinado_em?: string | null;
  }>;
  documentosPiso: Array<{
    id: string;
    competencia_id: string;
    created_at?: string | null;
  }>;
  assinaturasPiso: Array<{
    documento_id: string;
    cargo?: string | null;
    servidor_nome?: string | null;
    assinado_em?: string | null;
  }>;
  competenciasCacon: Array<{
    id: string;
    processado_em?: string | null;
    created_at?: string | null;
  }>;
  assinaturasCacon: Array<{
    competencia_id: string;
    cargo?: string | null;
    servidor_nome?: string | null;
    assinado_em?: string | null;
  }>;
  assinaturasPvh?: Array<{
    competencia_id: string;
    origem_em?: string | null;
    cargo?: string | null;
    servidor_nome?: string | null;
    assinado_em?: string | null;
  }>;
}): SlaSignatario[] {
  const acc = new Map<string, AccAssinatura>();

  const lancPorId = new Map(lancamentos.map((item) => [item.id, item]));
  const convPorLanc = new Map<string, typeof assinaturasConvenios>();
  for (const assinatura of assinaturasConvenios) {
    if (!lancPorId.has(assinatura.lancamento_id)) continue;
    const lista = convPorLanc.get(assinatura.lancamento_id) ?? [];
    lista.push(assinatura);
    convPorLanc.set(assinatura.lancamento_id, lista);
  }
  convPorLanc.forEach((lista, lancamentoId) => {
    let anterior = instante(lancPorId.get(lancamentoId)?.created_at);
    if (anterior == null) return;
    for (const assinatura of [...lista].sort(
      (a, b) => (instante(a.assinado_em) ?? 0) - (instante(b.assinado_em) ?? 0),
    )) {
      const fim = instante(assinatura.assinado_em);
      if (fim == null || fim < anterior ||
          importacaoSqlDocumental(assinatura.servidor_nome) ||
          importacaoSqlDocumental(assinatura.cargo)) continue;
      acumularAssinatura(
        acc,
        "Convênios",
        assinatura.servidor_nome?.trim() || assinatura.cargo?.trim() || "Não identificado",
        (fim - anterior) / DIA,
        assinatura.cargo,
      );
      anterior = fim;
    }
  });

  const docPorId = new Map(documentosPiso.map((item) => [item.id, item]));
  const pisoPorDoc = new Map<string, typeof assinaturasPiso>();
  for (const assinatura of assinaturasPiso) {
    if (!docPorId.has(assinatura.documento_id)) continue;
    const lista = pisoPorDoc.get(assinatura.documento_id) ?? [];
    lista.push(assinatura);
    pisoPorDoc.set(assinatura.documento_id, lista);
  }
  pisoPorDoc.forEach((lista, documentoId) => {
    let anterior = instante(docPorId.get(documentoId)?.created_at);
    if (anterior == null) return;
    for (const assinatura of [...lista].sort(
      (a, b) => (instante(a.assinado_em) ?? 0) - (instante(b.assinado_em) ?? 0),
    )) {
      const fim = instante(assinatura.assinado_em);
      if (fim == null || fim < anterior ||
          importacaoSqlDocumental(assinatura.servidor_nome) ||
          importacaoSqlDocumental(assinatura.cargo)) continue;
      acumularAssinatura(
        acc,
        "Piso",
        assinatura.servidor_nome?.trim() || assinatura.cargo?.trim() || "Não identificado",
        (fim - anterior) / DIA,
        assinatura.cargo,
      );
      anterior = fim;
    }
  });

  const caconPorId = new Map(competenciasCacon.map((item) => [item.id, item]));
  const caconPorComp = new Map<string, typeof assinaturasCacon>();
  for (const assinatura of assinaturasCacon) {
    if (!caconPorId.has(assinatura.competencia_id)) continue;
    const lista = caconPorComp.get(assinatura.competencia_id) ?? [];
    lista.push(assinatura);
    caconPorComp.set(assinatura.competencia_id, lista);
  }
  caconPorComp.forEach((lista, competenciaId) => {
    const competencia = caconPorId.get(competenciaId);
    let anterior = instante(competencia?.processado_em) ?? instante(competencia?.created_at);
    if (anterior == null) return;
    for (const assinatura of [...lista].sort(
      (a, b) => (instante(a.assinado_em) ?? 0) - (instante(b.assinado_em) ?? 0),
    )) {
      const fim = instante(assinatura.assinado_em);
      if (fim == null || fim < anterior ||
          importacaoSqlDocumental(assinatura.servidor_nome) ||
          importacaoSqlDocumental(assinatura.cargo)) continue;
      acumularAssinatura(
        acc,
        "CACON",
        assinatura.servidor_nome?.trim() || assinatura.cargo?.trim() || "Não identificado",
        (fim - anterior) / DIA,
        assinatura.cargo,
      );
      anterior = fim;
    }
  });

  const pvhPorCompetencia = new Map<string, typeof assinaturasPvh>();
  for (const assinatura of assinaturasPvh) {
    const lista = pvhPorCompetencia.get(assinatura.competencia_id) ?? [];
    lista.push(assinatura);
    pvhPorCompetencia.set(assinatura.competencia_id, lista);
  }
  pvhPorCompetencia.forEach((lista) => {
    let anterior = Math.min(
      ...lista
        .map((a) => instante(a.origem_em))
        .filter((v): v is number => v != null),
    );
    if (!Number.isFinite(anterior)) return;
    for (const assinatura of [...lista].sort(
      (a, b) => (instante(a.assinado_em) ?? 0) - (instante(b.assinado_em) ?? 0),
    )) {
      const fim = instante(assinatura.assinado_em);
      if (fim == null || fim < anterior ||
          importacaoSqlDocumental(assinatura.servidor_nome) ||
          importacaoSqlDocumental(assinatura.cargo)) continue;
      acumularAssinatura(
        acc,
        "PVH",
        assinatura.servidor_nome?.trim() || assinatura.cargo?.trim() || "Não identificado",
        (fim - anterior) / DIA,
        assinatura.cargo,
      );
      anterior = fim;
    }
  });

  return [...acc.values()]
    .map((valor) => ({
      modulo: [...valor.modulos].sort().join(" · "),
      signatario: valor.signatario,
      media: valor.n ? valor.soma / valor.n : 0,
      n: valor.n,
      porModulo: [...valor.porModulo.entries()]
        .map(([modulo, amostras]) => ({
          modulo, media: amostras.soma / amostras.n, n: amostras.n,
          cargos: [...amostras.cargos].sort((a, b) => a.localeCompare(b, "pt-BR")),
        }))
        .sort((a, b) => a.modulo.localeCompare(b.modulo, "pt-BR")),
    }))
    .sort((a, b) => b.media - a.media || a.signatario.localeCompare(b.signatario, "pt-BR"));
}

/**
 * Marcador de proveniência de registros migrados por SQL, não de ações humanas.
 * Pode aparecer como "usuário" ou no texto da ação. Nunca contabilizar como
 * produtividade nem atribuir esse evento a um servidor no gráfico de atividade.
 */
function importacaoSqlDocumental(valor: string | null | undefined): boolean {
  const normalizado = String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
  return /importacao\s+sql\s+documental|nao\s+representa\s+assinatura\s+de\s+servidor/.test(normalizado);
}

export function usuarioHumano(nome: string | null | undefined): string | null {
  const limpo = nome?.trim();
  if (!limpo) return null;
  if (/^sistema(?:\b|\s|—|-)/i.test(limpo)) return null;
  if (/^(service[_ -]?role|supabase)$/i.test(limpo)) return null;
  if (importacaoSqlDocumental(limpo)) return null;
  return limpo;
}

function moduloHistorico(acao: string, pisoCompetenciaId?: string | null): ModuloAtividade {
  if (pisoCompetenciaId) return "piso";
  return /presta[cç][aã]o|prestacao/i.test(acao) ? "prestacao" : "convenios";
}

export function calcularAtividadeUsuarios({
  historico,
  caconLogs,
  idsLancamentos,
  idsPiso,
  idsCacon,
  idsPvh,
}: {
  historico: Array<{
    usuario_nome?: string | null;
    acao?: string | null;
    lancamento_id?: string | null;
    piso_competencia_id?: string | null;
    pvh_competencia_id?: string | null;
  }>;
  caconLogs: Array<{
    usuario_nome?: string | null;
    competencia_id: string;
  }>;
  idsLancamentos: Set<string>;
  idsPiso: Set<string>;
  idsCacon: Set<string>;
  idsPvh: Set<string>;
}): AtividadeUsuario[] {
  const mapa = new Map<string, Omit<AtividadeUsuario, "usuario" | "total">>();

  const registrar = (nome: string | null | undefined, modulo: ModuloAtividade) => {
    const usuario = usuarioHumano(nome);
    if (!usuario) return;
    const atual = mapa.get(usuario) ?? { convenios: 0, piso: 0, cacon: 0, pvh: 0, prestacao: 0 };
    atual[modulo] += 1;
    mapa.set(usuario, atual);
  };

  for (const log of historico) {
    // Os históricos documentais legados não representam ação realizada por servidor.
    if (importacaoSqlDocumental(log.usuario_nome) || importacaoSqlDocumental(log.acao)) continue;
    if (log.pvh_competencia_id) {
      if (!idsPvh.has(log.pvh_competencia_id)) continue;
      registrar(log.usuario_nome, "pvh");
      continue;
    }
    if (log.piso_competencia_id) {
      if (!idsPiso.has(log.piso_competencia_id)) continue;
    } else if (log.lancamento_id) {
      if (!idsLancamentos.has(log.lancamento_id)) continue;
    } else {
      continue;
    }
    registrar(log.usuario_nome, moduloHistorico(log.acao ?? "", log.piso_competencia_id));
  }

  for (const log of caconLogs) {
    if (!idsCacon.has(log.competencia_id)) continue;
    registrar(log.usuario_nome, "cacon");
  }

  return [...mapa.entries()]
    .map(([usuario, contagens]) => ({
      usuario,
      total:
        contagens.convenios + contagens.piso + contagens.cacon + contagens.pvh + contagens.prestacao,
      ...contagens,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);
}
