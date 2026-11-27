# PACTO Joinville · Emendas Parlamentares · Fase F
## Anulações, encerramento por competência e conciliação por NE e emenda

**Data:** 26/11/2026. **Dependências:** Fases A–E instaladas. **Estado:** alterações em branch/PR; F1–F3 **não foram executadas pelo assistente no PostgreSQL operacional**.

### 1. Diagnóstico da base

O usuário executou E1, E2, E3 e o pós-flight da Fase E, registrando todas as instalações positivas, nove verificações de integridade zeradas e 0 pagamentos novos/legados, 0 parcelas e 0 subempenhos confirmados. O banco possuía 1 emenda e 1 NE.

A revisão de funções existentes revelou:
- `emenda_anular_residual` calcula `NE − anulações − liberações`, sem consultar diretamente os subempenhos da cadeia nova;
- `emenda_fluxo_finalizar_anulacao` repete esse cálculo legado;
- `emenda_fluxo_enviar` exige pagamento de todas as competências antes da anulação;
- `emenda_encerrar_competencia_sem_execucao` permite fechar sem execução se não houver liberação legada, mas não verifica distribuição nova, subempenho, pagamento e documento pendente;
- `emenda_conciliar_encerrar_ne` compara apenas liberações com pagamentos legados, ignorando as conciliações da Fase E;
- o componente `FluxoAnulacaoEmenda` impede mostrar qualquer ação se todas as competências não tiverem pagamento documentado, **mesmo quando o banco possui encerramento formal sem execução**.

Esses fatos constam nas funções SQL que foram inspecionadas antes da alteração.

### 2. Modelo de fechamento

Uma NE pode reunir competências:
- **executada_legado:** liberação documentada, pagamento legado conferido e nenhuma pendência no documento do fluxo anterior;
- **executada_novo:** subempenhos da competência confirmados, documentos concluídos, pagamentos líquidos iguais aos compromissos e conciliações individuais confirmadas pela Fase E;
- **sem_execucao:** encerramento próprio no SEI, sem alocação ativa, compromisso, liberação, pagamento ou documento legado daquela competência;
- **pendente:** qualquer documento em andamento, pagamento parcial, subempenho sem Aviso confirmado, não conciliação individual, competência ainda não fechada etc.;
- **inconsistente:** encerramento sem execução registrado em situação incompatível com os fatos financeiros.

Nenhuma competência fica resolvida apenas porque existe programação de pagamento. Quitação parcial nunca conclui a NE.

### 3. Três valores distintos e sem dupla contagem

`NE líquida = valor da NE emitida − anulações registradas`

`Compromissos = liberações legadas OU soma das reservas e subempenhos ativos da Fase B/D` (o modelo que de fato estiver sendo utilizado).

`Distribuído = soma dos valores alocados entre competências da NE` (planejamento, não é novo empenho nem pagamento).

`Saldo livre para anular = NE líquida − MAIOR(distribuído, liberações legadas, compromissos novos)`

`Residual a anular para fechar = NE líquida − compromissos`

`Saldo de pagamentos pendentes = compromissos − pagamentos líquidos efetivamente comprovados`

Quando **distribuição > compromissos**, o residual necessário para o encerramento pode ser superior ao saldo livre para anular. Nesse caso é obrigatório reduzir/cancelar previamente a distribuição que ficou sem utilização, respeitando as reservas existentes. Não se cancela saldo alocado automaticamente.

**Exemplo:** NE R$ 100 mil, distribuição R$ 70 mil, subempenhos R$ 50 mil, pago R$ 30 mil. Saldo imediatamente anulável R$ 30 mil; residual a anular no fechamento R$ 50 mil; pagamento pendente R$ 20 mil. Para encerrar, regularizar a distribuição livre de R$ 20 mil, anular o saldo sem compromissos e concluir os pagamentos e conciliações individuais.

### 4. Migrations

**F1:** `20261126140000_emendas_fase_f1_diagnosticos_fechamento.sql`
- `emenda_f_competencias_painel`: status real de cada competência, valores, documentos e pendências;
- `emenda_f_ne_painel`: saldo anulável, residual necessário, pagamentos pendentes, prontidão de conciliação e snapshot da NE;
- `emenda_f_emenda_painel`: soma independente das NEs, quantos fechamentos faltam e quantos lançamentos permanecem sem NE. Não considera emenda totalmente reconciliada se houver lançamento sem NE.

Três views `security_invoker=true`, sem multiplicação de valores por JOINs 1:N.

**F2:** `20261126141500_emendas_fase_f2_anulacao_conciliacao_rpc.sql`
- acrescenta colunas **nullable** e auditáveis em `emenda_conciliacoes_ne` (`modelo_financeiro`, `total_comprometido`, `total_pago_liquido`, `total_distribuido`, `competencias_sem_execucao`), sem ressignificar `total_liberado` legada;
- reimplementa as RPCs de anular, enviar e finalizar anulação, encerrar sem execução, conciliar e fechar NE;
- a conclusão atualiza as competências filhas e a situação da solicitação/NE `encerrada`, somente após registrar o documento SEI de conciliação;
- compatibiliza o guard da Fase C com a única transição controlada `emitida → encerrada`, após a fotografia de conciliação;
- previne novo fluxo de liberações legadas por meio da RPC de envio, preservando operações já iniciadas no modelo anterior que possuam liberações efetivas.

**F3:** `20261126143000_emendas_fase_f3_travas_encerramento.sql`
- bloqueia novas distribuições, subempenhos, anulações, liberações e eventos de pagamento da Fase E depois da conciliação;
- não permite distribuir ou liberar recursos em competência encerrada sem execução;
- impede alteração ou exclusão física de anulações, encerramentos sem execução e conciliações já registrados;
- valida snapshot financeiro contra a visão real antes de admitir a conciliação no banco.

**Compatibilidade:** sem alteração de `liberacao_id NOT NULL` no pagamento legado; nenhuma tabela ou documento antigo é apagado, convertido ou regravado.

### 5. Frontend

Na página da NE, `FluxoAnulacaoEmenda` agora mostra:
- NE líquida, compromissos, saldo livre anulável e residual a anular no fechamento;
- situação de cada competência e ação **Encerrar sem execução** com justificativa, número e link SEI quando cabível;
- aviso para reduzir distribuição ainda não comprometida, sem ignorar o valor reservado;
- solicitação e Aviso de Movimento de anulação, com conferências de assinatura e envio à SEFAZ.UCG.AEO;
- relatório das pendências documentais, financeiras e de conciliação;
- botão **Conciliar e encerrar NE**, habilitado somente se o diagnóstico do banco indicar prontidão. O backend reconfere tudo no momento da operação.

Na aba da emenda, `ExecucaoEmenda` exibe a consolidação das NEs, seus saldos a anular, valores a pagar e lançamentos ainda sem NE. O estado global não é inferido de um único lançamento fechado.

### 6. Testes funcionais obrigatórios em homologação

1. NE com três competências, uma sem execução registrada e duas com execução integral → permitir conciliação após zerar residual.
2. Competência sem execução com distribuição ativa ou qualquer documento legado iniciado → recusar encerramento e exigir regularização.
3. Subempenho de R$ 80 mil com apenas R$ 60 mil efetivamente pagos → bloquear fechamento da NE e mostrar R$ 20 mil pendentes.
4. Subempenho totalmente pago sem conciliação individual Fase E → bloquear NE, mesmo com saldo zero.
5. NE R$ 100 mil, R$ 70 mil distribuídos, R$ 50 mil comprometidos → mostrar anulável R$ 30 mil e residual para fechar R$ 50 mil; bloquear anulação total até ajustar a distribuição.
6. NE completamente sem execução com todas as competências formalmente encerradas e anulação total → permitir fechar, sem exigir comprovantes fictícios.
7. Uma emenda com duas NEs, uma conciliada e outra com pagamento pendente → impedir situação global `totalmente_conciliada`.
8. Uma emenda com NE conciliada e novo lançamento ativo sem NE → impedir consolidação global como concluída.
9. Conciliação da NE seguida de tentativa de inserir parcela, pagamento, anulação, subempenho ou distribuição → bloquear no banco.
10. Execução antiga com liberação e pagamento coincidentes → manter conciliação do modelo legado, sem misturar com subempenhos novos.
11. Conflito entre livros legado e novo → bloquear fechamento e expor no diagnóstico.
12. Repetição ou alteração de snapshot após conciliação → impedir, preservando evidências e documentos.
13. Usuário sem ACP/Admin tenta registrar anulação, encerramento sem execução ou conciliação → rejeitar; ACO somente leitura conforme políticas.
14. Dois usuários tentando anular, comprometer ou encerrar simultaneamente a mesma NE → trava `FOR UPDATE` deve serializar; somente uma operação pode consumir o saldo restante.
15. Confirmar que estados dos pagamentos são derivados de comprovantes efetivos, **não** da programação, inclusive após estornos/devoluções.

**Esses ensaios exigem dados sintéticos e ambiente segregado**, com backup restaurável validado. Os testes de código não provam que o parser ou as transações PostgreSQL funcionarão em produção.

### 7. Implantação e pós-flight

- Verificar que A–E estão implantadas (pós-flight E fornecido pelo usuário), confirmar backup restaurável e a fotografia anterior das NEs, anulações, encerramentos e pagamentos.
- Aplicar F1, depois F2, depois F3 em ambiente de homologação.
- Executar `scripts/emendas-fase-f-postflight-readonly.sql` e preservar o JSON, comparando com os pós-flights anteriores.
- Homologar os cenários acima, com ao menos uma concorrência real e um usuário com acesso apenas de consulta.
- Publicar frontend coordenadamente somente após migrations e aprovação do fluxo pela equipe.

**Se houver problema no frontend:** reverter a interface, não os registros documentais, e não reabilitar automaticamente funções legadas de conciliação que ignoravam os pagamentos da Fase E. Correções SQL futuras devem ser aditivas, com novas migrations e trilha de auditoria.
