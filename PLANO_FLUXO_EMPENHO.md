# Plano — Reengenharia do "Processo de Empenho" (lançamento)

Substitui as abas atuais (Dados ACP / Dados ACO) por uma aba única **"Processo de
Empenho"** com etapas sequenciais, progressão automática (sem botão "avançar"),
assinaturas por etapa e reflexo no dashboard.

## Decisões confirmadas (2026-06-21)
- **Valor Empenho Líquido: REMOVIDO.** Usar Valor Solicitado (nota de empenho) e
  Valor Atestado (executado). `Anulado = Solicitado − Atestado`. Ajustar gráficos,
  saldo e KPIs para essa lógica (empenhado = solicitado).
- **Teto MENSAL no termo aditivo** + **nº de parcelas (meses de vigência) no
  convênio**. Total = mensal × parcelas. Parcela no lançamento = **lista suspensa
  1..N**.
- **Assinaturas configuráveis por etapa** em Configurações. Cargo é **lista
  suspensa** (sem texto livre), **sem código SEI** (só nome completo + cargo).
  - Slots de cargo (com lógica "OU"):
    1. **Fiscal**
    2. **Gerente/Coordenador** (vale gerente OU coordenador)
    3. **Diretor de Serviços Complementares**
    4. **Diretoria Financeira/Secretária de Saúde** (vale diretor financeiro OU secretário)

## Schema (migração nova — aplicar via SQL editor)
- `convenios`: add `total_parcelas INT`, `dia_inicio_execucao INT`, `dia_fim_execucao INT`; remover obrigatoriedade de `valor_total` (manter coluna, sem uso).
- `termos_aditivos`: `valor_total` passa a significar **teto mensal**; add `objeto TEXT`, `link_extrato_sei TEXT`; remover `vigencia_inicio/fim` do form (manter só `data_assinatura`).
- `assinaturas_config` / `assinaturas_lancamento`: `codigo_sei` deixa de ser obrigatório; `cargo` passa a um conjunto fixo (enum/lista) com os 4 slots acima; assinatura validada por slot (OU).
- `lancamentos_pagamento`: novos campos por etapa:
  - Etapa 1: já tem solicitado/competência/link_solicitacao_sei; parcela vira número.
  - Etapa 2: status_aco (auto: aguardando_indicacao → aguardando_descontingenciamento → orcamento_disponivel ao preencher dotação+fonte).
  - Etapa 3: numero_empenho + link_empenho_sei → ao ter link, status = empenhado.
  - Etapa 4 (liberação): `link_solicitacao_liberacao_sei`, `link_subempenho_sei`, `link_programacao_pagamento_sei`, `link_comprovante_pagamento_sei`, flags de relatórios/certidões, valor_atestado.
  - Etapa 5 (anulação, condicional a anulado>0): `link_solicitacao_anulacao`, `link_anulacao_sei` (aviso de movimento).
- `etapa_processo`: rever os valores do enum para refletir as etapas reais
  (solicitacao_empenho → analise_orcamento → liberacao_orcamento → liberacao_recurso → anulacao_empenho).

## UI — aba "Processo de Empenho" (stepper dirigido)
Cada etapa é um cartão que só libera quando a anterior cumpre os gatilhos; a barra
de progresso **auto-incrementa** pelos gatilhos (sem botão "avançar"):

1. **Solicitação de Empenho**: descrição/termo aditivo (seletor), parcela (lista),
   competência, mês pgto, link solicitação SEI, valor solicitado → revisão do
   coordenador de orçamentos (aprova/sugere, com histórico) → assinaturas (4 slots)
   → enviar para SEFAZ.UCG.AEO.
2. **Análise de Orçamento**: status inicia "Aguardando Indicação"; usuário pode pôr
   "Aguardando Descontingenciamento"; ao preencher dotação+fonte → "Orçamento Disponível".
3. **Liberação de Orçamento**: exige status "Orçamento Disponível"; nº empenho +
   link nota de empenho → status "Empenhado".
4. **Liberação de Recurso**: relatórios (3 fiscais + 1 fiscal) + certidões + valor
   atestado → libera link de solicitação de liberação → assinaturas (4 slots) →
   SEFAZ.UAF.ADE → acompanhar subempenho/programação/comprovante (links SEI).
5. **Anulação de Empenho** (só se anulado>0): mostra valor a anular + link
   solicitação anulação → assinaturas (4 slots) → SEFAZ.UCG.AEO → acompanhar Aviso
   de Movimento - Anulação (link).

Progresso e status alimentam o dashboard (KPIs, alertas, placar, gráficos) em tempo real.

## Pré-requisito
Rodar `supabase/APLICAR_MIGRACOES.sql` (base ainda não aplicada) **antes** desta migração nova.
