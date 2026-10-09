# Encontro de Contas · Eletivas HMSJ — fundação institucional

## Origem e escopo

Baseado no HTML standalone **Auditoria_Cirurgias_Eletivas_EC_HMSJ_Ajustado(4).html**
apresentado pelo fiscal (4.981 linhas, funções e estruturas de conciliação próprias). O novo
grupo na sidebar é **Atesto de Produção**, com rota `/eletivas`.

Esta entrega estabelece cadastro mensal por prestador, armazenamento privado dos arquivos,
itens de conferência fiscal, glosas/decisões, correções documentadas, número/link SEI dos
relatórios, histórico de alterações e encerramento no servidor.

**Limite expresso:** o parser/conciliador automático do HTML **ainda NÃO foi migrado**.
Os números de itens lançados manualmente são identificados com `origem='manual'`.
A existência dos arquivos ou de um lançamento manual não prova que a análise TabWin/SES
foi executada pelo sistema. Nunca utilizar `origem='parser_validado'` sem função
server-side autorizada que faça o processamento, a conferência e o registro de hash.

## Invariantes financeiras preservadas do HTML

- O algoritmo original distingue SIH FAEC/MAC, SIA FAEC/MAC, múltiplas e sequenciais,
  faixa estadual, faixa federal e FAEC faixa MAC.
- `faec_fxmac` é recorte informativo, não pode entrar novamente no total.
- Item `ok`, `info` ou decisão `aceito`: parcela publicada.
- Decisão `erro`: zero.
- Enquanto `div/nc/fora` está pendente, em ofício ou análise: parcela incontroversa
  `min(publicado, esperado)` se ambos positivos; se não há valor esperado, conservar
  o valor publicado existente conforme lógica original. Isso **não** confirma que a diferença foi aceita.
- Correções de competências anteriores têm origem, valor e documento SEI; entram no total uma única vez.
- Total = FAEC + MAC + SIA + correções. O fechamento é computado em RPC transacional;
  a interface exibe somente memória provisória antes do encerramento.

## Regras de dados, documentos e segurança

- `eletivas_competencias`: uma por MM/AAAA e prestador; CNES e vínculo opcional
  `lancamento_id` ao convênio. A criação **não gera** lançamento do convênio.
- `eletivas_arquivos`: catálogo 19 tipos (DBF TabWin, SIH/SIA SES, FPO, EC Deliberações,
  AIH e relatórios SEI), armazenamento Supabase privado, SHA-256, versões rastreáveis.
- `eletivas_itens`: categoria, valores esperado/publicado, decisão fiscal,
  justificativa obrigatória, usuário/data registrados no servidor e histórico do item.
- `eletivas_eventos`: trilha append-only por gatilhos. Dados financeiros ficam no
  registro do evento; não salvar identificação direta de paciente ou CPF.
- `documentos`: número/link SEI do Relatório Técnico de Monitoramento (2 fiscais,
  terceiro opcional) e do Relatório de Análise (mínimo um fiscal). Os nomes
  informados são declarações do usuário; a assinatura válida continua sendo a
  efetivamente registrada no SEI, **não** é criada pelo preenchimento do campo.
- RLS: perfis autenticados Admin/ACP/ACO leem; Admin/ACP escrevem; arquivos no bucket
  privado `eletivas-arquivos`. Não há acesso anônimo, sobrescrita silenciosa de
  arquivos ou exclusão de competências.

## Integrações futuras — sem automatismo nesta entrega

1. **Motor de processamento:** portar parsers `parseDBF`, `stateMatrix`,
   `parseAihWb`, `multipleAihProfile`, `reconcile` e relatórios para
   funções/serviços testados, com evidência por fonte, CNES e AIH.
2. **Paridade com o legado:** usar amostras documentadas da competência abril/2026
   citadas no HTML (FAEC físico 84/84, financeiro 188.760,54,
   complemento 44.161,29, MAC 196.800,11, 15 múltiplas/sequenciais, SIA
   3 × 438,24). Essas expectativas são originadas dos comentários do HTML;
   a verificação independente exige arquivos brutos de exemplo.
3. **Assinaturas verificáveis:** validar o RTMA e o Relatório de Análise
   com a matriz de assinaturas do convênio ou evidências SEI, incluindo
   regra de dois fiscais no RTMA e um no Relatório de Análise.
4. **Vínculo com o convênio:** relacionar `lancamentos_pagamento.id` à competência
   do encontro **somente após verificar prestador, convênio de Eletivas e mês**.
   Criar competência automaticamente via evento de criação do convênio apenas
   com garantia de idempotência e regra de exercício.
5. **Atesto vinculado:** após fechamento, confirmação fiscal explícita e vínculo
   1:1 válido, propor valor `eletivas_competencias.valor_fechado` para o campo
   `lancamentos_pagamento.valor_atestado` da Etapa 6 — Liberação de Recurso,
   registrando autor, valor anterior, valor novo, data, documento e justificativa.
   **Nunca executar UPDATE automático** apenas porque o encontro foi fechado.
6. **Relatórios SEI gerados:** transportar toda a minuta RTMA e relatório detalhado
   por AIH, com campos, códigos e citações validados pelo fiscal; a fundação
   apenas registra as referências e prepara o valor fechado.

## Implantação e validação

1. Executar `supabase/migrations/20261010200000_eletivas_encontro_contas_fundacao.sql`
   no editor SQL antes de sincronizar telas, se a plataforma não aplica migrations automaticamente.
2. Sincronizar GitHub e rodar `bun run check:architecture`, `bun run build` e Vitest.
3. Criar uma competência com HMSJ cadastrado; carregar as quatro fontes
   obrigatórias; adicionar itens e decisões com justificativas; registrar números,
   links e os fiscais efetivamente signatários nos documentos do SEI; encerrar.
4. Validar permissão de leitura ACO, edição ACP/Admin, restrição de encerramento,
   impedir origem `parser_validado` pelo navegador e a impossibilidade
   de alterar valores após encerramento.
5. Confirmar que `lancamentos_pagamento.valor_atestado` não sofreu qualquer alteração.
6. Fazer teste de paridade das categorias financeiras com o HTML e dados sintéticos
   antes de transportar o processamento automático dos arquivos clínicos.
