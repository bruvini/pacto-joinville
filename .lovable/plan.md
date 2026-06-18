# Plano: Sistema de Gestão de Convênios e Pagamentos – SMS Joinville

Sistema web corporativo para o Enfermeiro Auditor (ACP) e a Área de Contratos (ACO) gerenciarem o fluxo SEI → Empenho → Atesto → Anulação dos repasses da Saúde Pública, com identidade visual da Prefeitura de Joinville e backend no Lovable Cloud (Supabase).

## Identidade visual

- Azul institucional `#003366` (headers, ações ACO), ciano `#3399CC` (ACP), verde sucesso, cinza `#808080` (bordas).
- Tipografia limpa (Inter / system) otimizada para tabelas densas.
- Logo da Prefeitura no topo do sidebar; layout claro, cartões com bordas coloridas por setor responsável.

## Estrutura de navegação

Sidebar fixo + topbar com filtros globais (competência, prestador, status).

1. **Dashboard** – cards de Total Solicitado / Empenhado Líquido / Anulado na competência, gráfico por prestador, lista de processos com SLA estourado/em risco, feed de notificações simuladas.
2. **Lançamentos de Pagamento** – tabela principal unificada (colunas ACP + ACO), filtros avançados, exportação CSV/Excel, botão "Novo lançamento".
3. **Detalhe do Lançamento** – abas:
   - *Dados ACP* (editáveis pela ACP): descrição, termo aditivo, parcela, competência, valor solicitado, links SEI (solicitação, empenho, anulação), valor atestado, valor anulado (auto-calculado).
   - *Dados ACO* (editáveis pela ACO): dotação, fonte, status_aco, nº empenho, valor empenho líquido.
   - *Checklist de Assinaturas* – gerado a partir das regras vigentes por etapa; cada item exibe nome, cargo, código SEI, botão "Marcar como assinado" (registra data/hora/validador). Avanço de status travado até 100%.
   - *Timeline / Audit Trail* – linha do tempo vertical com todos os eventos.
   - *Notas & Comentários* – feed interno ACP↔ACO.
   - Badge superior dinâmico: "🟡 AGUARDANDO AÇÃO DA ACO" / "🔵 AGUARDANDO ATESTO DA ACP" / "🟢 CONCLUÍDO".
4. **Prestadores** – CRUD (nome, CNPJ, status).
5. **Convênios** – CRUD vinculado a prestador (processo SEI mãe, objeto, status).
6. **Configurações**:
   - *Matriz de Assinaturas SEI* – por etapa (Solicitação de Empenho, Nota Técnica, Solicitação de Anulação, Anulação Executada): cadastrar Nome / Cargo / Código SEI / ativo. Snapshot é tirado no momento de criação do lançamento (alterações não afetam histórico).
   - *SLA & Prazos* – dias úteis por etapa + data limite mensal de fechamento.
   - *Notificações* – log em tela das mensagens disparadas.

## Banco de dados (migrações Supabase)

Tabelas: `prestadores`, `convenios`, `lancamentos_pagamento`, `assinaturas_config`, `assinaturas_lancamento` (snapshot + status assinado), `sla_config`, `historico_logs`, `notas_comentarios`, `notificacoes_log`.

- Enums: `status_aco`, `etapa_processo`, `status_convenio`.
- `valor_anulado` como coluna gerada (`valor_solicitado - COALESCE(valor_atestado,0)`) ou calculada no app.
- Triggers para popular `historico_logs` em UPDATE de `lancamentos_pagamento` e `assinaturas_lancamento`.
- RLS habilitada com policies para `authenticated` (sistema interno – todos autenticados leem/escrevem; refinamento por papel ACP/ACO via tabela `user_roles` + função `has_role`).
- GRANTs explícitos para `authenticated` e `service_role`.

## Autenticação

- Lovable Cloud com **e-mail/senha** (auto-confirmação ativa para acelerar uso interno) + tabela `user_roles` com enum `app_role` (`acp`, `aco`, `admin`).
- Tela `/auth` (login + cadastro). Rotas internas sob `_authenticated/`.
- Permissões de edição por aba conforme papel (ACO só edita campos ACO, etc.); admin edita tudo.

## Stack técnico

- TanStack Start + Tailwind v4 + shadcn (variantes customizadas `acp`, `aco`, `success`, `danger`).
- TanStack Query para data fetching, `createServerFn` quando necessário; CRUD direto via cliente Supabase autenticado para a maior parte.
- Exportação: `xlsx` (SheetJS) gerando arquivo unificado com colunas das duas planilhas originais.
- Validação com Zod em todos os formulários.

## Entregáveis nesta primeira iteração

1. Enable Lovable Cloud + migração com todas as tabelas, enums, triggers, RLS, GRANTs.
2. Design system Joinville em `src/styles.css` + logo no sidebar.
3. Auth (login/cadastro) + roles.
4. Dashboard, Lançamentos (lista + detalhe com todas as abas), Prestadores, Convênios, Configurações (Assinaturas, SLA, Notificações).
5. Exportação CSV/Excel, filtros avançados, audit trail, comentários, checklist com trava de assinaturas, badges de responsabilidade, alertas SLA.

## Pontos a confirmar antes de começar

1. **Autenticação**: confirmo e-mail/senha com auto-confirmação e papéis ACP/ACO/Admin? (Posso adicionar Google depois se quiser.)
2. **Importação inicial**: começo com o banco **vazio** (conforme item 2 do brief), correto? As planilhas anexadas servem só como referência da estrutura de colunas para a exportação.
3. **Escopo desta iteração**: posso entregar tudo acima de uma vez (sistema completo)? Ou prefere fatiar em entregas (ex.: primeiro CRUD + lançamentos, depois assinaturas/SLA)?
