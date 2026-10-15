# Eletivas HMSJ — Fase 0 (integridade do motor)

## Implantação
1. Sincronize a branch `main` no Lovable.
2. Execute [20261015101500_eletivas_fase0_integridade_execucao.sql](../supabase/migrations/20261015101500_eletivas_fase0_integridade_execucao.sql) no SQL Editor, apenas após as duas migrations originais de 10/10.
3. Execute [diagnóstico de SQL/RLS](../supabase/tests/eletivas_fase0_verificacoes.sql).
4. Confirme a publicação da **Edge Function eletivas-processar**: a migration revoga a RPC legada. O código de servidor atualizado usa exclusivamente `ec_importar_itens_v2`.
5. Reabra a interface, crie uma competência de teste e valide a nova trilha.

## Alterações
- Histórico `ec_registrar_evento` usa apenas JSONB de OLD/NEW conforme TG_OP e usa `id` para competência. Remove o erro de `OLD.competencia_id` em inserções.
- Trigger de itens deixa de preencher automaticamente `conferido_em`. A RPC `ec_conferir_item` carimba identidade e data do fiscal com autorização ACP/Admin.
- **Importante:** a migração limpa carimbos antigos de todas as competências **abertas** (nunca as encerradas), para exigir reconferência explícita após a correção. As decisões anteriores são preservadas.
- Execução do motor recebe um UUID, versão, data e manifesto de `id`/`categoria`/`sha256` das evidências. Registro imutável também em `eletivas_eventos`.
- A ingestão transacional somente pelo servidor trava categorias duplicadas, fontes de outra competência, hashes divergentes, versões antigas e tentativas de substituir decisões fiscais ou itens manuais.
- A interface consulta itens por páginas de 500 até 10 mil, mantendo os totais calculados da competência completa, em vez de ficar limitada à primeira página do PostgREST.
- O encerramento bloqueia ausência de execução do motor, incongruência da memória/hashes/itens, ausência de evento e dados sem conferência.
- Não há escrita automática nos lançamentos do convênio.

## Testes mínimos de homologação manual
1. Abrir competência nova. O histórico deve mostrar criação sem erro de OLD.
2. Inserir arquivos privados de teste; validar que versões e SHA aparecem.
3. Executar conciliação em servidor com deploy atualizado; identificar execução no cabeçalho. Nenhum item pode começar como conferido.
4. Conferir um item usando botão; verificar conferido_por/conferido_em e evento.
5. Registrar decisão com justificativa; rejeitar novo processamento.
6. Tentar encerrar sem execução, sem decisões ou sem documentos: bloqueio.
7. Tentar usar RPC de ingestão como `authenticated`: sem permissão.
8. Validar mais de 1000 itens (em fixture isolada) e totais completos.

## Limites
- As rotinas do motor ainda são as da fase anterior: o resultado **não garante** paridade com o HTML v2.28. As fases 1–3 tratam isso.
- A execução da migration e o deployment real da função não são automáticos apenas pelo commit; verificar no Lovable.
- O roteiro SQL/RLS verifica privilégios e estrutura, não simula perfis autenticados nem dados clínicos. Testes com usuário ACP/ACO/anon são necessários para aceite integrado.
