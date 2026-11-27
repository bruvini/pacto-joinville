# PACTO Joinville · Emendas Parlamentares · Fase B

**Objetivo:** introduzir a entidade financeira de subempenho, preservando a NE registrada em `emenda_solicitacoes`, as competências existentes, os documentos e os registros de execução anteriores.  
**Estado:** proposta versionada, **sem migração aplicada pelo assistente ao banco operacional**.  
**Dependência:** Fase A — `supabase/migrations/20261125170000_emendas_fase_a_protecao_exclusao.sql`.

## 1. Baseline antes da Fase B

Em 26/11/2026, consulta somente leitura ao banco conectado ao projeto Lovable confirmou:
- função `emenda_excluir_lancamento` com definição distinta do baseline anterior à Fase A;
- gatilho `trg_emenda_guard_exclusao_executada` instalado;
- `public.emenda_subempenhos` inexistente;
- uma solicitação de NE e zero pagamentos registrados.

A saída da SQL de inventário enviada pelo usuário confirma RLS ativa nas 22 tabelas existentes de Emendas, mas **não equivale a comprovante de backup ou à aplicação das migrations da Fase B**. O PR da Fase A ainda não estava integrado à `main` na consulta de 26/11; esta branch foi criada a partir da branch da Fase A. Integrar na ordem A → B para que migrations e código não se contradigam.

## 2. Novos relacionamentos

```text
emendas
  └─ emenda_lancamentos (competências)
       ├─ emenda_solicitacoes (uma NE emitida por lançamento no modelo atual)
       ├─ emenda_lancamento_meses (competência vinculada)
       └─ emenda_subempenhos (N solicitações de subempenho)
            ├─ emenda_subempenho_documentos (1 por tipo e solicitação)
            └─ emenda_blocos_pagamento.subempenho_id (0..N pagamentos; campo novo opcional)
```

**Identidade:** `subempenho_id` único, `chave_idempotencia` única por emenda, `sequencia` sequencial por lançamento/competência. A validação de chave, os saldos e a numeração acontecem dentro da mesma transação, serializada pela linha de `emendas`.

**Origem da NE:** `emenda_solicitacoes` permanece como registro original de solicitação, valor solicitado e NE efetivamente emitida. `valor_solicitado` de cada *subempenho* é outro campo, não substitui o valor solicitado da NE.

## 3. Estados e documentos

| Estado do subempenho | Evidência | Valor que reserva saldo |
| --- | --- | --- |
| `rascunho` | Nova solicitação interna, ainda sem SEI | `valor_solicitado` (reserva interna preventiva) |
| `solicitado` | `solicitacao_liquidacao`: nº SEI, link e data | `valor_solicitado` |
| `em_liquidacao` | `movimento_liquidacao`: nº SEI, link e data | `valor_solicitado` |
| `subempenhado` | `aviso_subempenho`: nº SEI, link, data, valor efetivamente documentado | `valor_subempenhado` |
| `cancelado` | Justificativa; somente rascunho sem documentos | zero |

O valor do Aviso pode ser diferente do valor solicitado; a divergência não é apagada, pois ambos continuam disponíveis. O status representa **etapa de registro documental no PACTO**, não comprova, por si só, assinatura, encaminhamento ou validação no e-Pública. Estas exigências serão adicionadas ao workflow operacional na Fase D.

Os três tipos de documento são identificados separadamente e inseridos uma única vez. Reenvio **idêntico** da mesma evidência é idempotente; tentativa de sobrescrever dados diferentes é bloqueada e requer futura rotina de retificação controlada.

## 4. Proteções monetárias e contra dupla contagem

`comprometido_novo = soma(valor_subempenhado dos confirmados + valor_solicitado dos demais não cancelados)`

`saldo_NE_a_comprometer = valor_NE_emitida - anulações - comprometido_novo`

Estas expressões valem **somente** para a carteira de novos subempenhos. Se houver registros históricos em `emenda_liberacoes`, o sistema não pode tratá-los como se fossem novos subempenhos: são um livro legado distinto.

Regras transacionais:
1. Subempenho só pode ser criado com NE emitida, competência vinculada, emenda ativa e lançamento não conciliado/encerrado.
2. Antes de criar ou confirmar, a RPC/triggers bloqueiam a emenda com `FOR UPDATE`, calculam reservas e anulações e rejeitam totais superiores à NE. Todos os cálculos persistentes usam `numeric(16,2)`.
3. Não se cria subempenho novo quando existe `emenda_liberacoes` daquele lançamento. O trigger inverso impede nova liberação legada quando há subempenhos ativos. **Não migrar automaticamente nenhum registro legado.**
4. A anulação registrada no fluxo existente também passa por verificação de reservas novas. Alterações de identificação, valor ou status da NE ficam bloqueadas após a existência de subempenho ativo.
5. Pagamentos novos poderão referenciar subempenho por FK composta, impedindo associação a outra emenda, lançamento ou competência. Se houver vínculo, o total pago não poderá ultrapassar o valor efetivo do subempenho.
6. `DELETE` de subempenho/documento é recusado; cancelamento de rascunho conserva o registro e a auditoria. O FK `ON DELETE RESTRICT` protege os vínculos mesmo por acesso direto a tabelas antigas.

A visão `emenda_subempenho_resumo` evita multiplicação de joins mediante agregações independentes por lançamento, expõe saldos com origem `modelo_legado`, `novo_subempenho` ou `sem_movimentacao`, e devolve **NULL** para o saldo quando encontra `conflito_entre_modelos`, em vez de produzir um número artificial.

## 5. Migrações

Aplicar **somente nesta ordem**, em ambiente de homologação:

1. `20261126100000_emendas_fase_b1_subempenhos_relacoes.sql`: duas novas tabelas, FK compostas, programação e vínculo opcionais no pagamento, RLS, privilégios e auditoria.
2. `20261126101500_emendas_fase_b2_integridade_rpc.sql`: triggers financeiros e três RPCs de criação, documentação e cancelamento conservador.
3. `20261126103000_emendas_fase_b3_resumo_ne.sql`: visão `security_invoker=true`, com diferenciação explícita do modelo legado.

**Contrato TypeScript:** `src/integrations/supabase/types.ts` contém os tipos previstos de B1–B3 antes da instalação, para validar o código e os contratos arquiteturais. Após aplicar as migrations no ambiente de homologação, regenerar os tipos a partir do esquema real e comparar, antes de promover a produção.

**O que NÃO muda:** nenhuma linha preexistente de `emenda_solicitacoes`, `emenda_liberacoes`, `emenda_blocos_pagamento` ou `emenda_historico` é atualizada pela Fase B. A coluna `subempenho_id` nos pagamentos permanece NULL em registros antigos. `emenda_liberacoes` conserva seus dados e contratos atuais; o mecanismo que o usava indevidamente como Aviso de Movimento será substituído na Fase D, sem apagar documentos históricos.

**Limitação deliberada:** `emenda_blocos_pagamento.liberacao_id` continua `NOT NULL` nesta fase. Assim, os campos de programação e o vínculo de subempenho estão estruturados, mas **a criação independente de pagamentos novos vinculados diretamente a subempenhos ainda não está habilitada**. O desacoplamento do lançamento de programação e comprovante é tarefa da Fase E.

## 6. Validação e cenários mínimos em homologação

Pré-condições:
- backup atual restaurável, efetivamente testado em ambiente segregado;
- inventário da Fase A registrado antes/depois;
- testagem com usuário ACP/Admin e usuário sem permissão, sem uso de documentos reais;
- checagem de objetos, triggers e RPCs após cada migration;
- executar `scripts/emendas-fase-b-postflight-readonly.sql`.

Matriz mínima de testes com dados **sintéticos**:

| Caso | Comportamento exigido |
| --- | --- |
| NE R$ 120 mil, pedido R$ 30 mil, pedido R$ 40 mil | Reserva R$ 70 mil; saldo R$ 50 mil |
| Aviso do primeiro pedido confirma R$ 28 mil | Primeiro compromisso passa a R$ 28 mil; reserva total R$ 68 mil; saldo R$ 52 mil |
| Solicitações simultâneas excedendo NE | Uma transação falha sem escrita parcial |
| Mesmo UUID de idempotência e mesmos valores | Retorna registro original |
| Mesmo UUID de idempotência e valores diferentes | Falha por conflito |
| Documento fora de sequência | Falha sem persistência |
| Anulação que ultrapassa saldo disponível | Bloqueada no banco |
| Liberação legada após novo subempenho | Bloqueada |
| Subempenho sobre lançamento com liberação legada | Bloqueado |
| Pagamento novo em outra competência ou maior que confirmado | Bloqueado por FK ou trigger |
| Tentativa de atualizar NE com subempenho ativo | Bloqueada |
| Usuário sem perfil ACP/Admin | Não consegue criar/documentar/cancelar |
| Rascunho sem documentos cancelado | Mantém registro, auditoria e libera saldo |
| Documento já registrado com dados diferentes | Bloqueado até existir fluxo formal de retificação |

**Concorrência:** executar duas sessões independentes em homologação, com pedidos que juntos excedam a NE. Conferir que o lock na emenda serializa operações e mantém saldo não negativo. Teste de SQL estático não substitui este ensaio.

**Regressão:** as operações de Emendas já existentes devem seguir funcionando quando a NE não possui subempenhos novos, bem como Piso, PVH e Convênios. Verificar no CI os testes específicos e comparar falhas gerais às preexistentes.

## 7. Rollout e reversão

1. Não implantar schema B2 antes de B1, nem cliente operacional de subempenho antes de B1-B3 aplicadas.
2. Não aplicar migrations em produção sem restauração de backup testada e homologação aprovada.
3. Aplicar migrations em ordem, capturar resultados do postflight e conferir que as contagens históricas permanecem idênticas.
4. Como rollback **não destruir tabelas ou dados**. Se o frontend novo falhar, reverter apenas o frontend, mantendo o banco protegido; o retorno ao fluxo legado não pode ocorrer para lançamentos que já possuam subempenhos novos.
5. Antes da Fase D, implementar assinatura e confirmação de envio; antes da Fase E, separar programação de pagamento e revisar a antiga exigência de `liberacao_id`.

## 8. Observações de segurança

Tabelas novas têm RLS e somente SELECT para usuários autorizados. Gravações são exclusivamente por RPCs `SECURITY DEFINER` com checagem de `auth.uid()` e papéis ACP/Admin, `search_path` seguro e privilégios de execução restritos. Nunca expor `service_role` no navegador. O pós-flight e a inspeção por conector não validam o comportamento em sessão de usuário final sem teste de autenticação.
