# Eletivas HMSJ — abertura vinculada e escolha de origem na Etapa 6

## Regras de criação
O Encontro de Contas passa a ser **filho de um lançamento já aberto**, nunca
uma competência avulsa digitada. A tela inicial seleciona, nesta ordem:
**instituição → convênio → competência/parcela individual do lançamento**.

O servidor retorna apenas lançamentos com:
- convênio do mesmo prestador e `modelo_fluxo='fluxo_1'`;
- competência individual `MM/AAAA` (não uma lista separada por vírgulas);
- `concluido=false`, sem data ou comprovante de pagamento;
- inexistência de outro encontro para o mesmo lançamento ou mesma
  competência do mesmo prestador.

Lançamentos-filhos de processos multicompetência **são aceitos**,
pois são os registros individuais de competência criados no Fluxo 1.
O lançamento-pai de vários meses não aparece na seleção.

A instituição é identificada por `prestador_id`, não por busca no texto.
Para o HMSJ, o CNES `2436469` é sugerido; outras instituições devem
informar CNES válido de sete dígitos, pois o cadastro de prestadores
não possui um campo institucional de CNES. **Não presumir o CNES
do HMSJ para outro estabelecimento.**

A criação é uma transação `ec_criar_competencia_vinculada`, com
`prestador_id`, `convenio_id` e `lancamento_id` conferidos no
banco. O acesso de INSERT direto a `eletivas_competencias` para
usuários autenticados foi revogado.

### Edição e exclusão
- Edição: somente na fase `preparacao`, sem arquivos, itens, execuções,
  fechamentos ou integrações, com motivo obrigatório e evento auditado.
  Permite corrigir vínculo/competência e observação antes de começar a
  auditoria.
- Exclusão: somente rascunhos sem **nenhuma** evidência, decisão,
  programação FPO, correção ou fechamento. Uma cópia dos metadados
  e dos eventos técnicos é registrada em `eletivas_exclusoes`
  (RLS, apenas leitura). Exclusão não elimina histórico fiscal já
  utilizado.
- Encontros auditados/fechados devem ser tratados por revisão formal,
  nunca apagados.

## 4. Valor Atestado — Etapa 6 do convênio
A coluna antiga `lancamentos_pagamento.valor_atestado` continua sendo
o **valor efetivo único** que o restante do Fluxo 1 usa para calcular
liberação, anulação e progresso. Em paralelo são preservados:

| Coluna | Significado |
|---|---|
| `valor_atestado_manual` | Valor informado no Fluxo 1 |
| `valor_atestado_automatico` | Valor fechado importado da conciliação, após proposta fiscal e aplicação expressa |
| `origem_valor_atestado` | `manual` ou `automatico`: fonte considerada |
| `ec_escolha_pendente` | Duas fontes disponíveis, ainda aguardando decisão |
| `valor_atestado` | Valor efetivo conforme a fonte escolhida |

O formulário da Etapa 6 grava **somente a coluna manual** ao digitar.
Não edita o valor automático; este é recebido exclusivamente por
`ec_aplicar_integracao`, após fechamento e confirmação fiscal
da Fase 6. A aplicação não apaga ou modifica o manual.

Quando existe um manual positivo e chega um automático, o sistema
**preserva a fonte atualmente considerada** mas assinala
`ec_escolha_pendente=true`. Até o fiscal selecionar a fonte,
as etapas de liberação/pagamento não podem avançar. Caso o manual
não exista ou seja zero, o automático pode ser considerado diretamente.

A seleção exige fiscal ACP/Admin, SEI, justificativa (20 caracteres),
conferência de valor anterior e grava uma linha append-only em
`eletivas_atesto_escolhas`, com as fontes, o anterior/novo,
usuário e data. Alterar novamente o manual com automático disponível
exige nova escolha. O sistema não altera valores já pagos/concluídos.

Esta política evita somar os dois valores ou substituir uma decisão
sem auditoria. A integração automática continua **opcional**,
separada do encerramento do Encontro e com as duas confirmações
da Fase 6 (proposta, aplicação).

## Implantação na base institucional
1. A migration da Fase 6 original
   `20261015195500_eletivas_fase6_fechamento_integracao_segura.sql`
   precisa ter sido executada anteriormente.
2. Execute a migration complementar:
   [20261015201000_eletivas_vinculo_origem_atesto_competencia.sql](../supabase/migrations/20261015201000_eletivas_vinculo_origem_atesto_competencia.sql).
   Ela preserva manual/automático dos lançamentos existentes,
   não altera convênios para transferir automaticamente valores
   e não cria Encontros nem conclui etapas.
3. Execute o script de verificação apenas leitura:
   [eletivas_vinculo_atesto_verificacoes.sql](../supabase/tests/eletivas_vinculo_atesto_verificacoes.sql).
4. Na tela inicial, confira instituição, convênio e parcela
   elegível; faça uma criação de rascunho (não financeiro).
5. Confira botões **Editar**/**Excluir** apenas em rascunhos,
   e se a exclusão deixa a parcela elegível novamente.
6. Na Etapa 6, teste lançamento com valor manual,
   escolha de origem documentada, e histórico SEI.
7. Para testar uma aplicação automática, prefira **ambiente de
   homologação**: no banco institucional, aplicar muda o atesto
   financeiro do lançamento. Não execute apenas por curiosidade.

**Limitações:** a sintaxe PostgreSQL no CI e testes estáticos
não provam execução transacional no banco Lovable, nem autenticidade
de SEI ou assinaturas. Comprovar na homologação com dois fiscais
ou com o responsável designado e verificar a Etapa 6 no lançamento.


## Correção do seletor e das ações na lista (15/10/2026)

Depois dos testes em tela, a abertura foi refinada:

- O seletor exibe **instituição, nome do convênio, competência e número da parcela**, sem UUID ou identificadores técnicos truncados.
- O CNES não aparece no formulário. O sistema resolve o valor a partir de
  `ec_cnes_instituicoes` (relação institucional prestador/CNES). O HMSJ
  recebe CNES conhecido `2436469`; outros prestadores exigem
  cadastramento institucional prévio — jamais recebem o CNES do HMSJ por engano.
- Um valor **manualmente atestado na Etapa 6 não exclui a parcela** da seleção.
- A competência `07/2026`, previamente conciliada, poderá ser mostrada como
  **Encontro existente**: a ação abre o registro já vinculado ou exige
  justificativa para vincular um encontro legado ainda sem vínculo.
  Não se cria uma segunda conciliação para mesma instituição/competência.
- Ícones **Editar** e **Excluir** ficam visíveis em todas as linhas
  para usuários ACP/Admin. Editar uma competência em auditoria modifica
  apenas a observação, com justificativa e evento. Competências encerradas
  exigem reabertura formal. Excluir continua permitido apenas para
  rascunhos sem evidências; os demais exibem o motivo do bloqueio.
- Competências concluidas/pagas ou lançamento-pai multicompetência
  permanecem indisponíveis.

### Nova instalação incremental

Execute **após** a migration complementar da Fase 6:
[20261015203000_eletivas_selecao_legado_cnes.sql](../supabase/migrations/20261015203000_eletivas_selecao_legado_cnes.sql).

Depois, execute o diagnóstico **somente leitura**:
[eletivas_selecao_legado_cnes_verificacoes.sql](../supabase/tests/eletivas_selecao_legado_cnes_verificacoes.sql).

O diagnóstico lista as parcelas de `07/2026`, seu valor atestado,
situação de pagamento, encontro cadastrado e eventual divergência no vínculo.
Esses resultados ajudam a distinguir encontro já criado de lançamento
concluído/pago ou vínculo com outra parcela.

**Os dois SQLs anteriores já executados não precisam ser repetidos.**
O script de diagnóstico não cria, edita, exclui nem integra valores.
