# Plano de ajustes V2 (2026-06-23)

Fases por ordem de importância, efetividade e custo. Itens entre [ ] = nº do pedido.

## Fase 1 — Quick wins (baixo risco, alto valor)
- [4] Reordenar a sidebar: Dashboard, Lançamentos, Auditoria de Anulações,
  Convênios, Prestadores, Configurações, Sobre.
- [3-sidebar] Mostrar o título da página no hover quando a sidebar está recolhida (tooltip).
- [1] Ordenar termos aditivos por **data de assinatura** (mais recente primeiro).
- [2] Badge de teto no card do convênio = teto do **termo aditivo mais recente
  que alterou** o teto; se nenhum alterou, usa o teto do convênio.
- [14] Conquistas "Guardião do saldo"/"Cofre protegido" só contam se houver
  lançamentos (não podem vir conquistadas com base zerada).
- [5a] Mensagens de erro (toast) com valores em **R$** (pt-BR), não formato americano.

## Fase 2 — Teto / Complemento (corrige a perda de dados do item 5)
- [6] Remover a **trava** que bloqueia valor solicitado > teto mensal (causa da
  perda de dados do item 5 — o autosave falhava). No resumo, o campo "Anulado"
  vira **dinâmico** (base = Solicitado vs **Atestado**):
  - "A anular" = (Solicitado − Atestado) quando Solicitado > Atestado;
  - "A complementar" = (Atestado − Solicitado) quando Atestado > Solicitado.
  A etapa de Anulação usa o "A anular" (Solicitado − Atestado).
- [12] Bloco de **justificativa** (abaixo da barra de progresso) quando o valor
  solicitado for maior que o teto mensal.

## Decisões confirmadas (2026-06-23)
- A anular/A complementar = Solicitado vs Atestado (não teto). Teto só limita visualmente.
- Ordem das etapas confirmada (ver Fase 4).
- Histórico de revisão em tabela dedicada `revisoes_empenho`.
- Alertas por convênio + consolidado no geral, respeitando filtro.

## Fase 3 — Sem emojis
- [15] Trocar **todos os emojis** por ícones SVG (lucide-react) em todo o app.

## Fase 4 — Reestruturação do Processo (a maior)
- [7] Nova ordem/estrutura das etapas (ver §Perguntas para confirmar):
  1. Análise de Orçamento (Dotação + Fonte → Orçamento Disponível)
  2. Solicitação de Empenho (dados + "Colocar em bloco para revisão")
  3. Revisão do Coordenador de Orçamentos (aprovar/negar + justificativa)
  4. Solicitação de Empenho — Assinaturas + Envio SEFAZ.UCG.AEO
  5. Liberação de Orçamento (nº + link da nota + assinatura de membro SEFAZ
     [nome manual] + Diretoria Financeira/Secretária)
  6. Liberação de Recurso
  7. Anulação de Empenho (opcional)
- [3-revisão] Revisão vira etapa própria com **histórico** de todas as
  aprovações/negativas e justificativas (nova tabela `revisoes_empenho`).
  Se negar, volta para a etapa 2 (editável); se aprovar, libera a etapa 4.

## Fase 5 — Assinaturas (sobre a nova estrutura)
- [8] Slots "OU" com **dois campos nomeados** (ex.: Gerente E Coordenador ACP),
  bastando **um** preenchido para concluir o slot.
- [9] Remover o botão "Assinar": preencher o nome do signatário já considera assinado.
- [10] Reversão em **cascata**: ao remover uma assinatura/checkbox obrigatório,
  as etapas seguintes já preenchidas são **anuladas** (com confirmação avisando).
- [11] Indicadores de **campo obrigatório** + bloco fica **verde** quando completo.

## Fase 6 — Alertas inteligentes do Dashboard
- [13] Alertas dinâmicos por convênio/prazo e por filtro (prestador/aditivo/consolidado):
  D-7→D-1 antes de iniciar; "fora do prazo" sem lançamento; pendente fora do prazo;
  contagem regressiva quando em andamento; parabéns quando concluído na competência.

## Perguntas pendentes (ver chat) antes da Fase 2 e 4.
