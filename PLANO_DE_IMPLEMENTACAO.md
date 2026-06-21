# Plano de Implementação — Sistema de Gestão e Auditoria de Empenhos
**Secretaria Municipal de Saúde de Joinville · Área de Convênios e Parcerias (ACP)**

> Documento técnico de diagnóstico + roadmap. Cada bloco traz: o que será feito, onde (camada), e a **referência teórica** que fundamenta a decisão.

---

## 0. Stack atual (mapeada no código)

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TanStack Start (SSR) + TanStack Router + TanStack Query |
| UI | Tailwind v4 + shadcn/ui (Radix) + lucide-react + sonner |
| Validação | Zod + react-hook-form (**instalados, mas não usados**) |
| Dados/Auth | Supabase (Postgres + Auth + RLS) |
| Build | Vite 8 + Bun, deploy via Lovable Cloud |
| Já presente | `recharts` (gráficos), `xlsx` (export), `date-fns` |

O modelo de dados central é `lancamentos_pagamento`, que une o painel **ACP** (solicita/atesta) e o painel **ACO** (empenha), com fluxo de 4 etapas (`etapa_processo`), matriz de assinaturas SEI versionada por lançamento, `historico_logs` (trilha de auditoria), `notas_comentarios`, `sla_config` e `notificacoes_log`.

---

## 1. Diagnóstico — o que está bom e o que está ruim

### ✅ Pontos fortes (preservar)
1. **Coluna gerada `valor_anulado`** = `valor_solicitado − valor_atestado` (`GENERATED ALWAYS … STORED`). É *single source of truth* no banco — exatamente a fórmula que você pediu no item 1. **Não recriar isso no frontend.**
2. **Separação de papéis em tabela própria** (`user_roles` + função `has_role` `SECURITY DEFINER`). Evita o antipadrão de guardar “role” no perfil do usuário (que permitiria escalonamento de privilégio). Boa base — só falta *usar*.
3. **Snapshot da matriz de assinaturas por lançamento**: alterar a matriz não reescreve o histórico. Isso é integridade de auditoria correta.
4. **RLS habilitado em todas as tabelas** e middleware server-side que valida o Bearer token via `getClaims`.
5. **Design tokens institucionais** em OKLCH (azul `#003366`, ciano ACP, verde sucesso, âmbar warning) já no `styles.css`, com dark mode. A identidade visual pedida nos gráficos já existe como variável.

### ❌ Pontos fracos / riscos (corrigir — ordem de prioridade)

| # | Problema | Impacto | Severidade |
|---|---|---|---|
| F1 | **RLS é só decorativa**: toda policy é `USING (true) WITH CHECK (true)` para `authenticated`. Qualquer usuário logado lê/edita/**apaga** todos os dados financeiros, independentemente de ser admin/acp/aco. O sistema de papéis nunca é aplicado. | Quebra de controle de acesso (OWASP A01). Viola LGPD Art. 46 e ISO 27001 A.5.15/A.8.3. | 🔴 Crítica |
| F2 | **Trilha de auditoria mutável**: `historico_logs` concede UPDATE e DELETE. Assinaturas podem ser marcadas por qualquer um por qualquer um. | Log de auditoria que pode ser adulterado não tem valor probatório. Viola ISO 27001 A.8.15 e o princípio de *accountability* da LGPD (Art. 37). | 🔴 Crítica |
| F3 | **`.env` versionado no git** (não está no `.gitignore`). Hoje contém só a *publishable/anon key* (projetada para ser pública e protegida por RLS — risco baixo **se** a RLS for corrigida), mas o padrão convida a vazar uma `service_role` no futuro. | Risco de exposição de segredo. ISO 27001 A.8.24/A.5.10. | 🟠 Alta |
| F4 | **Nenhuma regra de negócio no banco**: as travas que você pediu (empenho ≤ solicitado; soma dos empenhos parciais ≤ teto do convênio mãe) não existem em lugar nenhum. Valores trafegam como `string` e sofrem `Number()`. | Inconsistência financeira silenciosa. | 🟠 Alta |
| F5 | **`convenios` não tem campo de valor total** (teto). Sem isso, a “auditoria de saldo do convênio mãe” é impossível. | Bloqueia uma feature pedida. | 🟠 Alta |
| F6 | **Sem máscaras** (moeda, MM/AAAA) e **links SEI** exibidos como URL crua em `<input>`. | UX e os itens 2 do pedido. | 🟡 Média |
| F7 | **`any` em todo o código** (`useState<any>`, `(l: any)`) — descarta os tipos `Database` já gerados. | Bugs em runtime, refactors arriscados. | 🟡 Média |
| F8 | **Notificações são simuladas** (só inserem linha em `notificacoes_log`). Você pediu “atualizações automáticas”. | Expectativa do usuário. | 🟡 Média |
| F9 | **Autorização só no cliente**: a sidebar mostra tudo para todos; rotas não filtram por papel. | Defesa em profundidade. | 🟡 Média |
| F10 | **PII em log**: `usuario_nome` grava o e-mail do usuário em `historico_logs`. | Minimização de dados (LGPD Art. 6, III). | 🟢 Baixa |

---

## 2. Princípios e referências teóricas que guiam o plano

- **LGPD (Lei 13.709/2018)** — Art. 6º (finalidade, adequação, **necessidade/minimização**, segurança, prevenção), Art. 37 (registro das operações de tratamento), Art. 46 (medidas de segurança), Art. 18 (direitos do titular).
- **ISO/IEC 27001:2022 — Anexo A**: A.5.15 (controle de acesso), A.5.18 (direitos de acesso), A.8.2/A.8.3 (acesso privilegiado e restrição de acesso à informação), A.8.5 (autenticação segura), A.8.15 (registro/logging), A.8.16 (monitoramento), A.8.24 (criptografia), A.8.28 (codificação segura). **Ciclo PDCA** para melhoria contínua e gestão de riscos.
- **Defesa em profundidade & menor privilégio** — Saltzer & Schroeder, *“The Protection of Information in Computer Systems”* (1975).
- **OWASP ASVS 4.0** e **OWASP Top 10:2021** (A01 Broken Access Control) — base para RLS e validação dupla (cliente + servidor).
- **Nielsen — 10 Heurísticas de Usabilidade** (especialmente *visibility of system status* e *error prevention*) — fundamenta a validação em tempo real do item 1.
- **ISO/IEC 25010** (qualidade de produto de software: usabilidade, confiabilidade, segurança) — métrica de UX.
- **Octalysis (Yu-kai Chou)** e **Self-Determination Theory (Deci & Ryan)** — fundamentam a gamificação (competência, autonomia, progresso) sem cair em “pontos vazios”.
- **Postgres**: colunas geradas, *CHECK constraints*, *triggers*, funções `SECURITY DEFINER`, transações para checagem atômica de saldo (docs oficiais PostgreSQL 15+).

---

## 3. Roadmap em fases

A ordem é deliberada: **segurança e fundação de dados primeiro** (sem isso, toda feature nova herda os furos F1–F4), depois as features de produto.

---

### FASE 0 — Fundação de Segurança & Conformidade (LGPD/ISO 27001)
*Pré-requisito de tudo. Resolve F1, F2, F3, F9, F10.*

**0.1 — RBAC real na RLS** (resolve F1)
- Substituir todas as policies `USING (true)` por policies baseadas em `has_role()`:
  - Leitura: `authenticated` pode ler (ou restringir por papel se desejado).
  - Escrita em campos ACP → exige papel `acp` ou `admin`; campos ACO → papel `aco` ou `admin`. Como ACP e ACO editam a *mesma* tabela, a separação por coluna se faz via **trigger `BEFORE UPDATE`** que rejeita alteração de colunas fora do escopo do papel (ou via duas RPCs dedicadas `salvar_dados_acp` / `salvar_dados_aco`).
  - `DELETE` de lançamentos/convênios/prestadores → só `admin`.
- *Referência:* ISO 27001 A.8.3, A.5.18; OWASP A01; menor privilégio (Saltzer & Schroeder).

**0.2 — Trilha de auditoria imutável** (resolve F2)
- Remover `UPDATE`/`DELETE` de `historico_logs` e `assinaturas_lancamento` para `authenticated` (manter só `INSERT`/`SELECT`).
- Trocar a escrita manual de log no frontend por **triggers `AFTER INSERT/UPDATE`** em `lancamentos_pagamento` que gravam o *diff* (campo, valor antigo, valor novo, autor `auth.uid()`, timestamp). Assim nenhum log depende do cliente — e não pode ser burlado.
- Assinatura só pode ser marcada/desmarcada pelo próprio fluxo, registrando `assinado_por = auth.uid()`.
- *Referência:* ISO 27001 A.8.15 (logging) e A.8.16 (monitoring); LGPD Art. 37 (registro das operações).

**0.3 — Higiene de segredos** (resolve F3)
- Adicionar `.env` ao `.gitignore`; remover do índice (`git rm --cached .env`); manter um `.env.example` sem valores.
- Garantir que **nenhuma** `service_role key` viva no frontend nem no repo (confirmar: hoje não há — manter assim).
- *Referência:* ISO 27001 A.8.24 (criptografia/segredos), A.5.10 (uso aceitável de informação).

**0.4 — Defesa em profundidade no roteamento** (resolve F9)
- `beforeLoad` das rotas sensíveis (ex.: `/configuracoes`) checa papel via claims; sidebar esconde itens que o papel não acessa. **Mas a checagem real continua na RLS** (cliente nunca é fonte de verdade).
- *Referência:* OWASP ASVS V1/V4; defesa em profundidade.

**0.5 — Minimização de PII** (resolve F10)
- Logar `usuario_id` (UUID) em vez de e-mail; resolver o nome só na exibição. Documentar finalidade de cada dado pessoal coletado (CNPJ, nome de servidor) num **registro de tratamento** (`ROPA`) simples no README de conformidade.
- *Referência:* LGPD Art. 6º III (necessidade) e Art. 37.

**0.6 — Política de retenção & backup**
- Definir retenção dos logs (ex.: 5 anos, alinhado a prazos de prestação de contas do SUS) e confirmar backups automáticos do Supabase. Documentar.
- *Referência:* ISO 27001 A.8.13 (backup); ciclo PDCA.

**Entregável da fase:** nova migration `..._seguranca_rbac_auditoria.sql` + `CONFORMIDADE.md` (mapa LGPD↔ISO↔controle implementado).

---

### FASE 1 — Validações, Travas e Máscaras (itens 1 e 2 do pedido)
*Resolve F4, F6, F7. Validação em DUAS camadas (cliente p/ UX, servidor p/ verdade).*

**1.1 — Camada de domínio com Zod** (resolve F7 parcialmente)
- Criar `src/lib/schemas.ts` com schemas Zod para ACP e ACO, refletindo as regras:
  - `valor_empenho_liquido ≤ valor_solicitado` (`.refine(...)`).
  - `competencia` regex `^(0[1-9]|1[0-2])\/\d{4}$`.
- Plugar via `@hookform/resolvers/zod` em react-hook-form, substituindo o `useState<any>`.
- *Referência:* OWASP ASVS V5 (validação de entrada); Nielsen *error prevention*.

**1.2 — Trava “empenho líquido ≤ solicitado”** (item 1)
- **Cliente:** validação em tempo real (onChange). Se exceder → borda vermelha vibrante (`border-destructive ring-2 ring-destructive`), mensagem abaixo: *“⚠️ Erro de digitação: O valor do empenho líquido não pode exceder o valor solicitado pela ACP”*, e botão Salvar desabilitado.
- **Servidor (não burlável):** `CHECK (valor_empenho_liquido IS NULL OR valor_empenho_liquido <= valor_solicitado)` na tabela. Se alguém burlar o front, o banco rejeita.
- *Referência:* defesa em profundidade — validação no cliente é UX, no servidor é segurança (OWASP).

**1.3 — `valor_anulado` automático + badge** (item 1)
- A coluna gerada já calcula `solicitado − atestado`. No formulário, exibir o valor **em tempo real** (calculado no cliente para preview) e, quando `> 0`, mostrar badge sutil cinza/laranja (`bg-warning/15 text-warning-foreground`).
- *Referência:* Nielsen *visibility of system status*.

**1.4 — Máscaras de entrada** (item 2)
- Componentes reutilizáveis em `src/components/inputs/`:
  - `<CurrencyInput>` — máscara R$ #.##0,00 (digita centavos, formata ao vivo; guarda número puro no estado). Usar `Intl.NumberFormat('pt-BR', {currency:'BRL'})`. Campos: Valor Solicitado, Atestado, Anulado, Empenho Líquido.
  - `<CompetenciaInput>` — máscara `MM/AAAA`, bloqueia mês > 12 e caracteres inválidos.
  - `<SeiLinkField>` — no modo edição, input de URL; no modo leitura, renderiza botão azul **“🔗 Abrir no SEI”** (`<a target="_blank" rel="noopener noreferrer">`) em vez da URL crua. Aplicar nos 4 campos de link. *Atenção de segurança:* validar que a URL começa com `https://` e (opcional) com o domínio do SEI antes de transformar em link, para evitar `javascript:`/phishing.
- *Referência:* ISO 25010 (usabilidade); OWASP (sanitização de URL — `rel="noopener"`).

**Entregável:** `schemas.ts`, componentes de input, migration com `CHECK`, refactor dos formulários ACP/ACO tipados.

---

### FASE 2 — Auditoria de Anulações + Auditoria de Saldo do Convênio (item 3 + pedido extra)
*Resolve F5. Cria o módulo do Enfermeiro Auditor.*

**2.1 — Schema do teto financeiro** (resolve F5)
- `ALTER TABLE convenios ADD COLUMN valor_total NUMERIC(14,2)` (teto do convênio mãe).
- Para o controle por **Termo Aditivo**: criar tabela `termos_aditivos (id, convenio_id, identificador, valor_total, vigencia_inicio, vigencia_fim)` e referenciar `lancamentos_pagamento.termo_aditivo_id`. Isso permite o filtro “antes/depois da renovação” no gráfico (Fase 3).
- *Referência:* normalização relacional; integridade referencial (FK).

**2.2 — Trava de saldo (soma de empenhos ≤ teto)** (pedido extra)
- Função `SECURITY DEFINER` `checar_saldo_convenio(convenio_id, novo_valor, lancamento_id)` que soma os `valor_empenho_liquido` já lançados (excluindo o próprio em edição) e rejeita se ultrapassar `valor_total`. Disparada por **trigger `BEFORE INSERT/UPDATE`** — assim a checagem é **atômica e transacional**, imune a corrida entre dois usuários.
- No cliente: barra de progresso “Saldo do convênio: R$ X de R$ Y (Z% comprometido)” no formulário, com alerta ao se aproximar de 100%.
- *Referência:* ACID/transações Postgres; trava de invariante de negócio no servidor (OWASP A01/A04).

**2.3 — Aba “Auditoria de Anulações”** (item 3)
- Nova rota `src/routes/_authenticated/auditoria.tsx` (entrada na sidebar, visível p/ `admin`/auditor).
- **Cards do topo:**
  - *Total de Recursos Anulados (ano corrente)* — `SUM(valor_anulado)` onde o ano de `competencia` = ano atual. Idealmente via **view/RPC** `vw_auditoria_anulacoes` para não puxar tudo ao cliente.
  - *Anulações com Link Pendente* — `COUNT(*)` onde `valor_anulado > 0 AND link_anulacao_sei IS NULL`.
- **Tabela de auditoria rápida:** Prestador, Competência, Processo SEI, Valor Solicitado, Valor Atestado, Valor Anulado, Link da Anulação — com filtro por Prestador e por Mês de Competência (reaproveitar o padrão de filtros de `lancamentos.index`).
- *Referência:* ISO 27001 A.8.16 (monitoramento); LGPD Art. 37 (registro/prestação de contas).

**Entregável:** migration de `convenios.valor_total` + `termos_aditivos` + trigger de saldo + rota `/auditoria` + view de agregação.

---

### FASE 3 — Indicadores Gráficos (item 4 + filtro por Termo Aditivo)

**3.1 — Gráfico de Pizza Empenhado × Atestado** (item 4)
- Componente `<GraficoEmpenhadoAtestado>` com `recharts` (já instalado) no Dashboard.
- Filtro por prestador (HMSJ, BOJ, …) ou “Consolidado geral”.
- Compara *Montante Total Empenhado Líquido* vs *Montante Efetivamente Atestado* no período.
- Cores: **Azul Principal** (`var(--primary)`) p/ Empenhado, **Verde Claro Institucional** (`var(--success)`) p/ Atestado — usando os tokens já existentes.

**3.2 — Filtro por Termo Aditivo** (pedido extra)
- Dropdown adicional que filtra os dados do gráfico por `termo_aditivo_id`, permitindo comparar desempenho financeiro **antes e depois de uma renovação**. Depende do schema da Fase 2.1.
- *Referência:* visualização de dados (pré-atenção/Gestalt); ISO 25010 (adequação funcional).

**Entregável:** componente de gráfico + integração de filtros no Dashboard.

---

### FASE 4 — Relatório PDF de Prestação de Contas (item 5)

**4.1 — Geração de PDF**
- Biblioteca recomendada: **`@react-pdf/renderer`** (layout declarativo em React, fácil de versionar) ou `pdfmake`. Recomendo `@react-pdf/renderer` por consistência com o stack.
- Botão destacado **“Gerar Relatório de Prestação de Contas (PDF)”** na aba Auditoria.
- Conteúdo:
  - **Cabeçalho institucional**: SMS Joinville + Área de Convênios e Parcerias (ACP) + logo (já existe `joinville-logo`).
  - **Resumo executivo**: competência selecionada, valor total auditado, montante devolvido ao orçamento, lista de pendências de link SEI.
  - **Tabela consolidada**: Prestador, SEI, Valores, Status.
  - **Rodapé**: data/hora de emissão + linha para assinatura da Auditoria.
- *Segurança:* gerar o PDF **no cliente a partir de dados já autorizados pela RLS** (sem expor dados extras). Registrar a emissão em `historico_logs` (quem gerou, quando) — rastreabilidade.
- *Referência:* LGPD Art. 37 (prestação de contas); ISO 27001 A.8.15 (registro do ato de emissão).

**Entregável:** componente `RelatorioPrestacaoContas.pdf.tsx` + botão + log de emissão.

---

### FASE 5 — Automação Preditiva, Notificações e Gamificação (intuitivo/gameficado)
*Resolve F8 + os requisitos “preditivo, automático, gameficado”.*

**5.1 — Notificações automáticas reais** (resolve F8)
- Opções (decisão pendente — ver §5):
  - **E-mail**: Supabase Edge Function + provedor (Resend/SMTP institucional) disparada por trigger/cron quando muda etapa ou um SLA está perto de estourar.
  - **In-app realtime**: Supabase Realtime + um sino de notificações no header.
- *Referência:* ISO 27001 A.8.16 (monitoramento e alerta proativo).

**5.2 — Camada preditiva / proativa**
- Job (Supabase `pg_cron`) que recalcula diariamente `data_limite` a partir de `sla_config` e marca processos “em risco” (amarelo) *antes* de vencer, não só depois.
- Indicadores preditivos no Dashboard: “X processos vão vencer em 3 dias”, “Prestador Y tem padrão de anulação acima da média”.
- *Referência:* PDCA (Check/Act); gestão de riscos ISO 27001.

**5.3 — Gamificação responsável**
- Barra de progresso do processo (etapas concluídas), selos por “prestação de contas em dia”, ranking de SLA por setor (ACP×ACO) — focado em **competência e progresso**, nunca em expor desempenho individual de servidor de forma punitiva (cuidado LGPD).
- *Referência:* Octalysis (Yu-kai Chou); Self-Determination Theory (Deci & Ryan).

---

## 4. Qualidade de engenharia (transversal a todas as fases)
- **Tipagem**: eliminar `any`, usar `Tables<"lancamentos_pagamento">` dos tipos gerados (F7).
- **Camada de dados**: centralizar queries em hooks (`src/data/`) em vez de chamadas soltas a `supabase.from` espalhadas.
- **Testes**: Vitest para os schemas Zod e funções de cálculo; testes de policy RLS (consultas como cada papel).
- **CI**: lint + typecheck + testes no push.
- **Acessibilidade**: foco visível, `aria-*` nos inputs com erro, contraste AA (a paleta OKLCH ajuda).
- *Referência:* ISO 25010; OWASP ASVS V5/V14; codificação segura ISO 27001 A.8.28.

---

## 5. Decisões tomadas (definidas com o solicitante em 2026-06-21)
1. **Canal de notificação (Fase 5.1): AMBOS** — sino in-app em tempo real (Supabase Realtime) **e** e-mail institucional (Edge Function + provedor). Configurar credenciais de SMTP/Resend da prefeitura.
2. **Modelo de papéis (Fase 0.1): TRAVAR POR PAPEL** — ACP só edita campos ACP, ACO só edita campos ACO; o banco rejeita escrita fora do escopo (trava por coluna via trigger/RPC dedicada). Segregação de função (ISO 27001 A.5.3).
3. **Termo Aditivo (Fases 2.1/2.2): TETO PRÓPRIO POR ADITIVO** — cada termo aditivo define seu próprio `valor_total` e vigência. A trava de saldo soma os empenhos **dentro do aditivo vigente** contra o teto **daquele aditivo**, e o gráfico compara antes/depois da renovação por aditivo.
4. **Biblioteca de PDF (Fase 4): `@react-pdf/renderer`** confirmada.

---

## 6. Sequência recomendada de execução
```
Fase 0 (segurança)  →  Fase 1 (validações/máscaras)  →  Fase 2 (auditoria+saldo)
      →  Fase 3 (gráficos)  →  Fase 4 (PDF)  →  Fase 5 (automação/gamificação)
```
Cada fase entrega uma migration + telas funcionais, e nada nas fases 1–5 fica seguro sem a Fase 0.
