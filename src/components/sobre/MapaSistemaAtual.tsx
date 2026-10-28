import { Link } from "@tanstack/react-router";
import {
  Activity, ArrowUpRight, BarChart3, BookOpenCheck, Building2, CalendarCheck2,
  ClipboardCheck, ClipboardList, Cloud, Code2, Database, FileCheck2,
  FileSpreadsheet, FileText, GitBranch, Landmark, Layers3, LockKeyhole,
  Network, ShieldCheck, Stethoscope, Timer, Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PVH_ETAPAS } from "@/lib/pvh/etapas";
import { PISO_ETAPAS } from "@/lib/piso/etapas";
import { CACON_ETAPAS } from "@/lib/cacon/etapas";

/** Mapa documental do que está implementado, não um catálogo de recursos planejados. */
const modulos = [
  {
    id: "convenios", nome: "Empenhos de Contratos", rota: "/lancamentos",
    icone: FileText, cor: "text-sky-700 dark:text-sky-300",
    descricao: "Solicitação, revisão, empenho, liquidação, pagamento e eventual anulação de instrumentos e parcelas.",
    recursos: [
      "Dois fluxos documentados: Padrão Hospitalar e Liquidação Direta / Complementar.",
      "Prestador → convênio → termo aditivo (opcional) → lançamento; competências agrupadas com pai/filhos.",
      "Assinaturas por papel, números e links SEI, controle de prazos, revisão e conclusão explícita.",
    ],
    passos: ["Orçamento", "Solicitação", "Revisão", "Assinaturas e envio", "Empenho", "Liberação / liquidação", "Anulação quando aplicável"],
  },
  {
    id: "piso", nome: "Piso da Enfermagem", rota: "/piso",
    icone: Stethoscope, cor: "text-emerald-700 dark:text-emerald-300",
    descricao: "Assistência financeira complementar: da carga de dados e conciliação até as obrigações e o pagamento às instituições.",
    recursos: [
      "Competências mensais e parcela adicional do 13º com tratamento próprio.",
      "Conferência das planilhas e dados do InvestSUS, portarias, obrigações por instituição e documentos SEI.",
      "Trilhas paralelas de atos e execução financeira; anulação condicional 7A quando existir saldo e reconferência de etapas impactadas.",
    ],
    passos: PISO_ETAPAS.map(item => item.titulo),
  },
  {
    id: "pvh", nome: "Programa de Valorização dos Hospitais", rota: "/pvh",
    icone: Landmark, cor: "text-indigo-700 dark:text-indigo-300",
    descricao: "Execução das competências do PVH com valores oficiais por instituição e documentação estadual e municipal.",
    recursos: [
      "Portaria SES mensal, vinculação de normas, participantes/CNES e crédito no FMS.",
      "Minuta e memorando municipais com HTML formatado para o SEI e hyperlinks da portaria cadastrada na Etapa 1.",
      "Empenhos, subempenho/liquidação, repasses, comunicação, encerramento e pendências de prazo.",
    ],
    passos: PVH_ETAPAS.map(item => item.titulo),
  },
  {
    id: "cacon", nome: "Dieta CACON", rota: "/cacon",
    icone: ClipboardList, cor: "text-amber-700 dark:text-amber-300",
    descricao: "Conferência documental e financeira da produção do Hospital Municipal São José destinada ao fluxo CACON.",
    recursos: [
      "Recebimento do memorando e anexo encaminhados pelo hospital.",
      "Preservação do PDF original, extração de indicadores e conferência humana da competência.",
      "Memorando da SMS, assinaturas e encaminhamento à unidade financeira.",
    ],
    passos: CACON_ETAPAS.map(item => item.titulo),
  },
] as const;

const transversais = [
  {
    nome: "Dashboard integrado", rota: "/dashboard", icone: BarChart3,
    descricao: "Visão dos quatro módulos com filtros por módulo, prestador, competência e ano; indicadores financeiros, pendências, esteiras, atividade e evolução.",
    detalhe: "Lead Time geral = média ponderada pela quantidade de processos concluídos válidos. A origem e o fim são diferentes conforme cada fluxo.",
  },
  {
    nome: "Central da Planilha", rota: "/planilha-atualizacao", icone: FileSpreadsheet,
    descricao: "Consolidação de Convênios, Piso e PVH, em modo somente leitura; busca, filtros cruzados, competências em ordem decrescente e exportação CSV.",
    detalhe: "Números SEI copiáveis e links separados, sem tratar pagamento como valor atestado nem dividir artificialmente uma nota anual.",
  },
  {
    nome: "Auditoria de Anulações", rota: "/auditoria", icone: ShieldCheck,
    descricao: "Consulta e confronto das solicitações de anulação dos Convênios e das obrigações financeiras do Piso.",
    detalhe: "Identifica valores, documentos, instituições e contratos; a projeção do saldo não substitui o aviso efetivo da SEFAZ.",
  },
  {
    nome: "Prestação de Contas", rota: "/prestacao-contas", icone: ClipboardCheck,
    descricao: "Acompanhamento das prestações de Convênios e do universo PVH aplicável, conforme regras e prazos de cada instrumento.",
    detalhe: "Pendências, acompanhamento documental, referências SEI, análise financeira e relatórios para impressão e conferência.",
  },
] as const;

function TituloBloco({ icone: Icon, children }: { icone: LucideIcon; children: React.ReactNode }) {
  return <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" />{children}</span>;
}

export function MapaSistemaAtual() {
  return (
    <div className="space-y-6">
      <section id="modulos" className="scroll-mt-20 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-primary">Módulos de execução financeira</h2>
            <p className="text-sm text-muted-foreground">Quatro fluxos com regras e documentos próprios; uma mesma plataforma de acompanhamento.</p>
          </div>
          <Badge variant="outline">4 módulos</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {modulos.map((m) => (
            <Card key={m.id} className="flex flex-col border-border/80">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-muted p-2"><m.icone className={'h-5 w-5 ' + m.cor} /></div>
                    <CardTitle className="text-base">{m.nome}</CardTitle>
                  </div>
                  <Link to={m.rota} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Abrir <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <CardDescription className="leading-relaxed">{m.descricao}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-1.5 text-muted-foreground">
                  {m.recursos.map(texto => <li key={texto} className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />{texto}</li>)}
                </ul>
                <div className="border-t pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Etapas e marcos do fluxo</p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.passos.map((titulo, i) => (
                      <span key={titulo + i} className="rounded-md border bg-muted/40 px-2 py-1 text-[11px] leading-snug">{i + 1}. {titulo}</span>
                    ))}
                    {m.id === "piso" && <span className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px]">7A · Anulação condicional</span>}
                  </div>
                  {m.id === "piso" && <p className="mt-2 text-xs text-muted-foreground">Na parcela do 13º, a etapa inicial mensal não se aplica e a numeração visível é ajustada. Etapas 5–8 não compõem uma fila estritamente linear.</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm"><TituloBloco icone={Landmark}>Execução de Emendas Parlamentares</TituloBloco></CardTitle>
              <Badge variant="outline">Fase 1 · Fundação</Badge>
              <Link to="/emendas" className="text-xs font-medium text-primary hover:underline">Abrir cadastro</Link>
            </div>
            <CardDescription>Domínio independente de Emendas, vinculado aos cadastros de instituições, convênios e termos.</CardDescription>
          </CardHeader>
          <CardContent className="text-xs leading-relaxed text-muted-foreground">
            Cadastro da emenda, proposta, referências SEI, dotações/fontes, documentos múltiplos,
            ajustes formais de limite e histórico auditável. A execução de solicitações de empenho,
            NE, competências filhas, pagamentos e anulações ainda não está habilitada.
          </CardContent>
        </Card>
      </section>

      <section id="integracoes" className="scroll-mt-20 space-y-3">
        <div>
          <h2 className="text-lg font-bold text-primary">Centrais de controle e acompanhamento</h2>
          <p className="text-sm text-muted-foreground">Funcionalidades transversais, sem confundir as regras financeiras de cada módulo.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {transversais.map((item) => (
            <Card key={item.rota}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm"><TituloBloco icone={item.icone}>{item.nome}</TituloBloco></CardTitle>
                  <Link to={item.rota} className="text-xs font-medium text-primary hover:underline">Acessar</Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{item.descricao}</p>
                <p className="border-l-2 border-primary/30 pl-3 text-xs leading-relaxed text-muted-foreground">{item.detalhe}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="indicadores" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="text-base"><TituloBloco icone={Timer}>Como interpretar o Lead Time e o SLA</TituloBloco></CardTitle>
            <CardDescription>Indicadores derivados de datas e eventos dos processos; não são a soma das durações de todas as etapas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="font-semibold">Lead Time geral — média ponderada por processo concluído</p>
              <p className="mt-1 text-muted-foreground">Cada processo elegível entra uma vez na amostra, usando dias corridos entre abertura e encerramento. Com todos os módulos selecionados, a média considera as quantidades de processos de cada módulo — não a média simples de quatro números.</p>
              <p className="mt-2 font-mono text-xs text-foreground/90">Lead Time = soma dos dias de cada processo concluído ÷ número de processos concluídos válidos</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["Convênios", "Marco de criação → marco de conclusão do lançamento."],
                ["Piso", "Criação → data registrada de encerramento da competência."],
                ["CACON", "Criação → encaminhamento conclusivo à UFI."],
                ["PVH", "Criação → data registrada de encerramento da competência."],
              ].map(([nome, descricao]) => <div key={nome} className="rounded-md border px-3 py-2"><b>{nome}</b><p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p></div>)}
            </div>
            <p className="text-xs text-muted-foreground">
              O filtro por módulo altera quais processos compõem o indicador; os filtros de prestador e competência delimitam o recorte disponível.
              Registros não concluídos, sem datas válidas ou com término anterior ao início são excluídos. O SLA por etapa mede intervalos específicos e pode envolver etapas paralelas; não deve ser somado para obter o Lead Time. Sem amostras suficientes, o resultado é indisponível, não zero.
            </p>
          </CardContent>
        </Card>
      </section>

      <section id="arquitetura" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="text-base"><TituloBloco icone={Network}>Arquitetura, dados e governança técnica</TituloBloco></CardTitle>
            <CardDescription>Como a plataforma está estruturada e quais são os limites entre sistema, banco e documentos oficiais.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
            {[
              { icon: Code2, titulo: "Aplicação web", texto: "React e TypeScript, TanStack Start/Router para rotas, TanStack Query para consultas e cache, Tailwind CSS e componentes acessíveis. Rotas coordenam telas, bibliotecas de domínio concentram as regras e componentes organizam cada fluxo." },
              { icon: Database, titulo: "Persistência e autenticação", texto: "Supabase/PostgreSQL com autenticação, papéis de usuário, políticas Row Level Security, arquivos de evidência e registros históricos. O schema versionado fica em migrations SQL e os tipos em src/integrations/supabase/types.ts." },
              { icon: LockKeyhole, titulo: "Acesso e auditoria", texto: "Entrada autenticada com perfil aprovado; papéis técnicos admin, acp e aco (UFI). Operações críticas dependem das permissões do banco. Históricos de alteração, acessos e assinaturas apoiam a prestação de contas e a rastreabilidade." },
              { icon: GitBranch, titulo: "Versionamento e validação", texto: "Código no GitHub, integrado ao Lovable. Testes automatizados com Vitest, checagens de ambiente/schema/arquitetura e build via Vite; a pipeline de integração executa testes e compilação. Build bem-sucedido não comprova conformidade institucional nem ausência de falhas funcionais." },
            ].map((item) => (
              <div key={item.titulo} className="rounded-lg border p-3">
                <p className="flex items-center gap-2 font-semibold"><item.icon className="h-4 w-4 text-primary" />{item.titulo}</p>
                <p className="mt-1.5 text-muted-foreground leading-relaxed">{item.texto}</p>
              </div>
            ))}
            <div className="md:col-span-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">Integrações documentais não equivalem a execução nos sistemas externos</p>
              <p className="mt-1">A plataforma armazena referências SEI, números, links, documentos e comprovantes; oferece textos-base formatados para copiar ao SEI, e concilia dados de portarias e planilhas oficiais. Publicação, assinatura, liquidação, pagamento e envio externo precisam ser efetivamente realizados e registrados pelos responsáveis. Validações e relatórios não substituem a conferência humana nem os sistemas oficiais.</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
