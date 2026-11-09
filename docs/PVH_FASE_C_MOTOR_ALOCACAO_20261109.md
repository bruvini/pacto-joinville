# PVH · Fase C — motor global de alocação, FIFO e concorrência

**Status:** implementação preparada em branch isolada, **migration não aplicada** e frontend **não publicado**. A última revisão SQL não pôde ser testada no PostgreSQL porque o Lovable atingiu seu limite temporário de consultas. Não fazer merge do PR #48 antes da verificação abaixo.

## Banco
Migration: `supabase/migrations/20261109180000_pvh_motor_alocacao_global_fase_c.sql`

As rotinas:
- `pvh_ne_competencia_elegivel(uuid,text)`: somente mês confirmado, utilizado historicamente ou mês de origem de NE legada não reconstituída.
- `pvh_ne_guard_alocacao()`: valida mesma instituição, competência permitida, necessidade oficial, saldo global e vínculo de subempenho; serialização por `pg_advisory_xact_lock`.
- `pvh_ne_guard_emissao()`: não permitir redução do valor abaixo de compromissos/anulações, alteração do número de NE ativa ou inativação de NE utilizada.
- `pvh_sincronizar_cobertura_competencia(uuid)`: só acrescenta cobertura faltante, prioridade da NE mais antiga, sem redistribuir alocações antigas.
- Atualiza `pvh_rebalancear_alocacoes_origem`, `pvh_alocar_saldo_empenho`, `pvh_registrar_nota_empenho` e `pvh_preparar_etapa4` para respeitar o motor e deixar subempenhos documentados intocados.

## Condições de alocação
1. Portaria estadual com etapa 1 concluída, sem reconferência.
2. Número e data da portaria municipal preenchidos; crédito FMS **não é pré-condição de preparação**.
3. Mesma instituição e exercício.
4. NE emitida e ativa, competente para o mês; solicitações novas com ACO, SEFAZ e assinaturas exigidas.
5. Valor disponível = emitido − já alocado − anulacoes efetivas.
6. Maior antiguidade (data de emissão/solicitação/cadastro) antes das novas NEs.
7. Não alterar, reduzir ou excluir alocação já documentada; excedente oficial gera erro de reconferência.

## Interface
- Ao abrir a etapa 3, sincroniza somente valores oficiais já validados; se pendente, exibe a NE prevista sem alocá-la.
- Uma competência futura pode exibir NE com abrangência confirmada, mas sem valor planejado por mês.
- Saldos de NEs exibidos descontam anulações registradas.
- A preparação da etapa 4 não redistribui documentos ou assinaturas.

## Gate de segurança — obrigatório antes de liberar
1. Conferir backup restaurável e janela de implantação sem lançamentos simultâneos.
2. Executar a migration inteira em homologação, validar o schema, RLS/grants, SQL e invocações reais com usuário ACP.
3. Testar duas conexões simultâneas para a mesma NE e competências distintas (a soma não pode ultrapassar o valor efetivo).
4. Testar reabertura com eventos assinados, sobrecobertura e cancelamentos; a operação não pode mudar subempenhos documentados.
5. Executar `scripts/pvh-fase-c-integridade.sql` antes/depois e reconciliar os totais.
6. Validar NE 6606/2026 e 6604/2026 em 10/2026, ambas com cobertura original preservada.
7. Aplicar a migration em produção, repetir a reconciliação e **só depois** mesclar/publicar o frontend.

## Limites
Não altera as regras de conclusão das etapas (Fase D) nem permite anulação de saldo sem ato contábil (Fase E).
Não há testes de concorrência reais de duas sessões no CI atual; testes TypeScript verificam modelo, permissões estruturais e invariantes.
Não é seguro usar o editor SQL durante operação financeira ativa.
