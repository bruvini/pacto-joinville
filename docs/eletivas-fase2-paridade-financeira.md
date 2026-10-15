# Fase 2 — Motor de Eletivas HMSJ: FAEC, MAC, SIA e recortes

**Referência de negócio:** HTML v2.28, funções `reconcile()`, `recorte()`, `siaFile()`,
`aggregates()`, `expectedPayValue()`, `payValue()` e `countedPayValue()`.
A versão HTML analisada tem diferenças históricas em fluxos especiais; paridade com TODOS
os arquivos reais depende de homologação externa.

## Correção do bug do Excel (15/10/2026)
A planilha recebida se chama `SIA FAEC Julho 2026(1).xlsx` (diferente do SIH
FAEC citado pelo alerta). Inspeção de seu XLSX original: a aba Complemento tem
**1.011 células com fórmulas**, das quais **834 têm valor calculado armazenado 0**,
e **nenhuma** está sem cache. Exemplo: C2 usa `IFERROR(VLOOKUP(...),0)` com
`<v>0</v>`. O zero NÃO é falha de cache; não substituí-lo automaticamente.

O CNES 2436469 do HMSJ está na **coluna J em Físico e Financeiro** e na
**coluna K em Complemento**. Sempre buscar o CNES independentemente em cada aba.
Validação de caches restringe-se à coluna daquele CNES. Células de outros hospitais
não podem impedir a conciliação da competência do HMSJ.

Para recortes, quando físico>0, Delib>0 e o Complemento tem fórmula
com cache zero, o sistema mostra **valor publicado zero**, **valor esperado
Físico × Delib** e uma **divergência explicada**. Essa reconstrução não é
prova de pagamento e **não** equivale a crédito atestado automaticamente.

## Regras financeiras adotadas
- Tolerância: diferenças até R$ 0,02 entre valores nos dois lados são consideradas
  conciliadas, sem alterar os centavos armazenados.
- FAEC produção: comparar físico das AIHs, financeiro local e financeiro estadual;
  complemento: QT interna (workbook AIH quando disponível) × Delib; ambos são
  itens separados e não se somam duas vezes.
- MAC produção: registrar somente publicação específica do financeiro MC;
  complementar separadamente pelo físico e Delib. Sem referência normativa,
  item fora do rol não gera complemento automático.
- SIA: comparar físico local, financeiro estadual e complemento, esperado
  como produção da tabulação + QT aplicável × Delib. Em FAEC e FAEC puro,
  a mesma publicação idêntica é deduplicada; resultados discordantes bloqueiam
  o lote para investigação. Um mesmo código em FAEC e MAC simultaneamente
  exige classificação antes de admitir.
- Recortes: FAEC faixa MAC é controle não somável, com publicação e expectativa
  separadas. MAC faixa FAEC e MAC faixa Federal conservam recortes próprios.
- Estados: `ok`, `info` (publicado sem tabulação), `div` (diferença física
  ou financeira), `nc` (não contemplado), `fora` (ausência no rol), `pendente`
  onde houver indefinição técnica. Cada item conserva justificativa e proveniência.
- Valor admitido provisório: usa `ec_valor_item` do Postgres no fechamento;
  `src/lib/eletivas/financeiro.ts` replica a mesma regra em centavos no painel.
  Sem decisão fiscal não se presume glosa ou complementos não publicados.

## Homologação
1. Deploy do código sincronizado com a `main`.
2. Executar [migration Fase 2](../supabase/migrations/20261015161000_eletivas_fase2_resumo_financeiro.sql),
   sem reexecutar Fases 0/1.
3. Executar [SQL de verificação](../supabase/tests/eletivas_fase2_verificacoes.sql).
4. Conferir o resumo de servidor: **publicado, esperado, fiscalmente admitido,
   controles e correções**; o valor admitido deve coincidir com a soma de itens
   do painel em qualquer competência.
5. Importar SIH FAEC Julho 2026.xlsx (ainda não disponibilizado nesta análise)
   e comparar classificação, fórmulas e total com HTML v2.28. Testar SIA
   FAEC real e MAC, complementos e recortes em competência de homologação.
6. Para layout com fórmula sem cache real, exigir substituição do arquivo-fonte
   ou pendência explicitamente documentada; não considerar 0 por omissão.

**Limite da entrega:** SQL teve checagem de sintaxe e testes unitários sintéticos;
não executamos migration no banco do usuário nem homologamos todos os valores
do HTML por código/AIH. Ativação final exige teste de ponta a ponta.
