# Ajustes no fluxo de empenho

Todos os itens são frontend + uma regra derivada em `src/lib/etapa.ts` e um gatilho para a notificação de prestação de contas pendente.

## 1. Etapa 5 · Autocomplete para "Membro da SEFAZ"

Arquivos: `src/components/BlocoAssinaturas.tsx`.

- Trocar o `Input` do slot `manual` (usado em `SLOTS_LIBERA_ORC`) por um combobox com sugestões vindas do histórico já registrado.
- Fonte do histórico: `select distinct servidor_nome from assinaturas_etapa where cargo = 'SEFAZ'` — buscado por React Query e cacheado (invalida ao inserir novo).
- Usar `Command`/`Popover` do shadcn (já presentes em `src/components/ui/`) para autocomplete: digitando filtra as sugestões; se o nome não existir na lista, permite manter o valor digitado.
- Salvar em `onBlur` (e não mais apenas em `Enter`): quando o campo perde o foco com valor não vazio e ainda não atingiu `min`, dispara `assinar.mutate(...)` e limpa o campo. Manter Enter como atalho.

## 2. Etapa 4 · Ordem das assinaturas: Coordenador de Orçamentos → Fiscal

Arquivos: `src/components/BlocoAssinaturas.tsx` (constante `SLOTS_ETAPA1`).

- Reordenar `SLOTS_ETAPA1` para: `coord_orc`, `fiscal`, `gerente`, `diretor`, `financeira`. A ordem visual segue a ordem do array.

## 3. Slots "OU" (Gerente/Coord ACP e Financeira/Secretária)

Arquivos: `src/components/BlocoAssinaturas.tsx`.

- Bug atual: quando um slot `qualquer` já está completo (≥ `min`), o bloco ainda renderiza os pickers dos demais cargos e a mensagem "Cadastre X em Configurações → Signatários" quando não há signatário de outro cargo.
- Correção: no branch `slot.qualquer`, envolver o mapeamento dos pickers em `!completo && ...` para não renderizar pickers/mensagens quando o requisito já foi satisfeito. Também remover a nota "Basta a assinatura de um deles" quando completo.
- Além disso, `picker(...)` só deve mostrar a mensagem "Cadastre …" quando o slot ainda não está completo (já sai naturalmente com a guarda acima).

## 4. Etapa 7 · Ordem dos passos de anulação

Arquivos: `src/routes/_authenticated/lancamentos.$id.tsx` (bloco da Etapa 7, ~L936–952).

- Reestruturar a Etapa 7 como sequência de `Passo` com `gate(...)`:
  1. `Passo` "1. Link Solicitação de Anulação" com `SeiLink` de `link_solicitacao_anulacao`.
  2. `gate(isSafeUrl(link_solicitacao_anulacao))` → `Passo` "2. Assinaturas" (`SLOTS_PADRAO`, bloco `etapa5`).
  3. `gate(blocoCompleto etapa5)` → `Passo` "3. Envio à SEFAZ.UCG.AEO" (`SefazConfirm sefaz_etapa5_em`).
  4. `gate(!!sefaz_etapa5_em)` → `Passo` "4. Link Anulação SEI (Aviso de Movimento)" com `SeiLink` de `link_anulacao_sei`.
- Manter aviso do valor a anular no topo.

## 5. Etapa 6 · Assinaturas do Relatório Técnico (2 fiscais + 1 opcional livre)

Arquivos: `src/routes/_authenticated/lancamentos.$id.tsx` (constante `REL_TEC`) e `src/components/BlocoAssinaturas.tsx`.

- `REL_TEC` passa a ter dois slots:
  1. `{ key: "fiscal", label: "Fiscais", cargos: ["Fiscal"], min: 2 }` (obrigatório).
  2. `{ key: "extra", label: "Terceira assinatura (opcional)", cargos: ["Fiscal","Gerente","Coordenador ACP"], qualquer: true, min: 0, opcional: true }` — novo flag `opcional`.
- Ajustar `blocoCompleto` para tratar `min: 0` corretamente (já ok: `>= 0` sempre verdadeiro). Não altera as regras de progresso.
- No `BlocoAssinaturas`:
  - Slot `opcional`: badge muda de "Obrigatório/OK/pendente" para apenas "Opcional" quando `assinadas.length === 0`; oculta o texto "pendente".
  - Picker do slot opcional deve listar Nome + Cargo lado a lado no `SelectItem`. Já vem de `pool.filter(cargo === c)`; adicionar `<span className="text-muted-foreground"> · {p.cargo}</span>` ao rótulo.
  - Continuar oferecendo pickers agrupados por cargo (Fiscal, Gerente, Coordenador ACP) quando `qualquer`.
- Também atualizar o subtítulo do passo para "Relatório Técnico de Monitoramento (2 fiscais + 1 opcional)".

## 6. Modo retroativo · "Etapa atual" = última etapa com dado preenchido

Arquivos: `src/lib/etapa.ts` e chamadas em listas/dashboard.

- Adicionar `etapaCorrenteLabelRetro(l)` que devolve o rótulo da última etapa com algum dado preenchido, na ordem: Anulação (link_solicitacao_anulacao / link_anulacao_sei / sefaz_etapa5_em) → Liberação de Recurso (sefaz_etapa4_em / valor_atestado / links da etapa 6 / data_pagamento) → Liberação de Orçamento (numero_empenho / link_empenho_sei) → Análise de Orçamento (dotacao / fonte) → Solicitação (link_solicitacao_sei / em_bloco_revisao) → default "Solicitação de Empenho".
- Em pontos que exibem status (listagens, sublançamentos), quando `sistema_config.modo_retroativo === "1"` e `!l.concluido`, usar `etapaCorrenteLabelRetro` no lugar de `etapaCorrenteLabel`. Sem alterar `progresso` nem travas de sequência.

## 7. Notificação · nova Prestação de Contas Pendente

Objetivo: quando um lançamento é marcado como concluído e passa a existir uma prestação de contas pendente para ele, cair um card no sininho dos usuários da APC.

Implementação (banco, via migração):

- Nova função `notificar_prestacao_pendente(lanc_id uuid)` (SECURITY DEFINER, search_path=public) que:
  - Recupera `convenios.exige_prestacao_contas` e `convenios.prazo_prestacao_contas_dias` do lançamento; retorna se não exigir.
  - Verifica se já existe `notificacoes` com `tipo = 'prestacao_pendente'` e `lancamento_id = lanc_id` para evitar duplicidade.
  - Insere uma notificação por usuário do setor APC (mesmo padrão de `verificar_prazos_prestacao`) com título "Nova prestação de contas pendente" e mensagem contendo prestador + competência.
- Trigger `AFTER UPDATE ON lancamentos_pagamento` que, quando `NEW.concluido = true AND OLD.concluido = false`, chama `notificar_prestacao_pendente(NEW.id)`.
- Como `NotificationBell` já escuta `postgres_changes INSERT` em `notificacoes`, o toast + contador aparecem em tempo real sem alteração no frontend.

## Fora de escopo

- Nenhuma alteração em RLS, no fluxo de conclusão, no PDF, ou nas regras de saldo/teto.
- Não altero `progresso(...)` para não afetar a lógica de "Concluir processo" — o retroativo continua permitindo concluir com etapas incompletas via flag existente.
