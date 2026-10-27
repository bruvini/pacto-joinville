import { CACON_ETAPAS } from "@/lib/cacon/etapas";
import { ETAPA_ANULACAO_PISO, etapasVisiveisPiso, numeroVisualEtapaPiso } from "@/lib/piso/etapas";
import { PVH_ETAPAS, prerequisitosEtapaPvh } from "@/lib/pvh/etapas";

export type ModuloBpmn = "piso" | "pvh" | "cacon";
export type ParcelaPisoBpmn = "mensal" | "decimo_terceiro";
export type TipoNoBpmn = "inicio" | "fim" | "atividade" | "exclusivo" | "paralelo" | "documento";
export type NoBpmn = {
  id: string; tipo: TipoNoBpmn; x: number; y: number;
  titulo: string; linhas?: string[]; etapa?: string; raia?: number; 
};
export type ConexaoBpmn = {
  de: string; para: string; pontos: number[]; rotulo?: string;
  rotuloX?: number; rotuloY?: number; associacao?: boolean; referenciaInformativa?: boolean;
};
export type RaiaBpmn = { titulo: string; cor: string; y: number; altura: number };
export type ModeloBpmn = {
  modulo: ModuloBpmn; titulo: string; subtitulo: string;
  largura: number; altura: number; raias: RaiaBpmn[];
  nos: NoBpmn[]; conexoes: ConexaoBpmn[]; observacoes: string[];
};

const paleta = {
  acp: "#003866", ufi: "#1C9CD8", hospital: "#16806c",
  estadual: "#7C3AED", fluxo: "#D97706", comunicacao: "#0E7490",
};

const no = (id: string, tipo: TipoNoBpmn, x: number, y: number, titulo: string, linhas?: string[], etapa?: string, raia?: number): NoBpmn =>
  ({ id, tipo, x, y, titulo, linhas, etapa, raia });
const ar = (de: string, para: string, pontos: number[], rotulo?: string, rotuloX?: number, rotuloY?: number, associacao = false, referenciaInformativa = false): ConexaoBpmn =>
  ({ de, para, pontos, rotulo, rotuloX, rotuloY, associacao, referenciaInformativa });

/**
 * Fluxo BPMN didático. As dependências são tiradas das definições do domínio,
 * e as posições são um layout de apresentação, não código de execução.
 */
export function modeloBpmnPiso(tipo: ParcelaPisoBpmn): ModeloBpmn {
  const etapas = etapasVisiveisPiso(tipo, true);
  const buscar = (n: number) => n === 10 ? ETAPA_ANULACAO_PISO : etapas.find(e => e.n === n)!;
  const atividade = (n: number, x: number, y: number, linhas: string[], raia: number) =>
    no("p" + n, "atividade", x, y, buscar(n).titulo, linhas,
      String(numeroVisualEtapaPiso(n, tipo)), raia);
  const decimo = tipo === "decimo_terceiro";
  const nos: NoBpmn[] = [
    no("ini", "inicio", 100, 94, "Competência aberta"),
    no("ramifica", "paralelo", 225, 94, "Início das trilhas"),
    ...(!decimo ? [atividade(1, 370, 230, ["Carga, instituição", "e InvestSUS"], 0)] : []),
    atividade(2, 630, 230, decimo ? ["Média anual / CNES", "Portaria GM/MS 13ª"] : ["Retorno InvestSUS", "e Portaria GM/MS"], 0),
    atividade(3, 905, 230, ["Minuta, memorando", "e publicação"], 0),
    atividade(4, 1160, 230, ["Crédito efetivo", "no FMS"], 0),
    atividade(5, 370, 450, ["Obrigações, NE", "e conciliação"], 1),
    atividade(6, 630, 450, ["Subempenho, avisos", "e liquidação"], 1),
    no("paralelo-78", "paralelo", 835, 450, "Operações paralelas"),
    atividade(7, 1060, 425, ["Programação SEI", "e comprovante"], 1),
    no("saldo", "exclusivo", 1250, 425, "Saldo a anular?"),
    atividade(10, 1460, 425, ["Solicitação e aviso", "SEFAZ por obrigação"], 1),
    atividade(8, 1315, 690, ["E-mail e registro", "do envio no SEI"], 2),
    no("uniao", "paralelo", 1705, 765, "Conferência final"),
    atividade(9, 1860, 765, ["Reconciliação e", "fechamento"], 2),
    no("fim", "fim", 2010, 765, "Encerrada"),
    no("doc", "documento", 720, 595, "Evidências", ["SEI · NE · avisos", "por obrigação"]),
  ];
  const conexoes = [
    ar("ini","ramifica",[120,94,201,94]),
    ...(!decimo ? [
      ar("ramifica","p1",[225,119,225,230,275,230]),
      ar("p1","p2",[465,230,535,230]),
    ] : [ar("ramifica","p2",[225,119,225,230,535,230])]),
    ar("p2","p3",[725,230,810,230]),
    ar("p3","p4",[1000,230,1065,230]),
    ar("ramifica","p5",[225,119,225,450,275,450]),
    ar("p5","p6",[465,450,535,450]),
    ar("p6","paralelo-78",[725,450,811,450]),
    ar("paralelo-78","p7",[858,450,868,450,868,425,965,425]),
    ar("paralelo-78","p8",[835,475,835,690,1220,690]),
    ar("p7","saldo",[1155,425,1226,425]),
    ar("saldo","p10",[1274,425,1365,425],"sim",1308,411),
    ar("saldo","uniao",[1250,401,1250,355,1650,355,1650,730,1681,765],"não",1348,343),
    ar("p10","p8",[1460,467,1460,600,1315,600,1315,648],
      "se aplicada, condiciona a notificação",1533,580,true),
    ar("p10","uniao",[1555,425,1630,425,1630,765,1681,765]),
    // A confirmação do FMS alimenta a conciliação do empenho. É uma referência
    // documental, sem transformar a Etapa 4 em pré-requisito de liberação da 5.
    ar("p4","p5",[1255,230,1520,230,1520,344,370,344,370,405],
      "crédito FMS → conciliação",1040,334,false,true),
    ar("p8","uniao",[1410,690,1590,690,1590,765,1681,765]),
    ar("uniao","p9",[1729,765,1763,765]),
    ar("p9","fim",[1955,765,1988,765]),
    ar("p6","doc",[630,493,630,595,646,595],undefined,undefined,undefined,true),
  ];
  return {
    modulo:"piso",
    titulo: decimo ? "Piso da Enfermagem · parcela adicional do 13º" : "Piso da Enfermagem · competência mensal",
    subtitulo:"Dois ramos independentes e sincronização para encerramento; a anulação 7A só é aplicável quando há saldo.",
    largura:2080,altura:920,
    raias:[
      {titulo:"ATOS E CONCILIAÇÃO",cor:paleta.estadual,y:145,altura:195},
      {titulo:"EXECUÇÃO FINANCEIRA",cor:paleta.ufi,y:340,altura:245},
      {titulo:"COMUNICAÇÃO E FECHAMENTO",cor:paleta.acp,y:585,altura:255},
    ],
    nos,conexoes,
    observacoes:[
      decimo ? "A parcela adicional do 13º começa no cálculo e na Portaria Federal; não usa a Etapa 1 mensal." : "A trilha normativa (1–4) não precisa aguardar o início da trilha financeira (5–6).",
      "Pagamento (7) e notificação (8) são liberados após 6; não existe obrigação universal de concluir 7 antes de 8.",
      "A 7A depende da programação por obrigação financeira, não da conclusão integral de 7. Quando aplicável, ela deve ser reconferida antes de concluir 8 e 9.",
      "O encerramento (9) depende dos dois ramos, da notificação e da anulação quando aplicável. A ligação 4 → 5 mostra a referência financeira, sem bloquear o início da etapa 5.",
    ],
  };
}

export function modeloBpmnPvh(): ModeloBpmn {
  const tarefa = (n: number, x: number, y: number, linhas: string[], raia: number) =>
    no("v"+n,"atividade",x,y,PVH_ETAPAS[n-1].titulo,linhas,String(n),raia);
  return {
    modulo:"pvh", titulo:"PVH · Programa de Valorização dos Hospitais",
    subtitulo:"Portaria SES e empenhos iniciam em paralelo; após liquidação, pagamento e comunicação são trilhas paralelas.",
    largura:1900,altura:790,
    raias:[
      {titulo:"ATOS ESTADUAL E MUNICIPAL",cor:paleta.estadual,y:148,altura:175},
      {titulo:"ORÇAMENTO E LIQUIDAÇÃO",cor:paleta.ufi,y:323,altura:227},
      {titulo:"PAGAMENTO, COMUNICAÇÃO E FECHAMENTO",cor:paleta.acp,y:550,altura:190},
    ],
    nos:[
      no("ini","inicio",100,90,"Competência preparada"),
      no("div","paralelo",230,90,"Aberturas paralelas"),
      tarefa(1,415,232,["Portaria SES, valores", "oficiais e participantes"],0),
      tarefa(2,745,232,["Minuta, memorando", "portaria e crédito FMS"],0),
      tarefa(3,415,430,["Cobertura por hospital","NE e alocações"],1),
      tarefa(4,745,430,["Cadeia por alocação", "SEI + e-Pública"],1),
      no("div2","paralelo",935,430,"Ramos paralelos"),
      tarefa(5,1130,390,["Programação, parcelas","e comprovantes SEI"],1),
      tarefa(6,1130,655,["E-mail conforme", "configuração do hospital"],2),
      no("join2","paralelo",1370,525,"5 + 6 concluídas"),
      no("join","paralelo",1565,655,"Convergência final"),
      tarefa(7,1700,655,["Conciliação e","encerramento formal"],2),
      no("fim","fim",1850,655,"Competência encerrada"),
      no("doc","documento",980,248,"Atos oficiais",["Portaria SES","Minuta e memorando"]),
    ],
    conexoes:[
      ar("ini","div",[121,90,206,90]),
      ar("div","v1",[230,114,230,232,320,232]),
      ar("div","v3",[230,114,230,430,320,430]),
      ar("v1","v2",[510,232,650,232]),
      ar("v3","v4",[510,430,650,430]),
      ar("v2","v4",[745,274,745,365],"crédito FMS",770,330,true),
      ar("v4","div2",[840,430,911,430]),
      ar("div2","v5",[959,430,985,430,985,390,1035,390]),
      ar("div2","v6",[935,454,935,655,1035,655]),
      ar("v5","join2",[1225,390,1370,390,1370,501]),
      ar("v6","join2",[1225,655,1370,655,1370,549]),
      ar("join2","join",[1394,525,1470,525,1470,655,1541,655]),
      // Portaria municipal/crédito no FMS alimentam as NEs da Etapa 3.
    // A 3 pode iniciar em paralelo à 1; esta seta não é bloqueio de navegação.
    ar("v2","v3",[840,232,900,232,900,325,415,325,415,385],
      "atos e crédito FMS → empenhos",665,314,false,true),
      ar("join","v7",[1589,655,1605,655]),
      ar("v7","fim",[1795,655,1828,655]),
      ar("doc","v2",[950,248,840,248],undefined,undefined,undefined,true),
    ],
    observacoes:[
      "A ligação 2 → 3 mostra a integração dos atos e do crédito FMS com os empenhos. A Etapa 3 pode iniciar em paralelo à 1; a ligação é informativa, não uma trava.",
      "Pagamento (5) e Comunicação (6) são liberados em paralelo após 4; notificações são condicionais por instituição.",
      "O encerramento (7) exige as etapas anteriores e a conciliação financeira; não equivale à aprovação posterior das contas.",
      "Alterações em registros materiais concluídos podem exigir reconferência dirigida.",
    ],
  };
}

export function modeloBpmnCacon(): ModeloBpmn {
  return {
    modulo:"cacon",titulo:"Dieta CACON · produção do HMSJ",
    subtitulo:"Recebimento de evidências, auditoria com validação humana e memorando de encaminhamento.",
    largura:1790,altura:715,
    raias:[
      {titulo:"HMSJ · ORIGEM DA PRODUÇÃO",cor:paleta.hospital,y:145,altura:160},
      {titulo:"ACP · CONFERÊNCIA E DOCUMENTOS",cor:paleta.acp,y:305,altura:220},
      {titulo:"SES.UFI · ENCAMINHAMENTO",cor:paleta.ufi,y:525,altura:140},
    ],
    nos:[
      no("ini","inicio",95,225,"Receber competência"),
      no("c1","atividade",355,225,CACON_ETAPAS[0].titulo,
        ["Memorando e Anexo", "com número e link SEI"],"1",0),
      no("c2","atividade",710,430,CACON_ETAPAS[1].titulo,
        ["PDF original preservado","extração + conferência"],"2",1),
      no("ok","exclusivo",1040,430,"Auditoria validada?"),
      no("c3","atividade",1325,430,CACON_ETAPAS[2].titulo,
        ["Minuta, assinatura fiscal","e encaminhamento SEI"],"3",1),
      no("enviar","atividade",1550,600,"Encaminhar à SES.UFI",
        ["Registro de envio", "e rastreabilidade"],undefined,2),
      no("fim","fim",1740,600,"Competência concluída"),
      no("pdf","documento",710,582,"Documento",["PDF original", "indicadores extraídos"]),
    ],
    conexoes:[
      ar("ini","c1",[117,225,260,225]),
      ar("c1","c2",[450,225,520,225,520,430,615,430]),
      ar("c2","ok",[805,430,1016,430]),
      ar("ok","c3",[1064,430,1230,430],"sim",1130,416),
      ar("ok","c2",[1040,406,1040,336,710,336,710,388],"não: corrigir e reconferir",820,324),
      ar("c3","enviar",[1422,430,1550,430,1550,555]),
      ar("enviar","fim",[1645,600,1718,600]),
      ar("c2","pdf",[710,472,710,540],undefined,undefined,undefined,true),
    ],
    observacoes:[
      "A Etapa 1 exige memorando e anexo do HMSJ, ambos com número e link SEI válidos, além da data de recebimento.",
      "A Etapa 2 preserva o PDF, extrai indicadores, exige conferência humana e não conclui com críticas de auditoria.",
      "A Etapa 3 prepara memorando da SMS com assinatura fiscal e encaminhamento à UFI.",
      "O PDF e o resultado calculado permanecem como evidências, mas não substituem a conferência profissional.",
    ],
  };
}

export function modeloBpmn(modulo: ModuloBpmn, tipoPiso: ParcelaPisoBpmn = "mensal"): ModeloBpmn {
  if (modulo === "piso") return modeloBpmnPiso(tipoPiso);
  return modulo === "pvh" ? modeloBpmnPvh() : modeloBpmnCacon();
}

/** Smoke-check de integridade dos modelos para prevenir IDs e setas órfãs. */
export function errosModeloBpmn(modelo: ModeloBpmn): string[] {
  const ids = new Set<string>();
  const erros: string[] = [];
  for (const n of modelo.nos) {
    if (ids.has(n.id)) erros.push("Nó duplicado: " + n.id);
    ids.add(n.id);
    if (n.x < 0 || n.x > modelo.largura || n.y < 0 || n.y > modelo.altura)
      erros.push("Nó fora da área: " + n.id);
  }
  for (const edge of modelo.conexoes) {
    if (!ids.has(edge.de) || !ids.has(edge.para)) erros.push("Conexão órfã: " + edge.de + " → " + edge.para);
    if (edge.pontos.length < 4 || edge.pontos.length % 2) erros.push("Pontos inválidos: " + edge.de);
  }
  for (const modulo of [modelo.modulo]) {
    if (modulo === "pvh") {
      for (const n of [1,2,3,4,5,6,7]) {
        if (!ids.has("v"+n)) erros.push("Etapa PVH ausente: "+n);
        for (const p of prerequisitosEtapaPvh(n))
          if (!ids.has("v"+p)) erros.push("Pré-requisito PVH ausente: "+p);
      }
    }
  }
  return erros;
}
