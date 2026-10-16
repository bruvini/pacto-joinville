# Fase 2 — Fontes e importação inteligente · HTML v2.42.2

Referência única: `Auditoria - Cirurgias Eletivas - 102026.html`, SHA-256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`. Fase 0 congelada. Não substituir pela versão antiga do HTML.

## Entregas implementadas

1. **Página Fontes:** cabeçalho institucional, área de soltar arquivos com seleção múltipla, cartões organizados nos cinco grupos TabWin, SES Hospitalar, SES Ambulatorial, Apoio e documentos SEI; indicadores de obrigatórias por competência, fontes existentes e hashes parciais. A área de análise continua separada para não mudar a execução financeira.
2. **Classificação:** reconhecimento pelo esquema DBF (`N_AIH`, `PROC_REA`, valores federais ou `VAL_TOT`, campos `PRD_*`) e pelas assinaturas de abas/cabeçalhos XLSX/XLS/ODS. Identifica gerações FAEC MS `N_AIH+Estab`, `Hospitais+AIH`, `Hospital+Procedimentos`; MAC MS `DelibMS/Físico Principal`; workbook AIH/CIB; FPO e suas colunas; planilhas Físico/Financeiro/Complemento/Delib; e **Consolidado Geral SES/SC** pelo cabeçalho triplo.
3. **Consolidado:** categoria `ec_consolidado` adicional em catálogo e CHECK do banco; leitura `lerConsolidadoSES` extrai a linha do CNES, título da competência, soma produção + ajustes, total do estabelecimento, origem (aba/células), flag de valor derivado e consistência. **Não soma o consolidado ao atesto nem trata a planilha como prova de publicação individual.** Memória limitada a valores institucionais é registrada como observação no manifesto da execução.
4. **Integridade:** todo o lote é verificado **antes** do primeiro upload (extensão, limite, detecção, categoria informada, estrutura, CNES das matrizes obrigatórias, hash, repetição de papel/bytes). Arquivos com estrutura divergente ou fórmula sem cache são rejeitados. Depois, Storage privado recebe os arquivos e uma única inserção PostgREST registra todas as evidências em transação; falha aciona remoção compensatória dos objetos, quando permitida pela política Storage.
5. **Conciliação:** o fluxo atual continua baixando arquivos privados e conferindo tamanho + SHA-256 + esquema, processa em memória, só depois chama `ec_importar_itens_local`, que grava itens e manifesto na mesma transação. Arquivo inválido **não gera itens parcialmente conciliados**. A fase não modifica `financeiro.ts`, `ec_valor_item`, atestos nem lançamentos de pagamento.

## SQL obrigatório

Arquivo: [migration Fase 2](../supabase/migrations/20261016150000_eletivas_fase2_consolidado_ses.sql).

**Ordem:** aplicar migrations institucionais de 15/10/2026, Fase 1 (16/10) e depois esta. A migration acrescenta apenas o valor `ec_consolidado` ao CHECK de `eletivas_arquivos`; não cria tabela, não migra dados, não altera RLS, Storage, integração com o Fluxo 1 ou cálculos. Sem ela, o upload do consolidado será recusado pelo banco.

Depois de aplicar a migration, executar [SQL de verificação somente leitura](../supabase/tests/20261016153000_eletivas_fase2_verificacao.sql) no SQL Editor do **mesmo projeto de banco usado pelo Lovable**.

## Teste de aceitação no Lovable

### A. Preparar a competência

1. Atualizar o aplicativo para a revisão GitHub indicada e confirmar as migrations aplicadas. Usar competência de teste em **preparação** e perfil ACP/Admin, preservando os originais oficiais.
2. Abrir **Encontro de Contas → selecionar instituição → convênio → parcela → Fontes e importações**. Conferir cabeçalho CNES/competência, cartões e estados.
3. Arrastar de uma vez DBF FAEC, DBF MAC, SIH FAEC, SIH MAC e outros arquivos oficiais disponíveis. A partir de 07/2026, também é exigido `s_mac_ms` para processar.
4. Antes de confirmar, verificar classificação e distinguir layout de 04/2026, 07/2026 e 08/2026+; selecionar manualmente papel desconhecido apenas quando a estrutura for validável.
5. Enviar lote; confirmar todos os cartões e SHA parcial. Reabrir a página: o mesmo arquivo continua registrado; não há duplicidade por nome/competência ou hash.

### B. Negativos obrigatórios (sem mexer em atesto)

1. Renomear uma planilha FPO para "SIH MAC.xlsx" e forçar papel `s_mac`: deve bloquear **antes do upload**.
2. Enviar XLSX corrompido no mesmo lote que uma fonte válida: a importação deve falhar sem cadastrar nenhum arquivo desse lote.
3. Enviar a mesma fonte duas vezes no mesmo papel ou sob dois papéis: deve bloquear, sem substituir a evidência anterior.
4. Importar matriz SES obrigatória sem coluna do CNES do hospital: deve apontar aba/células e bloquear.
5. Testar fórmula sem valor calculado no cache na coluna do CNES: deve bloquear; com cache numérico zero, deve aceitar.
6. Faltando as fontes obrigatórias, clicar em conciliar: deve explicar o impedimento sem registrar execução/itens.

### C. Consolidados e rastreabilidade

1. Acrescentar um XLSX com cabeçalho `Estabelecimentos-SC / Municípios-SC / Total Estabelecimentos`, mesmo que o nome não inclua "Consolidado".
2. Confirmar reconhecimento como `Consolidado Geral SES/SC` e registro com SHA. Rodar a pré-conciliação da competência apenas quando todas as obrigatórias forem válidas.
3. Confirmar que a memória da fonte mostra competência, aba/célula, valor da competência, correções e total; o consolidado **não deve acrescentar valor** à soma dos componentes.
4. Se o consolidado for de outro mês, a leitura deve recusar antes da gravação. Se CNES não constar, a planilha não pode gerar produção para o hospital.
5. Na aba de homologação, confrontar o manifesto com as **mesmas fontes/hashes e decisões no HTML e no React**. O comparador existe, mas ainda não há amostras oficiais anexadas; não declarar equivalência real completa sem executar esse confronto.

## Evidências de teste e limites

- Suite sintética/estrutural em `src/lib/eletivas/fase2Fontes242.test.ts` e testes anteriores dos leitores, validação, SIA, MAC/FAEC e integridade do manifesto.
- GitHub Actions valida testes, sintaxe da migration, arquitetura e build; não substitui conexão real ao banco nem confrontos com 04/2026, 07/2026 e 08/2026+.
- O bucket Storage tem política de exclusão restrita; limpeza compensatória pode deixar objeto **órfão, nunca item parcialmente conciliado**, se a mesma conta não possuir permissão para remover o objeto. O sistema alerta o administrador nesse caso. Não ampliar permissões do bucket nesta fase.
- A interface preserva a arquitetura institucional, mas **a equivalência visual pixel a pixel das 11 telas** pertence à Fase 6; a Fase 2 reproduz especificamente a organização da tela Fontes.
