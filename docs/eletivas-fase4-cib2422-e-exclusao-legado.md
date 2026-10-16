# Eletivas — correção legado julho/2026 e Fase 4 normativa (HTML 2.42.2)

## 1. Reparo necessário da exclusão definitiva de julho

Causa comprovada pelo erro enviado: `ec_excluir_competencia_teste` ainda recusava `eletivas_competencias.lancamento_id IS NULL`. Competências antigas podem ter sido criadas antes de vincular a parcela do Fluxo 1.

Migration: `supabase/migrations/20261016210000_eletivas_reparo_exclusao_legado.sql`. Ela torna `eletivas_exclusoes.lancamento_id` nullable para permitir registrar tombstone do legado, reescreve a RPC para:
- aceitar encontro legado sem lançar **qualquer atualização** em `lancamentos_pagamento`;
- exigir ACP/Admin, justificativa 20+ caracteres, confirmação `EXCLUIR MM/AAAA`;
- bloquear competência encerrada, com fechamento, integração ou escolha de atesto; verificar inclusive escolha formal vinculada a **qualquer lançamento da mesma instituição e competência**;
- recusar exclusão se algum lançamento do mesmo prestador/mês estiver concluído, pago ou possuir valor automático de atesto;
- manter registro administrativo mínimo, limpar tabelas filhas numa transação e preservar tarefa de limpeza do Storage via API (migration anterior).

Após a migration a competência 07/2026 deve ser avaliada novamente. A ausência de vínculo deixa de ser, sozinha, bloqueio; outras condições de segurança podem bloquear. A parcela 54 e o valor manual **não são alterados**.

## 2. Matriz CIB reproduzida fielmente

Fonte: HTML original `Auditoria - Cirurgias Eletivas - 102026.html`, SHA-256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`, objeto `NORM_RAW` SHA-256 `a6b26d7449fb28d0aa2af6c6ba533491ce79a106cfec36238c63559180e6b917`.

O código armazena os 667 códigos do Anexo I para cada uma das três vigências; 249 códigos do Anexo II até 07/2026 e 255 a partir de 08/2026, sendo seis adições explícitas. A codificação delta/base36 é reversível (sem perda). Datas/retificações e normas:
- **030/CIB/2025**, 04/2025–08/2025, retificação 27/03/2025; Anexos I e II; EC Art. 17º e FPO Art. 18º.
- **727/CIB/2025**, 09/2025–07/2026, retificação 11/12/2025; Art. 7º, 11º, 18º e 19º.
- **399/CIB/2026**, 08/2026–12/2026, retificação 06/08/2026; Art. 7º, 11º, 18º e 19º.
- **Nota Informativa nº 05/2026**, a partir de 08/2026. Códigos destacados: `040701003`, `041304002`, `040901018`.

Arquivos `supabase/functions/_shared/eletivas-normativas.ts` e `eletivas-auditor-faixa.ts` aplicam a mesma matriz ao motor local, aos leitores SIH e aos dossiês. O workbook detalhado pode fornecer quantidade e valor unitário de cada filho, mas **a natureza do financiamento vem dos Anexos da competência**, nunca da coluna `nature` local de outra vigência.

## 3. Motor por AIH e FPO

O auditor trabalha com AIH, faixa 1/5, principal, agrupador envelope, filhos com QT, enquadramento Federal/Estadual/Ambos/Não localizado, unitário independente do workbook, soma do complemento, proveniência, regra/retificação e resultado. Estados: `ok` (estadual compatível), `fpo` (federal, dependente de prova efetiva), `review` (Ambos/mista/desconhecido) e `bad` (faixa oposta ao rol).

`faec_mult` exige publicação independente por AIH e memorial elegível; a soma dos próprios filhos não comprova pagamento. `mac_mult` preserva o consolidado SES, sem rateio financeiro fictício, e trata incompatibilidades/AIHs federais como pendência. FPO oficial da Nota nº 05/2026 **é referência do valor federal a programar, não prova de programação existente do prestador nem de repasse**.

A migration normativa `supabase/migrations/20261016213000_eletivas_fase4_guard_normativo.sql` introduz função de vigência CIB no SQL e bloqueia `status=ok` quando novas múltiplas possuem versionamento errado ou não têm publicação/prova independentes. Não recalcula registros anteriores.

## 4. SQLs do Lovable, na ordem

1. Reparo da exclusão legada: `supabase/migrations/20261016210000_eletivas_reparo_exclusao_legado.sql`.
2. Guarda normativa: `supabase/migrations/20261016213000_eletivas_fase4_guard_normativo.sql`.
3. Verificação conjunta **somente leitura**: `supabase/tests/20261016213500_eletivas_fase4_norma_verificacao.sql`.

As migrations 0–3 precisam estar aplicadas no mesmo projeto Supabase do Lovable. Nenhum SQL foi executado no banco remoto desta sessão.

## 5. Teste manual e aceite

**Exclusão:** na lista de encontros com "Mostrar arquivadas", selecionar julho/2026, justificar e digitar `EXCLUIR 07/2026`. Se a verificação mostrar vínculo financeiro ou pagamento, não forçar. Confirmar que o encontro some, a parcela original permanece e um novo encontro para o mesmo mês pode ser criado. Confirmar limpeza Storage pendente, se houver.

**Fase 4:** importar mesmas fontes/SHA que no HTML para 07 e 08/2026; conferir cada AIH e os procedimentos-filhos, estado, elegibilidade, artigo normativo, indicação FPO e valores. Usar códigos `030907001` (ausente da 727, estadual na 399), `040905008` (Ambos, demanda revisão) e `040701003` (Federal, demanda FPO). Confirmar que FPO oficial sem documento de programação não libera crédito. Conferir AIH agrupadora com dois filhos e casos mistos; checar recorte FAEC faixa MAC sem duplicação. Testar exclusão sem FPO e documento não comprovado.

**Limite da prova:** testes automatizados com amostras sintéticas e hashes das matrizes garantem seleção de vigência, contagens de anexos, classificação e guardas; **não comprovam paridade individual completa com os arquivos reais**, que precisa de Golden Master com o HTML. Não homologue valores de produção sem esse confronto.
