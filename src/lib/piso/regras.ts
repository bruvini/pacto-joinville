import { memorandoEncaminhadoParaDestinatarios, unidadesDestinatariasMemorando } from "./encaminhamento-memorando";
import { assinaturasAnulacaoCompletas, envioAnulacaoConfirmado } from "./anulacao-envio";
import type { ConciliacaoAfcFms } from "./conciliacao-afc";
import { linkValido } from "@/lib/sei";
import { INVESTSUS_AUDIT_RULES_VERSION } from "./investsus";
import { emailValido } from "./notificacao-email";
import { requerAnulacaoPiso, saldosAnulacaoPiso, programacaoPagamentoProntaPiso } from "./anulacao";
import { modoSubempenhoExplicito, valorLiquidadoNe, obrigacaoRequerPagamento, totalSubempenhado, type SubempenhoAloc } from "./alocacao";

/** Regras puras do módulo Piso da Enfermagem (validações de etapa e conciliação). */

/** Mantém compatibilidade com a Informação SEI textual das competências anteriores. */
export function numeroSeiCreditoPiso(c: { credito_fms_numero_sei?: string | null; credito_fms_referencia?: string | null }): string {
  return c.credito_fms_numero_sei?.trim() ||
    c.credito_fms_referencia?.match(/\bSEI\s*(?:N[º°o.]\s*)?(\d{5,})/i)?.[1] || "";
}

export const centavos = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);
export const iguaisCentavo = (a: number | null | undefined, b: number | null | undefined) =>
  centavos(a) === centavos(b);
export const dentroTolerancia = (
  a: number | null | undefined,
  b: number | null | undefined,
  tolerancia = 0.02,
) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) <= tolerancia;
export const soma = (xs: (number | null | undefined)[]) =>
  xs.reduce<number>((t, x) => t + centavos(x), 0) / 100;

export const transferenciaFederalEsperada = (
  homologado: number | null | undefined,
  desconto: number | null | undefined,
  acerto: number | null | undefined,
) => Math.max(Number(homologado ?? 0) - Number(desconto ?? 0), 0) + Number(acerto ?? 0);

/** URL do DOU: https + domínio in.gov.br + caminho /web/dou/. */
export function urlDouValida(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const url = new URL(u.trim());
    return (
      url.protocol === "https:" &&
      /(^|\.)in\.gov\.br$/i.test(url.hostname) &&
      url.pathname.includes("/web/dou/")
    );
  } catch {
    return false;
  }
}

export type MatrizSlot = { tipo_documento: string; slot_key: string; opcional: boolean };
export type Doc = {
  id: string;
  tipo: string;
  participante_id: string | null;
  obrigacao_id: string | null;
  subempenho_id?: string | null;
  numero?: string | null;
  numero_sei: string | null;
  link_sei: string | null;
  data_documento?: string | null;
  dados?: Record<string, unknown>;
};
export type Assin = { documento_id: string; slot: string; assinado_em?: string | null };
export type Enc = { documento_id: string; acao: string; ocorrido_em: string; destino?: string | null };

export interface CtxPiso {
  comp: any;
  parts: any[];
  obrigs: any[];
  subempenhos?: SubempenhoAloc[];
  docs: Doc[];
  assinaturas: Assin[];
  matriz: MatrizSlot[];
  encaminhamentos: Enc[];
  arquivos?: any[];
  ocorrencias?: any[];
  cnes?: any[];
  emailsPrestador?: any[];
  notificacoesEmail?: any[];
  conciliacaoAfc?: (ConciliacaoAfcFms & { piso_afc_contas_fms?: any }) | null;
  afcHabilitada?: boolean;
  notasCompartilhadas?: Array<any>;
  reservasAfc?: Array<{ conta_id: string | null; competencia_id: string; valor_reservado: number; situacao: string }>;
}

export function acharDoc(
  docs: Doc[],
  tipo: string,
  escopo: { participante_id?: string | null; obrigacao_id?: string | null; subempenho_id?: string | null } = {},
) {
  return docs.find(
    (d) =>
      d.tipo === tipo &&
      (d.participante_id ?? null) === (escopo.participante_id ?? null) &&
      (d.obrigacao_id ?? null) === (escopo.obrigacao_id ?? null) &&
      (d.subempenho_id ?? null) === (escopo.subempenho_id ?? null),
  );
}

/** Documento completo = possui nº SEI ou link e todas as assinaturas obrigatórias da matriz. */
export function docCompleto(
  ctx: Pick<CtxPiso, "matriz" | "assinaturas">,
  doc: Doc | undefined,
): boolean {
  if (
    !doc ||
    !doc.numero_sei?.trim() ||
    !linkValido(doc.link_sei) ||
    !doc.data_documento
  )
    return false;
  if (doc.tipo === "nota_empenho" && !/^\d{1,8}\/\d{4}$/.test(String(doc.numero ?? "").trim()))
    return false;
  return ctx.matriz
    .filter((m) => m.tipo_documento === doc.tipo && !m.opcional)
    .every((m) => ctx.assinaturas.some((a) => a.documento_id === doc.id && a.slot === m.slot_key));
}

export function encaminhado(encs: Enc[], docId: string | undefined): boolean {
  if (!docId) return false;
  const ult = encs
    .filter((e) => e.documento_id === docId)
    .sort((a, b) => a.ocorrido_em.localeCompare(b.ocorrido_em))
    .at(-1);
  return ult?.acao === "encaminhado";
}

export const elegiveis = (parts: any[]) => parts.filter((p) => !p.sem_elegiveis);

export const DOC_LABEL: Record<string, string> = {
  minuta: "Minuta da Portaria",
  memorando: "Memorando",
  portaria_municipal: "Portaria municipal publicada",
  solicitacao_ne: "Solicitação de Nota de Empenho",
  nota_empenho: "Nota de Empenho",
  solicitacao_liquidacao: "Solicitação de Subempenho / Liquidação",
  aviso_liquidacao: "Aviso de Movimento - Empenho em Liquidação",
  aviso_subempenho: "Aviso de Movimento - Subempenho",
  programacao_pagamento: "Programação de pagamento",
  comprovante_pagamento: "Comprovante de pagamento",
  solicitacao_anulacao: "Solicitação de anulação de empenho",
  aviso_anulacao: "Aviso de Movimento — Anulação",
};

/** Lista de pendências que impedem concluir a etapa n. */
export function pendenciasEtapa(n: number, ctx: CtxPiso): string[] {
  const { comp: c, parts, obrigs, docs } = ctx;
  const p: string[] = [];
  const eleg = elegiveis(parts);
  const nome = (pid: string) =>
    parts.find((x) => x.id === pid)?.prestadores?.nome_instituicao ?? "Instituição";
  switch (n) {
    case 1: {
      if (parts.length === 0) p.push("Inclua ao menos uma instituição.");
      const cnesCadastrados = ctx.cnes ?? [];
      for (const x of parts) {
        const temCnes = cnesCadastrados.some(
          (item) => item.prestador_id === x.prestador_id && String(item.cnes ?? "").trim(),
        );
        if (!temCnes) p.push(`${nome(x.id)}: cadastre ao menos um CNES no prestador`);
        if (c.tipo_parcela !== "decimo_terceiro") {
          if (!x.data_envio) p.push(`${nome(x.id)}: informe a data do envio`);
          if (!x.data_retorno) p.push(`${nome(x.id)}: informe a data do retorno`);
          if (x.data_envio && x.data_retorno && x.data_retorno < x.data_envio)
            p.push(`${nome(x.id)}: retorno anterior ao envio`);
        }
        const temPlanilha = (ctx.arquivos ?? []).some(
          (a) => a.participante_id === x.id && a.categoria === "planilha_carga",
        );
        if (c.tipo_parcela !== "decimo_terceiro" && x.data_retorno && !x.sem_elegiveis && (!temPlanilha || !x.auditoria_resumo))
          p.push(`${nome(x.id)}: Planilha de Carga ainda não auditada`);
      }
      if (c.tipo_parcela !== "decimo_terceiro" && !c.investsus_carga_em)
        p.push("Informe a data de envio das Planilhas de Carga ao InvestSUS.");
      if (c.tipo_parcela !== "decimo_terceiro" && c.investsus_carga_em) {
        const ultimoRetorno = parts.map((x) => x.data_retorno).filter(Boolean).sort().at(-1);
        if (ultimoRetorno && c.investsus_carga_em < ultimoRetorno)
          p.push("Envio ao InvestSUS anterior ao último retorno institucional.");
      }
      break;
    }
    case 2: {
      if (c.tipo_parcela === "decimo_terceiro") {
        if (!parts.length) p.push("Cadastre ao menos uma instituição participante da 13ª.");
        for (const parte of parts) {
          if (!(ctx.cnes ?? []).some((x) => x.prestador_id === parte.prestador_id &&
            /^\d{7}$/.test(String(x.cnes ?? ""))))
            p.push(`${nome(parte.id)}: cadastre CNES válido antes do cálculo anual.`);
        }
        if (!(ctx.arquivos ?? []).some((a) => a.categoria === "portaria_gm"))
          p.push("Importe o PDF da Portaria GM/MS específica da 13ª.");
        if (!c.portaria_gm_numero) p.push("Informe a Portaria GM/MS da 13ª.");
        if (!c.portaria_gm_data_publicacao) p.push("Informe a data de publicação federal.");
        if (!urlDouValida(c.portaria_gm_url_dou))
          p.push("Informe o link oficial da Portaria da 13ª no DOU.");
        if (c.valor_homologado == null) p.push("Valor homologado federal ainda não registrado.");
        if (c.valor_transferido == null) p.push("Valor transferido federal ainda não registrado.");
        const resumo13 = c.investsus_resumo;
        if (resumo13?.origem_calculo !== "simulacao13_conferida" ||
          !Object.keys(resumo13?.por_cnes ?? {}).length) {
          p.push("Confirme a memória da 13ª calculada com as competências mensais e conciliada à Portaria.");
        } else {
          const totalPorCnes = Object.values(resumo13.por_cnes)
            .reduce((total: number, v: unknown) => total + Number(v ?? 0), 0);
          if (c.valor_apurado_investsus == null ||
            !dentroTolerancia(totalPorCnes, c.valor_apurado_investsus))
            p.push("Total da memória conferida difere dos valores gravados na competência.");
          if (c.valor_homologado != null &&
            !dentroTolerancia(totalPorCnes, c.valor_homologado))
            p.push("O valor por CNES calculado difere do valor homologado na Portaria Federal.");
        }
        break;
      }
      const possuiInvestsus = (ctx.arquivos ?? []).some((a) =>
        a.categoria === (c.tipo_parcela === "decimo_terceiro" ? "afc13_cnes" : "investsus"),
      );
      if (!possuiInvestsus) p.push(c.tipo_parcela === "decimo_terceiro"
        ? "Anexe e processe a memória homologada da 13ª por CNES."
        : "Anexe e audite a planilha exportada do InvestSUS.");
      const auditoriaAtual =
        Number(c.investsus_auditoria?.versao_regras ?? 0) === INVESTSUS_AUDIT_RULES_VERSION;
      if (possuiInvestsus && !auditoriaAtual && c.tipo_parcela !== "decimo_terceiro")
        p.push("Reprocesse a auditoria do InvestSUS com as regras atuais.");
      if (c.tipo_parcela !== "decimo_terceiro" && auditoriaAtual && Number(c.investsus_auditoria?.interna?.erros ?? 0) > 0)
        p.push("A planilha do InvestSUS possui erros internos que precisam ser conferidos na origem.");
      if (
        auditoriaAtual &&
        c.tipo_parcela !== "decimo_terceiro" &&
        Number(c.investsus_auditoria?.conciliacao?.criticas ?? 0) > 0 &&
        !(c.conciliacao_excecao_por && c.justificativa_conciliacao?.trim())
      )
        p.push(
          "A conciliação possui críticas bloqueantes; corrija ou registre continuidade excepcional.",
        );
      // A data pertence à conferência da saída do InvestSUS (Etapa 2),
      // antes da importação. Permanece em municipal_config por compatibilidade.
      if (c.tipo_parcela !== "decimo_terceiro") {
        const consultaInvestsus = c.municipal_config?.consulta_investsus;
        if (!consultaInvestsus)
          p.push("Informe a data da consulta ao InvestSUS.");
        // A planilha pode ser disponibilizada antes da publicação da Portaria.
        // A cronologia da Minuta e dos demais atos municipais é verificada na Etapa 3.
      }
      if (!(ctx.arquivos ?? []).some((a) => a.categoria === "portaria_gm"))
        p.push("Anexe o PDF da Portaria GM/MS.");
      if (!c.portaria_gm_numero) p.push("Informe o número da Portaria GM/MS.");
      if (!c.portaria_gm_data_publicacao) p.push("Informe a data de publicação.");
      if (!urlDouValida(c.portaria_gm_url_dou))
        p.push("URL do DOU inválida (https, in.gov.br, /web/dou/).");
      if (c.valor_homologado == null) p.push("Informe o valor homologado.");
      if (c.valor_apurado_investsus == null) p.push("Informe o valor apurado no InvestSUS.");
      if (
        c.valor_homologado != null &&
        c.valor_apurado_investsus != null &&
        !dentroTolerancia(c.valor_homologado, c.valor_apurado_investsus) &&
        !(c.tipo_parcela === "decimo_terceiro" &&
          c.conciliacao_excecao_por &&
          c.justificativa_conciliacao?.trim())
      )
        p.push(c.tipo_parcela === "decimo_terceiro"
          ? "A memória da 13ª por CNES difere do homologado; justifique e autorize a diferença documentalmente."
          : "Total do InvestSUS difere do valor homologado da Portaria.");
      if (
        c.valor_homologado != null &&
        c.valor_transferido != null &&
        !dentroTolerancia(
          transferenciaFederalEsperada(
            c.valor_homologado,
            c.desconto_saldo,
            c.acerto_contas,
          ),
          c.valor_transferido,
        )
      )
        p.push(
          "Valor transferido não fecha com homologado, desconto (limitado a zero) e acerto de contas.",
        );
      if (Math.abs(Number(c.acerto_contas ?? 0)) > 0.005 && !c.acerto_identificacao?.trim())
        p.push("Identifique o acerto de contas.");
      break;
    }
    case 3:
      for (const t of ["minuta", "memorando", "portaria_municipal"])
        if (!docCompleto(ctx, acharDoc(docs, t))) p.push(`${DOC_LABEL[t]} incompleto(a)`);
      if (!c.municipal_config?.processo?.trim()) p.push("Informe o processo SEI das Portarias.");
      if (!c.municipal_config?.autoridade?.trim()) p.push("Informe o nome da autoridade.");
      if (!c.municipal_config?.cargo?.trim()) p.push("Informe o cargo da autoridade.");
      if (!c.municipal_config?.portaria_numero?.trim())
        p.push("Informe o número da Portaria municipal publicada.");
      if (!(c.municipal_config?.destinatarios ?? []).length)
        p.push("Inclua ao menos um destinatário do Memorando.");
      else if (
        c.municipal_config.destinatarios.some(
          (d: any) => !d.nome?.trim() || !d.cargo?.trim() || !d.unidade?.trim(),
        )
      )
        p.push("Complete setor/unidade SEI, nome e cargo de todos os destinatários.");
      // Não alterar retroativamente competências cuja Etapa 3 já havia sido
      // concluída antes da implantação do checkbox. Ao reconferir, exigir.
      if (!c.etapas_concluidas?.["3"] || c.etapas_reconferir?.includes(3)) {
        const memorandum = acharDoc(docs, "memorando");
        if (docCompleto(ctx, memorandum) &&
            !memorandoEncaminhadoParaDestinatarios(ctx)) {
          const setores = unidadesDestinatariasMemorando(c.municipal_config?.destinatarios);
          p.push(setores.length
            ? `Confirme o encaminhamento do Memorando no SEI para: ${setores.join(", ")}.`
            : "Informe os setores destinatários e confirme o encaminhamento do Memorando.");
        }
      }
      // O valor municipal só existe após comprovação documental. Nunca o
      // inferir automaticamente do processamento da planilha do InvestSUS.
      if (c.total_publicado_municipal != null &&
        !dentroTolerancia(c.total_publicado_municipal, c.valor_apurado_investsus))
        p.push(c.tipo_parcela === "decimo_terceiro"
          ? "O total municipal difere da memória da 13ª calculada e conferida."
          : "Total publicado difere do InvestSUS.");
      {
        const minuta = acharDoc(docs, "minuta"),
          memo = acharDoc(docs, "memorando"),
          portaria = acharDoc(docs, "portaria_municipal"),
          consulta = c.municipal_config?.consulta_investsus;
        if (consulta && minuta?.data_documento && minuta.data_documento < consulta)
          p.push("Minuta anterior à consulta ao InvestSUS.");
        if (
          c.portaria_gm_data_publicacao &&
          minuta?.data_documento &&
          minuta.data_documento < c.portaria_gm_data_publicacao
        )
          p.push("Minuta anterior à publicação federal.");
        if (
          minuta?.data_documento &&
          memo?.data_documento &&
          memo.data_documento < minuta.data_documento
        )
          p.push("Memorando anterior à Minuta.");
        if (
          memo?.data_documento &&
          portaria?.data_documento &&
          portaria.data_documento < memo.data_documento
        )
          p.push("Publicação municipal anterior ao Memorando.");
      }
      break;
    case 4: {
      // Confirmar o crédito documental não equivale a conciliar a disponibilidade bancária do FMS.
      if (!c.credito_fms_data) p.push("Informe a data do crédito no FMS.");
      if (c.credito_fms_valor == null) p.push("Informe o valor creditado no FMS.");
      if (!c.credito_fms_referencia?.trim())
        p.push("Informe a identificação da Informação SEI do crédito.");
      if (!linkValido(c.credito_fms_link))
        p.push("Informe um link SEI válido para a Informação do crédito.");
      if (
        c.credito_fms_valor != null &&
        c.valor_transferido != null &&
        !dentroTolerancia(c.credito_fms_valor, c.valor_transferido) &&
        !c.justificativa_credito?.trim()
      )
        p.push("Crédito difere do valor transferido; registre justificativa documental.");
      // A data do crédito federal independe da publicação municipal.
      break;
    }
    case 5:
      // A etapa pode ser iniciada antes da preparação, mas não é concluída
      // automaticamente enquanto não houver instituições cadastradas.
      if (parts.length === 0) p.push("Inclua ao menos uma instituição antes de concluir o empenho.");
      for (const x of eleg) {
        const os = obrigs.filter((o) => o.participante_id === x.id);
        if (os.length === 0) {
          p.push(`${nome(x.id)}: cadastre a obrigação de empenho`);
          continue;
        }
        for (const o of os) {
        if ((o.alocacao_manual || os.length > 1) && (o.valor_empenhado == null || Number(o.valor_empenhado) <= 0))
          p.push(`${nome(x.id)}: informe o valor efetivo da Nota de Empenho`);
        if ((o.alocacao_manual || os.length > 1) && Number(o.valor_solicitado ?? (!o.alocacao_manual ? o.valor_empenhado : 0) ?? 0) <= 0)
          p.push(`${nome(x.id)}: informe o valor solicitado`);
        if (!o.fonte?.trim()) p.push(`${nome(x.id)}: informe a fonte da Nota de Empenho`);
        if (!o.cr_dotacao?.trim()) p.push(`${nome(x.id)}: informe a CR/dotação`);

        const solicitacao = acharDoc(docs, "solicitacao_ne", { obrigacao_id: o.id });
        if (!docCompleto(ctx, solicitacao)) {
          p.push(`${nome(x.id)}: complete a Solicitação de Nota de Empenho`);
          continue;
        }
        if (!encaminhado(ctx.encaminhamentos, solicitacao?.id)) {
          p.push(`${nome(x.id)}: encaminhe a Solicitação de Nota de Empenho para SEFAZ.UCG.AEO`);
          continue;
        }
        const nota = acharDoc(docs, "nota_empenho", { obrigacao_id: o.id });
        if (!docCompleto(ctx, nota)) {
          p.push(`${nome(x.id)}: complete a Nota de Empenho e informe o número no formato XXXX/AAAA`);
        }
        }
      }
      break;
    case 6: {
      const rotuloNe = (o: any) => {
        const numero = acharDoc(docs, "nota_empenho", { obrigacao_id: o.id })?.numero?.trim();
        return `${nome(o.participante_id)} · NE ${numero || "não informada"}`;
      };
      for (const x of eleg) {
        if (!modoSubempenhoExplicito(x.id, obrigs, ctx.subempenhos)) continue;
        const os = obrigs.filter(o => o.participante_id === x.id);
        const cadeias = (ctx.subempenhos ?? []).filter(s => os.some(o => o.id === s.obrigacao_id));
        if (x.valor_devido == null || cadeias.some(s=>s.valor == null) || !iguaisCentavo(soma(cadeias.map(s=>s.valor)), x.valor_devido))
          p.push(`${nome(x.id)}: o total dos subempenhos da instituição deve corresponder ao valor devido`);
        for (const o of os) {
          const executado = totalSubempenhado(o.id, cadeias);
          if (executado > Number(o.valor_empenhado ?? 0) || Number(o.valor_pago ?? 0) > executado)
            p.push(`${rotuloNe(o)}: confira o valor subempenhado da NE em relação ao empenhado e pago`);
        }
      }
      for (const o of obrigs) {
        const cadeias = ctx.subempenhos?.filter(s => s.obrigacao_id === o.id);
        if (modoSubempenhoExplicito(o.participante_id, obrigs, ctx.subempenhos) && !cadeias?.length) continue;
        if (cadeias && !cadeias.length) {
          p.push(`${rotuloNe(o)}: cadastre a solicitação de subempenho`);
          continue;
        }
        for (const [indice, cadeia] of (cadeias ?? [{ id: null, legado: true, sequencia: 1 }]).entries()) {
          const rotulo = `${rotuloNe(o)} · Solicitação ${cadeia.sequencia ?? indice + 1}`;
          const escopo = { obrigacao_id: o.id, subempenho_id: cadeia.legado ? null : cadeia.id };
          const solicitacao = acharDoc(docs, "solicitacao_liquidacao", escopo);
          if (!docCompleto(ctx, solicitacao)) {
            p.push(`${rotulo}: complete a Solicitação de Subempenho / Liquidação`);
            continue;
          }

          const aviso = acharDoc(docs, "aviso_liquidacao", escopo);
          if (!docCompleto(ctx, aviso)) {
            p.push(`${rotulo}: complete o Aviso de Movimento - Empenho em Liquidação`);
            continue;
          }
          if (!encaminhado(ctx.encaminhamentos, aviso?.id)) {
            p.push(`${rotulo}: encaminhe o Aviso de Movimento - Empenho em Liquidação para SEFAZ.UAF.ADE`);
            continue;
          }
          const avisoSub = acharDoc(docs, "aviso_subempenho", escopo);
          if (!docCompleto(ctx, avisoSub)) {
            p.push(
              `${rotulo}: informe Nº SEI, link SEI válido e data do Aviso de Movimento - Subempenho`,
            );
            continue;
          }
          if (
            aviso?.data_documento &&
            avisoSub?.data_documento &&
            avisoSub.data_documento < aviso.data_documento
          )
            p.push(
              `${rotulo}: Aviso de Movimento - Subempenho anterior ao Aviso de Movimento - Empenho em Liquidação`,
            );
        }
      }
      break;
    }
    case 7: {
      const usadas = obrigs.filter(o => obrigacaoRequerPagamento(o, obrigs, ctx.subempenhos) || centavos(o.valor_pago) !== 0);
      for (const x of eleg) {
        if (!modoSubempenhoExplicito(x.id, obrigs, ctx.subempenhos)) continue;
        const os = obrigs.filter(o => o.participante_id === x.id);
        const efetivos = os.map(o => valorLiquidadoNe(o, obrigs, ctx.subempenhos));
        if (x.valor_devido == null || efetivos.some(v => v == null) ||
            !iguaisCentavo(soma(efetivos), x.valor_devido)) {
          p.push(`${nome(x.id)}: total subempenhado deve corresponder ao devido da instituição`);
        }
        // A soma paga fica garantida pela igualdade em centavos de cada NE
        // ao respectivo subempenho; não some comprovantes ainda pendentes.
      }
      for (const o of usadas) {
        const escopo = { obrigacao_id: o.id };
        const ne = acharDoc(docs, "nota_empenho", escopo)?.numero;
        const indice = obrigs.filter(x => x.participante_id === o.participante_id).indexOf(o) + 1;
        const rotulo = `${nome(o.participante_id)} · NE ${ne?.trim() || "#" + indice}`;
        if (!docCompleto(ctx, acharDoc(docs, "programacao_pagamento", escopo)))
          p.push(`${rotulo}: complete a Programação de pagamento (Nº SEI, link válido, data e assinaturas exigidas)`);
        const comprovante = acharDoc(docs, "comprovante_pagamento", escopo);
        const campos: string[] = [];
        if (!comprovante?.numero_sei?.trim()) campos.push("Nº SEI");
        if (!linkValido(comprovante?.link_sei)) campos.push("link SEI válido");
        if (!comprovante?.data_documento) campos.push("data do documento");
        if (comprovante && ctx.matriz.some(m => m.tipo_documento === comprovante.tipo && !m.opcional &&
          !ctx.assinaturas.some(a => a.documento_id === comprovante.id && a.slot === m.slot_key)))
          campos.push("assinaturas obrigatórias");
        if (!o.data_pagamento) campos.push("data do pagamento");
        if (o.valor_pago == null) campos.push("valor pago");
        if (campos.length) p.push(`${rotulo}: complete o Comprovante de pagamento (${campos.join(", ")})`);
        const explicito = modoSubempenhoExplicito(o.participante_id, obrigs, ctx.subempenhos);
        const valorDevido = explicito ? valorLiquidadoNe(o, obrigs, ctx.subempenhos)
          : parts.find(x => x.id === o.participante_id)?.valor_devido;
        if (valorDevido == null) p.push(`${rotulo}: valor subempenhado/devido não definido`);
        else if (o.valor_pago != null && !(explicito ? iguaisCentavo(o.valor_pago, valorDevido) : dentroTolerancia(o.valor_pago, valorDevido)))
          p.push(`${rotulo}: valor pago ≠ valor subempenhado da obrigação`);
      }
      break;
    }
    case 10: {
      const saldos = saldosAnulacaoPiso(obrigs);
      if (!saldos.length) break;
      if (!programacaoPagamentoProntaPiso(docs, obrigs)) {
        p.push("Registre ao menos uma Programação de pagamento completa antes de solicitar anulação.");
        break;
      }
      for (const saldo of saldos) {
        const instituicao = nome(saldo.participanteId);
        const solicitacao = acharDoc(docs, "solicitacao_anulacao", { obrigacao_id: saldo.obrigacaoId });
        const aviso = acharDoc(docs, "aviso_anulacao", { obrigacao_id: saldo.obrigacaoId });
        if (saldo.anulado == null || !dentroTolerancia(saldo.anulado, saldo.previsto))
          p.push(`${instituicao}: anulação efetiva deve ser igual ao saldo previsto (${saldo.previsto.toFixed(2)})`);
        if (!assinaturasAnulacaoCompletas(ctx, solicitacao?.id))
          p.push(`${instituicao}: registre os quatro signatários da Solicitação de Anulação`);
        else if (!envioAnulacaoConfirmado(ctx, solicitacao?.id))
          p.push(`${instituicao}: confirme o envio da Solicitação de Anulação à SEFAZ.UCG.AEO`);
        else if (!docCompleto(ctx, solicitacao))
          p.push(`${instituicao}: informe número, link e data SEI da Solicitação de Anulação`);
        if (!docCompleto(ctx, aviso))
          p.push(`${instituicao}: registre o aviso de anulação da SEFAZ com número, link e data`);
      }
      break;
    }
    case 8:
      if (!programacaoPagamentoProntaPiso(docs, obrigs))
        p.push("Registre ao menos uma Programação de pagamento completa antes de comunicar por e-mail.");
      for (const participante of eleg) {
        const contatos = (ctx.emailsPrestador ?? []).filter(
          (item) => item.prestador_id === participante.prestador_id,
        );
        const notificacao = (ctx.notificacoesEmail ?? []).find(
          (item) => item.participante_id === participante.id,
        );
        const destinatarios = Array.isArray(notificacao?.destinatarios)
          ? notificacao.destinatarios.filter(Boolean)
          : [];

        if (!notificacao?.enviado_em && contatos.length === 0) {
          p.push(`${nome(participante.id)}: cadastre ao menos um e-mail de contato no prestador`);
          continue;
        }
        if (destinatarios.length === 0) {
          p.push(`${nome(participante.id)}: selecione ao menos um destinatário para a notificação`);
          continue;
        }
        if (destinatarios.some((email: string) => !emailValido(email))) {
          p.push(`${nome(participante.id)}: há destinatário com e-mail inválido`);
        }
        if (
          !notificacao?.enviado_em &&
          destinatarios.some(
            (email: string) => !contatos.some((contato) => contato.email === email),
          )
        ) {
          p.push(`${nome(participante.id)}: revise destinatários que não constam mais no cadastro do prestador`);
        }
        if (!notificacao?.assunto?.trim() || !notificacao?.corpo?.trim()) {
          p.push(`${nome(participante.id)}: o modelo do e-mail ainda não foi registrado`);
        }
        if (!notificacao?.enviado_em) {
          p.push(`${nome(participante.id)}: registre o envio do e-mail pelo SEI`);
          continue;
        }
        if (!notificacao.processo_sei_numero?.trim()) {
          p.push(`${nome(participante.id)}: informe o número do processo SEI do e-mail enviado`);
        }
        if (!linkValido(notificacao.processo_sei_link)) {
          p.push(`${nome(participante.id)}: informe um link SEI válido para o e-mail enviado`);
        }
      }
      break;
    case 9:
      for (const ne of ctx.notasCompartilhadas ?? []) {
        if (ne.competencia_anulacao_id === c.id && Number(ne.saldo_bruto) > 0 &&
            !obrigs.some(o => (o.ne_origem_id ?? o.id) === ne.origem_id))
          p.push(`NE ${ne.numero}: vincule a nota compartilhada nesta competência para tratar o saldo final.`);
      }
      // A conciliação bancária é complementar, sem substituir a evidência de pagamento.
      if (requerAnulacaoPiso(obrigs) && (pendenciasEtapa(10, ctx).length || !c.etapas_concluidas?.["10"]))
        p.push("Regularize e conclua a anulação de empenho antes do encerramento.");
      for (let k = c.tipo_parcela === "decimo_terceiro" ? 2 : 1; k <= 8; k++)
        if (pendenciasEtapa(k, ctx).length) {
          p.push(`Etapa ${k} possui pendências`);
          break;
        }
      if (!c.relatorio_gerado_em) {
        p.push("Gere o Relatório Executivo antes de encerrar.");
      } else {
        const ultimaNotificacao = (ctx.notificacoesEmail ?? [])
          .map((item) => item.updated_at)
          .filter(Boolean)
          .sort()
          .at(-1);
        if (
          ultimaNotificacao &&
          new Date(c.relatorio_gerado_em).getTime() < new Date(ultimaNotificacao).getTime()
        ) {
          p.push("Gere novamente o Relatório Executivo após concluir as notificações por e-mail.");
        }
      }
      break;
  }
  return p;
}
