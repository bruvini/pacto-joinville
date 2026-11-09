# PVH · Fase B — Solicitação multicompetência

## Escopo
- O prestador é determinado pelo bloco da Etapa 3: **não escolher instituição novamente**.
- Valor pedido à SEFAZ fica em `pvh_empenhos.valor_solicitado` (novo campo da Fase A).
- A Nota emitida mantém `pvh_empenhos.valor_total`, independente do valor pedido. A diferença não é uma alocação.
- Meses de abrangência são referências `MM/AAAA` de `pvh_empenho_competencias`. Não há divisão/reserva mensal do valor solicitado.
- Um mês ainda não criado no PACTO pode ser indicado; a competência de origem é selecionada automaticamente e não pode ser desmarcada.
- Fase C implementará o consumo entre competências. Esta fase não altera `pvh_empenho_alocacoes` nem os motores existentes de distribuição.

## Migration necessária
`supabase/migrations/20261109160000_pvh_solicitacao_multicompetencia_fase_b.sql`

Pré-requisito: Fase A aplicada; confirmar presença de `pvh_empenho_competencias`, `pvh_empenho_anulacoes` e `pvh_empenhos.valor_solicitado`.

A migration instala:
1. Trigger que impede alteração do valor solicitado depois do envio à ACO/SEFAZ ou emissão da NE.
2. Trigger que exige pedido e abrangência válida ao confirmar o encaminhamento de solicitações novas (sem invalidar o legado).
3. RPC transacional `pvh_salvar_solicitacao_multicompetencia`: checa perfil, participante, competência, exercício, processo anual e estágio; atualiza valor e meses na mesma transação; preserva meses com utilização histórica.
4. `REVOKE EXECUTE FROM PUBLIC, anon`, concedendo `authenticated` com verificação interna de `admin/acp/aco`.

Não é necessário UPDATE de NEs históricas. Se `valor_solicitado` estiver nulo para um registro anterior, permanece **Não informado (registro anterior)**. O valor emitido jamais é usado como substituto.

## Ordem de publicação
1. Backup, janela operacional, baseline de outubro e homologação da migration A.
2. Aplicar o SQL da Fase B integralmente em homologação e testar salvamento de rascunho e envio ACO.
3. Aplicar em produção, validando a presença da função e triggers via SELECT.
4. Publicar o frontend correspondente (o formulário requer a nova RPC).
5. Testar uma solicitação de exemplo com pedido de R$ 120 mil e abrangência em três meses, sem emitir NE real.
6. Validar que ACO bloqueia pedido nulo, que meses congelam após envio e que a NE definitiva continua independente.

### SQL somente leitura para pós-instalação
```sql
SELECT to_regprocedure(
 'public.pvh_salvar_solicitacao_multicompetencia(uuid,uuid,uuid,uuid,text,text,date,text,text,numeric,text[])'
) AS rpc_instalada;

SELECT t.tgname, t.tgenabled, c.relname
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE t.tgname IN ('trg_pvh_proteger_valor_solicitado','trg_pvh_validar_multicompetencia_aco');

SELECT count(*) AS ne_com_pedido_historico_indevio
FROM public.pvh_empenhos WHERE valor_solicitado IS NOT NULL;
```
O último resultado deve permanecer zero logo após a migration; pedidos novos surgirão somente quando cadastrados no novo formulário.

## Regressões protegidas
- Outubro/2026: NEs 6606/2026 e 6604/2026 não mudam de valor nem de alocação.
- Usuário sem admin/acp/aco não salva por RPC.
- Persistência de meses e valor é atômica (sem inconsistência entre as tabelas).
- Pedido novo sem valor não pode ser enviado à ACO.
- Pedido antigo sem valor não vira automaticamente solicitação do valor da NE.
- Alterar o calendário depois do envio gera erro, preservando os registros anteriores.

## Limitações
- Registro de meses **não vincula automaticamente** uma NE às futuras competências na interface de consulta; isso pertence à Fase C.
- A Fase B não altera a conclusão das etapas 2/3/4; isso pertence à Fase D.
- A Fase B não realiza anulação contábil; isso pertence à Fase E.

## Reversão
Antes de uso: reverter apenas frontend e desabilitar o novo fluxo, mantendo funções e estruturas aditivas.
Depois de uso: não apagar `valor_solicitado` ou meses já cadastrados; qualquer rollback precisa preservar novos registros e seus eventos auditáveis.
