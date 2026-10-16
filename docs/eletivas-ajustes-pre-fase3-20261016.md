# Ajustes da Fase 2 antes do motor financeiro (16/10/2026)

## 1. Avisos de CNES ausente — três fontes, sete abas

Os sete avisos relatados representam ausência de publicação do HMSJ (CNES 2436469) nas matrizes **opcionais**, não falha no upload. São de três fontes: SIA FAEC puro (Físico e Complemento), SIA MAC (Físico, Financeiro e Complemento) e FAEC faixa estadual/MAC proc FAEC (Físico e Complemento).

A interface agora apresenta essas situações numa seção **informativa recolhida**, agregada por fonte (três), sem contar cada aba como um erro. A aplicação continua impedindo utilizar valores de outro CNES. Outras advertências e erros estruturais continuam visíveis e bloqueiam quando necessário; nenhuma validação de CNES das fontes obrigatórias foi reduzida.

Código: `src/lib/eletivas/avisosImportacao.ts`, `FontesEletivas.tsx`. Teste: `avisosImportacao.test.ts`.

## 2. Documentos SEI fora da tela Fontes

A fonte `rtma` e a fonte `ra` deixam de aparecer nos cartões e seletores de upload. Permanecem válidas **como categoria histórica no banco** para não quebrar cadastros anteriores. A inserção oficial dos dados de SEI da produção é pelo fluxo institucional do lançamento: **Etapa 6 — Liberação de Recurso**, nos campos de **Relatório Técnico de Monitoramento (2 fiscais + 1 opcional)** e **Relatório de Análise (mínimo 1 fiscal)**, com links/documentos SEI.

Não houve alteração nesses campos do lançamento, nem exigência de carregar PDFs pela aba Fontes. A aba Eletivas “Relatórios e atesto” mantém o código antigo de documentação/fechamento até a Fase 7; evitar registrar informações divergentes entre os dois módulos.

## 3. Excluir rascunho vazio OU arquivar competência de teste já auditada

- **Exclusão física** continua permitida exclusivamente para rascunho em preparação sem nenhum upload, decisão, arquivo, documento, execução ou atesto, com evento copiado no livro `eletivas_exclusoes`.
- **Arquivamento** agora está disponível para competência em preparação ou auditoria que **nunca teve fechamento, integração ou escolha formal de atesto**. Exige perfil ACP/Admin e justificativa de pelo menos 20 caracteres. A competência deixa de aparecer na lista ativa, mas mantém o mesmo UUID, o vínculo com a parcela, todos os hashes, arquivos, decisões e eventos. Existe “Mostrar arquivadas” para consultar e **Restaurar competência**, também com justificativa. A restauração não reexecuta motor nem altera o lançamento.
- **Encontro encerrado, fechado, integrado ou usado em escolha fiscal** não pode ser arquivado por essa operação. O objetivo é retirar testes da visualização, sem destruir o livro fiscal ou reabrir atos financeiros.
- **Limite deliberado:** arquivar não libera a chave única `(prestador_id,competencia)` nem a parcela. Para testar novamente a mesma competência, **restaure o encontro**. Não é possível criar outro e apagar a história anterior; isso evita atestos duplicados.
- **Proteção de escrita:** depois de arquivar, os triggers bloqueiam novas mutações das evidências; somente as RPCs de arquivamento e restauração mudam essa marcação, com eventos auditáveis. Leitura e documentos armazenados continuam íntegros.

## SQLs para o Lovable / banco Supabase institucional

1. Caso ainda não aplicada, conferir migration Fase 1: `supabase/migrations/20261016120000_eletivas_fase1_fundacao_competencias.sql`.
2. Aplicar migration de **arquivamento reversível**: `supabase/migrations/20261016180000_eletivas_arquivamento_auditado.sql`.
3. Validar somente leitura: `supabase/tests/20261016181000_eletivas_arquivamento_verificacao.sql`.

O SQL novo acrescenta três campos na tabela existente `eletivas_competencias`; não cria tabelas, não aplica DELETE e não modifica `lancamentos_pagamento`. ACL e RLS existentes permanecem. A conexão da sessão não aponta para o banco do pacto-joinville: migration **não aplicada automaticamente**. SQL Editor deve ser o do mesmo projeto do sistema no Lovable.

## Teste manual obrigatório antes da Fase 3

1. Usar uma competência fictícia já em auditoria, **sem fechamento e sem vínculo financeiro aplicado**; clicar na lixeira na lista.
2. Digitar justificativa longa, clicar **Arquivar e retirar da lista**; confirmar que some da lista ativa.
3. Marcar **Mostrar arquivadas**; observar o status Arquivada. Abrir o encontro: leituras disponíveis, edição e upload desativados.
4. Tentar criar encontro novo para **a mesma instituição e mês**: não deve gerar duplicidade; a parcela deve indicar encontro arquivado.
5. Restaurar pela lista com motivo. Conferir que os arquivos, itens, SHA e histórico continuam inalterados e registraram os eventos de arquivamento/restauração.
6. Testar exclusão definitiva de rascunho vazio e tentativa de exclusão de rascunho com documentos: o segundo deve ser negado, sugerindo arquivar.
7. Testar que competência **encerrada** ou com integração/atesto formal é bloqueada para arquivamento, sem mudar lançamentos.
8. Reabrir aba Fontes: não há **Documentos SEI**; os sete avisos se agrupam em três informações, sem aparência de erro. Importação obrigatória com CNES incorreto ainda deve falhar.

**Homologação:** código e contratos são verificados em CI; o comportamento real do banco precisa de teste na instância do Lovable. A paridade com HTML e dados SES reais continua pendente de Golden Master.
