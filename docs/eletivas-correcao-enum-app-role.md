# Eletivas HMSJ — correção do erro PostgreSQL `type "app_role[]" does not exist`

## Diagnóstico
A pré-conciliação pelo navegador chegou até a função
`public.ec_importar_itens_local`. Essa RPC executa com
`SECURITY DEFINER SET search_path=''` e chama
`public.has_any_role(usuario, ARRAY['admin','acp']::app_role[])`.
O tipo existente é **`public.app_role`**. Com `search_path` vazio,
a resolução de `::app_role[]` falha antes mesmo da verificação fiscal.

O problema também se encontra em outras três funções:
`ec_conferir_item`, `ec_validar_execucao_local` e `ec_encerrar`.
A correção se aplica às quatro preventivamente.

## Implantação incremental
1. **Não** reexecutar as migrations das Fases 0, 1 ou 2.
2. Abrir [migration de 15/10 17:00](../supabase/migrations/20261015170000_eletivas_corrige_app_role_search_path.sql)
   na branch `main`, copiar o arquivo Raw e executar no SQL Editor do Lovable.
3. Executar [verificação pós-migration](../supabase/tests/eletivas_app_role_verificacoes.sql).
4. Reabrir a competência de julho/2026 e clicar em **Pré-conciliar arquivos da competência**.
5. Se aparecer outro impedimento, registrar o novo diagnóstico na tela. Não
   desligar os bloqueios nem registrar resultado parcial.

## Como funciona e o que não muda
A migration, em transação, consulta o catálogo `pg_proc` e reconstrói
**somente** as quatro definições necessárias, substituindo exatamente
`::app_role[]` por `::public.app_role[]`. Não altera `search_path`,
perfil ACP/Admin, função `has_any_role`, grants, triggers, RLS,
arquivos, memória de cálculo ou estados das competências.

O SQL é idempotente: se o tipo já estiver qualificado, não o altera.
Verifica ainda que cada função continua `SECURITY DEFINER` com caminho
de pesquisa vazio antes de aplicar a substituição.

## Teste e limites
O GitHub Actions verifica estrutura/migrations, testes de unidade e build.
A checagem pós-migration consulta as quatro funções **efetivamente instaladas**
e seus grants. Isso não substitui o teste funcional autenticado no Lovable,
pois o GitHub não tem acesso de execução ao banco institucional.
