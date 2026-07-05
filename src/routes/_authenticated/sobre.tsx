import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BpmnFluxo } from "@/components/BpmnFluxo";
import {
  ShieldCheck, ScrollText, Lock, GitBranch, BookOpen, Workflow, Building2, Landmark,
  FileSignature, ListChecks, ArrowRight, ArrowDown, LayoutDashboard, Gauge,
  RotateCcw, CheckCircle2, Users, Bell, ClipboardCheck, History, Mail, FileDown, Timer,
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

      {/* ===== FLUXOGRAMA BPMN ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" />Mapa do processo (BPMN 2.0)</CardTitle>
          <CardDescription>
            Notação BPMN — a mesma usada em ferramentas como o Bizagi: cada <b>piscina</b> é um processo, cada <b>raia</b> um
            responsável; losangos são decisões e a linha tracejada é a mensagem que liga o pagamento ao início da prestação de contas.
            Arraste para o lado para ver o fluxo completo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BpmnFluxo />
        </CardContent>
      </Card>

      {/* ===== CADASTROS BASE ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" />Como os cadastros se organizam</CardTitle>
          <CardDescription>A informação é cadastrada em cascata — cada nível depende do anterior.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-stretch gap-2 md:gap-1">
            <Cadastro icon={Building2} titulo="Prestador" desc="Instituição/OSC parceira. É a raiz de tudo." />
            <Seta />
            <Cadastro icon={Landmark} titulo="Convênio" desc="Objeto, teto mensal, nº de parcelas, vigência e prazo de prestação de contas (dias)." />
            <Seta />
            <Cadastro icon={FileSignature} titulo="Termo aditivo" desc="(Opcional) Renova/altera o convênio e pode ter teto próprio." />
            <Seta />
            <Cadastro icon={ListChecks} titulo="Lançamento" desc="O processo de uma parcela/competência — onde correm as 7 etapas." />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Cada lançamento pertence a um convênio (e, opcionalmente, a um termo aditivo) e representa uma parcela. A
            <b className="text-foreground"> data de início da vigência</b> e o <b className="text-foreground">nº de parcelas</b> do
            convênio alimentam o acompanhamento de parcelas e a taxa de completude no painel.
          </p>
        </CardContent>
      </Card>

      {/* ===== FLUXO DAS 7 ETAPAS ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" />Fluxo do processo (passo a passo)</CardTitle>
          <CardDescription>Da análise orçamentária à eventual anulação. A cor à esquerda indica o setor responsável.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4 text-xs">
            <Legenda cls="bg-[#1C9CD8]" t="UFI — Unidade de Gestão Financeira" />
            <Legenda cls="bg-[#003866]" t="ACP — Convênios e Parcerias" />
            <Legenda cls="bg-[#7C3AED]" t="APC — Prestação de Contas" />
            <Legenda cls="bg-[#D97706]" t="Anulação (quando há saldo)" />
          </div>
          <ol className="space-y-2">
            {ETAPAS.map((e, i) => (
              <li key={e.n}>
                <FlowStage {...e} />
                {i < ETAPAS.length - 1 && (
                  <div className="flex justify-center py-1"><ArrowDown className="h-4 w-4 text-muted-foreground" /></div>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <span className="text-foreground">Com tudo preenchido, o responsável clica em <b>“Concluir processo”</b> (com confirmação). Nada é concluído automaticamente.</span>
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
    </div>
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
