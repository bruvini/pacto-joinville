import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ScrollText, Lock, GitBranch, BookOpen, Workflow } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sobre")({
  head: () => ({ meta: [{ title: "Sobre o Sistema" }] }),
  component: SobrePage,
});

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
            Ferramenta para gerir e auditar os empenhos de convênios e parcerias da Saúde, substituindo o controle manual
            por planilhas. O objetivo é dar <b className="text-foreground">confiabilidade, rastreabilidade e previsibilidade</b> ao
            fluxo de repasses, reduzindo erro humano com validações automáticas, máscaras de dados e trilha de auditoria.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" />Como funciona o fluxo</CardTitle>
          <CardDescription>Etapas do processo, da solicitação à eventual anulação.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <Step n={1} titulo="Solicitação de Empenho" desc="A ACP solicita o empenho no SEI, informando valor solicitado, competência e o link do processo." />
            <Step n={2} titulo="Nota de Empenho" desc="O Financeiro autoriza e emite a Nota de Empenho. A ACO registra dotação, fonte, nº e valor do empenho líquido." />
            <Step n={3} titulo="Solicitação de Anulação" desc="Quando há saldo a devolver, a ACP solicita a anulação do empenho no SEI." />
            <Step n={4} titulo="Nota de Anulação" desc="O Financeiro emite a nota de anulação e o recurso retorna ao orçamento da Saúde." />
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Segurança da Informação</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <Feature icon={Lock} titulo="Controle de acesso por papel (RBAC)">
            Cada usuário é <b>ACP</b>, <b>ACO</b> ou <b>Administrador</b>. As permissões são aplicadas no banco de dados (RLS), não apenas na tela.
          </Feature>
          <Feature icon={GitBranch} titulo="Segregação de função ACP × ACO">
            A ACP só altera campos da ACP e a ACO só os da ACO — barreira contra alterações indevidas.
          </Feature>
          <Feature icon={ScrollText} titulo="Trilha de auditoria imutável">
            Toda alteração é registrada automaticamente (quem, quando, o quê) em log somente-anexação, que não pode ser editado ou apagado.
          </Feature>
          <Feature icon={ShieldCheck} titulo="Validação em dupla camada">
            Regras críticas (ex.: empenho ≤ solicitado) são validadas na tela e garantidas no banco, mesmo que a tela seja contornada.
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
            <p><b className="text-foreground">Segurança (Art. 46):</b> controle de acesso e prevenção a vazamentos.</p>
            <p>Os logs guardam o identificador e o nome do servidor (ato oficial), não dados pessoais desnecessários.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Conformidade — ISO/IEC 27001:2022</CardTitle>
            <CardDescription>Controles do Anexo A aplicados</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1.5">
            <Ctrl c="A.5.3" t="Segregação de funções (ACP × ACO)" />
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
          <p>• <b className="text-foreground">LGPD</b> — Lei nº 13.709/2018 (Arts. 6º, 7º, 18, 37, 46).</p>
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

function Step({ n, titulo, desc }: { n: number; titulo: string; desc: string }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">{n}</span>
      <div>
        <div className="font-semibold">{titulo}</div>
        <div className="text-muted-foreground">{desc}</div>
      </div>
    </li>
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
