import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BpmnFluxo } from "@/components/BpmnFluxo";
import {
  ShieldCheck, ScrollText, Lock, GitBranch, BookOpen, Workflow, Building2, Landmark,
  FileSignature, ListChecks, ArrowRight, ArrowDown, LayoutDashboard, Gauge,
  RotateCcw, CheckCircle2, Users, Bell, ClipboardCheck, History, Mail, FileDown, Timer,
  HelpCircle, KeyRound, Stamp, PenLine, FileText, LifeBuoy,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/sobre")({
  head: () => ({ meta: [{ title: "Sobre o Sistema" }] }),
  component: SobrePage,
});

// Cor do rail/badge por setor responsável
const COR: Record<string, string> = {
  ufi: "border-l-[#1C9CD8] [--c:#1C9CD8]",
  acp: "border-l-[#003866] [--c:#003866]",
  apc: "border-l-[#7C3AED] [--c:#7C3AED]",
  anul: "border-l-[#D97706] [--c:#D97706]",
};

const ETAPAS = [
  { n: 1, titulo: "Análise de Orçamento", setor: "UFI", cor: "ufi", acoes: ["A coordenação da UFI registra a dotação orçamentária e a fonte de pagamento.", "Com isso o status passa a “Orçamento disponível”."] },
  { n: 2, titulo: "Solicitação de Empenho", setor: "ACP", cor: "acp", acoes: ["Informa valor solicitado, competência e o link da solicitação no SEI.", "Marca a solicitação “em bloco para revisão”.", "Se o valor passar do teto mensal, é obrigatório justificar."] },
  { n: 3, titulo: "Revisão da Coordenação da UFI", setor: "UFI", cor: "ufi", acoes: ["A mesma coordenação da UFI que fez a análise de orçamento revisa a solicitação: aprova ou nega.", "Negar exige justificativa e devolve à Etapa 2 para correção.", "Todo o histórico de decisões fica registrado."] },
  { n: 4, titulo: "Assinaturas e Envio (Solicitação)", setor: "ACP", cor: "acp", acoes: ["Coleta as 5 assinaturas: Fiscal, Coordenador de Orçamentos, Gerente/Coordenador ACP, Diretor de Serviços Complementares e Diretoria Financeira/Secretária.", "Confirma o envio à SEFAZ.UCG.AEO."] },
  { n: 5, titulo: "Liberação de Orçamento", setor: "UFI", cor: "ufi", acoes: ["Registra o nº e o link da Nota de Empenho — o status passa a “Empenhado”.", "Coleta a assinatura de um membro da SEFAZ e da Diretoria Financeira/Secretária."] },
  { n: 6, titulo: "Liberação de Recurso", setor: "ACP", cor: "acp", acoes: ["Anexa o Relatório Técnico de Monitoramento, o Relatório de Análise, as certidões e o valor atestado.", "Faz a solicitação de liberação, coleta as assinaturas e confirma o envio à SEFAZ.UAF.ADE.", "Anexa os links de acompanhamento (subempenho, programação e comprovante de pagamento) e a DATA DO PAGAMENTO — obrigatórios para concluir."] },
  { n: 7, titulo: "Anulação de Empenho (quando há saldo)", setor: "ACP", cor: "anul", acoes: ["Quando o valor atestado é menor que o solicitado, solicita a anulação do saldo.", "Nota de anulação, assinaturas e envio à SEFAZ — o recurso retorna ao orçamento da Saúde."] },
  { n: 8, titulo: "Prestação de Contas (após o pagamento)", setor: "APC", cor: "apc", acoes: ["O prazo (em dias, cadastrado no convênio) conta a partir da DATA DO PAGAMENTO informada na Etapa 6.", "Na página própria de Prestação de Contas: recebimento, ofícios e respostas (links SEI), valores aprovado × glosado e o resultado da análise.", "A APC recebe alertas automáticos (sino + e-mail) em D-7, D-3 e no vencimento do prazo."] },
];

// Fluxo 2 — Liquidação Direta / Complementar: 6 etapas reais (sem anulação).
// Cada etapa lista os signatários e os documentos/switches obrigatórios (micro-badges).
type EtapaF2 = { n: number; titulo: string; setor: string; cor: string; acoes: string[]; signatarios?: string[]; documentos?: string[]; switches?: string[] };
const ETAPAS_F2: EtapaF2[] = [
  { n: 1, titulo: "Análise de Orçamento", setor: "UFI", cor: "ufi", acoes: ["A coordenação da UFI registra a dotação orçamentária e a fonte de pagamento."], documentos: ["Dotação orçamentária", "Fonte de pagamento"] },
  { n: 2, titulo: "Solicitação de Empenho", setor: "ACP", cor: "acp", acoes: ["Valor solicitado, competência e link SEI da solicitação; marca “em bloco para revisão”."], documentos: ["Link SEI da Solicitação"] },
  { n: 3, titulo: "Revisão da Coordenação da UFI", setor: "UFI", cor: "ufi", acoes: ["A UFI aprova ou nega a solicitação; negar exige justificativa e devolve à Etapa 2."] },
  { n: 4, titulo: "Assinaturas e Envio (Solicitação)", setor: "ACP", cor: "acp", acoes: ["Coleta as assinaturas exclusivas do Fluxo 2 e confirma o envio à SEFAZ.UCG.AEO."], signatarios: ["Coordenador de Orçamentos", "Fiscal", "Membro da Comissão de Despesa (texto livre)", "Diretoria Financeira E/OU Secretária de Saúde"], switches: ["Envio à SEFAZ.UCG.AEO"] },
  { n: 5, titulo: "Liberação de Orçamento", setor: "UFI", cor: "ufi", acoes: ["Registra o nº e o link da Nota de Empenho — status “Empenhado”."], signatarios: ["Membro da SEFAZ", "Diretoria Financeira/Secretária"], documentos: ["Link SEI da Nota de Empenho"] },
  {
    n: 6, titulo: "Liquidação de Despesa", setor: "ACP", cor: "acp",
    acoes: [
      "Após aguardar o fechamento do mês de execução (M+1), percorre os 8 subpassos sequenciais:",
      "1. Minuta no SEI · 2. Memorando no SEI · 3. Portaria de Divulgação de Recursos.",
      "4. Solicitação de Liquidação (com o Valor Liquidado) · 5. Aviso de Movimento (Empenho em Liquidação).",
      "6. Aviso de Movimento · Subempenho · 7. Programação de Pagamento · 8. Comprovante + DATA do pagamento.",
      "Concluído o subpasso 8, o processo é finalizado — não há Etapa 7 de anulação.",
    ],
    signatarios: ["Minuta: Gerente ACP + Diretor de Serviços Complementares", "Memorando: Fiscal + Gerente/Coordenador ACP", "Liquidação e Aviso: Fiscal + Membro da Comissão (texto livre)"],
    documentos: ["Minuta (SEI)", "Memorando (SEI)", "Portaria (SEI)", "Solic. Liquidação (SEI) + Valor Liquidado", "Aviso de Movimento (SEI)", "Subempenho · Programação · Comprovante (SEI)"],
    switches: ["Minuta encaminhada p/ SES.UPA e SES.UPA.APA", "Aviso enviado p/ SEFAZ.UAF.ADE"],
  },
];

function SobrePage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-primary">Sobre o Sistema</h1>
        <p className="text-sm text-muted-foreground">
          Gestão e Auditoria de Empenhos · Secretaria Municipal de Saúde de Joinville · Área de Convênios e Parcerias (ACP)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" />O que é</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed space-y-2 text-muted-foreground">
          <p>
            Ferramenta para gerir e auditar os empenhos de convênios e parcerias da Saúde, substituindo o controle manual por
            planilhas. O objetivo é dar <b className="text-foreground">confiabilidade, rastreabilidade e previsibilidade</b> ao fluxo
            de repasses, reduzindo o erro humano com validações automáticas, máscaras de dados, alertas de prazo e trilha de auditoria.
          </p>
          <p>
            O trabalho se organiza em <b className="text-foreground">dois processos encadeados</b>: o <b className="text-foreground">Processo
            de Empenho</b> (7 etapas que liberam automaticamente conforme cada uma é preenchida — não há botão de “avançar”)
            e a <b className="text-foreground">Prestação de Contas</b>, que começa quando o pagamento é efetuado: o prazo do
            prestador conta a partir da <b className="text-foreground">data do pagamento</b>, conforme os dias cadastrados em cada
            convênio, com alertas automáticos (sino + e-mail) para o setor APC em D-7, D-3 e no vencimento.
          </p>
          <p>
            Cada setor tem sua “mesa de trabalho”: a ACP e a UFI atuam nos lançamentos (a coordenação da UFI faz a análise de
            orçamento e a revisão das solicitações), a APC na página de Prestação de Contas, e o painel inicial prioriza
            automaticamente os indicadores do setor de quem está logado.
          </p>
        </CardContent>
      </Card>

      {/* ===== ZONA DE FLUXOS — ABAS (Fluxo 1 × Fluxo 2) ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" />Modelos de Fluxo do Processo</CardTitle>
          <CardDescription>
            O sistema opera <b>dois modelos de fluxo</b> conforme a natureza do convênio. Escolha a aba para ver o mapa BPMN 2.0
            e o passo a passo de cada um. Clique no diagrama para abrir em tela cheia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="fluxo1">
            <TabsList className="mb-3">
              <TabsTrigger value="fluxo1">Fluxo 1 — Padrão Hospitalar</TabsTrigger>
              <TabsTrigger value="fluxo2">Fluxo 2 — Liquidação Direta / Complementar</TabsTrigger>
            </TabsList>

            {/* ---- ABA 1 ---- */}
            <TabsContent value="fluxo1" className="space-y-4">
              <BpmnFluxo variante="fluxo1" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Passo a passo — 7 etapas operacionais (+ prestação de contas)</div>
                <div className="flex flex-wrap gap-3 mb-3 text-xs">
                  <Legenda cls="bg-[#1C9CD8]" t="UFI — Unidade de Gestão Financeira" />
                  <Legenda cls="bg-[#003866]" t="ACP — Convênios e Parcerias" />
                  <Legenda cls="bg-[#7C3AED]" t="APC — Prestação de Contas" />
                  <Legenda cls="bg-[#D97706]" t="Anulação (quando há saldo)" />
                </div>
                <ol className="space-y-2">
                  {ETAPAS.map((e, i) => (
                    <li key={e.n}>
                      <FlowStage {...e} />
                      {i < ETAPAS.length - 1 && <div className="flex justify-center py-1"><ArrowDown className="h-4 w-4 text-muted-foreground" /></div>}
                    </li>
                  ))}
                </ol>
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <span className="text-foreground">Com tudo preenchido, o responsável clica em <b>“Concluir processo”</b> (com confirmação). Nada é concluído automaticamente.</span>
                </div>
              </div>
            </TabsContent>

            {/* ---- ABA 2 ---- */}
            <TabsContent value="fluxo2" className="space-y-4">
              <BpmnFluxo variante="fluxo2" />
              <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                <b className="text-foreground">Fluxo simplificado, sem a Etapa 7 de anulação.</b> A Etapa 6 vira <b>Liquidação de Despesa</b> (8 subpassos),
                precedida de um evento de tempo (aguardar o fechamento do mês de execução, M+1). Ideal para convênios de
                <b> Pagamentos Complementares</b>.
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Passo a passo — 6 etapas reais (signatários e documentos em destaque)</div>
                <div className="flex flex-wrap gap-3 mb-3 text-xs">
                  <Legenda cls="bg-[#1C9CD8]" t="UFI — Gestão Financeira" />
                  <Legenda cls="bg-[#003866]" t="ACP — Convênios" />
                  <Legenda cls="bg-[#7C3AED]" t="Comissão de Gestão e Controle de Despesa" />
                </div>
                <ol className="space-y-2">
                  {ETAPAS_F2.map((e, i) => (
                    <li key={e.n}>
                      <FlowStageF2 {...e} />
                      {i < ETAPAS_F2.length - 1 && <div className="flex justify-center py-1"><ArrowDown className="h-4 w-4 text-muted-foreground" /></div>}
                    </li>
                  ))}
                </ol>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ===================================================================== */}
      {/* CENTRAL DE AJUDA E DOCUMENTAÇÃO — framework Diátaxis                    */}
      {/* ===================================================================== */}
      <div className="flex items-center gap-2 pt-2">
        <LifeBuoy className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-primary">Central de Ajuda e Documentação</h2>
        <Badge variant="outline" className="text-[10px]">framework Diátaxis</Badge>
      </div>

      {/* ===== BLOCO A · Guia de Referência de Dados ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" />A · Guia de Referência de Dados</CardTitle>
          <CardDescription>Como os cadastros se organizam — cascata lógica em que cada nível depende do anterior.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-stretch gap-2 md:gap-1">
            <Cadastro icon={Building2} titulo="Prestador" desc="Instituição/OSC parceira. É a raiz de tudo." />
            <Seta />
            <Cadastro icon={Landmark} titulo="Convênio" desc="Objeto, modelo de fluxo, teto mensal, nº de parcelas, vigência e prazos." />
            <Seta />
            <Cadastro icon={FileSignature} titulo="Termo Aditivo" desc="(Opcional) Renova/altera o convênio e pode ter teto próprio." />
            <Seta />
            <Cadastro icon={ListChecks} titulo="Lançamento / Parcela" desc="O processo de uma competência — onde correm as etapas do fluxo." />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Cada lançamento pertence a um convênio (e, opcionalmente, a um termo aditivo) e representa uma parcela. A
            <b className="text-foreground"> data de início da vigência</b> e o <b className="text-foreground">nº de parcelas</b> do
            convênio alimentam o acompanhamento de parcelas e a taxa de completude no painel.
          </p>
          <div className="mt-3 rounded-lg border border-acp/25 bg-acp/5 px-3 py-2 text-xs text-muted-foreground">
            <b className="text-foreground">No Fluxo 2, o tipo “Pagamentos Complementares”</b> ignora o teto mensal e os prazos cronológicos:
            as parcelas são <b className="text-foreground">auto-incrementadas pelo sistema</b> de forma sequencial, sem exigir o
            calendário de competência dos convênios contínuos.
          </div>
        </CardContent>
      </Card>

      {/* ===== BLOCO B · Solução de Problemas Rápidos (Troubleshooting) ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><HelpCircle className="h-4 w-4 text-primary" />B · Solução de Problemas Rápidos</CardTitle>
          <CardDescription>Respostas diretas às dúvidas operacionais mais frequentes da rotina.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="q1">
              <AccordionTrigger className="text-sm text-left">Por que meu processo sumiu da listagem ou está no grupo vermelho de atraso?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  <b className="text-foreground">Herança de atraso Pai→Filho:</b> em lançamentos de múltiplas competências, o
                  processo <b>pai</b> compartilha as Etapas 1–5 e cada <b>competência filha</b> corre a Etapa 6 individualmente.
                  Se qualquer filho estoura o prazo, o pai passa a ser sinalizado em atraso (herança), aparecendo no grupo vermelho.
                </p>
                <p>
                  <b className="text-foreground">Modo Retroativo (admin):</b> quando ativo, o status “salta” para a última etapa
                  preenchida e as travas de sequência são suspensas — um processo pode mudar de grupo. Um processo nunca “some”
                  de fato: a listagem tem <b>fallback</b> que garante a exibição mesmo se um recurso recém-criado ainda não estiver
                  disponível no banco.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2">
              <AccordionTrigger className="text-sm text-left">Como reverter uma aprovação (ou negativa) na Etapa 3?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Na Etapa 3, a coordenação da UFI dispõe do botão <b className="text-foreground">“Reverter Aprovação / Cancelar Revisão”</b>,
                  que reabre a etapa para nova decisão — a ação fica registrada na trilha de auditoria.
                </p>
                <p>
                  Ao <b className="text-foreground">negar</b> a revisão, o sistema faz o <b>reset automático do switch “em bloco para revisão”</b>
                  na Etapa 2, obrigando a ACP a corrigir os dados e reativar o bloco antes de submeter novamente.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3">
              <AccordionTrigger className="text-sm text-left">Como os prazos de SLA são calculados?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  O sistema grava <b className="text-foreground">marcos temporais imutáveis</b> (event sourcing) numa tabela
                  <b> append-only</b>: cada vez que um processo cruza uma etapa ou é concluído, o instante real é carimbado pelo
                  banco. O <b className="text-foreground">Lead Time</b> (Lei de Little) e o <b className="text-foreground">SLA de retenção
                  por etapa</b> (Teoria das Filas) usam esses carimbos reais.
                </p>
                <p>
                  Processos <b>históricos</b> (anteriores à instrumentação) só têm os marcos de criação e conclusão — por isso aparecem
                  com o selo <b className="text-foreground">“estimativa (proxy)”</b>; os novos, medidos ponta a ponta, exibem
                  <b className="text-foreground"> “medição real”</b>.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* ===== BLOCO C · Governança e Perfis de Acesso ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" />C · Governança e Perfis de Acesso</CardTitle>
          <CardDescription>Quais ações competem a cada setor. As permissões são aplicadas no banco (RLS), não só na tela.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Perfil cor="#1C9CD8" nome="UFI — Gestão Financeira e Orçamentária" acoes="Etapa 1 (análise de orçamento), Etapa 3 (revisão da solicitação) e Etapa 5 (liberação de orçamento / Nota de Empenho)." />
          <Perfil cor="#003866" nome="ACP — Convênios e Parcerias" acoes="Etapa 2 (solicitação), Etapa 4 (assinaturas e envio) e Etapa 6 (liberação de recurso / liquidação de despesa), além da criação de lançamentos." />
          <Perfil cor="#7C3AED" nome="APC — Prestação de Contas" acoes="Módulo de Prestação de Contas: recebimento, análise (SES → CGM → baixa contábil), diligências e encerramento." />
          <Perfil cor="#D97706" nome="ADMIN — Administração" acoes="Configurações, matriz de assinaturas, Modo Retroativo, gestão de usuários, reabertura de processos e Logs de Acesso." />
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
            <Lock className="h-4 w-4 text-warning-foreground shrink-0 mt-0.5" />
            <span className="text-foreground">
              A <b>atribuição de setores/papéis</b> a novos usuários é restrita à tela de <b>administração</b> — o auto-cadastro não
              define setor. Isso protege o ecossistema contra escalonamento indevido de privilégios (segregação de funções).
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ===== REGRAS IMPORTANTES ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ScrollText className="h-4 w-4 text-primary" />Regras que ajudam no dia a dia</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <Feature icon={Gauge} titulo="Teto mensal é um guia, não uma trava">
            O valor solicitado pode ultrapassar o teto do mês, mas o sistema <b>exige uma justificativa</b> e sinaliza o
            estouro — sem bloquear o trabalho.
          </Feature>
          <Feature icon={RotateCcw} titulo="Reversão em cascata">
            Se você alterar um dado de uma etapa anterior já concluída, o sistema avisa e, com a sua confirmação,
            <b> anula as etapas seguintes</b> para manter a consistência.
          </Feature>
          <Feature icon={CheckCircle2} titulo="A anular × A complementar">
            <b>A anular</b> = Solicitado − Atestado (quando se pediu mais do que foi atestado). <b>A complementar</b> =
            Atestado − Solicitado (quando o atestado foi maior).
          </Feature>
          <Feature icon={Lock} titulo="Conclusão e reabertura">
            Concluído, o processo fica <b>somente leitura</b>. Um administrador pode <b>reabrir</b> quando necessário,
            ficando tudo registrado.
          </Feature>
          <Feature icon={Bell} titulo="Datas validadas">
            A competência não pode ser anterior ao início da vigência do convênio, e o mês de pagamento deve ser de
            <b> 1 a 6 meses</b> após a competência.
          </Feature>
          <Feature icon={Users} titulo="Assinaturas por papel">
            Cada bloco de assinatura tem os cargos esperados; alguns aceitam <b>um entre dois cargos</b> (ex.: Gerente
            ou Coordenador ACP) e ficam verdes quando completos.
          </Feature>
        </CardContent>
      </Card>

      {/* ===== PRESTAÇÃO DE CONTAS ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" />Módulo de Prestação de Contas (APC)</CardTitle>
          <CardDescription>Padrão inspirado no Transferegov e nas contas anuais ao TCE/SC.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <Feature icon={Timer} titulo="Prazo pela data do pagamento">
            O prazo (em dias, cadastrado em cada convênio) começa na <b>data do pagamento</b> informada na Etapa 6.
            O semáforo mostra: no prazo, vencendo (≤7 dias), atrasada, em análise, aprovada ou com pendências.
          </Feature>
          <Feature icon={Mail} titulo="Alertas D-7, D-3 e vencimento">
            O banco verifica os prazos diariamente e notifica o setor APC pelo sino e por e-mail. Cada marco é avisado
            <b> uma única vez</b> por lançamento — sem spam.
          </Feature>
          <Feature icon={CheckCircle2} titulo="Aprovado × glosado">
            Na análise, registra-se o <b>valor aprovado</b> (comprovado) e o <b>valor glosado</b>. O sistema avisa quando a
            soma difere do valor atestado, fechando o vínculo financeiro do ciclo.
          </Feature>
          <Feature icon={FileDown} titulo="Relatório Mensal Consolidado">
            Um PDF por competência (e por prestador, se filtrado) juntando empenho, pagamento e prestação de contas,
            com totais de comprovação e glosas — pronto para instruir as contas.
          </Feature>
        </CardContent>
      </Card>

      {/* ===== PAINEL POR SETOR ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><LayoutDashboard className="h-4 w-4 text-primary" />Painel de acompanhamento por setor</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <Feature icon={Bell} titulo="Ação necessária em um clique">
            Os alertas viram <b>chips clicáveis</b> que levam direto à página do problema: processo em atraso, prestação
            vencida, teto estourado, anulação sem documento.
          </Feature>
          <Feature icon={LayoutDashboard} titulo="Visão prioritária por setor">
            Quem é da <b>APC</b> abre o painel com os indicadores de prestação de contas em primeiro; ACP/UFI veem o
            financeiro primeiro. Mesmo painel, prioridades diferentes.
          </Feature>
          <Feature icon={Gauge} titulo="Acompanhamento das parcelas">
            Ao filtrar por um convênio, você vê o status de cada parcela (sem lançamento, em andamento, concluída ou
            pendente) e a <b>taxa de completude</b> do contrato até o mês atual.
          </Feature>
          <Feature icon={Bell} titulo="Situação da competência">
            Por convênio, o painel mostra a competência atual: contagem regressiva para iniciar, “fora do prazo”,
            “em andamento” e concluído.
          </Feature>
        </CardContent>
      </Card>

      {/* ===== SEGURANÇA ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Segurança da Informação</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <Feature icon={Lock} titulo="Controle de acesso por papel (RBAC)">
            Cada usuário é <b>ACP</b>, <b>UFI</b> ou <b>Administrador</b>. As permissões são aplicadas no banco de dados
            (RLS), não apenas na tela.
          </Feature>
          <Feature icon={GitBranch} titulo="Segregação de função ACP × UFI">
            A ACP edita as etapas da ACP e a UFI as etapas da UFI — barreira contra alterações indevidas em cada fase.
          </Feature>
          <Feature icon={ScrollText} titulo="Trilha de auditoria imutável">
            Toda alteração é registrada automaticamente (quem, quando, o quê) em log somente-anexação, que não pode ser
            editado ou apagado, e fica legível na linha do tempo de cada processo.
          </Feature>
          <Feature icon={ShieldCheck} titulo="Validação em dupla camada">
            Regras críticas (links válidos, datas, justificativas obrigatórias) são validadas na tela e reforçadas no
            banco, mesmo que a interface seja contornada.
          </Feature>
          <Feature icon={History} titulo="Log de acessos (LGPD)">
            Login, logout, navegação e emissão de relatórios deixam rastro em trilha <b>imutável</b> (sem edição nem
            exclusão), consultável por administradores na página <b>Logs de Acesso</b>, com filtros e exportação CSV.
          </Feature>
          <Feature icon={Users} titulo="Gestão de usuários com transparência">
            Página exclusiva de administradores: aprovação de acesso, papel e setor de cada servidor — e, ao clicar no
            nome, os <b>dados de acesso</b> (último login e ações recentes).
          </Feature>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Conformidade — LGPD</CardTitle>
            <CardDescription>Lei 13.709/2018</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p><b className="text-foreground">Finalidade e minimização (Art. 6º):</b> tratamos apenas os dados necessários ao empenho.</p>
            <p><b className="text-foreground">Registro das operações (Art. 37):</b> a trilha de auditoria comprova cada ato.</p>
            <p><b className="text-foreground">Segurança (Art. 46):</b> controle de acesso, log de acessos e prevenção a vazamentos.</p>
            <p><b className="text-foreground">Retenção com prazo (Arts. 15/16):</b> logs de acesso são eliminados automaticamente após o período de retenção (padrão 24 meses; nunca menos que os 6 meses do Marco Civil da Internet, Art. 15).</p>
            <p>Os logs guardam o identificador e o nome do servidor (ato oficial), não dados pessoais desnecessários.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Conformidade — ISO/IEC 27001:2022</CardTitle>
            <CardDescription>Controles do Anexo A aplicados</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1.5">
            <Ctrl c="A.5.3" t="Segregação de funções (ACP × UFI)" />
            <Ctrl c="A.5.15 / A.8.3" t="Controle e restrição de acesso" />
            <Ctrl c="A.8.2" t="Direitos de acesso privilegiado (admin)" />
            <Ctrl c="A.8.15 / A.8.16" t="Registro (logging) e monitoramento" />
            <Ctrl c="A.8.24" t="Proteção de segredos / criptografia" />
            <Ctrl c="A.8.28" t="Codificação segura" />
            <p className="text-xs text-muted-foreground pt-1">Melhoria contínua pelo ciclo PDCA.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" />Referências teóricas</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1.5 text-muted-foreground">
          <p>• <b className="text-foreground">LGPD</b> — Lei nº 13.709/2018 (Arts. 6º, 7º, 15, 16, 18, 37, 46) e <b className="text-foreground">Marco Civil da Internet</b> — Lei nº 12.965/2014 (Art. 15, guarda de logs).</p>
          <p>• <b className="text-foreground">BPMN 2.0</b> — Business Process Model and Notation (OMG), notação do mapa de processos desta página.</p>
          <p>• <b className="text-foreground">Transferegov (Plataforma +Brasil)</b> — modelo de prestação de contas com valores aprovado × glosado; <b className="text-foreground">TCE/SC</b> — estrutura das contas anuais que inspira o Relatório Mensal Consolidado.</p>
          <p>• <b className="text-foreground">ISO/IEC 27001:2022</b> — Sistema de Gestão de Segurança da Informação (Anexo A) e ciclo PDCA.</p>
          <p>• <b className="text-foreground">OWASP ASVS 4.0</b> e <b className="text-foreground">OWASP Top 10:2021</b> (A01 — Broken Access Control).</p>
          <p>• <b className="text-foreground">Saltzer & Schroeder (1975)</b> — menor privilégio e defesa em profundidade.</p>
          <p>• <b className="text-foreground">Nielsen</b> — 10 Heurísticas de Usabilidade (prevenção de erros, visibilidade do estado do sistema).</p>
          <p>• <b className="text-foreground">ISO/IEC 25010</b> — qualidade de produto de software (usabilidade, confiabilidade, segurança).</p>
          <p className="pt-2 text-xs">Identidade visual conforme o Manual de Identidade Visual 2026 da Prefeitura de Joinville (azul institucional Pantone 2955C / RGB 0·56·102; tipografia da família Myriad Pro).</p>
        </CardContent>
      </Card>

      {/* ===== CRÉDITOS INSTITUCIONAIS ===== */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Créditos e Co-autoria</CardTitle>
          <CardDescription>Secretaria Municipal de Saúde de Joinville · Área de Convênios e Parcerias (ACP)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            O desenvolvimento deste sistema representa a materialização técnica da inteligência operacional e governança da
            Secretaria Municipal de Saúde de Joinville. Enquanto as linhas de código dão estrutura à plataforma, foi a
            <b className="text-foreground"> expertise diária, o rigor técnico e a visão dos especialistas de negócio</b> que
            permitiram mapear e blindar este fluxo de integridade pública.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <GitBranch className="h-3.5 w-3.5" />Engenharia de Software e Arquitetura de Sistemas
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                <Credito nome="Bruno Vinícius da Silva" papel="Desenvolvimento e Estruturação de Código" />
              </ul>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <PenLine className="h-3.5 w-3.5" />Desenho Intelectual, Requisitos e Regras de Negócio
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Especialistas do Processo</div>
              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {["Bárbara do Amaral Pinto", "Ana Carolina Klein", "Joice Correa Gomes", "Heloisa Hoffmann", "Fernanda Dobrotnick dos Reis", "Renata Luiza da Silva", "Hugo Felipe Wittitz", "Edson Luiz Dissenha"].map((nome) => (
                  <Credito key={nome} nome={nome} />
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Credito({ nome, papel }: { nome: string; papel?: string }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" />
      <div>
        <div className="font-medium text-foreground leading-tight">{nome}</div>
        {papel && <div className="text-xs text-muted-foreground">{papel}</div>}
      </div>
    </li>
  );
}

function Cadastro({ icon: Icon, titulo, desc }: { icon: any; titulo: string; desc: string }) {
  return (
    <div className="flex-1 rounded-xl border bg-card px-3 py-3 min-w-0">
      <div className="flex items-center gap-2 font-semibold text-foreground"><Icon className="h-4 w-4 text-primary shrink-0" />{titulo}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
    </div>
  );
}

function Seta() {
  return (
    <div className="flex items-center justify-center text-muted-foreground">
      <ArrowRight className="h-4 w-4 hidden md:block" />
      <ArrowDown className="h-4 w-4 md:hidden" />
    </div>
  );
}

function Legenda({ cls, t }: { cls: string; t: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${cls}`} />{t}</span>;
}

function FlowStage({ n, titulo, setor, cor, acoes }: { n: number; titulo: string; setor: string; cor: string; acoes: string[] }) {
  return (
    <div className={`rounded-xl border border-l-4 bg-card px-4 py-3 ${COR[cor]}`}>
      <div className="flex items-center gap-3">
        <span className="flex-shrink-0 h-8 w-8 rounded-full text-sm font-bold flex items-center justify-center text-white" style={{ backgroundColor: "var(--c)" }}>{n}</span>
        <div className="font-semibold text-foreground">{titulo}</div>
        <Badge variant="outline" className="ml-auto text-[10px]">{setor}</Badge>
      </div>
      <ul className="mt-2 ml-11 list-disc text-sm text-muted-foreground space-y-0.5">
        {acoes.map((a, i) => <li key={i}>{a}</li>)}
      </ul>
    </div>
  );
}

function FlowStageF2({ n, titulo, setor, cor, acoes, signatarios, documentos, switches }: EtapaF2) {
  return (
    <div className={`rounded-xl border border-l-4 bg-card px-4 py-3 ${COR[cor]}`}>
      <div className="flex items-center gap-3">
        <span className="flex-shrink-0 h-8 w-8 rounded-full text-sm font-bold flex items-center justify-center text-white" style={{ backgroundColor: "var(--c)" }}>{n}</span>
        <div className="font-semibold text-foreground">{titulo}</div>
        <Badge variant="outline" className="ml-auto text-[10px]">{setor}</Badge>
      </div>
      <ul className="mt-2 ml-11 list-disc text-sm text-muted-foreground space-y-0.5">
        {acoes.map((a, i) => <li key={i}>{a}</li>)}
      </ul>
      {!!(signatarios?.length || documentos?.length || switches?.length) && (
        <div className="ml-11 mt-2 space-y-1.5">
          {signatarios?.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><PenLine className="h-3.5 w-3.5" />Signatários:</span>
              {signatarios.map((s, i) => <Badge key={i} className="bg-primary/10 text-primary hover:bg-primary/10 text-[10px] font-medium border border-primary/20">{s}</Badge>)}
            </div>
          ) : null}
          {documentos?.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><FileText className="h-3.5 w-3.5" />Documentos:</span>
              {documentos.map((d, i) => <Badge key={i} variant="outline" className="text-[10px] font-normal border-[#0E7490]/40 text-[#0E7490]">{d}</Badge>)}
            </div>
          ) : null}
          {switches?.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><Stamp className="h-3.5 w-3.5" />Validações:</span>
              {switches.map((s, i) => <Badge key={i} className="bg-warning/15 text-warning-foreground hover:bg-warning/15 text-[10px] font-medium border border-warning/30">{s}</Badge>)}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Perfil({ cor, nome, acoes }: { cor: string; nome: string; acoes: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border px-3 py-2">
      <span className="mt-1 h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: cor }} />
      <div>
        <div className="font-semibold text-foreground text-sm">{nome}</div>
        <div className="text-xs text-muted-foreground">{acoes}</div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, titulo, children }: { icon: any; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold text-foreground">{titulo}</div>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function Ctrl({ c, t }: { c: string; t: string }) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="font-mono text-[10px]">{c}</Badge>
      <span className="text-muted-foreground">{t}</span>
    </div>
  );
}
