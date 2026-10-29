# Emendas — Fase 5

A interface passa a usar uma página exclusiva por lançamento; a tabela agrupada por etapas é somente de navegação. Cadastro da emenda e lançamento em preparação podem ser excluídos logicamente via confirmação modal, desde que não tenham execução documental. Histórico preservado.

A etapa de dotação/fonte solicita confirmação de registro no bloco de Orçamentos. A etapa financeira cria pareceres cronológicos aprovados ou recusados, com justificativa. A solicitação de empenho verifica saldo, recolhe documento SEI e habilita cinco assinaturas: Coordenador de Orçamentos, Fiscal, Gerente/Coordenador ACP, Diretor de Serviços Complementares e Diretoria Financeira/Secretária de Saúde.

Depois das cinco conferências, uma confirmação humana de envio à SEFAZ.UCG.AEO formaliza a solicitação e a reserva. O PACTO não envia documentos nem efetua operações na SEFAZ.

A anulação residual é vinculada à NE e ao processo principal da emenda. Nunca pode ultrapassar o valor da NE não liberado, considerando anulações anteriores. A visão gerencial recompõe a disponibilidade pela NE líquida. A conciliação exige que cada competência esteja paga integralmente ou encerrada sem execução, e que NE líquida, liberações e pagamentos sejam iguais. Uma NE conciliada fica bloqueada para novos movimentos, inclusive por RPC legada.

Migration: supabase/migrations/20261029004500_emendas_fase5_conciliacao_pareceres.sql. Requer Fases 1–4 aplicadas. Não reexecutar após sucesso. Sem homologação SQL real e sessão ACP/Admin, não considerar o fluxo financeiro operacionalmente validado.

Testar: recusa seguida de aprovação; reconfirmação de dotação invalidando parecer anterior; pedido maior que saldo; cinco assinaturas; envio à SEFAZ; NE; edição/exclusão de rascunho; anulação residual; liberação acima da NE líquida; conciliação com parcela pendente; bloqueio após encerramento; RLS e auditoria. Nenhum registro fictício na base operacional.
