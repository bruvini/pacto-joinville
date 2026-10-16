# Fase 3 — Migração financeira HTML v2.42.2 (16/10/2026)

**Fonte congelada**: `Auditoria - Cirurgias Eletivas - 102026.html`, SHA-256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`. Funções confrontadas: `reconcile()`, `payValue()`, `expectedPayValue()`, `countedPayValue()`, `aggregates()`, `effStatus()`, `officioValue()` e `correctionTotal()`.

## Regra por linha, sem arredondamento intermediário incorreto

O leitor já entrega `valor_publicado` e `valor_esperado` da categoria correta; SIA combina financeiro e complemento dentro do MESMO item. Em centavos:

1. `faec_fxmac`: apenas controle (publicado/esperado preservados), zero no total.
2. `status=ok/info`: valor publicado prevalece, inclusive sobre uma decisão `erro` antiga (precedência literal do HTML).
3. `decisao=aceito`: publicado.
4. `decisao=erro`: zero.
5. `publicado <= R$ 0,02`: zero nos estados divergentes.
6. `esperado > R$ 0,02`: menor entre publicado e esperado.
7. Sem expectativa verificável, o valor **já publicado** continua na parcela incontroversa, mas não se cria crédito novo.
8. `analise`, `oficio` e sem decisão usam a mesma base incontroversa: pendências não anulam automaticamente os valores publicados.
9. Exceção documental adicional: FAEC múltiplas pendentes exigem publicação independente por AIH e FPO efetivamente comprovada; MAC múltiplas pendentes exigem comprovação independente. FPO oficial não é prova de programação. O total contábil usa `ec_valor_item_documentado`; a função de 5 parâmetros `ec_valor_item` preserva a fórmula literal do HTML para uso comparativo.
10. Ofício/valor a cobrar é diferença positiva entre esperado e publicado, **não** valor adicional recebido. O código-envelope isolado não gera cobrança, e FAEC faixa MAC não se soma novamente.

**Onze categorias**: `faec_prod`, `faec_compl`, `faec_mult`, `faec_fxmac`, `mac_compl`, `mac_mult`, `mac_fxfaec`, `mac_prod`, `mac_fxfed`, `sia_faec`, `sia_mac`.

## Correções e fechamento

Somente `eletivas_correcoes.status='aprovada'` entra no total; `duplicada`, `rejeitada`, `em_analise` não entram. O JSON histórico não é somado outra vez. O SQL `ec_resumo_financeiro`, `ec_resumo` e a RPC de fechamento `ec_encerrar` usam a mesma função com exceções documentais. A integração com o Fluxo 1 continua explicitamente separada: nenhum valor de `lancamentos_pagamento` é atualizado nesta fase.

## SQL obrigatório, EM ORDEM

1. **Diagnóstico antes**: [SQL leitura Fase 3](../supabase/tests/20261016193500_eletivas_fase3_preflight.sql). Exibe competências e os itens que mudariam em relação à regra atual; confira especialmente o status `encerrada`.
2. **Migration principal**: [Regra HTML 2.42.2](../supabase/migrations/20261016193000_eletivas_fase3_motor_html2422.sql). Ajusta precedência, tolerância e subtotal; bloqueia migração se a regra reavaliaria valores de competências encerradas.
3. **Migration documental**: [Múltiplas FAEC/MAC e FPO](../supabase/migrations/20261016194500_eletivas_fase3_excecoes_documentais.sql). Faz resumo e encerramento usarem a mesma verificação documental por item, bloqueando alteração retroativa de fechamento histórico. Não aplica decisões automaticamente.
4. **Diagnóstico novamente**: repetir o SQL de leitura e confirmar diferença zero na regra de cinco parâmetros. Confrontar `ec_resumo_financeiro` com o quadro no React no mesmo encontro e nas mesmas evidências.

O usuário deve executar os SQLs **no SQL Editor do banco vinculado ao Lovable**, com a migration de arquivamento da Fase 2 já aplicada. O projeto não está disponível pelo conector Supabase nesta sessão; nenhuma migration foi executada em produção.

## Cenários de teste em competência de homologação

- Abrir uma competência com pelo menos uma evidência das 11 categorias e conferir publicado/esperado/incontroverso por item, subtotal FAEC, MAC, SIA e total EC-base.
- `div` com publicado 150, esperado 120, decisão `analise` ⇒ admitido 120; com `oficio` ⇒ admitido 120, diferença a cobrar 0 (a diferença neste caso é sobrepagamento); com decisão `erro` ⇒ 0; `aceito` ⇒ 150.
- `pendente` publicado 80 e esperado 120 sem restrição documental ⇒ admitido 80. A situação continua pendente fiscalmente; não significa que haja aprovação.
- `status=ok` com decisão histórica `erro` ⇒ 100% do publicado pela precedência original. Esse caso CONTRADITÓRIO deve ser revisado pelo fiscal e sua decisão corrigida em registro auditado, sem alterar a fórmula por conveniência.
- FAEC múltipla federal `pendente` com `exige_programacao_fpo=true` ⇒ zero no **atesto fiscal** enquanto não validada a prova. Não inferir programação a partir da tabela FPO.
- Correção aprovada +20,35 ⇒ subtotal +20,35 no total preliminar; a mesma correção duplicada não soma. FAEC faixa MAC deve mostrar valor no campo de controle mas não no subtotal.
- Confirmar que `ec_resumo_financeiro` coincide com o resumo do navegador a **R$ 0,00 de diferença** e que a competência não pode ser encerrada sem checklist/documentos/decisões.
- Usar o comparador **Golden Master** com o mesmo SHA e as MESMAS planilhas reais de 04/2026, 07/2026 e 08/2026+. Testes sintéticos comprovam fórmulas, **não equivalência integral do `reconcile()` original com o leitor React nos arquivos oficiais**. O aceite total requer golden dos 11 componentes e memória de origem, centavo a centavo.

## Resultado e limites

Implementado: regra de valor por item do HTML, onze somatórios sem dupla contagem, cálculo de correções, exceções de prova documental no fechamento, SQL comparável e prévia de valores financeiros no React. O leitor `conciliarEletivas()` já possuía transposição das 11 categorias da fase anterior; sua equivalência integral com `reconcile()` **não deve ser presumida** sem amostras reais. O comparador existente apresenta divergências por item e hash. Não registrar aceite fiscal real baseado apenas em CI.
