# PACTO · Emendas — Convergência do fluxo com Convênios

## Diagnóstico
O campo "disponível para novas solicitações" passou a R$ 0,00 após a formalização da solicitação de R$ 510.000,00. Esse valor **não** é a diferença não executada da própria solicitação. A interface comparava uma solicitação já reservada ao saldo restante para futuras solicitações, gerando alerta vermelho incorreto. A validação passa a recompor a reserva própria no formulário e só exibe alerta para valores que realmente excedam o limite editável.

## Estrutura
- **Solicitação:** cinco linhas de assinaturas; Gerente/Coordenador e Diretoria Financeira/Secretária aparecem na mesma linha com duas opções independentes. Campo SEI sempre visível, mesmo depois do envio.
- **Nota de Empenho:** quatro campos (número, valor, número SEI e link SEI). Exercício derivado do número/ano corrente. Diferença entre NE e solicitação gera aviso não bloqueante. Assinaturas: Membro da SEFAZ (nome manual, conforme Convênios) e Diretoria Financeira ou Secretária de Saúde. Validação documental automática após ambas.
- **Competência:** documento comprobatório (número/link SEI) → valor executado → solicitação de liberação (número/link) → quatro grupos de assinaturas → envio à SEFAZ.UAF.ADE → aviso de movimento/subempenho → programação de pagamento → comprovante de pagamento → data de pagamento. Cada documento é salvo ao sair do campo, sem botões de registrar. Os registros financeiros são criados por RPCs transacionais ao confirmar envio e documentação completa, não pelo simples preenchimento.
- **Anulação:** aparece após todas as parcelas pagas, apenas se NE−Liberado−Anulado for positivo. Pede solicitação (SEI), quatro grupos de assinaturas, envio à SEFAZ.UCG.AEO e aviso de movimento (SEI). Ao completar, registra a anulação residual na base.
- **Encerramento:** botão automaticamente visível após todas as competências concluídas e residual zero. A conciliação exige documento SEI de conferência (requisito de governança mantido da Fase 5).

## Persistência e segurança
Migration `supabase/migrations/20261029030000_emendas_fluxo_pagamentos_documentado.sql`:
- Documentos e assinaturas por contexto (NE, parcela, anulação) com RLS, auditoria e RPCs limitadas a ACP/Admin.
- Gravação de documentos e assinaturas em trilha de histórico, sem apagar a NE original, inclusive NE emitidas antes da migration (backfill documental).
- Consolidação de comprovante, liberação, pagamento e anulação usa as RPCs financeiras existentes para preservar integridade e conciliação.
- Toda confirmação de envio representa somente registro documental da ação externa, nunca envio real pelo PACTO.

## Limitações para homologação adicional
- Alterações após emissão de NE ou após movimentos de liberação/pagamento/anulação precisam **retificação administrativa formal**. Esta entrega não promove regressão destrutiva automática dessas movimentações, para evitar inconsistência entre documentos SEI e valores do banco.
- O fluxo novo de cada parcela representa um ciclo de liberação original e pagamento integral. Liberações complementares e pagamentos parciais da mesma competência ainda exigem expansão do modelo de múltiplos ciclos; NÃO marcar essa condição como plenamente homologada.
- Data do registro de liberação usa a data da confirmação no PACTO. Para lançamento retroativo, a data real da liberação terá de ser representada por campo adicional antes da homologação dessa situação.
- O fluxo de Matriz SEFAZ possui assinatura manual porque não há Membro da SEFAZ na configuração compartilhada atual.

## Homologação
Verificar sem movimentar documentos reais de terceiros:
1. NE antiga preservada e reserva reconhecida sem falso alerta de saldo.
2. Concluir assinatura complementar SEFAZ/Financeira após NE já emitida, sem emissão duplicada.
3. Criar documento de uma competência e conferir bloqueio progressivo.
4. Salvar os 4 grupos de assinatura e confirmar envio para liberar bloco de pagamento.
5. Registrar os três documentos financeiros e data válida; conferir idempotência dos registros.
6. Verificar saldo residual, anulação assinada e encerramento somente se conciliável.
7. Validar auditoria e RLS, e testar com usuário sem papel ACP/Admin.
