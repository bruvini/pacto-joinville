# PACTO Joinville · Emendas · Fase 4 e interface de execução

## Interface
- Lista principal agora utiliza linhas navegáveis: clique ou Enter/espaço abrem a emenda. Convênio aparece sob a instituição, quando vinculado.
- Visão Geral contém KPIs financeiros, dois resumos cadastrais compactos e **Lançamentos agrupados por etapa**. Aba separada de Lançamentos removida. Cadastro permanece editável, auditado.
- Em cada lançamento, etapa **sequencial e vertical**: dotação/fonte → autorização → solicitação → conferência de assinaturas → formalização/NE → liberações/pagamentos. Sem cards paralelos de etapas.
- Dotação/fonte não exige número/link SEI. O usuário informa dotação e fonte, marca confirmação de registro no **bloco da Coordenação de Orçamentos** e só então libera a autorização financeira.
- Ao abrir um lançamento de periodicidade mensal, trimestral ou anual: competências e parcelas geradas automaticamente a partir do primeiro MM/AAAA e número da parcela inicial.
- Visão agrupada do lançamento mostra linha do tempo dos eventos da operação, sem exibir indiscriminadamente payloads de auditoria.

## Fase 4 — regras transacionais
- `emenda_comprovantes`: por competência; tipos atesto, relatório, nota fiscal ou outro, com evidência SEI.
- `emenda_liberacoes`: cada competência tem **uma liberação original** e zero ou mais **complementares**. Uma complementar exige original prévia. Somatório das liberações de todas as competências de uma NE não pode ultrapassar o valor registrado dessa NE.
- `emenda_blocos_pagamento`: bloco interno atrelado à liberação; vários blocos por liberação, com data, valor e documento SEI. Somatório de blocos não ultrapassa a liberação; requer ao menos um comprovante na mesma competência, e data não anterior à liberação.
- `emenda_encerramentos_sem_execucao`: um registro por competência, com justificativa e SEI, apenas após NE e sem qualquer liberação da competência. Marca a filha como `sem_execucao`, sem cancelar, estornar ou liberar saldo da NE. Lançamentos de várias competências podem ter encerramentos individuais.
- Transações protegidas por autenticação + papel ACP/Admin, `FOR UPDATE` da emenda para serializar movimentações, RLS e auditoria. Leitura de ACP/Admin/ACO. Sem INSERT/UPDATE/DELETE direto via client.
- O formulário é um **registro administrativo com prova SEI**. Nenhuma operação na SEFAZ ou pagamento bancário é executada pelo PACTO.

## Migration e risco operacional
Migration: `supabase/migrations/20261029000500_emendas_fase4_liberacoes_pagamentos.sql`.
Pré-requisito: Fases 1–3 aplicadas. Executar uma vez, em transação completa, sem repetir se houve êxito. O script não é uma importação e não cria exemplos no banco operacional. Verificar a função `emenda_confirmar_dotacao`, as quatro tabelas, RLS e a consulta pelo cliente. O gatilho impede formalizar sem confirmação de Orçamentos.
**Sem homologação com sessão ACP/Admin não considerar pronto para uso financeiro operacional.**

## Homologação mínima
1. Abrir lançamento mensal e trimestral: sem dedução de saldo; verificar ordem parcelas.
2. Confirmar dotação sem SEI e sem preencher número/link; verificar status e habilitação da autorização.
3. Verificar bloqueio ao saltar etapas (inclusive por chamada RPC direta).
4. NE emitida registrada, depois comprovante, liberação original e complementar por competência.
5. Tentar complemento sem original, duas originais na mesma competência, liberação total maior que NE e pagamento total maior que liberação — operações devem falhar.
6. Testar pagamento sem comprovante ou anterior à liberação — deve falhar.
7. Encerrar competência sem execução e verificar impossibilidade após liberação; nenhum estorno automático da NE.
8. Comprovar auditoria e papéis; nenhum registro fictício na base operacional.

Registros históricos `emenda_documentos`, `emenda_fontes` e `emenda_ajustes_valor` permanecem armazenados e auditados, embora suas abas antigas não apareçam na interface. A revisão do fluxo completo de ajustes financeiros pertence a uma entrega futura.
