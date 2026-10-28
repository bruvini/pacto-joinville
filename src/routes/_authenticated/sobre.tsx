import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BpmnFluxo } from "@/components/BpmnFluxo";
import { BpmnModulos } from "@/components/sobre/BpmnModulos";
import { MapaSistemaAtual } from "@/components/sobre/MapaSistemaAtual";
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
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-primary">Sobre o Sistema</h1>
        <p className="text-sm text-muted-foreground">
          Gestão de Convênios e Parcerias · Secretaria Municipal da Saúde de Joinville · ACP
        </p>
        <p className="text-xs text-muted-foreground">Documentação funcional alinhada à implementação de outubro de 2026.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-4 w-4 text-primary" />Uma plataforma, quatro fluxos financeiros</CardTitle>
          <CardDescription>Execução, controle documental, rastreabilidade e apoio à decisão na gestão dos recursos da saúde.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            A plataforma organiza os <b className="text-foreground">Empenhos de Contratos, Piso da Enfermagem,
            Programa de Valorização dos Hospitais (PVH) e Dieta CACON</b>. Cada módulo mantém suas competências,
            atos, regras de negócio, evidências SEI e critérios de conclusão. Não se trata de uma única
            sequência de empenhos aplicada indiscriminadamente a todos os programas.
          </p>
          <p>
            Um novo domínio, <b className="text-foreground">Execução de Emendas Parlamentares</b>,
            avançou à Fase 4: cadastro e lançamento com parcelas previstas, etapas
            documentais sequenciais, conferência de assinaturas e NE emitida.
            Também permite registrar comprovantes, liberações originais e complementares,
            blocos internos de pagamento e encerramento sem execução por competência,
            sem executar transações bancárias ou na SEFAZ.
          </p>
          <p>
            O trabalho é complementado por um <b className="text-foreground">dashboard com indicadores dos
            quatro módulos</b>, Central da Planilha, Auditoria de Anulações, Prestação de Contas,
            cadastros, configurações e trilhas de auditoria. O objetivo é tornar visíveis os prazos,
            os valores e as decisões de cada processo, apoiando o trabalho da ACP e das áreas parceiras.
          </p>
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {[
              ["Módulos", "modulos"], ["Centrais", "integracoes"], ["Indicadores", "indicadores"],
              ["Fluxos dos contratos", "fluxos-convenios"], ["Arquitetura", "arquitetura"],
              ["Ajuda", "ajuda"],
            ].map(([nome, ancora]) => (
              <a key={ancora} href={"#" + ancora} className="rounded-full border px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted">{nome}</a>
            ))}
          </div>
        </CardContent>
      </Card>

      <MapaSistemaAtual />

      {/* ===== ZONA DE FLUXOS — ABAS (Fluxo 1 × Fluxo 2) ===== */}
      <Card id="fluxos-convenios" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" />Mapas BPMN dos Processos do Sistema</CardTitle>
          <CardDescription>
            Selecione uma das cinco abas para visualizar as dependências, responsáveis, documentos e decisões de cada processo.
            Os dois fluxos de Convênios foram preservados; Piso, PVH e Dieta CACON possuem diagramas específicos. Use Tela cheia para ampliar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="fluxo1">
            <TabsList className="mb-3 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
              <TabsTrigger className="h-auto py-2 text-xs sm:text-sm" value="fluxo1">Convênios · Fluxo 1 (Hospitalar)</TabsTrigger>
              <TabsTrigger className="h-auto py-2 text-xs sm:text-sm" value="fluxo2">Convênios · Fluxo 2 (Direta)</TabsTrigger>
              <TabsTrigger className="h-auto py-2 text-xs sm:text-sm" value="piso">Piso da Enfermagem</TabsTrigger>
              <TabsTrigger className="h-auto py-2 text-xs sm:text-sm" value="pvh">PVH</TabsTrigger>
              <TabsTrigger className="h-auto py-2 text-xs sm:text-sm" value="cacon">Dieta CACON</TabsTrigger>
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

            <TabsContent value="piso" className="space-y-4">
              <BpmnModulos modulo="piso" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                O Piso combina atos e conciliação com a execução financeira. O alternador acima mostra
                a competência mensal ou a parcela adicional do 13º. A 7A representa a anulação
                condicional por obrigação; sua confirmação exige documentos da SEFAZ.
              </p>
            </TabsContent>
            <TabsContent value="pvh" className="space-y-4">
              <BpmnModulos modulo="pvh" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                No PVH, atos e empenhos podem avançar paralelamente. O encerramento depende
                da conciliação de valores estaduais, municipais, subempenhos, pagamentos e comunicações
                aplicáveis. A prestação de contas posterior permanece uma obrigação própria.
              </p>
            </TabsContent>
            <TabsContent value="cacon" className="space-y-4">
              <BpmnModulos modulo="cacon" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                A auditoria do PDF do HMSJ exige confirmação humana antes do memorando da SMS.
                Divergências ou críticas precisam ser corrigidas antes do encaminhamento à UFI.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>


      <section id="ajuda" className="scroll-mt-20 space-y-3">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-primary">Ajuda, regras e governança</h2>
          <Badge variant="outline" className="text-[10px]">Referência operacional</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4 text-primary" />Como os cadastros se relacionam</CardTitle>
            <CardDescription>O encadeamento abaixo pertence aos Empenhos de Contratos. Os demais módulos utilizam suas competências e entidades próprias.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-1">
              <Cadastro icon={Building2} titulo="Prestador" desc="Instituição ou organização vinculada ao instrumento." />
              <Seta />
              <Cadastro icon={Landmark} titulo="Convênio" desc="Objeto, fluxo, vigência, parcelas e regras de valor." />
              <Seta />
              <Cadastro icon={FileSignature} titulo="Termo Aditivo" desc="Opcional; ajusta condições e período do instrumento." />
              <Seta />
              <Cadastro icon={ListChecks} titulo="Lançamento" desc="Parcela ou competência com andamento próprio." />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Um lançamento pode referenciar termo aditivo e apresentar agrupamento de competências com
              lançamentos pai/filho. A Central da Planilha consolida Convênios, Piso e PVH, mas não altera os
              cadastros ou a origem de seus valores.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><HelpCircle className="h-4 w-4 text-primary" />Perguntas frequentes</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="prazo">
                <AccordionTrigger className="text-left text-sm">Por que há um processo em alerta ou em atraso?</AccordionTrigger>
                <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Os alertas dependem da competência, do instrumento, do marco de prazo e das evidências da etapa. Os Empenhos de Contratos podem ter lançamentos agrupados (pai/filhos); os outros módulos utilizam suas próprias regras de pagamento, abertura, envio e reconferência.</p>
                  <p>Use o filtro do Dashboard ou abra a competência na esteira correspondente para identificar a pendência. A conclusão de uma etapa não equivale automaticamente à quitação financeira nem à entrega da prestação de contas.</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="lead">
                <AccordionTrigger className="text-left text-sm">Como é calculado o Lead Time geral?</AccordionTrigger>
                <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                  <p>O indicador considera uma amostra por processo concluído com datas válidas. Usa dias corridos da criação até a conclusão/encerramento registrada e pondera todos os processos selecionados, em vez de atribuir peso igual a cada módulo.</p>
                  <p>Convênios usam marcos de criação e conclusão; Piso e PVH usam o encerramento das competências; CACON usa o encaminhamento conclusivo à UFI. Os filtros delimitam as amostras. SLA por etapa e Lead Time não são a mesma métrica.</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="piso">
                <AccordionTrigger className="text-left text-sm">No Piso, por que algumas etapas andam em paralelo ou aparece a 7A?</AccordionTrigger>
                <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                  <p>A preparação normativa e a execução financeira possuem dependências próprias. Pagamento e notificação podem avançar em paralelo após a etapa financeira exigida. A <b>7A — Anulação de empenho</b> só se aplica quando a obrigação possui saldo a anular; a efetividade depende da documentação correspondente.</p>
                  <p>A parcela adicional do 13º tem fluxo reduzido com cálculo e portaria federal específicos. Etapas reabertas ou alteradas podem demandar reconferência de etapas dependentes.</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="sei">
                <AccordionTrigger className="text-left text-sm">Os links do SEI e os textos-base substituem a emissão do documento?</AccordionTrigger>
                <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Não. Os campos preservam números, links, datas, assinaturas registradas e rastreabilidade. No PVH, a minuta e o memorando são gerados com formatação para copiar ao SEI; referências à Portaria SES mensal usam o endereço cadastrado na primeira etapa, quando válido.</p>
                  <p>A emissão, assinatura, publicação e o envio formal precisam ocorrer nos sistemas competentes. O texto-base é um apoio à elaboração e deve ser conferido antes de utilizado.</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="dados">
                <AccordionTrigger className="text-left text-sm">Por que há valores previstos, empenhados, atestados e pagos separados?</AccordionTrigger>
                <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Cada número representa uma operação financeira diferente. A Central da Planilha é somente leitura e não transforma comprovantes de pagamento em atesto, nem rateia automaticamente notas de empenho anuais. As anulações previstas não devem ser confundidas com avisos efetivos da SEFAZ.</p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" />Governança e perfis de acesso</CardTitle>
            <CardDescription>Três papéis técnicos de autenticação. As áreas operacionais e seus fluxos não precisam corresponder a papéis exclusivos no banco.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Perfil cor="#1C9CD8" nome="UFI — papel aco" acoes="Atuação financeira e orçamentária; análise de orçamento, revisão da solicitação e etapas de liberação atribuídas à UFI." />
            <Perfil cor="#003866" nome="ACP — papel acp" acoes="Criação e execução dos processos operacionais, solicitação de empenho, documentação, assinaturas e etapas atribuídas à ACP." />
            <Perfil cor="#D97706" nome="ADMIN — administração" acoes="Gestão de usuários e papéis, configurações, acesso a logs e funcionalidades administrativas condicionadas à autorização." />
            <div className="rounded-lg border p-3 text-xs leading-relaxed text-muted-foreground">
              <b className="text-foreground">APC — Prestação de Contas</b> é uma função/área operacional descrita nos processos,
              não um quarto papel técnico independente na tabela de papéis do sistema. A autenticação exige conta aprovada,
              e a autorização efetiva depende das políticas RLS e das demais regras de acesso.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Segurança, rastreabilidade e limites de conformidade</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            <Feature icon={Lock} titulo="Autenticação e menor privilégio">Login pelo Supabase Auth, aprovação de papéis e restrições no banco por RLS. Ocultar uma ação no menu não substitui autorização na camada de dados.</Feature>
            <Feature icon={History} titulo="Históricos e logs">Eventos de processos, assinaturas e acessos auxiliam a reconstrução das decisões. Navegação é registrada de forma não bloqueante; uma falha de gravação não derruba o sistema.</Feature>
            <Feature icon={FileSignature} titulo="SEI e evidências">Números, links e documentos precisam de conferência com a fonte oficial. Os textos gerados e a visualização interna não têm valor de assinatura ou publicação formal.</Feature>
            <Feature icon={BookOpen} titulo="LGPD e controles técnicos">Minimização, controle de acesso, retenção e registro das operações fazem parte da arquitetura. Referenciar LGPD ou controles da ISO/IEC 27001 não equivale a certificação ou atestado jurídico de conformidade.</Feature>
          </CardContent>
        </Card>
      </section>

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
