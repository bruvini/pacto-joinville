# PACTO Joinville — Emendas Parlamentares
## Fase E: Programação, pagamentos parciais e conciliação individual

**Data:** 26/11/2026. **Branch:** `feat/emendas-fase-e-pagamentos-parciais-20261126`.  
**Dependências:** Fases A, B, C e D. **Estado:** implementação versionada, sem aplicação da Fase E no PostgreSQL operacional.

### 1. Diagnóstico da base antes da alteração

O usuário confirmou o pós-flight da Fase D com **4 tabelas de evidências protegidas, 5 gatilhos, todos os indicadores de integridade iguais a zero e nenhuma matriz, subempenho ou pagamento cadastrado**. A consulta de leitura complementar confirmou que `emenda_blocos_pagamento.liberacao_id` continua `NOT NULL`, com ligações ao modelo legado de `emenda_liberacoes` e zero registros financeiros. Também foram verificados os gatilhos atuais de auditoria, proteção de saldo e bloqueio de fluxo legado.

**Decisão:** não transformar `liberacao_id` em NULL nem criar `emenda_liberacoes` artificiais. A Fase E cria um livro imutável independente, exclusivamente para subempenhos do modelo novo, sem alterar, migrar ou excluir pagamentos antigos.

### 2. Fluxo de dados

```text
Emenda
 └─ NE emitida
    └─ Competência + valor distribuído manualmente (C)
       └─ Subempenho confirmado no Aviso de Movimento (D)
          ├─ Parcela #1
          │  ├─ Programação inicial · SEI e valor previsto
          │  ├─ Reprogramações/cancelamentos · novos documentos e versões
          │  ├─ Comprovante de pagamento · SEI e valor efetivamente transferido
          │  ├─ Devoluções ou estornos · ajustes append-only
          │  └─ Retificações de referências · sem alterar valor histórico
          ├─ Parcela #2
          └─ Parcela #N
       └─ Eventos de conciliação/reabertura
```

A programação não efetua pagamento, e o comprovante não encerra o subempenho automaticamente.

**Cardinalidade:** muitos cartões de parcelas por subempenho. Cada cartão admite múltiplas versões de programação, mas **um comprovante de pagamento original**. Para outro pagamento efetivo, registrar nova parcela; não substituir ou acrescentar um segundo comprovante no primeiro cartão.

### 3. Tabelas aditivas

| Tabela | Papel |
| --- | --- |
| `emenda_pagamento_parcelas` | Identidade, sequência e idempotência de cada cartão |
| `emenda_pagamento_programacoes` | Programação inicial, reprogramação, cancelamento documentado (versões imutáveis) |
| `emenda_pagamento_comprovantes` | Comprovante original do pagamento efetivamente realizado |
| `emenda_pagamento_ajustes` | Devolução financeira ou estorno contábil, com motivo, valor, data e SEI |
| `emenda_pagamento_retificacoes` | Retificação de número, link e data documental com referência ao original |
| `emenda_pagamento_conciliacoes` | Eventos administrativos de conciliação e reabertura, ambos com SEI |

FKs compostas vinculam as tabelas à emenda, ao subempenho e à parcela correta. Todas as tabelas possuem RLS, privilégios somente de leitura para perfis autorizados e auditoria em `emenda_historico`. **UPDATE e DELETE são recusados** em evidências já inseridas, inclusive por triggers para acesso direto privilegiado.

### 4. Conceitos e fórmulas financeiras

Para cada parcela, **programação vigente** é a última versão documental, nunca a soma das reprogramações antigas. Uma programação cancelada contribui com R$ 0,00 para o teto.

`total_programado = soma(última_programação_por_parcela.valor_programado)`

`pago_bruto = soma(comprovantes.valor_pago)`

`devolvido = soma(ajustes onde tipo='devolucao')`

`estornado = soma(ajustes onde tipo='estorno')`

`pago_liquido = pago_bruto - devolvido - estornado`

`saldo_a_programar = valor_subempenhado - total_programado`

`saldo_a_pagar = valor_subempenhado - pago_liquido`

`programado_nao_pago = total_programado - pago_liquido`

Os saldos são *por subempenho*, não globais da emenda; a conferência da NE/competência permanece sob os gatilhos das Fases B/C.

**Regra de capacidade:** `total_programado <= valor_subempenhado`, `0 <= pago_liquido_parcela <= valor_programado_parcela`, `pago_liquido_subempenho <= valor_subempenhado` e `ajustes_de_um_comprovante <= valor_original_do_comprovante`. Operações concorrentes bloqueiam primeiro `emendas FOR UPDATE`, evitando a mesma verba ser consumida por dois registros simultâneos.

### 5. Reprogramação, devolução, estorno e correção

- **Reprogramação:** novo documento SEI, nova data prevista e novo valor planejado. A versão anterior continua disponível. Justificativa obrigatória (mínimo 10 caracteres).
- **Cancelamento de programação:** registra outra versão com valor zero, somente se a parcela não tiver pagamento líquido remanescente. Não elimina o cartão ou o SEI original.
- **Devolução:** movimentação de retorno do recurso efetivamente pago, com valor, motivo e evidência próprios. Reduz o total pago líquido.
- **Estorno:** correção contábil documentada do lançamento de pagamento, também com valor, motivo e documento próprios. É **distinto de devolução física** e não pode exceder o valor ainda não estornado/devolvido.
- **Retificação documental:** adiciona referência SEI nova, identifica exatamente um documento original e preserva seu valor e histórico. Para *corrigir quantia financeira*, utilizar estorno/devolução documentado e novo cartão, não sobrescrever o pagamento.
- **Compensação posterior a devolução/estorno:** se a programação antiga continuar ocupando saldo, reprogramá-la para o valor líquido remanescente (ou cancelá-la se zero) antes de programar nova parcela.

### 6. Conciliação não automática

O estado `saldo_zerado_aguardando_conciliacao` é exibido se `pago_liquido == valor_subempenhado` e ainda não houver evento de conciliação.

A RPC `emenda_pag_conciliar` só cria o evento `conciliado` se **valor pago líquido e programação vigente forem ambos exatamente iguais ao valor do Aviso de Subempenho**. É necessário número, link e data do SEI de conciliação e justificativa. Um comprovante parcial nunca marca quitação.

Depois de conciliado, o banco **impede novas programações, comprovantes, ajustes e retificações**, até a criação de evento formal `reaberto`, com justificativa e documento SEI. O histórico de conciliações anteriores permanece intocado.

### 7. Como operar no PACTO

1. **NE/competência:** registre distribuição manual (Fase C); nenhuma parcela é gerada automaticamente.
2. **Subempenho:** complete as três subetapas documentais e confirme o Aviso efetivo (Fase D).
3. No cartão de subempenho confirmado, veja as métricas e clique em **Nova parcela**.
4. Clique em **Programar**, informe valor previsto, data prevista, número/link/data da programação no SEI.
5. Quando o pagamento realmente for feito e houver comprovante, clique em **Registrar pagamento**, informe valor pago, data de pagamento e documento SEI próprio. Se o pagamento for inferior à programação, o saldo pendente continua visível.
6. Para outro pagamento, crie **Nova parcela**. Se a programação anterior tiver saldo sem pagamento e precisar liberar limite para outro cartão, use **Reprogramar** com justificativa e SEI; não apague a programação anterior.
7. Devoluções e estornos são ações específicas no cartão que já tem comprovante. Cada um exige valor, data, motivo e SEI.
8. Para corrigir referência documental, use **Corrigir SEI**; o registro original permanece visível no histórico.
9. Quando todos os pagamentos cobrirem integralmente o subempenhado, confira os valores e registre **Conciliar pagamento**. Caso seja necessário ajustar após o encerramento, use **Reabrir conciliação** com justificativa.

**O PACTO não movimenta valores no e-Pública e não confirma transferências bancárias sozinho.** Os registros representam atos e documentos verificados pela equipe.

### 8. Exemplo em três momentos

**NE/competência:** R$ 120.000,00 disponíveis; subempenho efetivo R$ 100.000,00.

**Momento A — programação:** parcela #1 programada R$ 80.000,00, parcela #2 R$ 20.000,00. Total programado = R$ 100.000,00, pago = R$ 0,00, saldo a pagar = R$ 100.000,00.

**Momento B — execução parcial:** comprovante da parcela #1 por R$ 60.000,00. Total pago = R$ 60.000,00, saldo a pagar = R$ 40.000,00. Não há quitação e a parcela #1 continua com R$ 20.000,00 programados não pagos.

**Momento C — reorganização:** reprogramar a parcela #1 para R$ 60.000,00, preservando a programação anterior com justificativa. A parcela #2 continua com R$ 20.000,00. Agora restam R$ 20.000,00 para programar um cartão #3, sem ultrapassar o valor subempenhado. Registrar comprovantes adicionais somente depois dos pagamentos reais.

Se a equipe registrar devolução de R$ 10.000,00 de um pagamento, o valor pago líquido diminui nesse montante; a devolução não cria automaticamente outra parcela nem altera a programação.

### 9. Ordem de implantação

**Somente após backup restaurável verificado e homologação em ambiente segregado**, executar:

1. `supabase/migrations/20261126130000_emendas_fase_e1_livro_pagamentos.sql` — seis tabelas, relações, RLS, auditoria.
2. `supabase/migrations/20261126131500_emendas_fase_e2_movimentos_transacionais.sql` — funções de criar parcelas, programar, comprovar, ajustar, retificar, conciliar/reabrir, guardas de imutabilidade.
3. `supabase/migrations/20261126133000_emendas_fase_e3_paineis_pagamentos.sql` — visões `security_invoker` de cartões e saldo por subempenho.

Depois, `scripts/emendas-fase-e-postflight-readonly.sql` retorna um **JSON único**, com objetos de instalação, registro, integridade e operação.

Não reaplicar migrations A–D. A Fase E não altera `emenda_blocos_pagamento`, `emenda_liberacoes`, `emenda_subempenhos` ou quaisquer registros históricos do legado.

### 10. Matriz de homologação obrigatória

| Cenário | Comportamento esperado |
| --- | --- |
| Subempenho ainda em liquidação | Criação de parcela bloqueada |
| Sem matrícula/autorização ACP/Admin | RPCs financeiras bloqueadas |
| Novo cartão sem programação | Programado=0, pago=0; nenhum comprovante criado |
| Programado R$ 100, pago R$ 0 | Saldo a pagar igual ao subempenhado |
| Pagamento R$ 60 sobre R$ 100 programados | Pago líquido R$ 60, saldo a pagar R$ 40 |
| Segunda parcela do mesmo subempenho | Sequência independente e soma dos valores |
| Duas programações que ultrapassam o Aviso | Uma delas bloqueada, sem escrita parcial |
| Pagamento superior ao programado na parcela | Bloqueado |
| Soma de comprovantes acima do Aviso | Bloqueada |
| Devolução de R$ 10 sobre R$ 60 pagos | Pago líquido R$ 50; saldo a pagar aumenta R$ 10 |
| Estorno acumulado + devolução maior que comprovante | Bloqueado |
| Reprogramar abaixo do valor já pago líquido | Bloqueado |
| Cancelar programação com pagamento líquido positivo | Bloqueado |
| Mesma chave de idempotência + mesmos dados | Retorna registro existente |
| Mesma chave + dados diferentes | Bloqueado |
| Retificação documental | Adiciona referência; preserva documento, valor e histórico |
| Saldo zerado sem evento de conciliação | **Não** mostra quitado; exige conferência manual |
| Conciliar com saldo parcial | Bloqueado |
| Novo pagamento após conciliação vigente | Bloqueado até reabertura SEI |
| Reabrir sem conciliação anterior | Bloqueado |
| UPDATE/DELETE direto em registros financeiros | Bloqueado por gatilhos e RLS |
| Duas sessões simultâneas programando além do limite | Uma falha, sem saldo negativo |
| Lançamento legado com `liberacao_id` obrigatório | Nenhuma nova parcela produz liberação fictícia |
| Usuário ACO | Consulta respeita RLS; escrita financeira proibida |

**Atenção:** suíte de testes unitários/estáticos e CI não substituem execução real dessas operações em PostgreSQL e com dois usuários/sessões simultâneos. A conclusão de implantação depende dessa homologação.

### 11. Retorno seguro

Caso a interface apresente defeito, reverter o frontend, preservando o livro de pagamentos já gravado. Não excluir tabelas, eventos ou documentos, não desabilitar triggers e não retornar ao uso de `emenda_liberacoes` para novos subempenhos. Alterações estruturais corretivas devem ser migrations aditivas.
