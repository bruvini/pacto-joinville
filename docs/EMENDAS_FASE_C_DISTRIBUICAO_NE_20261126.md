# PACTO Joinville · Emendas Parlamentares · Fase C — NE e distribuição por competência

**Data:** 26/11/2026  
**Dependência:** Fase A (#76), Fase B (#77), migrations B1–B3 aplicadas antes desta fase.  
**Estado:** código em PR separado. **Não foi aplicado nenhum DDL/DML da Fase C pelo assistente.**

## 1. Checagem do banco conectado

Foi confirmada, somente por consultas de leitura, a presença de `emenda_subempenhos`, `emenda_subempenho_documentos` e `emenda_subempenho_resumo`. A base estava com **1 solicitação/NE, 1 competência, 0 subempenhos, 0 liberações, 0 pagamentos, 0 anulações, 0 conflitos entre os livros e 0 saldos negativos**.

O retorno fornecido pelo usuário comprovou que `emenda_blocos_pagamento.liberacao_id` continua `NOT NULL`, enquanto `subempenho_id` e os campos de programação estão opcionais. A checagem real complementou essa evidência, mas **não substitui ensaios transacionais concorrentes e a homologação de permissões**.

A branch `main` do GitHub ainda não continha os PRs #76/#77 na consulta. Esta branch deriva da Fase B e seu PR tem a Fase B como base, evitando duplicar os diffs das fases anteriores.

## 2. Modelo de cardinalidade e abrangência

```text
Emenda (1)
 ├── Lançamento outubro/2026 → solicitação/NE 111/2026
 │    ├── competência outubro/2026 → alocação informada manualmente
 │    ├── competência novembro/2026 → alocação informada manualmente
 │    └── competência dezembro/2026 → alocação informada manualmente
 └── Lançamento novembro/2026 → solicitação/NE 222/2026
      ├── competência novembro/2026 → alocação independente da NE 111
      └── competência dezembro/2026 → alocação independente da NE 111
```

O modelo atual continua vinculando **uma solicitação/NE a cada lançamento**. Uma emenda pode ter múltiplos lançamentos e, portanto, múltiplas NEs. A competência `emenda_competencias` é global dentro da emenda e pode ser utilizada por vários lançamentos. Cada lançamento registra os meses no `emenda_lancamento_meses`; a nova tabela `emenda_ne_competencias` registra **o valor da NE destinado a cada competência**.

O índice de unicidade é `(solicitacao_id,competencia_id)`; **não** é `(emenda_id,competencia_id)`. Isso permite duas NEs cobrirem a mesma competência, sem confundir seus limites. FKs e triggers confirmam que a alocação pertence à NE, ao lançamento e a uma competência realmente abrangida pelo lançamento.

**Periodicidade:** mensal = 1 mês; trimestral = 3; anual = 12. Os meses são gerados pela previsão já existente, inclusive na virada de exercício, mas **nenhum valor financeiro é automaticamente rateado ou alocado**. A distribuição começa vazia em toda NE, inclusive na NE de R$ 510 mil do cadastro legado. O usuário define manualmente valores por competência.

## 3. Valores distintos

`NE líquida = valor_ne emitida - somatório de anulações`

`Distribuição planejada = somatório(valor_alocado das alocações ativas da NE)`

`Saldo ainda não distribuído = NE líquida - distribuição planejada`

`Comprometimento financeiro = valores solicitados nos subempenhos ainda não confirmados + valores efetivos dos subempenhos confirmados`

`Saldo da NE a comprometer = NE líquida - comprometimento financeiro` (ou, em NE do modelo legado, conforme as liberações existentes, sem misturar os dois livros)

`Saldo da competência = valor_alocado nesta NE/competência - comprometimento nesta NE/competência`

**Não se deve somar distribuição e subempenhos no mesmo saldo**, porque o subempenho é a utilização do limite já distribuído.

Exemplo: NE R$ 120.000; alocação de R$ 30.000 para outubro e R$ 40.000 para novembro. Há R$ 50.000 ainda sem distribuição. Se os subempenhos confirmados somam R$ 45.000, o saldo da NE ainda a comprometer é R$ 75.000 (não R$ 5.000 e não R$ 50.000). Cada competência, isoladamente, tem saldo calculado sobre seus compromissos específicos.

## 4. Migrations (aplicar somente após homologação)

1. `20261126110000_emendas_fase_c1_ne_competencias.sql` — tabela `emenda_ne_competencias`, FKs, índice único por NE/competência, RLS, privilégios de leitura e auditoria. **Nenhum backfill**.
2. `20261126111500_emendas_fase_c2_distribuicao_protecao_rpc.sql` — RPCs de definir/alterar e cancelar distribuição; limites serializados por `emendas FOR UPDATE`; proibição de reduzir abaixo de compromissos; integração com gatilhos da Fase B, proteção das anulações, da NE e do fluxo legado.
3. `20261126113000_emendas_fase_c3_paineis_ne.sql` — visões `security_invoker=true` para saldos da NE e por competência, usando agregações independentes.

As duas RPCs `emenda_ne_competencia_definir` e `emenda_ne_competencia_cancelar` são acessíveis apenas a usuários autenticados com papel ACP/Admin. A tabela não concede escrita direta para o cliente. Toda criação, revisão e cancelamento gera evento em `emenda_historico`.

Ajustes de distribuição exigem justificativa mínima de 10 caracteres; cancelamentos não excluem a linha original e só são permitidos quando não há subempenhos ativos naquela NE/competência. Uma distribuição cancelada pode ser reativada por ação explícita com justificativa de pelo menos 10 caracteres; a trilha de auditoria preserva ambos os estados.

## 5. Painel do lançamento

O componente `PainelDistribuicaoNeEmenda` foi integrado à página individual do lançamento logo após a lista de competências previstas. Exibe:

- NE emitida, NE líquida, valor distribuído e ainda não distribuído.
- Reservas e subempenhos existentes, saldo da NE não comprometido e número de competências efetivamente distribuídas.
- Uma linha por competência prevista, com parcela, valor alocado, comprometido, saldo e NEs adicionais que atendem a mesma competência.
- Botões **Distribuir**, **Alterar** e **Cancelar** (cancelamento bloqueado se há compromisso ativo).
- Campo monetário brasileiro; modal de justificativa para revisão/cancelamento.

Quando a NE tem distribuição ativa, a interface oculta o antigo Aviso de Movimento registrado como `emenda_liberacoes`. O novo fluxo documental e o registro de subempenhos na interface serão implementados na **Fase D**. O usuário recebe explicação, evitando tentar executar o fluxo anterior e receber erro financeiro inesperado.

## 6. Cenários obrigatórios de homologação

| Cenário | Resultado esperado |
|---|---|
| Uma NE, três competências | Três alocações manuais, sem rateio automático |
| Mesma competência em duas NEs da emenda | Duas alocações independentes, cada uma limitada pela própria NE |
| Lançamento anual iniciado em outubro | Competências outubro/2026 a setembro/2027 visíveis, sem valor presumido |
| NE R$ 100 mil, anulação R$ 10 mil | Soma ativa de alocações limitada a R$ 90 mil |
| Duas operações simultâneas ultrapassam a NE | Uma deve falhar integralmente pela trava da emenda |
| Subempenho de R$ 25 mil com alocação R$ 20 mil | Bloqueado antes de persistir |
| Redução de alocação para menos que já solicitado/subempenhado | Bloqueada |
| Cancelamento com subempenho ativo | Bloqueado |
| Revisão de valor sem justificativa | Bloqueada |
| Reativação de distribuição cancelada | Permitida com justificativa e saldo disponível, preservando o histórico |
| Solicitação de anulação que invade valor distribuído | Bloqueada até revisão do planejamento |
| Lançamento com liberação do modelo legado | Nova distribuição bloqueada até conciliação |
| Liberação legada após distribuição nova | Bloqueada por gatilho |
| Usuário sem papel ACP/Admin | Leitura conforme política, gravação negada |
| Tentativa de DELETE físico da distribuição | Bloqueada; registro histórico preservado |
| Vários períodos incluindo mudança de exercício | Escopo dos meses preservado e saldo individual consistente |

**Importante:** além dos testes estáticos e build, executar testes **reais no PostgreSQL em ambiente segregado**, incluindo duas sessões concorrentes, e registrar um backup restaurável validado.

## 7. Implantação e pós-flight

1. Confirmar sincronização dos PRs A/B com o esquema instalado. Não recriar migrations já executadas nem reaplicar por conta própria.
2. Registrar fotografia da base, backup restaurável e hash do estado das funções.
3. Aplicar C1, C2 e C3 em homologação, nesta ordem. Executar testes de regressão de Emendas, Piso, PVH e Convênios.
4. Executar `scripts/emendas-fase-c-postflight-readonly.sql`, que emite **uma única linha JSON** contendo instalação, integridade e cenários. Guardar em local institucional.
5. Após aceite da equipe, aplicar a versão revisada em produção. Publicar o painel **apenas depois** das migrations C1–C3.
6. Se houver incompatibilidade visual, reverter apenas o frontend, preservando as estruturas e as travas financeiras. Não apagar alocações nem voltar a habilitar liberações legadas em NEs já distribuídas.

## 8. Limitações assumidas

A Fase C ainda não implementa a interface de solicitação de subempenho, assinatura e Aviso de Movimento (Fase D), nem o pagamento diretamente vinculado ao subempenho (Fase E). O requisito `liberacao_id NOT NULL` permanece no banco até a Fase E. Assim, o painel introduz **planejamento e saldos por NE**, sem antecipar o processamento operacional ou lançar movimentos financeiros sintéticos.
